#!/usr/bin/env node
// Adds or refreshes ?v=<hash> on every page's links to the shared CSS and JS in assets/,
// so browsers fetch a new copy as soon as the file changes. The version is the first
// 10 hex characters of the file's SHA-256, so unchanged files keep their URL.
// It also stamps the giscus theme stylesheets, which are loaded by URL from JS
// (assets/app.js and assets/config.js), not from HTML. Those are stamped first, because
// stamping changes app.js and config.js, whose new hashes then go into the pages.
// Run after editing anything in assets/:  node scripts/cache-bust.mjs
// Idempotent: a second run changes nothing. Existing ?v= values may be upper- or lowercase.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = ["style.css", "config.js", "data.js", "icons.js", "art.js", "md.js", "native.js", "app.js", "guide.js"];
// Stylesheets referenced by URL string inside these scripts (the giscus iframe loads them).
const JS_REFERENCED = ["giscus-theme.css", "giscus-theme-light.css"];
const JS_FILES = ["app.js", "config.js"];

const hashOf = (f) => createHash("sha256").update(readFileSync(join(ROOT, "assets", f))).digest("hex").slice(0, 10);
const escape = (f) => f.replace(/[.]/g, "\\.");
const V = "(?:\\?v=[0-9a-fA-F]+)?";

let changed = 0;
const rewrite = (path, label, re, stamp) => {
  const before = readFileSync(path, "utf8");
  const after = before.replace(re, stamp);
  if (after !== before) {
    writeFileSync(path, after);
    changed++;
    console.log(`updated ${label}`);
  }
};

// 1. giscus theme URLs inside JS string literals: ".../assets/giscus-theme.css[?v=...]" followed by a quote.
// The URLs stay absolute (siteBase() + "assets/..." or the full URL in config.js); only the query changes.
const cssVersion = Object.fromEntries(JS_REFERENCED.map((f) => [f, hashOf(f)]));
const cssRef = new RegExp(`(assets/(${JS_REFERENCED.map(escape).join("|")}))${V}(?=["'\`])`, "g");
for (const f of JS_FILES) {
  rewrite(join(ROOT, "assets", f), `assets/${f}`, cssRef, (_m, path, file) => `${path}?v=${cssVersion[file]}`);
}

// 2. CSS and JS links in the pages, hashed after step 1 so app.js and config.js versions are current.
const version = Object.fromEntries(ASSETS.map((f) => [f, hashOf(f)]));
// (href|src)="[/]assets/<file>[?v=...]"
const ref = new RegExp(`((?:href|src)="/?assets/(${ASSETS.map(escape).join("|")}))${V}"`, "g");

for (const page of readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort()) {
  rewrite(join(ROOT, page), page, ref, (_m, attr, file) => `${attr}?v=${version[file]}"`);
}
console.log(changed ? `${changed} file(s) updated` : "all files already current");
