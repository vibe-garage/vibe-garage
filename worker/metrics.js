// First-party page-view metrics on D1 (free plan; no third-party scripts).
// Pages served by the Worker get a tiny inline beacon that POSTs to /api/hit, so
// clients that don't run JS (most bots and scanners) are never counted.
import { error, json, readJson } from "./http.js";
import { getUser, COOKIE_NAME } from "./auth.js";
import { randomToken, sha256Hex } from "./crypto.js";

const PAGES = new Set([
  "/", "/index.html", "/learn.html", "/projects.html", "/project.html", "/submit.html",
  "/account.html", "/profile.html", "/forum.html", "/thread.html", "/challenges.html",
  "/leaderboard.html", "/guidelines.html", "/local-llm-guide.html",
]);
const BOT_RE = /bot|crawl|spider|slurp|scrape|preview|fetch|curl|wget|python|httpx|axios|go-http|java\/|okhttp|libwww|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|facebookexternalhit|embedly|whatsapp|telegram|discord|slack|vercel|node-fetch|undici/i;
const MOBILE_RE = /mobi|android|iphone|ipad|ipod/i;
const RETENTION_DAYS = 400;

export const BEACON =
  '<script>(function(){try{if(navigator.webdriver)return;fetch("/api/hit",{method:"POST",keepalive:true,' +
  'headers:{"Content-Type":"application/json"},body:JSON.stringify({p:location.pathname,s:location.search,' +
  'r:document.referrer})}).catch(function(){})}catch(e){}})()</script>';

export function isTrackedPage(pathname) {
  return PAGES.has(pathname);
}

function clip(value, max = 64) {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase().slice(0, max);
  return v || null;
}

export function isBot(request) {
  const ua = request.headers.get("User-Agent") || "";
  if (ua.length < 20 || BOT_RE.test(ua)) return true;
  const bm = request.cf && request.cf.botManagement;
  if (bm && (bm.verifiedBot || (typeof bm.score === "number" && bm.score < 30))) return true;
  return false;
}

let saltCache = { day: "", salt: "" };
async function dailySalt(env, day) {
  if (saltCache.day === day) return saltCache.salt;
  await env.DB.prepare("INSERT OR IGNORE INTO metrics_salt(day, salt) VALUES (?1, ?2)").bind(day, randomToken()).run();
  const row = await env.DB.prepare("SELECT salt FROM metrics_salt WHERE day = ?1").bind(day).first();
  saltCache = { day, salt: row.salt };
  return row.salt;
}

function hasSessionCookie(request) {
  const cookie = request.headers.get("Cookie") || "";
  return cookie.split(";").some((part) => part.trim().startsWith(`${COOKIE_NAME}=`));
}

export async function hit(request, env, ctx) {
  // Always 204 so the beacon never shows an error, even when the view is skipped.
  const done = () => new Response(null, { status: 204 });
  if (isBot(request)) return done();

  let body;
  try {
    body = await readJson(request, 4096);
  } catch {
    return done();
  }
  const path = typeof body.p === "string" ? body.p : "";
  if (!isTrackedPage(path)) return done();

  const site = new URL(request.url).host;
  let params;
  try {
    params = new URLSearchParams(typeof body.s === "string" ? body.s.slice(0, 512) : "");
  } catch {
    params = new URLSearchParams();
  }
  let refHost = null;
  try {
    if (typeof body.r === "string" && body.r) {
      const h = new URL(body.r).hostname.toLowerCase().replace(/^www\./, "");
      if (h && h !== site) refHost = h.slice(0, 100);
    }
  } catch { /* ignore bad referrers */ }

  const now = Math.floor(Date.now() / 1000);
  const day = new Date(now * 1000).toISOString().slice(0, 10);
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const ua = request.headers.get("User-Agent") || "";
  const salt = await dailySalt(env, day);
  const vh = (await sha256Hex(`${salt}|${ip}|${ua}`)).slice(0, 16);
  const rawPost = path === "/learn.html" || path === "/project.html" ? params.get("p") : null;
  const postId = rawPost ? rawPost.trim().slice(0, 40) || null : null;

  await env.DB.prepare(
    `INSERT INTO pageviews(ts, day, path, post_id, ref_host, utm_source, utm_medium, utm_campaign, country, device, vh, signed_in)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
  )
    .bind(
      now, day, path === "/index.html" ? "/" : path, postId, refHost,
      clip(params.get("utm_source")), clip(params.get("utm_medium")), clip(params.get("utm_campaign")),
      (request.cf && request.cf.country) || null, MOBILE_RE.test(ua) ? "mobile" : "desktop", vh,
      hasSessionCookie(request) ? 1 : 0
    )
    .run();

  // Housekeeping about once per 50 views: drop old salts and rows past retention.
  if (Math.random() < 0.02 && ctx && ctx.waitUntil) {
    ctx.waitUntil(env.DB.batch([
      env.DB.prepare("DELETE FROM metrics_salt WHERE day < ?1").bind(day),
      env.DB.prepare("DELETE FROM pageviews WHERE ts < ?1").bind(now - RETENTION_DAYS * 86400),
    ]));
  }
  return done();
}

export async function isOwner(request, env) {
  const ids = String(env.STATS_OWNER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return false;
  const user = await getUser(request, env);
  return Boolean(user && ids.includes(user.id));
}

export async function stats(request, env) {
  if (!(await isOwner(request, env))) return error(404, "not_found", "Not found.");

  const url = new URL(request.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 30, 1), RETENTION_DAYS);
  const own = url.searchParams.get("include_signed_in") === "1";
  const now = Math.floor(Date.now() / 1000);
  const today = new Date(now * 1000).toISOString().slice(0, 10);
  const since = now - days * 86400;
  const f = own ? "" : " AND signed_in = 0";
  const db = env.DB;
  const top = (col) =>
    db.prepare(
      `SELECT ${col} AS k, COUNT(*) AS views, COUNT(DISTINCT day || vh) AS uniques FROM pageviews
       WHERE ts >= ?1 AND ${col} IS NOT NULL${f} GROUP BY ${col} ORDER BY views DESC LIMIT 15`
    ).bind(since);
  const win = (cond) =>
    db.prepare(`SELECT COUNT(*) AS views, COUNT(DISTINCT day || vh) AS uniques FROM pageviews WHERE ${cond}${f}`);

  const r = await db.batch([
    win("day = ?1").bind(today),
    win("ts >= ?1").bind(now - 7 * 86400),
    win("ts >= ?1").bind(now - 30 * 86400),
    db.prepare(
      `SELECT v.post_id AS id, p.title, p.kind, COUNT(*) AS views, COUNT(DISTINCT v.day || v.vh) AS uniques
       FROM pageviews v LEFT JOIN posts p ON p.id = v.post_id
       WHERE v.ts >= ?1 AND v.post_id IS NOT NULL${f.replace("signed_in", "v.signed_in")}
       GROUP BY v.post_id ORDER BY views DESC LIMIT 15`
    ).bind(since),
    top("path"), top("ref_host"), top("utm_source"), top("utm_medium"), top("utm_campaign"),
    top("country"), top("device"),
    db.prepare(
      `SELECT day, COUNT(*) AS views, COUNT(DISTINCT vh) AS uniques FROM pageviews
       WHERE ts >= ?1${f} GROUP BY day ORDER BY day`
    ).bind(since),
    db.prepare("SELECT COUNT(*) AS views FROM pageviews WHERE ts >= ?1 AND signed_in = 1").bind(since),
  ]);
  const rows = (i) => r[i].results || [];
  return json(
    {
      generated_at: now,
      window_days: days,
      includes_signed_in: own,
      note: "Days are UTC. Uniques are distinct visitors per day (the visitor hash rotates daily), summed over the window.",
      totals: { today: rows(0)[0], last_7d: rows(1)[0], last_30d: rows(2)[0] },
      top_posts: rows(3),
      top_pages: rows(4),
      referrers: rows(5),
      utm_sources: rows(6),
      utm_mediums: rows(7),
      utm_campaigns: rows(8),
      countries: rows(9),
      devices: rows(10),
      daily: rows(11),
      signed_in_views_excluded: own ? 0 : rows(12)[0].views,
    },
    200,
    { "Cache-Control": "no-store" }
  );
}
