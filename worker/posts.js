import { error, json, readJson } from "./http.js";
import { getUser } from "./auth.js";
import { hit } from "./ratelimit.js";
import { randomId } from "./crypto.js";

const KINDS = new Set(["project", "guide"]);
const FEEDBACK = new Set(["vibes", "gentle", "tear"]);
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{30,}/,
  /AKIA[0-9A-Z]{16}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

const POST_SELECT = `SELECT p.id, p.user_id, p.kind, p.title, p.slug, p.body_md,
  p.pitch, p.link, p.repo, p.code, p.prompts, p.tools, p.tags, p.feedback,
  p.image_key, p.created_at, p.updated_at, p.deleted_at,
  u.id AS author_id, u.display_name AS author_display_name, u.avatar_key AS author_avatar_key
  FROM posts p JOIN users u ON u.id = p.user_id`;

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function parseArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function imageUrl(key) {
  return key ? `/img/${encodeURIComponent(key)}` : null;
}

function postJson(row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    slug: row.slug,
    body_md: row.body_md,
    pitch: row.pitch ?? null,
    link: row.link ?? null,
    repo: row.repo ?? null,
    code: row.code ?? null,
    prompts: parseArray(row.prompts),
    tools: parseArray(row.tools),
    tags: parseArray(row.tags),
    feedback: FEEDBACK.has(row.feedback) ? row.feedback : "vibes",
    image: imageUrl(row.image_key),
    author: {
      id: row.author_id,
      display_name: row.author_display_name,
      avatar: imageUrl(row.author_avatar_key),
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

function invalid(message) {
  return { ok: false, status: 400, code: "invalid", message };
}

function cleanText(value) {
  return typeof value === "string" ? value : "";
}

function checkUrl(value, field) {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return invalid(`${field} must be a URL.`);
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > 500) return invalid(`${field} must be 500 characters or fewer.`);
  if (!trimmed.startsWith("https://")) return invalid(`${field} must start with https://.`);
  try {
    new URL(trimmed);
  } catch {
    return invalid(`${field} must be a valid URL.`);
  }
  return { ok: true, value: trimmed };
}

function checkStringArray(value, field, maxItems, minLength, maxLength) {
  if (value === undefined) return { ok: false, missing: true };
  if (!Array.isArray(value)) return invalid(`${field} must be a list.`);
  if (value.length > maxItems) return invalid(`${field} can have at most ${maxItems} items.`);
  const out = [];
  for (const item of value) {
    if (typeof item !== "string") return invalid(`${field} items must be text.`);
    const text = item.trim();
    if (text.length < minLength || text.length > maxLength) {
      return invalid(`${field} items must be ${minLength} to ${maxLength} characters.`);
    }
    out.push(text);
  }
  return { ok: true, value: out };
}

function checkPrompts(value) {
  if (value === undefined) return { ok: false, missing: true };
  if (!Array.isArray(value)) return invalid("prompts must be a list.");
  if (value.length > 20) return invalid("prompts can have at most 20 items.");
  const out = [];
  for (const item of value) {
    if (typeof item !== "string") return invalid("prompts items must be text.");
    if (item.length > 1000) return invalid("prompts items must be 1000 characters or fewer.");
    out.push(item);
  }
  return { ok: true, value: out };
}

function scanSecrets(parts) {
  const blob = parts.filter((part) => typeof part === "string" && part).join("\n");
  return SECRET_PATTERNS.some((pattern) => pattern.test(blob));
}

async function readImageMetadata(env, key) {
  if (typeof key !== "string" || !key) return null;
  return env.DB.prepare(
    "SELECT key, user_id AS owner, type, size, created_at FROM images WHERE key = ?1"
  )
    .bind(key)
    .first();
}

async function validatePost(body, { partial, current, env, userId }) {
  const result = {};

  if (!partial || body.kind !== undefined) {
    if (!KINDS.has(body.kind)) return invalid("kind must be project or guide.");
    result.kind = body.kind;
  }

  if (!partial || body.title !== undefined) {
    if (typeof body.title !== "string") return invalid("title is required.");
    const title = body.title.trim();
    if (title.length < 3 || title.length > 120) {
      return invalid("title must be 3 to 120 characters.");
    }
    result.title = title;
  }

  if (!partial || body.body_md !== undefined) {
    const raw = body.body_md === undefined ? "" : body.body_md;
    if (typeof raw !== "string") return invalid("body_md must be text.");
    if (raw.length > 50000) return invalid("body_md must be 50000 characters or fewer.");
    result.body_md = raw;
  }

  const effectiveKind = result.kind || (current && current.kind) || "";
  const effectiveBody = result.body_md !== undefined ? result.body_md : (current ? current.body_md : "");
  if (effectiveKind === "guide" && String(effectiveBody || "").trim().length < 20) {
    return invalid("body_md must be at least 20 characters for a guide.");
  }

  if (!partial || body.pitch !== undefined) {
    if (body.pitch === undefined || body.pitch === null || body.pitch === "") {
      result.pitch = null;
    } else {
      if (typeof body.pitch !== "string") return invalid("pitch must be text.");
      if (body.pitch.length > 200) return invalid("pitch must be 200 characters or fewer.");
      result.pitch = body.pitch;
    }
  }

  for (const field of ["link", "repo"]) {
    if (!partial || body[field] !== undefined) {
      const check = checkUrl(body[field], field);
      if (!check.ok) return check;
      result[field] = check.value;
    }
  }

  if (!partial || body.code !== undefined) {
    if (body.code === undefined || body.code === null || body.code === "") {
      result.code = null;
    } else {
      if (typeof body.code !== "string") return invalid("code must be text.");
      if (body.code.length > 20000) return invalid("code must be 20000 characters or fewer.");
      result.code = body.code;
    }
  }

  if (!partial || body.prompts !== undefined) {
    const check = checkPrompts(body.prompts === undefined ? [] : body.prompts);
    if (!check.ok && !check.missing) return check;
    result.prompts = check.missing ? [] : check.value;
  }

  for (const field of ["tools", "tags"]) {
    if (!partial || body[field] !== undefined) {
      const check = checkStringArray(body[field] === undefined ? [] : body[field], field, 12, 1, 30);
      if (!check.ok) return check;
      result[field] = check.value;
    }
  }

  if (!partial || body.feedback !== undefined) {
    const feedback = body.feedback === undefined ? "vibes" : body.feedback;
    if (!FEEDBACK.has(feedback)) return invalid("feedback must be vibes, gentle or tear.");
    result.feedback = feedback;
  }

  if (!partial || body.image_key !== undefined) {
    const key = body.image_key;
    if (key === undefined || key === null || key === "") {
      result.image_key = null;
    } else {
      if (typeof key !== "string") return invalid("image_key must be text.");
      const metadata = await readImageMetadata(env, key);
      if (!metadata) return invalid("image_key does not point to an uploaded image.");
      if (metadata.owner !== userId) return invalid("image_key belongs to another account.");
      result.image_key = key;
    }
  }

  const titleForScan = result.title !== undefined ? result.title : (current ? current.title : "");
  const bodyForScan = result.body_md !== undefined ? result.body_md : (current ? current.body_md : "");
  const pitchForScan = result.pitch !== undefined ? result.pitch : (current ? current.pitch : "");
  const codeForScan = result.code !== undefined ? result.code : (current ? current.code : "");
  const promptsForScan = result.prompts !== undefined
    ? result.prompts
    : (current ? parseArray(current.prompts) : []);

  if (scanSecrets([titleForScan, bodyForScan, pitchForScan, codeForScan, ...promptsForScan])) {
    return { ok: false, status: 400, code: "secret_detected", message: "Hold up! This looks like a secret. Remove it before publishing." };
  }

  return { ok: true, value: result };
}

async function findPost(env, id) {
  return env.DB.prepare(`${POST_SELECT} WHERE p.id = ?1`).bind(id).first();
}

export async function listPosts(request, env) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  if (kind !== null && !KINDS.has(kind)) {
    return error(400, "invalid", "kind must be project or guide.");
  }

  const user = url.searchParams.get("user");
  const parsedLimit = Number.parseInt(url.searchParams.get("limit") || "", 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 50;

  let sql = `${POST_SELECT} WHERE p.deleted_at IS NULL`;
  const bindings = [];
  if (kind) {
    bindings.push(kind);
    sql += ` AND p.kind = ?${bindings.length}`;
  }
  if (user) {
    bindings.push(user);
    sql += ` AND p.user_id = ?${bindings.length}`;
  }
  bindings.push(limit);
  sql += ` ORDER BY p.created_at DESC, p.id DESC LIMIT ?${bindings.length}`;

  const rows = await env.DB.prepare(sql).bind(...bindings).all();
  return json(
    { posts: (rows.results || []).map(postJson) },
    200,
    { "Cache-Control": "no-store" }
  );
}

export async function getPost(request, env, ctx, params) {
  const row = await findPost(env, params.id);
  if (!row || row.deleted_at !== null) {
    return error(404, "not_found", "Not found.");
  }
  return json({ post: postJson(row) }, 200, { "Cache-Control": "no-store" });
}

export async function createPost(request, env) {
  const user = await getUser(request, env);
  if (!user) {
    return error(401, "not_signed_in", "Sign in to publish.");
  }

  if (!(await hit(env, `post:user:${user.id}`, 10, 86400))) {
    return error(429, "rate_limited", "You have reached today's posting limit. Try again tomorrow.");
  }

  const body = await readJson(request, 256 * 1024);
  const check = await validatePost(body, { partial: false, current: null, env, userId: user.id });
  if (!check.ok) {
    return error(check.status || 400, check.code || "invalid", check.message);
  }

  const values = check.value;
  const id = randomId();
  const now = nowSec();
  const slug = slugify(values.title);

  await env.DB.prepare(
    `INSERT INTO posts (id, user_id, kind, title, slug, body_md, pitch, link, repo, code,
      prompts, tools, tags, feedback, image_key, created_at, updated_at, deleted_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, NULL)`
  )
    .bind(
      id,
      user.id,
      values.kind,
      values.title,
      slug,
      values.body_md,
      values.pitch,
      values.link,
      values.repo,
      values.code,
      JSON.stringify(values.prompts),
      JSON.stringify(values.tools),
      JSON.stringify(values.tags),
      values.feedback,
      values.image_key,
      now,
      now
    )
    .run();

  const row = await findPost(env, id);
  return json({ post: postJson(row) }, 201);
}

export async function updatePost(request, env, ctx, params) {
  const user = await getUser(request, env);
  if (!user) {
    return error(401, "not_signed_in", "Sign in to edit a post.");
  }

  if (!(await hit(env, `edit:user:${user.id}`, 30, 3600))) {
    return error(429, "rate_limited", "You have reached the edit limit. Try again later.");
  }

  const current = await findPost(env, params.id);
  if (!current || current.deleted_at !== null) {
    return error(404, "not_found", "Not found.");
  }
  if (current.user_id !== user.id) {
    return error(403, "forbidden", "You can only edit your own posts.");
  }

  const body = await readJson(request, 256 * 1024);
  if (body.kind !== undefined && body.kind !== current.kind) {
    return error(400, "invalid", "kind cannot be changed.");
  }

  const check = await validatePost(body, { partial: true, current, env, userId: user.id });
  if (!check.ok) {
    return error(check.status || 400, check.code || "invalid", check.message);
  }

  const next = { ...current, ...check.value };
  const title = next.title;
  // created_at/updated_at use whole seconds; make sure an edit is always visible as newer.
  const now = Math.max(nowSec(), current.updated_at + 1);

  await env.DB.prepare(
    `UPDATE posts SET title = ?1, slug = ?2, body_md = ?3, pitch = ?4, link = ?5,
      repo = ?6, code = ?7, prompts = ?8, tools = ?9, tags = ?10, feedback = ?11,
      image_key = ?12, updated_at = ?13
     WHERE id = ?14`
  )
    .bind(
      title,
      slugify(title),
      next.body_md,
      next.pitch,
      next.link,
      next.repo,
      next.code,
      JSON.stringify(parseArray(typeof next.prompts === "string" ? next.prompts : JSON.stringify(next.prompts))),
      JSON.stringify(parseArray(typeof next.tools === "string" ? next.tools : JSON.stringify(next.tools))),
      JSON.stringify(parseArray(typeof next.tags === "string" ? next.tags : JSON.stringify(next.tags))),
      next.feedback,
      next.image_key,
      now,
      current.id
    )
    .run();

  const row = await findPost(env, current.id);
  return json({ post: postJson(row) });
}

export async function deletePost(request, env, ctx, params) {
  const user = await getUser(request, env);
  if (!user) {
    return error(401, "not_signed_in", "Sign in to delete a post.");
  }

  const current = await findPost(env, params.id);
  if (!current || current.deleted_at !== null) {
    return error(404, "not_found", "Not found.");
  }
  if (current.user_id !== user.id) {
    return error(403, "forbidden", "You can only delete your own posts.");
  }

  const now = nowSec();
  await env.DB.prepare("UPDATE posts SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2")
    .bind(now, current.id)
    .run();

  return json({ ok: true });
}

export async function getUserProfile(request, env, ctx, params) {
  const user = await env.DB.prepare(
    `SELECT id, display_name, avatar_key, bio, created_at FROM users WHERE id = ?1`
  )
    .bind(params.id)
    .first();

  if (!user) {
    return error(404, "not_found", "Not found.");
  }

  const rows = await env.DB.prepare(
    `${POST_SELECT} WHERE p.user_id = ?1 AND p.deleted_at IS NULL
     ORDER BY p.created_at DESC, p.id DESC`
  )
    .bind(user.id)
    .all();

  return json({
    user: {
      id: user.id,
      display_name: user.display_name,
      avatar: imageUrl(user.avatar_key),
      bio: user.bio ?? null,
      created_at: user.created_at,
    },
    posts: (rows.results || []).map(postJson),
  });
}
