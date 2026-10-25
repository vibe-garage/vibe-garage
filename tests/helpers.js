import { SELF } from "cloudflare:test";

export const ORIGIN = "https://vibe-garage.test";
const PASSWORD = "correct-horse-9";

let ipCounter = 0;

export function nextIp() {
  ipCounter += 1;
  return `192.0.2.${ipCounter}`;
}

export function uniqueEmail(prefix = "builder") {
  return `${prefix}-${crypto.randomUUID()}@example.com`;
}

export async function api(path, options = {}) {
  const method = options.method || "GET";
  const headers = new Headers(options.headers || {});

  if (method !== "GET" && method !== "HEAD") {
    headers.set("Origin", options.origin || ORIGIN);
  }
  if (options.ip) headers.set("CF-Connecting-IP", options.ip);
  if (options.cookie) headers.set("Cookie", options.cookie);

  let body;
  if (options.rawBody !== undefined) {
    body = options.rawBody;
    if (options.contentType) headers.set("Content-Type", options.contentType);
  } else if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }

  return SELF.fetch(`${ORIGIN}${path}`, { method, headers, body });
}

export function sessionCookie(response) {
  const header = response.headers.get("set-cookie") || "";
  return header.split(";")[0];
}

export async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function signupUser(overrides = {}) {
  const email = overrides.email || uniqueEmail();
  const password = overrides.password || PASSWORD;
  const displayName = overrides.display_name || "Test Builder";
  const ip = overrides.ip || nextIp();
  const response = await api("/api/auth/signup", {
    method: "POST",
    ip,
    body: {
      email,
      password,
      display_name: displayName,
      turnstile: overrides.turnstile === undefined ? "dev" : overrides.turnstile,
    },
  });
  const data = await readJson(response);
  return {
    response,
    data,
    email,
    password,
    displayName,
    ip,
    cookie: response.ok ? sessionCookie(response) : null,
    user: data && data.user ? data.user : null,
  };
}

export async function createPost(cookie, body, ip) {
  const response = await api("/api/posts", {
    method: "POST",
    cookie,
    ip: ip || nextIp(),
    body,
  });
  return { response, data: await readJson(response) };
}

export function tinyPng() {
  return Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2ZQAAAABJRU5ErkJggg=="),
    (char) => char.charCodeAt(0)
  );
}
