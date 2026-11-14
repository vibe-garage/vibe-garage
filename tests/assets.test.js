import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { api, ORIGIN } from "./helpers.js";

describe("giscus theme stylesheets", () => {
  for (const file of ["giscus-theme.css", "giscus-theme-light.css"]) {
    it(`serves /assets/${file} with a CORS header for giscus.app`, async () => {
      const response = await api(`/assets/${file}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/css");
      expect(response.headers.get("access-control-allow-origin")).toBe("https://giscus.app");
      expect((await response.text()).length).toBeGreaterThan(100);
    });
  }

  it("does not add the CORS header to other assets", async () => {
    const response = await api("/assets/style.css");
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("spark-swarm trailing slash", () => {
  it("redirects /spark-swarm to /spark-swarm/ with 301", async () => {
    const response = await SELF.fetch(`${ORIGIN}/spark-swarm`, { redirect: "manual" });
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/spark-swarm/`);
  });

  it("keeps the query string on the redirect", async () => {
    const response = await SELF.fetch(`${ORIGIN}/spark-swarm?ref=nav`, { redirect: "manual" });
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/spark-swarm/?ref=nav`);
  });

  it("serves /spark-swarm/ as 200", async () => {
    const response = await api("/spark-swarm/");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
  });
});

describe("favicon", () => {
  it("serves /favicon.ico", async () => {
    const response = await api("/favicon.ico");
    expect(response.status).toBe(200);
    const type = (response.headers.get("content-type") || "").toLowerCase();
    expect(type.includes("icon") || type.includes("image") || type.includes("octet-stream")).toBe(true);
    expect(Number(response.headers.get("content-length") || 0) || (await response.arrayBuffer()).byteLength).toBeGreaterThan(100);
  });
});

describe("public author identity", () => {
  const BANNED = ["firestarterxox", "github.com/firestarterxox"];

  async function read(path) {
    const response = await api(path);
    expect(response.status).toBe(200);
    return response.text();
  }

  it("does not serve the personal GitHub login in public JSON, the feed, or app.js", async () => {
    const bodies = await Promise.all([
      read("/data/members.json"),
      read("/data/discussions.json"),
      read("/data/projects.json"),
      read("/data/guides.json"),
      read("/data/challenges.json"),
      read("/feed.xml"),
      read("/assets/app.js"),
    ]);
    for (const body of bodies) {
      const lower = body.toLowerCase();
      for (const token of BANNED) {
        expect(lower).not.toContain(token.toLowerCase());
      }
    }
  });

  it("shows the welcome thread and member as Vibe Garage team, with no GitHub profile URL", async () => {
    const members = JSON.parse(await read("/data/members.json"));
    const discussions = JSON.parse(await read("/data/discussions.json"));
    expect(members.members).toHaveLength(1);
    const member = members.members[0];
    expect(member.login).toBe("Vibe Garage team");
    expect(member.url).toBe("");
    expect(member.avatar).toBe("/assets/icon-192.png");

    const welcome = discussions.threads.find((t) => t.id === "gh-1");
    expect(welcome).toBeTruthy();
    expect(welcome.by).toBe("Vibe Garage team");
    expect(welcome.avatar).toBe("/assets/icon-192.png");
  });

  it("does not invent a GitHub profile URL from a login in app.js", async () => {
    const js = await read("/assets/app.js");
    expect(js).not.toMatch(/https:\/\/github\.com\/\$\{esc\(login\)\}/);
    expect(js).not.toMatch(/https:\/\/github\.com\/" \+ m\.login/);
  });
});

describe("spark-swarm episode pages", () => {
  for (const ep of ["ep01", "ep02", "ep03", "ep04"]) {
    it(`serves /spark-swarm/${ep}.html with the page-view beacon`, async () => {
      const response = await api(`/spark-swarm/${ep}.html`);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("/api/hit");
    });

    it(`serves /spark-swarm/${ep}.zip`, async () => {
      const response = await api(`/spark-swarm/${ep}.zip`);
      expect(response.status).toBe(200);
      await response.arrayBuffer();
    });
  }
});
