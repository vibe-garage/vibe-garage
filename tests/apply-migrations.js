import { env, applyD1Migrations } from "cloudflare:test";

const migrations = env.TEST_MIGRATIONS;

if (!Array.isArray(migrations)) {
  throw new Error("TEST_MIGRATIONS binding is missing from the test config.");
}

await applyD1Migrations(env.DB, migrations);
