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
