import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import {
  api,
  nextIp,
  readJson,
  sessionCookie,
  signupUser,
  uniqueEmail,
} from "./helpers.js";

const PASSWORD = "correct-horse-9";

describe("auth", () => {
  it("signs up with a secure session cookie", async () => {
    const email = uniqueEmail("signup");
    const response = await api("/api/auth/signup", {
      method: "POST",
      ip: nextIp(),
      body: {
        email,
        password: PASSWORD,
        display_name: "Ada Byte",
        turnstile: "dev",
      },
    });

    expect(response.status).toBe(201);
    const setCookie = response.headers.get("set-cookie") || "";
    expect(setCookie).toMatch(/^vg_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);

    const data = await readJson(response);
    expect(data.user).toMatchObject({ display_name: "Ada Byte" });
    expect(data.user).not.toHaveProperty("pw_hash");
    expect(data.user).not.toHaveProperty("email");

    const row = await env.DB.prepare("SELECT * FROM users WHERE email = ?1")
      .bind(email)
      .first();
    expect(row.email).toBe(email);
    expect(row.pw_hash).not.toBe(PASSWORD);
    expect(row.pw_hash).not.toContain(PASSWORD);
    expect(row.pw_iter).toBeLessThanOrEqual(100000);
  });

  it("rejects a duplicate email", async () => {
    const first = await signupUser();
    expect(first.response.status).toBe(201);

    const duplicate = await api("/api/auth/signup", {
      method: "POST",
      ip: nextIp(),
      body: {
        email: first.email,
        password: PASSWORD,
        display_name: "Copy Cat",
        turnstile: "dev",
      },
    });

    expect(duplicate.status).toBe(409);
    const data = await readJson(duplicate);
    expect(data.error.code).toBe("email_taken");
  });

  it("validates email, password, display name and turnstile", async () => {
    const badEmail = await api("/api/auth/signup", {
      method: "POST",
      ip: nextIp(),
      body: {
        email: "not-an-email",
        password: PASSWORD,
        display_name: "Valid Name",
        turnstile: "dev",
      },
    });
    expect(badEmail.status).toBe(400);
    expect((await readJson(badEmail)).error.code).toBe("invalid_email");

    const shortPassword = await api("/api/auth/signup", {
      method: "POST",
      ip: nextIp(),
      body: {
        email: uniqueEmail("short-pw"),
        password: "short",
        display_name: "Valid Name",
        turnstile: "dev",
      },
    });
    expect(shortPassword.status).toBe(400);
    expect((await readJson(shortPassword)).error.code).toBe("invalid_password");

    const shortName = await api("/api/auth/signup", {
      method: "POST",
      ip: nextIp(),
      body: {
        email: uniqueEmail("short-name"),
        password: PASSWORD,
        display_name: "A",
        turnstile: "dev",
      },
    });
    expect(shortName.status).toBe(400);
    expect((await readJson(shortName)).error.code).toBe("invalid_display_name");

    const noTurnstile = await api("/api/auth/signup", {
      method: "POST",
      ip: nextIp(),
      body: {
        email: uniqueEmail("no-turnstile"),
        password: PASSWORD,
        display_name: "Valid Name",
      },
    });
    expect(noTurnstile.status).toBe(400);
    expect((await readJson(noTurnstile)).error.code).toBe("turnstile_failed");
  });

  it("uses the same message for a wrong password and an unknown email", async () => {
    const user = await signupUser();
    expect(user.response.status).toBe(201);

    const wrongPassword = await api("/api/auth/login", {
      method: "POST",
      ip: nextIp(),
      body: { email: user.email, password: "wrong-password-123" },
    });
    expect(wrongPassword.status).toBe(401);
    const wrongData = await readJson(wrongPassword);

    const unknownEmail = await api("/api/auth/login", {
      method: "POST",
      ip: nextIp(),
      body: { email: uniqueEmail("missing"), password: PASSWORD },
    });
    expect(unknownEmail.status).toBe(401);
    const unknownData = await readJson(unknownEmail);

    expect(wrongData.error.message).toBe("Incorrect email or password.");
    expect(unknownData.error.message).toBe(wrongData.error.message);

    const ok = await api("/api/auth/login", {
      method: "POST",
      ip: nextIp(),
      body: { email: user.email, password: PASSWORD },
    });
    expect(ok.status).toBe(200);
    expect(sessionCookie(ok)).toMatch(/^vg_session=/);
    expect((await readJson(ok)).user.display_name).toBe(user.displayName);
  });

  it("returns a null user without a cookie and the user when signed in", async () => {
    const anonymous = await api("/api/me");
    expect(anonymous.status).toBe(200);
    expect(await readJson(anonymous)).toEqual({ user: null });

    const user = await signupUser({ display_name: "Signed In" });
    const signedIn = await api("/api/me", { cookie: user.cookie });
    expect(signedIn.status).toBe(200);
    const data = await readJson(signedIn);
    expect(data.user).toMatchObject({
      id: user.user.id,
      email: user.email,
      display_name: "Signed In",
    });
  });

  it("invalidates the session on logout", async () => {
    const user = await signupUser();

    const logout = await api("/api/auth/logout", {
      method: "POST",
      cookie: user.cookie,
      body: {},
    });
    expect(logout.status).toBe(200);
    expect(logout.headers.get("set-cookie")).toMatch(/Max-Age=0/);

    const me = await api("/api/me", { cookie: user.cookie });
    expect(me.status).toBe(200);
    expect(await readJson(me)).toEqual({ user: null });
  });

  it("updates the display name with PATCH /api/me", async () => {
    const user = await signupUser({ display_name: "Old Name" });

    const patch = await api("/api/me", {
      method: "PATCH",
      cookie: user.cookie,
      body: { display_name: "New Name" },
    });
    expect(patch.status).toBe(200);
    expect((await readJson(patch)).user.display_name).toBe("New Name");

    const me = await api("/api/me", { cookie: user.cookie });
    expect((await readJson(me)).user.display_name).toBe("New Name");
  });

  it("blocks cross-origin POST requests", async () => {
    const response = await api("/api/auth/logout", {
      method: "POST",
      origin: "https://evil.example",
      body: {},
    });
    expect(response.status).toBe(403);
    expect((await readJson(response)).error.code).toBe("forbidden_origin");
  });
});
