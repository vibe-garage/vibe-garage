import { error, json, readJson, clientIp } from "./http.js";
import { randomId, randomToken, sha256Hex, hashPassword, verifyPassword } from "./crypto.js";
import { hit } from "./ratelimit.js";

export const COOKIE_NAME = "vg_session";
export const SESSION_TTL = 30 * 24 * 60 * 60;
const SESSION_COOKIE = `${COOKIE_NAME}=`;
const TEST_TURNSTILE_SECRET = "1x0000000000000000000000000000000AA";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const DUMMY_SALT = "AAAAAAAAAAAAAAAAAAAAAA==";
const DUMMY_HASH = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function sessionCookie(token, maxAge = SESSION_TTL) {
  return `${SESSION_COOKIE}${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function getSessionToken(request) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === COOKIE_NAME) {
      return part.slice(index + 1).trim();
    }
  }
  return null;
}

function publicUser(row) {
  return {
    id: row.id,
    display_name: row.display_name,
    avatar_key: row.avatar_key ?? null,
    bio: row.bio ?? null,
    created_at: row.created_at,
  };
}

function selfUser(row) {
  return { ...publicUser(row), email: row.email };
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validEmail(email) {
  return email.length > 0 && email.length <= 254 && EMAIL_RE.test(email);
}

function validPassword(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 200;
}

function normalizeDisplayName(value) {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (name.length < 2 || name.length > 40) return null;
  if (CONTROL_RE.test(name)) return null;
  return name;
}

function normalizeBio(value) {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  if (value.length > 280) return { ok: false };
  return { ok: true, value };
}

async function findUserByEmail(env, email) {
  return env.DB.prepare("SELECT * FROM users WHERE email = ?1").bind(email).first();
}

async function createSession(env, userId) {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const now = nowSec();
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)"
  )
    .bind(tokenHash, userId, now, now + SESSION_TTL)
    .run();
  return token;
}

export async function getUser(request, env) {
  const token = getSessionToken(request);
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.display_name, u.avatar_key, u.bio, u.created_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?1 AND s.expires_at > ?2`
  )
    .bind(tokenHash, nowSec())
    .first();

  return row || null;
}

export async function verifyTurnstile(token, ip, env) {
  if (typeof token !== "string" || token.length === 0) return false;

  const secret = env.TURNSTILE_SECRET;
  // Fail closed: with no secret configured, sign-up is refused (set TURNSTILE_SECRET before go-live).
  if (!secret) return false;
  if (secret === TEST_TURNSTILE_SECRET) {
    return token.length > 0;
  }

  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  if (ip && ip !== "local") form.set("remoteip", ip);

  let response;
  try {
    response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
  } catch {
    return false;
  }

  if (!response.ok) return false;
  try {
    const result = await response.json();
    return result.success === true;
  } catch {
    return false;
  }
}

export async function signup(request, env) {
  const ip = clientIp(request);

  if (!(await hit(env, `signup:ip:${ip}`, 3, 3600))) {
    return error(429, "rate_limited", "Too many signup attempts. Try again later.");
  }

  const body = await readJson(request, 16 * 1024);
  const email = normalizeEmail(body.email);

  if (!validEmail(email)) {
    return error(400, "invalid_email", "Enter a valid email address.");
  }
  if (!validPassword(body.password)) {
    return error(400, "invalid_password", "Password must be 8 to 200 characters.");
  }

  const displayName = normalizeDisplayName(body.display_name);
  if (!displayName) {
    return error(400, "invalid_display_name", "Display name must be 2 to 40 characters.");
  }

  if (!(await verifyTurnstile(body.turnstile, ip, env))) {
    return error(400, "turnstile_failed", "Verification failed. Try again.");
  }

  if (await findUserByEmail(env, email)) {
    return error(409, "email_taken", "That email is already registered.");
  }

  const { hash, salt, iter } = await hashPassword(body.password, env.PBKDF2_ITER);
  const id = randomId();
  const createdAt = nowSec();

  try {
    await env.DB.prepare(
      `INSERT INTO users (id, email, pw_hash, pw_salt, pw_iter, display_name, avatar_key, bio, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL, ?7)`
    )
      .bind(id, email, hash, salt, iter, displayName, createdAt)
      .run();
  } catch (err) {
    if (String(err && err.message).toLowerCase().includes("unique")) {
      return error(409, "email_taken", "That email is already registered.");
    }
    throw err;
  }

  const token = await createSession(env, id);
  const user = {
    id,
    email,
    display_name: displayName,
    avatar_key: null,
    bio: null,
    created_at: createdAt,
  };

  return json({ user: publicUser(user) }, 201, { "Set-Cookie": sessionCookie(token) });
}

export async function login(request, env) {
  const ip = clientIp(request);
  const body = await readJson(request, 16 * 1024);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";

  const ipAllowed = await hit(env, `login:ip:${ip}`, 10, 900);
  const emailAllowed = email ? await hit(env, `login:email:${email}`, 5, 900) : true;
  if (!ipAllowed || !emailAllowed) {
    return error(429, "rate_limited", "Too many login attempts. Try again later.");
  }

  if (!validEmail(email) || !password) {
    return error(401, "bad_credentials", "Incorrect email or password.");
  }

  const row = await findUserByEmail(env, email);
  if (!row) {
    await verifyPassword(password, {
      hash: DUMMY_HASH,
      salt: DUMMY_SALT,
      iter: env.PBKDF2_ITER,
    });
    return error(401, "bad_credentials", "Incorrect email or password.");
  }

  const valid = await verifyPassword(password, {
    hash: row.pw_hash,
    salt: row.pw_salt,
    iter: row.pw_iter,
  });
  if (!valid) {
    return error(401, "bad_credentials", "Incorrect email or password.");
  }

  const now = nowSec();
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1 AND expires_at < ?2")
    .bind(row.id, now)
    .run();

  const token = await createSession(env, row.id);
  return json({ user: publicUser(row) }, 200, { "Set-Cookie": sessionCookie(token) });
}

export async function logout(request, env) {
  const token = getSessionToken(request);
  if (token) {
    const tokenHash = await sha256Hex(token);
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(tokenHash).run();
  }

  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
}

export async function me(request, env) {
  const user = await getUser(request, env);
  if (!user) {
    // A session probe should not log a failed request in the browser console.
    return json({ user: null }, 200, { "Cache-Control": "no-store" });
  }
  return json({ user: selfUser(user) }, 200, { "Cache-Control": "no-store" });
}

export async function updateMe(request, env) {
  const user = await getUser(request, env);
  if (!user) {
    return error(401, "not_signed_in", "You are not signed in.");
  }

  const body = await readJson(request, 16 * 1024);

  let displayName = user.display_name;
  if (body.display_name !== undefined) {
    const next = normalizeDisplayName(body.display_name);
    if (!next) {
      return error(400, "invalid_display_name", "Display name must be 2 to 40 characters.");
    }
    displayName = next;
  }

  let bio = user.bio;
  if (body.bio !== undefined) {
    const next = normalizeBio(body.bio);
    if (!next.ok) {
      return error(400, "invalid_bio", "Bio must be 280 characters or fewer.");
    }
    bio = next.value;
  }

  await env.DB.prepare("UPDATE users SET display_name = ?1, bio = ?2 WHERE id = ?3")
    .bind(displayName, bio, user.id)
    .run();

  return json({
    user: selfUser({ ...user, display_name: displayName, bio }),
  });
}
