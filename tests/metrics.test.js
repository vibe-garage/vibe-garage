import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { api, signupUser } from "./helpers.js";
import { sha256Hex } from "../worker/crypto.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const OWNER_ID = "43PJtDjiETCrISmF-BgD4A";

async function ownerCookie() {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT OR IGNORE INTO users (id, email, pw_hash, pw_salt, pw_iter, display_name, created_at) VALUES (?1, 'owner@example.com', 'x', 'x', 1, 'Owner', ?2)"
  ).bind(OWNER_ID, now).run();
  const token = "owner-token-" + crypto.randomUUID();
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(await sha256Hex(token), OWNER_ID, now, now + 3600).run();
  return `vg_session=${token}`;
}

function beacon(body, { ua = UA, cookie, ip = "198.51.100.7" } = {}) {
  return api("/api/hit", { method: "POST", body, ip, cookie, headers: { "User-Agent": ua } });
}

const count = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM pageviews").first()).n;

describe("first-party metrics", () => {
  it("injects the beacon into tracked HTML pages only", async () => {
    const page = await (await api("/learn.html")).text();
    expect(page).toContain('fetch("/api/hit"');
    const home = await (await api("/")).text();
    expect(home).toContain('fetch("/api/hit"');
    const css = await (await api("/assets/style.css")).text();
    expect(css).not.toContain("/api/hit");
  });

  it("records a view with post id, external referrer, UTM, device and a hashed visitor", async () => {
    const before = await count();
    const res = await beacon({ p: "/learn.html", s: "?p=AbC123&utm_source=YouTube&utm_medium=video&utm_campaign=dual-gpu", r: "https://www.youtube.com/watch?v=x" }, { ua: MOBILE_UA });
    expect(res.status).toBe(204);
    expect(await count()).toBe(before + 1);
    const row = await env.DB.prepare("SELECT * FROM pageviews ORDER BY id DESC LIMIT 1").first();
    expect(row).toMatchObject({ path: "/learn.html", post_id: "AbC123", ref_host: "youtube.com", utm_source: "youtube", utm_medium: "video", utm_campaign: "dual-gpu", device: "mobile", signed_in: 0 });
    expect(row.vh).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(row)).not.toContain("198.51.100.7");
  });

  it("drops same-site referrers and skips bots, unknown paths and bad bodies", async () => {
    await beacon({ p: "/", s: "", r: "https://vibe-garage.test/learn.html" });
    const row = await env.DB.prepare("SELECT ref_host FROM pageviews ORDER BY id DESC LIMIT 1").first();
    expect(row.ref_host).toBeNull();
    const before = await count();
    expect((await beacon({ p: "/", s: "", r: "" }, { ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" })).status).toBe(204);
    await beacon({ p: "/", s: "", r: "" }, { ua: "curl/8.5.0" });
    await beacon({ p: "/.env", s: "", r: "" });
    await api("/api/hit", { method: "POST", rawBody: "nope", contentType: "text/plain", headers: { "User-Agent": UA } });
    expect(await count()).toBe(before);
  });

  it("flags signed-in views and leaves them out of stats by default", async () => {
    const cookie = await ownerCookie();
    await beacon({ p: "/account.html", s: "", r: "" }, { cookie });
    const row = await env.DB.prepare("SELECT signed_in FROM pageviews ORDER BY id DESC LIMIT 1").first();
    expect(row.signed_in).toBe(1);
    const s = await (await api("/api/stats", { cookie })).json();
    expect(s.top_pages.find((r) => r.k === "/account.html")).toBeUndefined();
    expect(s.signed_in_views_excluded).toBeGreaterThan(0);
    const all = await (await api("/api/stats?include_signed_in=1", { cookie })).json();
    expect(all.top_pages.find((r) => r.k === "/account.html")).toBeTruthy();
  });

  it("shows stats only to the owner", async () => {
    expect((await api("/api/stats")).status).toBe(404);
    expect((await api("/stats.html")).status).toBe(404);
    const other = await signupUser();
    expect((await api("/api/stats", { cookie: other.cookie })).status).toBe(404);
    const cookie = await ownerCookie();
    const res = await api("/api/stats", { cookie });
    expect(res.status).toBe(200);
    const s = await res.json();
    expect(s.totals.today.views).toBeGreaterThan(0);
    expect(s.utm_sources[0].k).toBe("youtube");
    expect(s.top_posts[0].id).toBe("AbC123");
    const page = await api("/stats.html", { cookie });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Vibe Garage stats");
  });
});
