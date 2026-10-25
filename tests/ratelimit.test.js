import { describe, expect, it } from "vitest";
import { api, createPost, nextIp, readJson, signupUser, uniqueEmail } from "./helpers.js";

const PASSWORD = "correct-horse-9";

const POST_BODY = {
  kind: "project",
  title: "Rate Limited Project",
  body_md: "",
  pitch: "Testing limits.",
  link: "",
  repo: "",
  code: "",
  prompts: [],
  tools: [],
  tags: ["game"],
};

describe("rate limits", () => {
  it("blocks the fourth signup from one IP", async () => {
    const ip = nextIp();

    for (let index = 0; index < 3; index += 1) {
      const response = await api("/api/auth/signup", {
        method: "POST",
        ip,
        body: {
          email: uniqueEmail("rate-signup"),
          password: PASSWORD,
          display_name: `Signup ${index}`,
          turnstile: "dev",
        },
      });
      expect(response.status).toBe(201);
    }

    const fourth = await api("/api/auth/signup", {
      method: "POST",
      ip,
      body: {
        email: uniqueEmail("rate-signup"),
        password: PASSWORD,
        display_name: "Signup Four",
        turnstile: "dev",
      },
    });
    expect(fourth.status).toBe(429);
    expect((await readJson(fourth)).error.code).toBe("rate_limited");
  });

  it("blocks the sixth failed login for one email", async () => {
    const user = await signupUser();
    const loginIp = nextIp();

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await api("/api/auth/login", {
        method: "POST",
        ip: loginIp,
        body: { email: user.email, password: "definitely-wrong" },
      });
      expect(response.status).toBe(401);
    }

    const sixth = await api("/api/auth/login", {
      method: "POST",
      ip: loginIp,
      body: { email: user.email, password: "definitely-wrong" },
    });
    expect(sixth.status).toBe(429);
    expect((await readJson(sixth)).error.code).toBe("rate_limited");
  });

  it("blocks the eleventh post in a day", async () => {
    const user = await signupUser();

    for (let index = 0; index < 10; index += 1) {
      const { response } = await createPost(
        user.cookie,
        { ...POST_BODY, title: `Daily Post ${index}` },
        user.ip
      );
      expect(response.status).toBe(201);
    }

    const eleventh = await createPost(
      user.cookie,
      { ...POST_BODY, title: "Daily Post Eleven" },
      user.ip
    );
    expect(eleventh.response.status).toBe(429);
    expect(eleventh.data.error.code).toBe("rate_limited");
  });

  it("blocks the thirty-first post edit in an hour", async () => {
    const user = await signupUser();
    const created = await createPost(user.cookie, POST_BODY, user.ip);
    expect(created.response.status).toBe(201);
    const postId = created.data.post.id;

    for (let index = 0; index < 30; index += 1) {
      const response = await api(`/api/posts/${encodeURIComponent(postId)}`, {
        method: "PATCH",
        cookie: user.cookie,
        ip: user.ip,
        body: { pitch: `Edit number ${index}` },
      });
      expect(response.status).toBe(200);
    }

    const blocked = await api(`/api/posts/${encodeURIComponent(postId)}`, {
      method: "PATCH",
      cookie: user.cookie,
      ip: user.ip,
      body: { pitch: "One edit too many" },
    });
    expect(blocked.status).toBe(429);
    expect((await readJson(blocked)).error.code).toBe("rate_limited");
  });
});
