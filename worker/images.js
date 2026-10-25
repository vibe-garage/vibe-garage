import { error, json } from "./http.js";
import { getUser } from "./auth.js";
import { hit } from "./ratelimit.js";
import { randomId } from "./crypto.js";

const MAX_BYTES = 1048576;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function sniffType(bytes) {
  if (bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }
  return null;
}

function imageUser(row) {
  return {
    id: row.id,
    display_name: row.display_name,
    avatar_key: row.avatar_key ?? null,
    avatar: row.avatar_key ? `/img/${encodeURIComponent(row.avatar_key)}` : null,
    bio: row.bio ?? null,
    created_at: row.created_at,
    email: row.email,
  };
}

async function readImage(request) {
  const declaredType = String(request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.has(declaredType)) {
    return { error: error(415, "unsupported_media_type", "Images must be PNG, JPEG or WebP.") };
  }

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_BYTES) {
    return { error: error(413, "payload_too_large", "Images must be 1 MB or smaller.") };
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) {
    return { error: error(413, "payload_too_large", "Images must be 1 MB or smaller.") };
  }
  if (bytes.byteLength === 0) {
    return { error: error(400, "invalid", "The image is empty.") };
  }

  const actualType = sniffType(bytes);
  if (!actualType || actualType !== declaredType) {
    return { error: error(415, "unsupported_media_type", "That file does not match its image type.") };
  }

  return { bytes, type: declaredType };
}

async function allowImageUpload(env, userId) {
  return hit(env, `img:user:${userId}`, 20, 86400);
}

export async function uploadImage(request, env) {
  const user = await getUser(request, env);
  if (!user) {
    return error(401, "not_signed_in", "Sign in to upload an image.");
  }
  if (!(await allowImageUpload(env, user.id))) {
    return error(429, "rate_limited", "You have reached today's image upload limit. Try again tomorrow.");
  }

  const image = await readImage(request);
  if (image.error) return image.error;

  const key = randomId();
  await env.IMAGES.put(key, image.bytes, {
    metadata: { type: image.type, owner: user.id, created_at: nowSec() },
  });

  return json({ key, url: `/img/${key}` }, 201);
}

export async function uploadAvatar(request, env) {
  const user = await getUser(request, env);
  if (!user) {
    return error(401, "not_signed_in", "Sign in to update your avatar.");
  }
  if (!(await allowImageUpload(env, user.id))) {
    return error(429, "rate_limited", "You have reached today's image upload limit. Try again tomorrow.");
  }

  const image = await readImage(request);
  if (image.error) return image.error;

  const key = randomId();
  await env.IMAGES.put(key, image.bytes, {
    metadata: { type: image.type, owner: user.id, created_at: nowSec() },
  });
  await env.DB.prepare("UPDATE users SET avatar_key = ?1 WHERE id = ?2")
    .bind(key, user.id)
    .run();

  return json({ user: imageUser({ ...user, avatar_key: key }) });
}

export async function serveImage(request, env, key) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return error(405, "method_not_allowed", "Method not allowed.");
  }
  if (!key) {
    return error(404, "not_found", "Not found.");
  }

  const result = await env.IMAGES.getWithMetadata(key, "arrayBuffer");
  if (!result || !result.value) {
    return error(404, "not_found", "Not found.");
  }

  const type = (result.metadata && result.metadata.type) || "application/octet-stream";
  const headers = {
    "Content-Type": type,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Length": String(result.value.byteLength),
  };

  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }
  return new Response(result.value, { status: 200, headers });
}
