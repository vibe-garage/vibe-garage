import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { api, createPost, readJson, signupUser, tinyPng } from "./helpers.js";

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngHeaderOnly(size) {
  const bytes = new Uint8Array(size);
  bytes.set(PNG_MAGIC, 0);
  return bytes;
}

describe("images", () => {
  it("uploads a PNG and serves it back with the right type", async () => {
    const user = await signupUser();
    const png = tinyPng();

    const upload = await api("/api/images", {
      method: "PUT",
      cookie: user.cookie,
      ip: user.ip,
      rawBody: png,
      contentType: "image/png",
    });
    expect(upload.status).toBe(201);

    const data = await readJson(upload);
    expect(data.key).toBeTruthy();
    expect(data.url).toBe(`/img/${data.key}`);

    const served = await api(`/img/${encodeURIComponent(data.key)}`);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    const servedBytes = new Uint8Array(await served.arrayBuffer());
    expect(Array.from(servedBytes)).toEqual(Array.from(png));
  });

  it("rejects files whose bytes do not match an allowed image", async () => {
    const user = await signupUser();

    const upload = await api("/api/images", {
      method: "PUT",
      cookie: user.cookie,
      ip: user.ip,
      rawBody: new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]),
      contentType: "image/png",
    });

    expect([400, 415]).toContain(upload.status);
  });

  it("rejects images larger than 1 MiB", async () => {
    const user = await signupUser();

    const upload = await api("/api/images", {
      method: "PUT",
      cookie: user.cookie,
      ip: user.ip,
      rawBody: pngHeaderOnly(1048577),
      contentType: "image/png",
    });

    expect(upload.status).toBe(413);
  });

  it("requires a signed-in user", async () => {
    const upload = await api("/api/images", {
      method: "PUT",
      rawBody: tinyPng(),
      contentType: "image/png",
    });
    expect(upload.status).toBe(401);
  });

  it("rejects an image_key owned by another user", async () => {
    const owner = await signupUser();
    const other = await signupUser();

    const upload = await api("/api/images", {
      method: "PUT",
      cookie: owner.cookie,
      ip: owner.ip,
      rawBody: tinyPng(),
      contentType: "image/png",
    });
    expect(upload.status).toBe(201);
    const { key } = await readJson(upload);

    const { response, data } = await createPost(
      other.cookie,
      {
        kind: "project",
        title: "Borrowed Image",
        body_md: "",
        pitch: "Not my image.",
        link: "",
        repo: "",
        code: "",
        prompts: [],
        tools: [],
        tags: ["game"],
        image_key: key,
      },
      other.ip
    );

    expect(response.status).toBe(400);
    expect(data.error.message).toContain("another account");
  });

  it("lets the owner use the uploaded image_key", async () => {
    const owner = await signupUser();

    const upload = await api("/api/images", {
      method: "PUT",
      cookie: owner.cookie,
      ip: owner.ip,
      rawBody: tinyPng(),
      contentType: "image/png",
    });
    expect(upload.status).toBe(201);
    const { key } = await readJson(upload);

    const row = await env.DB.prepare("SELECT * FROM images WHERE key = ?1")
      .bind(key)
      .first();
    expect(row.user_id).toBe(owner.user.id);
    expect(row.type).toBe("image/png");

    const { response, data } = await createPost(
      owner.cookie,
      {
        kind: "project",
        title: "Own Image Project",
        body_md: "",
        pitch: "This screenshot is mine.",
        link: "",
        repo: "",
        code: "",
        prompts: [],
        tools: [],
        tags: ["game"],
        image_key: key,
      },
      owner.ip
    );

    expect(response.status).toBe(201);
    expect(data.post.image).toBe(`/img/${key}`);
  });
});
