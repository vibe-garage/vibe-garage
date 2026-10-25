import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

const root = fileURLToPath(new URL(".", import.meta.url));
const migrations = await readD1Migrations(path.join(root, "migrations"));

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: path.join(root, "wrangler.jsonc") },
      remoteBindings: false,
      miniflare: {
        // The bundled workerd supports up to this date; wrangler.jsonc targets a newer one.
        compatibilityDate: "2026-08-22",
        d1Databases: ["DB"],
        kvNamespaces: ["IMAGES"],
        bindings: {
          TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
          TEST_MIGRATIONS: migrations,
        },
      },
    }),
  ],
  test: {
    include: ["tests/**/*.test.js"],
    setupFiles: ["tests/apply-migrations.js"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
