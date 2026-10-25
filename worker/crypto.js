const MAX_ITER = 100000;

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

function clampIter(iter) {
  const value = Number(iter);
  if (!Number.isFinite(value) || value <= 0) return MAX_ITER;
  return Math.min(Math.floor(value), MAX_ITER);
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export function randomId() {
  return bytesToBase64Url(randomBytes(16));
}

export function randomToken() {
  return bytesToBase64Url(randomBytes(32));
}

export async function sha256Hex(str) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password, iter) {
  const iterations = clampIter(iter);
  const salt = randomBytes(16);
  const hash = await pbkdf2(password, salt, iterations);
  return {
    hash: bytesToBase64(hash),
    salt: bytesToBase64(salt),
    iter: iterations,
  };
}

export async function verifyPassword(password, { hash, salt, iter }) {
  const expected = base64ToBytes(hash);
  const actual = await pbkdf2(password, base64ToBytes(salt), clampIter(iter));
  return timingSafeEqual(expected, actual);
}
