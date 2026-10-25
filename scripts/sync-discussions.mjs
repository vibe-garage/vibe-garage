#!/usr/bin/env node
// Pulls GitHub Discussions into static files for the site:
//   data/discussions.json, data/projects.json, data/members.json,
//   data/challenges.json, data/guides.json, feed.xml, sitemap.xml, robots.txt
// Auth: GITHUB_TOKEN env (GitHub Actions) or, locally, the `gh` CLI if it is logged in.
// `gh` can wrap JSON in ANSI color when FORCE_COLOR is set. This script clears the
// color env vars and strips ANSI before parsing.
import fs from "node:fs";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const COMMENT_SAMPLE = 50;
const PAGE_SIZE = 50;
const MAX_PAGES = 6;
const POLL_OPTIONS = 20;
// Leaderboard: projects*10 + threads*3 + replies*1 + reactions received.
const SCORE_WEIGHTS = { projects: 10, threads: 3, replies: 1, reactions: 1 };
const SCORE_TEXT = "projects*10 + threads*3 + replies*1 + reactions";
const REACTIONS = [
  ["thumbsUp", "THUMBS_UP"],
  ["thumbsDown", "THUMBS_DOWN"],
  ["laugh", "LAUGH"],
  ["hooray", "HOORAY"],
  ["confused", "CONFUSED"],
  ["heart", "HEART"],
  ["rocket", "ROCKET"],
  ["eyes", "EYES"],
];
const EMPTY_FEED_UPDATED = "1970-01-01T00:00:00Z";

const FBMAP = [[/tear it apart/i, "tear"], [/gentle/i, "gentle"], [/just vibes|no critique/i, "vibes"]];
const fbOf = (t) => (FBMAP.find(([re]) => re.test(t || "")) || [, ""])[1];

function sections(body) {
  const out = {};
  const parts = (body || "").split(/^###\s+(.+)$/m);
  for (let i = 1; i < parts.length; i += 2) out[parts[i].trim().toLowerCase()] = (parts[i + 1] || "").trim();
  return out;
}
const list = (s) => (s || "").split(/[,\n]/).map((x) => x.replace(/^[-*#\s]+/, "").trim()).filter((x) => x && !/^_?no response_?$/i.test(x));
const strip = (s) => (s || "").replace(/^_?no response_?$/i, "").trim();

function stripAnsi(s) {
  return String(s).replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
}

export function parseJson(raw) {
  const clean = stripAnsi(raw);
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("gh did not return JSON");
  return JSON.parse(clean.slice(start, end + 1));
}

export function discussionQuery() {
  const reactions = REACTIONS.map(([alias, content]) => `${alias}:reactions(content:${content}){totalCount}`).join(" ");
  return `query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){
    discussionCategories(first:50){nodes{id name slug emoji}}
    pinnedDiscussions(first:10){nodes{discussion{number}}}
    discussions(first:${PAGE_SIZE},after:$after,orderBy:{field:UPDATED_AT,direction:DESC}){pageInfo{hasNextPage endCursor}
      nodes{number title url body bodyHTML bodyText createdAt updatedAt upvoteCount closed
        author{login avatarUrl(size:80) url}
        category{name slug}
        labels(first:10){nodes{name}}
        comments(first:${COMMENT_SAMPLE}){totalCount nodes{author{login avatarUrl(size:80) url} createdAt reactions{totalCount}}}
        reactions{totalCount}
        ${reactions}
        poll{question totalVoteCount options(first:${POLL_OPTIONS}){nodes{option totalVoteCount}}}}}}} `;
}

function reactionsOf(d) {
  const n = (k) => d?.[k]?.totalCount || 0;
  const thumbsUp = n("thumbsUp");
  return {
    thumbsUp,
    thumbsDown: n("thumbsDown"),
    laugh: n("laugh"),
    hooray: n("hooray"),
    confused: n("confused"),
    heart: n("heart"),
    rocket: n("rocket"),
    eyes: n("eyes"),
    thumbs: thumbsUp,
    total: d?.reactions?.totalCount || 0,
  };
}

function person(author) {
  const login = author?.login || "";
  if (!login) return null;
  return {
    login,
    avatar: author.avatarUrl || "",
    url: author.url || `https://github.com/${login}`,
  };
}

function excerpt(text, n = 240) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  if (flat.length <= n) return flat;
  const cut = flat.slice(0, n);
  const sp = cut.lastIndexOf(" ");
  return (sp > 80 ? cut.slice(0, sp) : cut).trimEnd() + "…";
}

function plainText(d) {
  if (d.bodyText) return d.bodyText;
  return String(d.bodyHTML || d.body || "").replace(/<[^>]+>/g, " ");
}

function deadlineOf(body) {
  const m = String(body || "").match(/Deadline:\s*(\d{4}-\d{2}-\d{2})/i);
  if (!m) return null;
  const [y, mo, da] = m[1].split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, da));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== da) return null;
  return m[1];
}

function pollOf(d) {
  const p = d.poll;
  if (!p) return null;
  const options = (p.options?.nodes || []).filter(Boolean).map((o) => ({
    option: o.option || "",
    totalVoteCount: o.totalVoteCount || 0,
  }));
  const summed = options.reduce((n, o) => n + o.totalVoteCount, 0);
  return { question: p.question || "", totalVoteCount: p.totalVoteCount ?? summed, options };
}

function labelsOf(d) {
  return (d.labels?.nodes || []).map((n) => n?.name).filter(Boolean);
}

function xmlEscape(s) {
  return String(s ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
}

function siteBase(config) {
  const raw = String(config.siteUrl || "https://vibegarage.neozonesproductions.com/");
  return raw.replace(/\/+$/, "") + "/";
}

function absUrl(config, path) {
  return siteBase(config) + String(path || "").replace(/^\/+/, "");
}

function titled(raw, prefixRe) {
  const title = String(raw || "").replace(prefixRe, "").trim();
  return title || String(raw || "").trim();
}

function isGuideTitle(title) {
  return /^\s*\[Guide\]/i.test(title || "");
}

function challengeOf(body, s) {
  const m = String(body || "").match(/^\s*Challenge:\s*#?(\d+)\s*$/im) || String((s && s["challenge"]) || "").match(/#?(\d+)/);
  return m ? Number(m[1]) : null;
}

function isChallengeDiscussion(d) {
  return /^\s*\[Challenge\]/i.test(d.title || "") || /^polls$/i.test(d.category?.name || "");
}

function isProjectDiscussion(d, projCat, marker) {
  return (d.body || "").includes(marker) || (projCat && d.category?.name === projCat && projCat === "Projects");
}

function see(member, when) {
  if (!when) return;
  if (!member.firstSeen || when < member.firstSeen) member.firstSeen = when;
  if (!member.lastSeen || when > member.lastSeen) member.lastSeen = when;
}

function bump(members, author, { projects = 0, threads = 0, replies = 0, reactions = 0, when = null } = {}) {
  const p = person(author);
  if (!p) return;
  let m = members.get(p.login);
  if (!m) {
    m = {
      login: p.login,
      avatar: p.avatar,
      url: p.url,
      projects: 0,
      threads: 0,
      replies: 0,
      reactions: 0,
      score: 0,
      firstSeen: null,
      lastSeen: null,
      real: true,
    };
    members.set(p.login, m);
  }
  m.projects += projects;
  m.threads += threads;
  m.replies += replies;
  m.reactions += reactions;
  if (p.avatar && (!m.avatar || !m.lastSeen || (when && when >= m.lastSeen))) m.avatar = p.avatar;
  if (p.url) m.url = p.url;
  see(m, when);
}

function feedXml(config, entries) {
  const base = siteBase(config);
  const updated = entries.reduce((max, e) => (e.updated > max ? e.updated : max), "") || EMPTY_FEED_UPDATED;
  const lines = [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<feed xmlns="http://www.w3.org/2005/Atom">`,
    `  <title>Vibe Garage</title>`,
    `  <subtitle>A community hub for people who build with AI.</subtitle>`,
    `  <link href="${xmlEscape(base)}" rel="alternate" type="text/html"/>`,
    `  <link href="${xmlEscape(absUrl(config, "feed.xml"))}" rel="self" type="application/atom+xml"/>`,
    `  <id>${xmlEscape(base)}</id>`,
    `  <updated>${xmlEscape(updated)}</updated>`,
    `  <author><name>Vibe Garage</name></author>`,
  ];
  for (const e of entries) {
    lines.push(`  <entry>`);
    lines.push(`    <title>${xmlEscape(e.title)}</title>`);
    lines.push(`    <link href="${xmlEscape(e.link)}" rel="alternate" type="text/html"/>`);
    lines.push(`    <id>${xmlEscape(e.link)}</id>`);
    lines.push(`    <updated>${xmlEscape(e.updated)}</updated>`);
    if (e.published) lines.push(`    <published>${xmlEscape(e.published)}</published>`);
    // Entry authors are kept neutral on purpose: no personal handles or profile URLs in the public feed.
    lines.push(`    <author><name>Vibe Garage</name></author>`);
    if (e.summary) lines.push(`    <summary>${xmlEscape(e.summary)}</summary>`);
    lines.push(`  </entry>`);
  }
  lines.push(`</feed>`);
  return lines.join("\n") + "\n";
}

function sitemapXml(config, htmlFiles, dynamic) {
  const names = [...htmlFiles].filter((f) => f.endsWith(".html") && f !== "404.html").sort();
  const locs = [];
  if (names.includes("index.html")) locs.push(siteBase(config));
  for (const f of names) {
    if (f === "index.html") continue;
    locs.push(absUrl(config, f));
  }
  const lines = [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
  ];
  for (const loc of locs) lines.push(`  <url><loc>${xmlEscape(loc)}</loc></url>`);
  for (const item of dynamic) {
    const lastmod = item.updatedAt ? `<lastmod>${xmlEscape(String(item.updatedAt).slice(0, 10))}</lastmod>` : "";
    lines.push(`  <url><loc>${xmlEscape(item.loc)}</loc>${lastmod}</url>`);
  }
  lines.push(`</urlset>`);
  return lines.join("\n") + "\n";
}

function robotsTxt(config) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${absUrl(config, "sitemap.xml")}\n`;
}

/**
 * Turn a fetched discussion list into the site's JSON and text files.
 * `discussions` may be empty; every output is still written by the caller.
 */
export function buildSnapshot({ discussions, categories, pinned, owner, name, config, htmlFiles, now }) {
  const cats = categories || [];
  const catNames = new Set(cats.map((c) => c.name));
  const chanForCat = {};
  const channelCategory = {};
  for (const [chan, names] of Object.entries(config.channels || {})) {
    const hit = (names || []).find((n) => catNames.has(n));
    if (hit) {
      channelCategory[chan] = hit;
      chanForCat[hit] ??= chan;
    }
  }
  const projCat = (config.projectsCategory || []).find((n) => catNames.has(n)) || null;
  const annCat = (config.announcementsCategory || []).find((n) => catNames.has(n)) || null;
  const marker = config.projectMarker || "<!-- vibe-garage:project -->";
  const pinnedSet = pinned instanceof Set ? pinned : new Set(pinned || []);

  const threads = [];
  const projects = [];
  const guides = [];
  const challenges = [];
  const feedEntries = [];
  const members = new Map();

  for (const d of discussions || []) {
    if (!d || d.number == null) continue;
    const by = d.author?.login || "ghost";
    const avatar = d.author?.avatarUrl || "";
    const authorUrl = d.author?.url || (d.author?.login ? `https://github.com/${d.author.login}` : "");
    const reactions = reactionsOf(d);
    const labels = labelsOf(d);
    const project = isProjectDiscussion(d, projCat, marker);
    const guide = isGuideTitle(d.title);
    const challenge = isChallengeDiscussion(d);
    const id = `gh-${d.number}`;

    bump(members, d.author, {
      projects: project ? 1 : 0,
      threads: project ? 0 : 1,
      reactions: reactions.total,
      when: d.createdAt || null,
    });
    for (const c of (d.comments?.nodes || []).filter(Boolean)) {
      bump(members, c.author, {
        replies: 1,
        reactions: c.reactions?.totalCount || 0,
        when: c.createdAt || null,
      });
    }

    const author = { login: by, avatar, url: authorUrl };
    if (guide) {
      guides.push({
        id,
        number: d.number,
        title: titled(d.title, /^\s*\[Guide\]\s*/i),
        author,
        by,
        avatar,
        bodyHTML: d.bodyHTML || "",
        excerpt: excerpt(plainText(d)),
        tags: labels,
        labels,
        reactions,
        url: d.url || "",
        discussionUrl: d.url || "",
        createdAt: d.createdAt || null,
        updatedAt: d.updatedAt || null,
        real: true,
      });
    }
    if (challenge) {
      challenges.push({
        id,
        number: d.number,
        title: titled(d.title, /^\s*\[Challenge\]\s*/i),
        author,
        by,
        avatar,
        category: d.category?.name || "",
        bodyHTML: d.bodyHTML || "",
        excerpt: excerpt(plainText(d)),
        tags: labels,
        labels,
        deadline: deadlineOf(d.body),
        status: d.closed ? "closed" : "open",
        closed: !!d.closed,
        thumbsUp: reactions.thumbsUp,
        poll: pollOf(d),
        reactions,
        url: d.url || "",
        discussionUrl: d.url || "",
        createdAt: d.createdAt || null,
        updatedAt: d.updatedAt || null,
        real: true,
      });
    }

    const linkPath = project
      ? `project.html?id=${encodeURIComponent(id)}`
      : `thread.html?id=${encodeURIComponent(id)}`;
    let summary = excerpt(plainText(d));
    if (project) {
      const pitch = strip(sections(d.body)["pitch"]);
      if (pitch) summary = excerpt(pitch);
    }
    feedEntries.push({
      title: project ? titled(d.title, /^\s*\[project\]\s*/i) : (d.title || ""),
      link: absUrl(config, linkPath),
      updated: d.updatedAt || d.createdAt || EMPTY_FEED_UPDATED,
      published: d.createdAt || "",
      author: by,
      authorUrl,
      summary,
      number: d.number,
    });

    if (project) {
      const s = sections(d.body);
      const code = (s["code"] || "").replace(/^```[\w-]*\n?|\n?```$/g, "");
      projects.push({
        id,
        number: d.number,
        name: titled(d.title, /^\s*\[project\]\s*/i),
        by,
        avatar,
        kind: "generic",
        pitch: strip(s["pitch"]) || "A fresh build from the garage.",
        tools: list(s["tools"]),
        tags: list(s["tags"]),
        fb: fbOf(s["feedback wanted"]),
        likes: reactions.total + (d.upvoteCount || 0),
        comments: d.comments?.totalCount || 0,
        reactions,
        url: strip(s["live link"]),
        repo: strip(s["repo"]).replace(/^https:\/\/github\.com\//, ""),
        code: strip(code),
        prompts: list(s["prompts"]).slice(0, 8),
        challenge: challengeOf(d.body, s),
        discussionUrl: d.url || "",
        createdAt: d.createdAt || null,
        updatedAt: d.updatedAt || null,
        real: true,
      });
      continue;
    }

    const isAnn = annCat && d.category?.name === annCat;
    threads.push({
      id,
      number: d.number,
      channel: isAnn ? "announcements" : (chanForCat[d.category?.name] || "off-topic-lounge"),
      category: d.category?.name || "",
      title: d.title || "",
      by,
      avatar,
      fb: fbOf(((d.body || "").match(/feedback(?: level| wanted)?:\s*([^\n]+)/i) || [])[1]),
      replies: d.comments?.totalCount || 0,
      reactions,
      createdAt: d.createdAt || null,
      updatedAt: d.updatedAt || null,
      url: d.url || "",
      bodyHTML: d.bodyHTML || "",
      pinned: pinnedSet.has(d.number),
      real: true,
    });
  }

  threads.sort((a, b) => (b.pinned - a.pinned) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  guides.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || b.number - a.number);
  for (const c of challenges) {
    c.entries = projects.filter((p) => p.challenge === c.number).map((p) => ({ id: p.id, name: p.name, by: p.by, avatar: p.avatar }));
  }
  challenges.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || b.number - a.number);
  feedEntries.sort((a, b) => String(b.updated).localeCompare(String(a.updated)) || b.number - a.number);

  const memberList = [...members.values()].map((m) => {
    m.score = m.projects * SCORE_WEIGHTS.projects + m.threads * SCORE_WEIGHTS.threads + m.replies * SCORE_WEIGHTS.replies + m.reactions * SCORE_WEIGHTS.reactions;
    return m;
  }).sort((a, b) => b.score - a.score || a.login.localeCompare(b.login));

  const catOut = cats.map((c) => ({
    name: c.name,
    slug: c.slug,
    emoji: c.emoji,
    channel: chanForCat[c.name] || (c.name === projCat ? "projects" : c.name === annCat ? "announcements" : null),
  }));

  const dynamic = [
    ...projects.map((p) => ({ loc: absUrl(config, `project.html?id=${encodeURIComponent(p.id)}`), updatedAt: p.updatedAt })),
    ...threads.map((t) => ({ loc: absUrl(config, `thread.html?id=${encodeURIComponent(t.id)}`), updatedAt: t.updatedAt })),
  ];

  return {
    discussions: { generated: now, repo: `${owner}/${name}`, categories: catOut, channelCategory, projectsCategory: projCat, threads },
    projects: { generated: now, projects },
    members: { generated: now, score: SCORE_TEXT, weights: SCORE_WEIGHTS, commentSample: COMMENT_SAMPLE, members: memberList },
    challenges: { generated: now, challenges },
    guides: { generated: now, guides },
    feed: feedXml(config, feedEntries),
    sitemap: sitemapXml(config, htmlFiles || [], dynamic),
    robots: robotsTxt(config),
    counts: {
      threads: threads.length,
      projects: projects.length,
      categories: cats.length,
      members: memberList.length,
      challenges: challenges.length,
      guides: guides.length,
      feed: feedEntries.length,
      urls: (sitemapXml(config, htmlFiles || [], dynamic).match(/<loc>/g) || []).length,
    },
  };
}

function loadConfig() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(new URL("../assets/config.js", import.meta.url), "utf8"), ctx);
  return ctx.window.VG_CONFIG;
}

async function gql(query, variables) {
  let payload;
  if (process.env.GITHUB_TOKEN) {
    const r = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `bearer ${process.env.GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "vibe-garage-sync",
      },
      body: JSON.stringify({ query, variables }),
    });
    payload = await r.json();
  } else {
    const args = ["api", "graphql", "-f", `query=${query}`, "-f", `owner=${variables.owner}`, "-f", `name=${variables.name}`];
    if (variables.after) args.push("-f", `after=${variables.after}`);
    const env = { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", CLICOLOR: "0", GH_FORCE_TTY: "0" };
    const raw = execFileSync("gh", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, env });
    payload = parseJson(raw);
  }
  if (payload.errors) throw new Error(JSON.stringify(payload.errors));
  if (!payload.data?.repository) throw new Error("Repository not found or not readable");
  return payload.data;
}

function writeText(rel, text) {
  const url = new URL(rel, import.meta.url);
  fs.mkdirSync(new URL("./", url), { recursive: true });
  fs.writeFileSync(url, text.endsWith("\n") ? text : text + "\n");
}

async function main() {
  const config = loadConfig();
  const [owner, name] = String(process.env.REPO || config.repo || "").split("/");
  if (!owner || !name) throw new Error("Missing repo owner/name (config.repo or REPO)");
  const query = discussionQuery();
  const all = [];
  let cats = [];
  const pinned = new Set();
  let after = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const repo = (await gql(query, { owner, name, after })).repository;
    cats = repo.discussionCategories?.nodes || [];
    for (const p of repo.pinnedDiscussions?.nodes || []) {
      if (p?.discussion?.number != null) pinned.add(p.discussion.number);
    }
    const nodes = (repo.discussions?.nodes || []).filter(Boolean);
    all.push(...nodes);
    const info = repo.discussions?.pageInfo || {};
    if (!info.hasNextPage) break;
    after = info.endCursor;
    if (page === MAX_PAGES - 1) console.warn(`stopped after ${PAGE_SIZE * MAX_PAGES} discussions; older ones were not synced`);
  }

  const root = new URL("../", import.meta.url);
  const htmlFiles = fs.readdirSync(root).filter((f) => f.endsWith(".html"));
  const now = new Date().toISOString();
  const snap = buildSnapshot({ discussions: all, categories: cats, pinned, owner, name, config, htmlFiles, now });
  writeText("../data/discussions.json", JSON.stringify(snap.discussions, null, 1));
  writeText("../data/projects.json", JSON.stringify(snap.projects, null, 1));
  writeText("../data/members.json", JSON.stringify(snap.members, null, 1));
  writeText("../data/challenges.json", JSON.stringify(snap.challenges, null, 1));
  writeText("../data/guides.json", JSON.stringify(snap.guides, null, 1));
  writeText("../feed.xml", snap.feed);
  writeText("../sitemap.xml", snap.sitemap);
  writeText("../robots.txt", snap.robots);
  const c = snap.counts;
  console.log(`synced ${c.threads} threads, ${c.projects} projects, ${c.categories} categories, ${c.members} members, ${c.challenges} challenges, ${c.guides} guides`);
  console.log(`wrote feed.xml (${c.feed} entries), sitemap.xml (${c.urls} urls), robots.txt`);
}

function invokedDirectly() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (invokedDirectly()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
