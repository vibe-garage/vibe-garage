import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { api, readJson } from "./helpers.js";

describe("config", () => {
  it("returns the Turnstile sitekey without requiring sign-in", async () => {
    const response = await api("/api/config");

    expect(response.status).toBe(200);
    const data = await readJson(response);
    expect(data).toEqual({ turnstileSiteKey: env.TURNSTILE_SITEKEY });
    expect(data.turnstileSiteKey).toBeTruthy();
  });
});
