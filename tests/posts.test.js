import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { api, createPost, nextIp, readJson, signupUser } from "./helpers.js";

const PROJECT = {
  kind: "project",
  title: "Hit Stop Demo",
  body_md: "",
  pitch: "A tiny fighting game that freezes on impact.",
  link: "https://example.com/hit-stop",
  repo: "https://github.com/example/hit-stop",
  code: "func hit_stop(): pass",
  prompts: ["make it punchy", "add screen shake"],
  tools: ["Cursor", "Claude"],
  tags: ["game", "fun"],
};

describe("posts", () => {
  it("creates a project with every wizard field and reads it back", async () => {
    const user = await signupUser({ display_name: "Lexi Volt" });
    const { response, data } = await createPost(user.cookie, PROJECT, user.ip);
    expect(response.status).toBe(201);

    const post = data.post;
    expect(post).toMatchObject({
      kind: "project",
      title: PROJECT.title,
      pitch: PROJECT.pitch,
      link: PROJECT.link,
      repo: PROJECT.repo,
      code: PROJECT.code,
      prompts: PROJECT.prompts,
      tools: PROJECT.tools,
      tags: PROJECT.tags,
    });
    expect(post.author).toMatchObject({
      id: user.user.id,
      display_name: "Lexi Volt",
    });

    const read = await api(`/api/posts/${encodeURIComponent(post.id)}`);
    expect(read.status).toBe(200);
    const readPost = (await readJson(read)).post;
    expect(readPost.title).toBe(PROJECT.title);
    expect(readPost.code).toBe(PROJECT.code);
    expect(readPost.author.display_name).toBe("Lexi Volt");
  });

  it("creates a guide, lists by kind newest first, and rejects unauthenticated posts", async () => {
    const user = await signupUser();

    const first = await createPost(user.cookie, PROJECT, user.ip);
    expect(first.response.status).toBe(201);
    const firstId = first.data.post.id;

    const second = await createPost(
      user.cookie,
      { ...PROJECT, title: "Newer Project" },
      user.ip
    );
    expect(second.response.status).toBe(201);
    expect(second.data.post.id).not.toBe(firstId);

    const guide = await createPost(
      user.cookie,
      {
        kind: "guide",
        title: "How I shipped it",
        body_md: "## The setup\n\nThis guide has more than twenty characters.",
        link: "",
        repo: "",
        code: "",
        prompts: [],
        tools: [],
        tags: ["writing"],
      },
      user.ip
    );
    expect(guide.response.status).toBe(201);

    await env.DB.prepare("UPDATE posts SET created_at = ?1 WHERE id = ?2")
      .bind(Math.floor(Date.now() / 1000) - 60, firstId)
      .run();

    const projects = await api(
      `/api/posts?kind=project&user=${encodeURIComponent(user.user.id)}`
    );
    expect(projects.status).toBe(200);
    const projectList = (await readJson(projects)).posts;
    expect(projectList.map((post) => post.id)).toEqual([
      second.data.post.id,
      firstId,
    ]);
    expect(projectList.every((post) => post.kind === "project")).toBe(true);

    const guides = await api(
      `/api/posts?kind=guide&user=${encodeURIComponent(user.user.id)}`
    );
    const guideList = (await readJson(guides)).posts;
    expect(guideList[0].id).toBe(guide.data.post.id);
    expect(guideList.every((post) => post.kind === "guide")).toBe(true);

    const signedOut = await api("/api/posts", {
      method: "POST",
      ip: nextIp(),
      body: PROJECT,
    });
    expect(signedOut.status).toBe(401);
    expect((await readJson(signedOut)).error.code).toBe("not_signed_in");
  });

  it("validates titles, links and tag counts", async () => {
    const user = await signupUser();

    const shortTitle = await createPost(
      user.cookie,
      { ...PROJECT, title: "ab" },
      user.ip
    );
    expect(shortTitle.response.status).toBe(400);

    const httpLink = await createPost(
      user.cookie,
      { ...PROJECT, title: "Valid Title", link: "http://example.com/insecure" },
      user.ip
    );
    expect(httpLink.response.status).toBe(400);
    expect(httpLink.data.error.message).toContain("https://");

    const tooManyTags = await createPost(
      user.cookie,
      {
        ...PROJECT,
        title: "Valid Title",
        tags: Array.from({ length: 13 }, (_value, index) => `tag-${index}`),
      },
      user.ip
    );
    expect(tooManyTags.response.status).toBe(400);
    expect(tooManyTags.data.error.message).toContain("at most 12");
  });

  it("detects likely secrets in prompts and code", async () => {
    const user = await signupUser();

    const openAiStyle = await createPost(
      user.cookie,
      {
        ...PROJECT,
        title: "Leaky Prompt",
        prompts: ["make it punchy sk-demo-not-a-real-key-0000"],
      },
      user.ip
    );
    expect(openAiStyle.response.status).toBe(400);
    expect(openAiStyle.data.error.code).toBe("secret_detected");
    expect(openAiStyle.data.error.message).toContain("looks like a secret");

    const githubToken = await createPost(
      user.cookie,
      {
        ...PROJECT,
        title: "Leaky Code",
        code: `const token = "ghp_${"a".repeat(36)}";`,
      },
      user.ip
    );
    expect(githubToken.response.status).toBe(400);
    expect(githubToken.data.error.code).toBe("secret_detected");
  });

  it("only lets the owner edit and delete, and hides deleted posts", async () => {
    const owner = await signupUser({ display_name: "Owner" });
    const other = await signupUser({ display_name: "Other" });

    const created = await createPost(owner.cookie, PROJECT, owner.ip);
    expect(created.response.status).toBe(201);
    const postId = created.data.post.id;
    const before = created.data.post;

    const kept = await createPost(
      owner.cookie,
      { ...PROJECT, title: "Kept Project" },
      owner.ip
    );
    expect(kept.response.status).toBe(201);

    const foreignPatch = await api(`/api/posts/${encodeURIComponent(postId)}`, {
      method: "PATCH",
      cookie: other.cookie,
      ip: other.ip,
      body: { pitch: "Not mine" },
    });
    expect(foreignPatch.status).toBe(403);

    const foreignDelete = await api(`/api/posts/${encodeURIComponent(postId)}`, {
      method: "DELETE",
      cookie: other.cookie,
      ip: other.ip,
    });
    expect(foreignDelete.status).toBe(403);

    const patch = await api(`/api/posts/${encodeURIComponent(postId)}`, {
      method: "PATCH",
      cookie: owner.cookie,
      ip: owner.ip,
      body: { pitch: "A brand new pitch." },
    });
    expect(patch.status).toBe(200);
    const patched = (await readJson(patch)).post;
    expect(patched.pitch).toBe("A brand new pitch.");
    expect(patched.updated_at).toBeGreaterThan(before.updated_at);

    const remove = await api(`/api/posts/${encodeURIComponent(postId)}`, {
      method: "DELETE",
      cookie: owner.cookie,
      ip: owner.ip,
    });
    expect(remove.status).toBe(200);

    const gone = await api(`/api/posts/${encodeURIComponent(postId)}`);
    expect(gone.status).toBe(404);

    const list = await api("/api/posts?kind=project");
    const posts = (await readJson(list)).posts;
    expect(posts.some((post) => post.id === postId)).toBe(false);

    const profile = await api(`/api/users/${encodeURIComponent(owner.user.id)}`);
    expect(profile.status).toBe(200);
    const payload = await readJson(profile);
    expect(payload.user.display_name).toBe("Owner");
    expect(payload.user).not.toHaveProperty("email");
    expect(payload.posts.some((post) => post.id === kept.data.post.id)).toBe(true);
    expect(payload.posts.some((post) => post.id === postId)).toBe(false);
    expect(JSON.stringify(payload)).not.toContain(owner.email);
  });

  it("ignores the retired feedback field and keeps old rows valid", async () => {
    const user = await signupUser();
    const created = await createPost(user.cookie, { ...PROJECT, feedback: "not-a-level" }, user.ip);
    expect(created.response.status).toBe(201);
    expect(created.data.post).not.toHaveProperty("feedback");
    const id = created.data.post.id;

    const row = await env.DB.prepare("SELECT feedback FROM posts WHERE id = ?1").bind(id).first();
    expect(row.feedback).toBeNull();

    // A row written before the field was retired still reads and edits cleanly.
    await env.DB.prepare("UPDATE posts SET feedback = 'tear' WHERE id = ?1").bind(id).run();
    const edit = await api(`/api/posts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      cookie: user.cookie,
      ip: user.ip,
      body: { title: "Edited Title", feedback: "gentle" },
    });
    expect(edit.status).toBe(200);
    const edited = (await readJson(edit)).post;
    expect(edited.title).toBe("Edited Title");
    expect(edited).not.toHaveProperty("feedback");
    const after = await env.DB.prepare("SELECT feedback FROM posts WHERE id = ?1").bind(id).first();
    expect(after.feedback).toBe("tear");

    const read = await api(`/api/posts/${encodeURIComponent(id)}`);
    expect(read.status).toBe(200);
  });

  it("returns 404 for malformed percent-encoding in a path parameter", async () => {
    const response = await api("/api/posts/%E0");
    expect(response.status).toBe(404);
    expect((await readJson(response)).error.code).toBe("not_found");
  });
});
