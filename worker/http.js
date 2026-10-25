const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

export function error(status, code, message) {
  return json({ error: { code, message } }, status);
}

export async function readJson(request, maxBytes = 64 * 1024) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > maxBytes) {
    throw new HttpError(413, "payload_too_large", "Request body is too large.");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new HttpError(413, "payload_too_large", "Request body is too large.");
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new HttpError(400, "bad_json", "Request body must be valid JSON.");
  }

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new HttpError(400, "bad_json", "Request body must be a JSON object.");
  }

  return data;
}

export function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "local";
}

function normalizeOrigin(value) {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return String(value).replace(/\/+$/, "");
  }
}

export function sameOrigin(request, env) {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD") return true;

  const origin = request.headers.get("Origin");
  if (!origin) return false;

  const allowed = [new URL(request.url).origin, normalizeOrigin(env.SITE_ORIGIN)];
  return allowed.includes(origin.replace(/\/+$/, ""));
}
