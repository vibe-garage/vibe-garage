import { describe, expect, it } from "vitest";
import { api } from "./helpers.js";

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
