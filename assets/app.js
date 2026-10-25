/* Vibe Garage front end. Vanilla JS, no framework.
   Lists render from data/*.json. Empty files show an empty state, never sample posts. */
(function () {
  document.documentElement.classList.remove("no-js");
  const D = window.VG_DATA || { tools: [], channels: [], members: [] };
  const I = window.VG_ICONS || {};
  const C = window.VG_CONFIG || {};
  const nativePosts = Boolean(C.nativePosts);
  const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
  const IMAGE_TYPE_ERROR = "Use a PNG, JPEG or WebP image.";
  const isAllowedImage = (file) => Boolean(file && IMAGE_TYPES.includes(file.type));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ic = (n, cls = "") => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[n] || ""}</svg>`;
  const qs = (k) => new URLSearchParams(location.search).get(k);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ROOT = (() => {
    let src = "";
    try { src = (document.currentScript && document.currentScript.src) || ""; } catch (e) { src = ""; }
    if (!src) {
      const el = document.querySelector('script[src*="assets/app.js"]');
      src = el ? el.src : "";
    }
    try { return new URL(src, location.href).pathname.replace(/assets\/app\.js$/, ""); }
    catch (e) { return "/"; }
  })();
  const url = (path) => {
    const p = String(path || "");
    if (/^(https?:|mailto:)/i.test(p)) return p;
    return ROOT + p.replace(/^\/+/, "");
  };
  const siteBase = () => String(C.siteUrl || "https://vibegarage.neozonesproductions.com/").replace(/\/+$/, "") + "/";
  const pageUrl = (path) => siteBase() + String(path || "").replace(/^\/+/, "");

  function tryJSON(path) {
    return fetch(url(path), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const hasNative = nativePosts && Boolean(window.VGN);
  const isoFromSec = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "";
    return new Date(n * 1000).toISOString();
  };
  const nativeChallenge = (md) => {
    const match = String(md || "").match(/Challenge:\s*#(\d+)/i);
    return match ? Number(match[1]) : null;
  };
  const plainText = (md) => String(md || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~[\]()]/g, " ")
    .replace(/^\s*[-+]\s+/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
  const mdHTML = (md) => {
    try {
      return window.VGMD && typeof window.VGMD.render === "function" ? window.VGMD.render(md) : `<p>${esc(md)}</p>`;
    } catch (e) {
      return `<p>${esc(md)}</p>`;
    }
  };
  function normalizeNativeProject(post) {
    const author = post.author || {};
    return {
      id: "vg-" + post.id,
      native: true,
      postId: post.id,
      name: post.title,
      by: author.display_name || "ghost",
      byId: author.id || "",
      avatar: author.avatar || "",
      kind: "generic",
      pitch: post.pitch || "",
      tools: post.tools || [],
      tags: post.tags || [],
      likes: 0,
      comments: 0,
      reactions: null,
      url: post.link || "",
      repo: post.repo || "",
      code: post.code || "",
      prompts: post.prompts || [],
      image: post.image || "",
      challenge: nativeChallenge(post.body_md),
      discussionUrl: null,
      createdAt: isoFromSec(post.created_at),
      updatedAt: isoFromSec(post.updated_at),
      real: true
    };
  }
  function normalizeNativeGuide(post) {
    const author = post.author || {};
    const name = author.display_name || "ghost";
    const text = plainText(post.body_md);
    return {
      id: "vg-" + post.id,
      native: true,
      postId: post.id,
      title: post.title,
      by: name,
      byId: author.id || "",
      author: { login: name, avatar: author.avatar || "" },
      avatar: author.avatar || "",
      bodyHTML: mdHTML(post.body_md),
      excerpt: text.slice(0, 160),
      tags: post.tags || [],
      labels: post.tags || [],
      reactions: null,
      url: "learn.html?p=" + post.id,
      discussionUrl: null,
      createdAt: isoFromSec(post.created_at),
      updatedAt: isoFromSec(post.updated_at),
      link: post.link || "",
      image: post.image || ""
    };
  }
  let _nativeProjects = null;
  let _nativeGuides = null;
  const nativeProjectList = () => {
    if (!hasNative) return Promise.resolve([]);
    if (!_nativeProjects) {
      _nativeProjects = VGN.listPosts({ kind: "project" }).then((rows) => rows.map(normalizeNativeProject)).catch(() => []);
    }
    return _nativeProjects;
  };
  const nativeGuideList = () => {
    if (!hasNative) return Promise.resolve([]);
    if (!_nativeGuides) {
      _nativeGuides = VGN.listPosts({ kind: "guide" }).then((rows) => rows.map(normalizeNativeGuide)).catch(() => []);
    }
    return _nativeGuides;
  };
  let _disc, _proj, _mem, _guides, _chal;
  const disc = () => _disc || (_disc = tryJSON("data/discussions.json").then((j) => j || { threads: [], categories: [] }));
  const projJSON = () => _proj || (_proj = tryJSON("data/projects.json").then((j) => j || { projects: [] }));
  const membersJSON = () => _mem || (_mem = tryJSON("data/members.json").then((j) => j || { members: [], score: "", weights: {}, commentSample: 50 }));
  const guidesJSON = () => _guides || (_guides = Promise.all([tryJSON("data/guides.json"), nativeGuideList()]).then(([j, native]) => {
    const data = j || { guides: [] };
    return { ...data, guides: [...(native || []), ...(data.guides || [])] };
  }));
  const challengesJSON = () => _chal || (_chal = tryJSON("data/challenges.json").then((j) => j || { challenges: [] }));

  const api = {
    async projects() {
      const [real, native] = await Promise.all([projJSON(), nativeProjectList(), wait(250)]);
      return [...native, ...(real.projects || [])].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    },
    async project(id) {
      const [real, native] = await Promise.all([projJSON(), nativeProjectList()]);
      return [...native, ...(real.projects || [])].find((p) => p.id === id || (p.native && p.postId === id));
    },
    async threads() { const [j] = await Promise.all([disc(), wait(250)]); return j.threads || []; },
    async thread(id) { const t = ((await disc()).threads || []).find((row) => row.id === id); return t && { ...t, posts: t.posts || [] }; },
    async categorySlug(chan) {
      const j = await disc();
      const name = chan === "projects"
        ? (j.projectsCategory || (C.projectsCategory || []).slice(-1)[0])
        : (j.channelCategory || {})[chan] || ((C.channels || {})[chan] || []).find((n) => (C.fallbackSlugs || {})[n]);
      const c = (j.categories || []).find((row) => row.name === name);
      return c ? c.slug : ((C.fallbackSlugs || {})[name] || "general");
    },
    newDiscussionUrl(slug, title, body) {
      const u = new URL(`https://github.com/${C.repo || "vibe-garage/vibe-garage"}/discussions/new`);
      if (slug) u.searchParams.set("category", slug);
      if (title) u.searchParams.set("title", title);
      if (body) u.searchParams.set("body", body);
      return u.toString();
    },
    channels: () => D.channels || []
  };
  async function categorySlugByName(name, fallback) {
    const j = await disc();
    const c = (j.categories || []).find((row) => String(row.name || "").toLowerCase() === String(name).toLowerCase());
    return (c && c.slug) || fallback;
  }
  const ago = (iso) => {
    if (!iso) return "";
    const s = (Date.now() - new Date(iso)) / 1000;
    if (!Number.isFinite(s) || s < 60) return "just now";
    const u = [[31536000, "y"], [2592000, "mo"], [86400, "d"], [3600, "h"], [60, "m"]].find(([n]) => s >= n);
    return u ? Math.floor(s / u[0]) + u[1] + " ago" : "just now";
  };
  const day = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };
  function giscusTheme() {
    const light = siteBase() + "assets/giscus-theme-light.css?v=3aed97afd7";
    const dark = (C.giscus && C.giscus.theme) || (siteBase() + "assets/giscus-theme.css?v=4214d84c9a");
    return document.documentElement.getAttribute("data-theme") === "light" ? light : dark;
  }
  function giscus(number) {
    if (!(C.giscus && C.giscus.enabled) || !number) return "";
    return `<div class="panel glass reveal" id="comments"><h3>${ic("message-circle")} Replies &amp; reactions</h3><p class="muted" style="margin-top:0;font-size:.9rem">Replies and reactions run on GitHub Discussions.</p><div class="giscus"></div></div>`;
  }
  function mountGiscus(number) {
    const box = $(".giscus");
    if (!box || !number || box.dataset.mounted) return;
    box.dataset.mounted = "1";
    const sc = document.createElement("script");
    sc.src = "https://giscus.app/client.js";
    sc.async = true;
    sc.crossOrigin = "anonymous";
    const attrs = {
      repo: C.repo,
      "repo-id": C.repoId,
      mapping: "number",
      term: String(number),
      "reactions-enabled": "1",
      "emit-metadata": "0",
      "input-position": "top",
      theme: giscusTheme(),
      lang: "en",
      loading: "lazy",
      strict: "0"
    };
    Object.entries(attrs).forEach(([k, v]) => { if (v != null) sc.setAttribute("data-" + k, v); });
    box.appendChild(sc);
  }
  function sendGiscusTheme() {
    const frame = document.querySelector("iframe.giscus-frame");
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage({ giscus: { setConfig: { theme: giscusTheme() } } }, "https://giscus.app");
  }
  function watchGiscus() {
    const hook = (frame) => {
      if (!frame || frame.dataset.vgTheme) return;
      frame.dataset.vgTheme = "1";
      frame.addEventListener("load", sendGiscusTheme);
    };
    const scan = () => $$("iframe.giscus-frame").forEach(hook);
    scan();
    if (!window.MutationObserver || !document.body) return;
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  }
  window.VG = { api, ic, esc, url };

  const PAL = [["#3dd6c4", "#06221f"], ["#8fa8ff", "#06221f"], ["#5b6b82", "#ffffff"]];
  function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
  function av(handle, cls = "", img = "") {
    const name = String(handle || "?");
    if (img) return `<span class="av ${cls}"><img src="${esc(img)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover"></span>`;
    const h = hash(name);
    const [bg, ink] = PAL[h % PAL.length];
    return `<span class="av ${cls}" style="background:${bg};color:${ink}">${esc(name[0].toUpperCase())}</span>`;
  }
  function who(handle, img, cls = "") {
    const name = String(handle || "ghost");
    return `<a class="who" href="${url("profile.html?u=" + encodeURIComponent(name))}">${av(name, cls, img)}@${esc(name)}</a>`;
  }
  function whoNative(name, avatar, userId, cls = "", link = true) {
    const label = String(name || "ghost");
    const inner = `${av(label, cls, avatar || "")}${esc(label)}`;
    if (!link) return `<span class="who">${inner}</span>`;
    return `<a class="who" href="${url("profile.html?n=" + encodeURIComponent(userId || ""))}">${inner}</a>`;
  }
  const FB = { vibes: ["Just vibes", "💜", "No critique, hype only", "fb"], gentle: ["Gentle tips", "🌱", "Kind suggestions welcome", "fb gentle"], tear: ["Tear it apart", "🔥", "Brutal honesty, please", "fb tear"] };
  const toolColor = (n) => ((D.tools || []).find((t) => t.name === n) || {}).color || "#93a1b3";
  const toolTag = (n) => `<span class="tag tool"><span class="dot" style="color:${toolColor(n)}"></span>${esc(n)}</span>`;
  const fbTag = (f) => { const x = FB[f]; if (!x) return ""; return `<span class="tag ${x[3]}">${x[1]} ${x[0]}</span>`; };
  function art(p, ribbon = "") {
    let inner = "";
    if (p && p.image) inner = `<img src="${esc(p.image)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover">`;
    else if (p && typeof window.vgArt === "function") {
      try { inner = window.vgArt(p.id, p.kind, p.name) || ""; } catch (e) { inner = ""; }
    }
    return `<div class="art">${inner}${ribbon || ""}</div>`;
  }
  const reacted = (p) => (p && p.reactions && p.reactions.total != null) ? p.reactions.total : ((p && p.likes) || 0);
  function card(p, cls = "", opts = {}) {
    const ribbon = opts.ribbon || (p.real ? `<span class="ribbon">${ic("sparkles")} new submission</span>` : "");
    const rank = opts.rank ? `<span class="rank">0${opts.rank}</span>` : "";
    const href = url("project.html?id=" + encodeURIComponent(p.id));
    return `<article class="card reveal ${cls}"><a class="stretch" href="${href}"><span class="sr-only">${esc(p.name)}</span></a>${art(p, ribbon + rank)}
<div class="body">${opts.cover ? `<div class="cover-tag">${ic("star")} Cover story · this week</div>` : ""}<h3>${esc(p.name)}</h3><p>${esc(p.pitch || "")}</p>
<div class="tags">${(p.tools || []).map(toolTag).join("")}${opts.noFb || p.native ? "" : fbTag(p.fb)}</div>
<div class="meta">${p.native ? whoNative(p.by, p.avatar, p.byId) : who(p.by, p.avatar)}<span>${ic("heart")} ${reacted(p)}</span><span>${ic("message-circle")} ${p.comments || 0}</span></div></div></article>`;
  }
  const skel = (n, cls = "") => Array.from({ length: n }, () => `<div class="card skel ${cls}"><div class="art"></div><div class="body"><div class="ln h"></div><div class="ln"></div><div class="ln w60"></div><div class="ln w40"></div></div></div>`).join("");
  const ANN = { id: "announcements", name: "Announcements", icon: "pin", blurb: "News and house rules from the garage." };
  const chan = (id) => id === "announcements" ? ANN : ((D.channels || []).find((c) => c.id === id) || { id, name: id, icon: "message-circle", blurb: "" });
  function threadRow(t) {
    const c = chan(t.channel);
    const href = url("thread.html?id=" + encodeURIComponent(t.id));
    const reactN = t.reactions && t.reactions.total != null ? t.reactions.total : 0;
    const replies = t.replies || 0;
    return `<article class="thread reveal" data-chan="${esc(t.channel)}"><a class="stretch" href="${href}"><span class="sr-only">${esc(t.title)}</span></a><span class="chan-ico">${ic(c.icon)}</span>
<div><h4>${t.pinned ? `<span class="badge" style="margin-right:6px">${ic("pin")} pinned</span>` : ""}${esc(t.title)}</h4><small><span>${esc(c.name)}</span> · ${who(t.by, t.avatar, "xs")} · <span>${esc(t.ago || ago(t.createdAt))}</span>${t.channel === "announcements" ? "" : " " + fbTag(t.fb)}</small></div>
<div class="count"><span>${ic("heart")} ${reactN}</span><span>${replies ? `${replies} repl${replies === 1 ? "y" : "ies"}` : "no replies yet"}</span></div></article>`;
  }
  const emptyIll = `<svg class="ill" viewBox="0 0 150 110" fill="none" aria-hidden="true"><rect x="20" y="20" width="110" height="74" rx="14" fill="#1a2433" stroke="#3dd6c4" stroke-opacity=".7" stroke-width="2" stroke-dasharray="6 6"/><circle cx="60" cy="54" r="4" fill="#3dd6c4"/><circle cx="90" cy="54" r="4" fill="#3dd6c4"/><path d="M62 72q13 -8 26 0" stroke="#8fa8ff" stroke-opacity=".9" stroke-width="2.5" stroke-linecap="round"/><circle cx="128" cy="20" r="8" fill="#111926" stroke="#8fa8ff" stroke-width="2"/><circle cx="18" cy="96" r="5" fill="#3dd6c4" opacity=".8"/></svg>`;
  const empty = (title, msg, action = "") => `<div class="empty">${emptyIll}<h3>${title}</h3><p>${msg}</p>${action}</div>`;
  const REACTIONS = [["thumbsUp", "👍", "Thumbs up"], ["thumbsDown", "👎", "Thumbs down"], ["laugh", "😄", "Laugh"], ["hooray", "🎉", "Hooray"], ["confused", "😕", "Confused"], ["heart", "❤️", "Heart"], ["rocket", "🚀", "Rocket"], ["eyes", "👀", "Eyes"]];
  function reactionBlock(reactions, discussionUrl) {
    const r = reactions || {};
    const rows = REACTIONS.map(([key, emoji, label]) => {
      const n = r[key] || 0;
      return `<span class="rx"><span aria-hidden="true">${emoji}</span> <b>${n}</b><span class="sr-only">${esc(label)}</span></span>`;
    }).join("");
    const link = discussionUrl ? `<p style="margin:14px 0 0"><a class="btn" href="${esc(discussionUrl)}" target="_blank" rel="noopener noreferrer">${ic("heart")} React on GitHub</a></p>` : "";
    return `<div class="panel"><h3>${ic("heart")} Reactions</h3><div class="reacts" aria-label="GitHub reaction counts">${rows}</div><p class="muted" style="margin:10px 0 0">${r.total || 0} reaction${r.total === 1 ? "" : "s"} on GitHub.</p>${link}</div>`;
  }
  function shareBar(shareUrl, title) {
    const u = encodeURIComponent(shareUrl);
    const t = encodeURIComponent(title);
    const text = encodeURIComponent(title + " " + shareUrl);
    return `<div class="share" role="group" aria-label="Share"><button type="button" class="btn ghost sm" data-copy-link="${esc(shareUrl)}">${ic("link")} Copy link</button><a class="btn ghost sm" target="_blank" rel="noopener noreferrer" href="https://twitter.com/intent/tweet?text=${t}&amp;url=${u}">Share on X</a><a class="btn ghost sm" target="_blank" rel="noopener noreferrer" href="https://bsky.app/intent/compose?text=${text}">Bluesky</a><a class="btn ghost sm" target="_blank" rel="noopener noreferrer" href="https://www.reddit.com/submit?url=${u}&amp;title=${t}">Reddit</a><button type="button" class="btn ghost sm" hidden data-native-share data-share-url="${esc(shareUrl)}" data-share-title="${esc(title)}">${ic("share")} Share</button></div>`;
  }
  function bindShare(root = document) {
    $$("[data-copy-link]", root).forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        const text = btn.getAttribute("data-copy-link") || "";
        const ok = () => toast("Link copied");
        const fail = () => toast("Could not copy the link", "warn");
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fail);
        else fail();
      });
    });
    $$("[data-native-share]", root).forEach((btn) => {
      if (typeof navigator.share !== "function") { btn.hidden = true; return; }
      btn.hidden = false;
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        navigator.share({ title: btn.dataset.shareTitle || document.title, url: btn.dataset.shareUrl || location.href }).catch((err) => {
          if (err && err.name === "AbortError") return;
          toast("Could not open share", "warn");
        });
      });
    });
  }
  const DROP_TAGS = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "BASE", "FORM", "FRAME", "FRAMESET"]);
  function safeHref(v, isSrc) {
    const s = String(v || "").trim();
    if (!s || /^(javascript|data|vbscript):/i.test(s)) return "";
    if (isSrc) return /^https:\/\//i.test(s) ? s : "";
    if (/^(https?:|mailto:|\/|#)/i.test(s) || !/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
    return "";
  }
  function sanitize(html) {
    let doc;
    try { doc = new DOMParser().parseFromString(String(html || ""), "text/html"); }
    catch (e) { return ""; }
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType !== 1) return;
        if (DROP_TAGS.has(child.tagName)) { child.remove(); return; }
        [...child.attributes].forEach((attr) => {
          const n = attr.name.toLowerCase();
          if (n.startsWith("on") || n === "style" || n === "srcdoc" || n === "formaction") child.removeAttribute(attr.name);
          else if (n === "href" || n === "src" || n === "xlink:href") {
            const ok = safeHref(attr.value, child.tagName === "IMG" || n === "src");
            if (!ok) child.removeAttribute(attr.name);
            else child.setAttribute(attr.name, ok);
          }
        });
        if (child.tagName === "A") {
          const href = child.getAttribute("href") || "";
          if (/^https?:/i.test(href)) child.setAttribute("target", "_blank");
          child.setAttribute("rel", "nofollow noopener noreferrer");
        }
        if (child.tagName === "IMG") {
          child.setAttribute("loading", "lazy");
          if (!child.hasAttribute("alt")) child.setAttribute("alt", "");
          child.removeAttribute("srcset");
        }
        if (child.tagName === "INPUT") {
          if ((child.getAttribute("type") || "").toLowerCase() !== "checkbox") { child.remove(); return; }
          child.setAttribute("disabled", "");
          child.setAttribute("tabindex", "-1");
        }
        if (child.parentNode) walk(child);
      });
    };
    walk(doc.body);
    return doc.body ? doc.body.innerHTML : "";
  }
  function stripHtml(html) {
    const d = document.createElement("div");
    d.innerHTML = sanitize(html);
    return (d.textContent || "").replace(/\s+/g, " ").trim();
  }
  function setMeta(attr, key, value) {
    if (value == null) return;
    let el = document.head.querySelector(`meta[${attr}="${key}"]`);
    if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
    el.setAttribute("content", value);
  }
  function setSeo({ title, description, path, type }) {
    if (title) document.title = title;
    const desc = String(description || "").replace(/\s+/g, " ").trim().slice(0, 220);
    const canon = path != null ? pageUrl(path) : "";
    if (desc) { setMeta("name", "description", desc); setMeta("property", "og:description", desc); setMeta("name", "twitter:description", desc); }
    if (title) { setMeta("property", "og:title", title); setMeta("name", "twitter:title", title); }
    if (canon) {
      setMeta("property", "og:url", canon);
      let link = document.querySelector('link[rel="canonical"]');
      if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
      link.href = canon;
    }
    if (type) setMeta("property", "og:type", type);
    return canon;
  }
  function injectLd(obj) {
    let s = document.getElementById("vg-ld");
    if (!s) { s = document.createElement("script"); s.id = "vg-ld"; s.type = "application/ld+json"; document.head.appendChild(s); }
    s.textContent = JSON.stringify(obj);
  }
  function httpUrl(v) { const s = String(v || "").trim(); return /^https?:\/\/\S+$/i.test(s) ? s : ""; }
  function repoUrl(repo) {
    const r = String(repo || "").trim();
    if (!r || /^_?no response_?$/i.test(r)) return "";
    if (/^https?:\/\//i.test(r)) return r;
    if (/^[\w.-]+\/[\w.-]+$/.test(r)) return "https://github.com/" + r;
    return "";
  }
  function pollBlock(poll) {
    if (!poll || !Array.isArray(poll.options) || !poll.options.length) return "";
    const options = poll.options;
    const summed = options.reduce((s, o) => s + (o.totalVoteCount || 0), 0);
    const total = poll.totalVoteCount != null ? poll.totalVoteCount : summed;
    const rows = options.map((o) => {
      const n = o.totalVoteCount || 0;
      const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((n / total) * 100))) : 0;
      return `<div class="poll-row"><div class="poll-top"><span>${esc(o.option)}</span><span>${n}</span></div><div class="poll-track" role="meter" aria-valuemin="0" aria-valuemax="${Math.max(total, 1)}" aria-valuenow="${n}" aria-label="${esc(o.option)}"><i style="width:${pct}%"></i></div></div>`;
    }).join("");
    return `<div class="poll">${poll.question ? `<p style="margin:0 0 4px"><b>${esc(poll.question)}</b></p>` : ""}${rows}<p class="muted" style="margin:0">${total} vote${total === 1 ? "" : "s"}</p></div>`;
  }
  function entriesBlock(list) {
    if (!list || !list.length) return `<p class="muted" style="margin:12px 0 0">No entries yet. Be the first to enter.</p>`;
    return `<div style="margin-top:12px"><b>${list.length} ${list.length === 1 ? "entry" : "entries"}</b><ul style="margin:6px 0 0;padding-left:18px">${list.map((e) => `<li><a href="${url("project.html?id=" + encodeURIComponent(e.id))}">${esc(e.name || "Untitled")}</a> <span class="muted">by <a href="${url("profile.html?u=" + encodeURIComponent(e.by || ""))}">@${esc(e.by || "ghost")}</a></span></li>`).join("")}</ul></div>`;
  }

  function challengeCard(c) {
    const status = c.status === "closed" ? "closed" : "open";
    const past = c.deadline && c.deadline < new Date().toISOString().slice(0, 10);
    const discuss = c.discussionUrl || c.url || "";
    const enter = url("submit.html?challenge=" + encodeURIComponent(c.number));
    return `<article class="panel challenge-card reveal" id="challenge-${esc(c.number)}"><div class="tags"><span class="tag ${status === "open" ? "fb" : "ex"}">${esc(status)}</span>${c.deadline ? `<span class="tag">${ic("clock")} ${esc(c.deadline)}</span>` : ""}${past ? `<span class="tag ex">deadline passed</span>` : ""}</div><h3>${esc(c.title || "Challenge")}</h3><p>${esc(c.excerpt || "")}</p><div class="meta">${who(c.by || (c.author && c.author.login), c.avatar || (c.author && c.author.avatar))}<span>${ic("heart")} ${(c.reactions && c.reactions.total) || 0}</span><span>👍 ${c.thumbsUp || 0}</span></div>${pollBlock(c.poll)}${entriesBlock(c.entries)}<div class="share" style="margin-top:14px">${discuss ? `<a class="btn sm" href="${esc(discuss)}" target="_blank" rel="noopener noreferrer">${ic("heart")} Vote with 👍 on GitHub</a>` : ""}<a class="btn ghost sm" href="${enter}">${ic("rocket")} Enter this challenge</a></div></article>`;
  }
  // Hand-written guide pages listed in config.js (siteGuides). Entries without an href or title are skipped.
  const siteGuides = () => (Array.isArray(C.siteGuides) ? C.siteGuides : []).filter((g) => g && g.href && g.title);
  // The small "Guide" label that sets guide cards apart from project cards in mixed lists (Fresh Drops).
  const guideHead = (kind) => kind ? `<div class="guide-top"><div class="gi">${ic("book-open")}</div><span class="tag kind-guide">${ic("book-open")} Guide</span></div>` : `<div class="gi">${ic("book-open")}</div>`;
  function siteGuideCard(g, opts = {}) {
    const tags = (g.tags || []).slice(0, 6).map((t) => `<span class="tag">#${esc(t)}</span>`).join("");
    return `<article class="card guide reveal"><a class="stretch" href="${esc(url(g.href))}"><span class="sr-only">${esc(g.title)}</span></a><div class="body">${guideHead(opts.kind)}<h3>${esc(g.title)}</h3><p>${esc(g.summary || "")}</p><div class="tags">${tags}</div></div></article>`;
  }
  function guideCard(g, opts = {}) {
    const href = g.native ? url("learn.html?p=" + encodeURIComponent(g.postId)) : url("learn.html?g=" + encodeURIComponent(g.number));
    const tags = (g.tags || g.labels || []).slice(0, 6).map((t) => `<span class="tag">#${esc(t)}</span>`).join("");
    const person = g.native ? whoNative(g.by, g.avatar, g.byId, "xs") : who(g.by || (g.author && g.author.login), g.avatar || (g.author && g.author.avatar), "xs");
    return `<article class="card guide reveal"><a class="stretch" href="${href}"><span class="sr-only">${esc(g.title)}</span></a><div class="body">${guideHead(opts.kind)}<h3>${esc(g.title || "Guide")}</h3><p>${esc(g.excerpt || "")}</p><div class="tags">${tags}</div><div class="meta">${person}<span>${ic("heart")} ${(g.reactions && g.reactions.total) || 0}</span></div></div></article>`;
  }
  function memberRow(m, rank) {
    const href = url("profile.html?u=" + encodeURIComponent(m.login));
    const bits = `${m.projects || 0} projects · ${m.threads || 0} threads · ${m.replies || 0} replies · ${m.reactions || 0} reactions`;
    return `<li><a class="member-row" href="${href}">${rank ? `<span class="rank-n">${rank}</span>` : ""}${av(m.login, "", m.avatar)}<span><b>@${esc(m.login)}</b><br><small class="muted">${bits}</small></span><span class="score-pill">${m.score || 0}<small>score</small></span></a></li>`;
  }

  function toast(msg, kind = "ok") {
    let box = $(".toasts");
    if (!box) { box = document.createElement("div"); box.className = "toasts"; box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
    const t = document.createElement("div");
    t.className = "toast " + kind;
    t.innerHTML = ic(kind === "warn" ? "triangle-alert" : kind === "info" ? "info" : "circle-check") + `<span>${esc(msg)}</span>`;
    box.appendChild(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 350); }, 2600);
  }
  window.VG.toast = toast;

  function userAvatar(user) {
    if (!user) return "";
    if (user.avatar) return user.avatar;
    if (user.avatar_key) return "/img/" + encodeURIComponent(user.avatar_key);
    return "";
  }
  function setAccountLink(me) {
    const slot = $("#account-link");
    if (!slot) return;
    if (me) {
      $("#account-signup")?.remove();
      const name = me.display_name || "Account";
      slot.className = "account-chip";
      slot.href = url("account.html");
      slot.title = name;
      slot.innerHTML = `${av(name, "xs", userAvatar(me))}<span class="account-name">${esc(name)}</span>`;
    } else {
      slot.className = "btn ghost sm";
      slot.href = url("account.html");
      slot.title = "Sign in";
      slot.textContent = "Sign in";
      if (!$("#account-signup")) {
        const signup = document.createElement("a");
        signup.id = "account-signup";
        signup.className = "btn ghost sm";
        signup.href = url("account.html?mode=signup");
        signup.textContent = "Sign up";
        slot.after(signup);
      }
    }
  }
  function loadAccountLink() {
    if (!hasNative) return Promise.resolve(null);
    return VGN.me().then((me) => { setAccountLink(me); return me; }).catch(() => null);
  }
  function ownerPanel(editHref) {
    return `<div class="panel"><h3>${ic("user")} Owner</h3><p class="muted" style="margin-top:0">Only you can see these controls.</p><div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn sm" href="${esc(editHref)}">Edit</a><button type="button" class="btn ghost sm" data-owner-delete>Delete</button></div></div>`;
  }
  function bindOwnerDelete(root, postId, redirect = "projects.html") {
    const btn = $("[data-owner-delete]", root);
    if (!btn || !postId || !window.VGN) return;
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this post? This cannot be undone.")) return;
      btn.disabled = true;
      try {
        await VGN.deletePost(postId);
        try { sessionStorage.setItem("vg-toast", "Post deleted"); } catch (e) { /* storage can be blocked */ }
        location.href = url(redirect);
      } catch (err) {
        btn.disabled = false;
        toast(err.message || "Could not delete this post.", "warn");
      }
    });
  }

  let io = null;
  function reveal(root = document) {
    const els = $$(".reveal:not(.in)", root);
    if (reduce || !("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
    io = io || new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -6% 0px" });
    els.forEach((e, i) => { e.style.transitionDelay = Math.min(i % 6 * 60, 300) + "ms"; io.observe(e); });
  }

  function writeQuery(mutator) {
    try {
      const u = new URL(location.href);
      mutator(u.searchParams);
      const q = u.searchParams.toString();
      history.replaceState(null, "", u.pathname + (q ? "?" + q : "") + u.hash);
    } catch (e) { /* file URLs can reject replaceState */ }
  }
  function setOrDel(p, key, value, skip) {
    if (value == null || value === skip) p.delete(key);
    else p.set(key, value);
  }
  function markGroup(group, value) {
    const g = document.querySelector(`.filters[data-group="${group}"]`);
    if (!g) return;
    $$(".fbtn", g).forEach((b) => {
      const on = b.dataset.v === value;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  function sortProjects(list, sort) {
    const out = list.slice();
    const date = (a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    if (sort === "reacted") out.sort((a, b) => reacted(b) - reacted(a) || date(a, b));
    else if (sort === "discussed") out.sort((a, b) => (b.comments || 0) - (a.comments || 0) || date(a, b));
    else out.sort(date);
    return out;
  }
  function sortThreads(list, sort) {
    const out = list.slice();
    const pin = (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    const date = (k) => (a, b) => String(b[k] || "").localeCompare(String(a[k] || ""));
    if (sort === "top") out.sort((a, b) => ((b.reactions && b.reactions.total) || 0) - ((a.reactions && a.reactions.total) || 0) || (b.replies || 0) - (a.replies || 0) || date("updatedAt")(a, b));
    else if (sort === "active") out.sort((a, b) => pin(a, b) || date("updatedAt")(a, b));
    else out.sort((a, b) => pin(a, b) || date("createdAt")(a, b));
    return out;
  }

  let searchToken = 0;
  let searchActive = 0;
  let lastFocus = null;
  let corpusP = null;
  function corpus() {
    if (!corpusP) corpusP = buildCorpus();
    return corpusP;
  }
  async function buildCorpus() {
    const [projects, discj, guides, challenges, members] = await Promise.all([api.projects(), disc(), guidesJSON(), challengesJSON(), membersJSON()]);
    const items = [];
    for (const p of projects) items.push({ type: "Project", title: p.name || "Untitled project", text: [p.pitch, p.by, ...(p.tools || []), ...(p.tags || []), p.id].filter(Boolean).join(" "), href: url("project.html?id=" + encodeURIComponent(p.id)), meta: (p.native ? "" : "@") + (p.by || "ghost"), native: p.native, author: p.by, avatar: p.avatar, byId: p.byId, when: p.updatedAt || p.createdAt || "" });
    for (const t of discj.threads || []) items.push({ type: "Thread", title: t.title || "Untitled thread", text: [t.by, t.category, t.channel, t.id].filter(Boolean).join(" "), href: url("thread.html?id=" + encodeURIComponent(t.id)), meta: "@" + (t.by || "ghost"), when: t.updatedAt || t.createdAt || "" });
    for (const g of siteGuides()) items.push({ type: "Guide", title: g.title, text: [g.keywords, g.summary, ...(g.tags || [])].filter(Boolean).join(" "), href: url(g.href), meta: "Vibe Garage", when: g.published || "" });
    for (const g of guides.guides || []) items.push({ type: "Guide", title: g.title || "Untitled guide", text: [g.excerpt, g.by, g.author && g.author.login, ...(g.tags || [])].filter(Boolean).join(" "), href: g.native ? url("learn.html?p=" + encodeURIComponent(g.postId)) : url("learn.html?g=" + encodeURIComponent(g.number)), meta: (g.native ? "" : "@") + (g.by || (g.author && g.author.login) || "ghost"), native: g.native, author: g.by, avatar: g.avatar, byId: g.byId, when: g.updatedAt || g.createdAt || "" });
    for (const c of challenges.challenges || []) items.push({ type: "Challenge", title: c.title || "Untitled challenge", text: [c.excerpt, c.by, c.status, ...(c.tags || [])].filter(Boolean).join(" "), href: url("challenges.html") + "#challenge-" + encodeURIComponent(c.number), meta: "@" + (c.by || (c.author && c.author.login) || "ghost"), when: c.updatedAt || c.createdAt || "" });
    for (const m of members.members || []) items.push({ type: "Builder", title: "@" + m.login, text: m.login, href: url("profile.html?u=" + encodeURIComponent(m.login)), meta: (m.score || 0) + " score", when: m.lastSeen || "" });
    return items;
  }
  function ensureSearchModal() {
    if ($("#search-modal")) return;
    const el = document.createElement("div");
    el.id = "search-modal";
    el.className = "search-modal";
    el.hidden = true;
    el.innerHTML = `<div class="search-backdrop" data-close-search></div><div class="search-dialog" role="dialog" aria-modal="true" aria-labelledby="search-label"><div class="searchbox"><label id="search-label" class="sr-only" for="search-input">Search the garage</label>${ic("search")}<input id="search-input" type="search" role="combobox" aria-expanded="false" aria-controls="search-results" aria-autocomplete="list" placeholder="Projects, threads, guides, challenges, builders" autocomplete="off"><button type="button" class="icon-btn" data-close-search aria-label="Close search">${ic("x")}</button></div><ul id="search-results" role="listbox"></ul><p class="search-hint">↑ ↓ to move · Enter to open · Esc to close · / opens search</p></div>`;
    document.body.appendChild(el);
    $("#search-input").addEventListener("input", () => renderSearch());
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-close-search]")) { closeSearch(); return; }
      const hit = e.target.closest("[data-href]");
      if (hit) location.href = hit.getAttribute("data-href");
    });
  }
  function setInert(on) {
    if (!("inert" in HTMLElement.prototype)) return;
    const modal = $("#search-modal");
    [...document.body.children].forEach((node) => {
      if (node !== modal && node.tagName !== "SCRIPT") node.inert = on;
    });
  }
  async function renderSearch() {
    const token = ++searchToken;
    const list = $("#search-results");
    const input = $("#search-input");
    if (!list || !input) return;
    list.innerHTML = `<li class="search-empty" role="presentation">Looking through the garage…</li>`;
    let items = [];
    try { items = await corpus(); } catch (e) { items = []; }
    if (token !== searchToken || !input.isConnected) return;
    const query = input.value.trim();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const order = { Project: 0, Thread: 1, Guide: 2, Challenge: 3, Builder: 4 };
    let hits;
    if (!terms.length) hits = items.filter((i) => i.type !== "Builder").slice().sort((a, b) => String(b.when).localeCompare(String(a.when))).slice(0, 8);
    else hits = items.filter((i) => { const hay = (i.title + " " + i.text).toLowerCase(); return terms.every((t) => hay.includes(t)); }).sort((a, b) => (order[a.type] - order[b.type]) || String(b.when).localeCompare(String(a.when))).slice(0, 30);
    searchActive = hits.length ? 0 : -1;
    if (!hits.length) {
      list.innerHTML = `<li class="search-empty" role="presentation">${items.length ? "No matches. Try a builder, a tool, or part of a title." : "Nothing to search yet. Projects, threads, guides, challenges, and builders will show up here."}</li>`;
      input.removeAttribute("aria-activedescendant");
      return;
    }
    list.innerHTML = hits.map((hit, i) => `<li id="sopt-${i}" role="option" aria-selected="${i === 0 ? "true" : "false"}"><button type="button" data-href="${esc(hit.href)}"><span class="k">${esc(hit.type)}</span><strong>${esc(hit.title)}</strong><small>${hit.native ? whoNative(hit.author, hit.avatar, hit.byId, "", false) : esc(hit.meta || "")}</small></button></li>`).join("");
    input.setAttribute("aria-activedescendant", "sopt-0");
  }
  function moveSearch(dir) {
    const opts = $$('#search-results [role="option"]');
    if (!opts.length) return;
    searchActive = (searchActive + dir + opts.length) % opts.length;
    opts.forEach((el, i) => el.setAttribute("aria-selected", i === searchActive ? "true" : "false"));
    const input = $("#search-input");
    if (input) input.setAttribute("aria-activedescendant", opts[searchActive].id);
    opts[searchActive].scrollIntoView({ block: "nearest" });
  }
  function openSearch(prefill) {
    ensureSearchModal();
    const modal = $("#search-modal");
    if (!modal) return;
    lastFocus = document.activeElement;
    modal.hidden = false;
    setInert(true);
    const input = $("#search-input");
    input.value = prefill || "";
    input.setAttribute("aria-expanded", "true");
    $("#search-open")?.setAttribute("aria-expanded", "true");
    const nav = $("nav.main");
    if (nav && nav.classList.contains("open")) { nav.classList.remove("open"); $(".burger")?.setAttribute("aria-expanded", "false"); }
    input.focus();
    renderSearch();
  }
  function closeSearch() {
    const modal = $("#search-modal");
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    setInert(false);
    $("#search-input")?.setAttribute("aria-expanded", "false");
    $("#search-open")?.setAttribute("aria-expanded", "false");
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }
  function typingTarget(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
  }
  function currentTheme() { return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"; }
  function applyTheme(next, persist) {
    const theme = next === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", theme);
    if (persist) { try { localStorage.setItem("vg-theme", theme); } catch (e) { /* storage can be blocked */ } }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#f4f7fb" : "#0a0f17");
    const btn = $("#theme-toggle");
    if (btn) btn.setAttribute("aria-label", theme === "light" ? "Switch to dark theme" : "Switch to light theme");
    syncNavTheme();
    sendGiscusTheme();
  }
  // Phone menu copy of the theme toggle (the header toggle is hidden at 480px and below).
  // Only text and hidden flags change, so the clicked node stays in the menu and the menu stays open.
  function syncNavTheme() {
    const item = $("#nav-theme-toggle");
    if (!item) return;
    const toLight = currentTheme() !== "light";
    item.querySelector("[data-to-light]").toggleAttribute("hidden", !toLight);
    item.querySelector("[data-to-dark]").toggleAttribute("hidden", toLight);
    item.querySelector("span").textContent = toLight ? "Switch to light theme" : "Switch to dark theme";
  }
  function mountNavTheme() {
    const nav = $("#site-nav");
    if (!nav || $("#nav-theme-toggle")) return;
    const item = document.createElement("button");
    item.type = "button";
    item.id = "nav-theme-toggle";
    item.className = "nav-theme";
    item.innerHTML = '<svg class="ico" data-to-light viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg><svg class="ico" data-to-dark viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg><span></span>';
    const cta = nav.querySelector(".nav-cta");
    nav.insertBefore(item, cta || null);
    item.addEventListener("click", () => applyTheme(currentTheme() === "light" ? "dark" : "light", true));
    syncNavTheme();
  }
  function mountAnalytics() {
    if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(location.hostname)) return;
    const cf = String((C.analytics && C.analytics.cfBeacon) || "").trim();
    if (/^[a-f0-9]{32}$/.test(cf) && !document.querySelector("script[data-cf-beacon]")) {
      const b = document.createElement("script");
      b.defer = true;
      b.src = "https://static.cloudflareinsights.com/beacon.min.js";
      b.setAttribute("data-cf-beacon", JSON.stringify({ token: cf }));
      document.body.appendChild(b);
    }
    const code = String((C.analytics && C.analytics.goatcounter) || "").trim();
    if (!/^[A-Za-z0-9-]{1,64}$/.test(code)) return;
    if (document.querySelector("script[data-goatcounter]")) return;
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://gc.zgo.at/count.js";
    s.setAttribute("data-goatcounter", "https://" + code + ".goatcounter.com/count");
    document.body.appendChild(s);
  }
  function ensureChrome() {
    const skip = $('a[href="#main"]');
    if (skip) { skip.classList.add("skip"); skip.removeAttribute("style"); if (!skip.textContent.trim()) skip.textContent = "Skip to content"; }
    else {
      const a = document.createElement("a");
      a.className = "skip";
      a.href = "#main";
      a.textContent = "Skip to content";
      document.body.prepend(a);
    }
    const main = $("#main");
    if (main && !main.hasAttribute("tabindex")) main.tabIndex = -1;
    const bar = $(".top .bar");
    if (bar && !$("#search-open")) {
      let tools = $(".bar-tools");
      if (!tools) { tools = document.createElement("div"); tools.className = "bar-tools"; bar.appendChild(tools); }
      const b = document.createElement("button");
      b.type = "button";
      b.className = "icon-btn";
      b.id = "search-open";
      b.setAttribute("aria-label", "Search");
      b.setAttribute("aria-keyshortcuts", "/");
      b.setAttribute("aria-expanded", "false");
      b.innerHTML = ic("search");
      tools.prepend(b);
    }
    if (!document.querySelector('link[rel="alternate"][type="application/atom+xml"]')) {
      const l = document.createElement("link");
      l.rel = "alternate";
      l.type = "application/atom+xml";
      l.title = "Vibe Garage";
      l.href = pageUrl("feed.xml");
      document.head.appendChild(l);
    }
    const footer = document.querySelector("footer .wrap");
    if (footer && !footer.querySelector(".loop")) {
      const div = document.createElement("div");
      div.className = "loop";
      div.innerHTML = `<div><h2>Stay in the loop</h2><p>Forum threads land in the Atom feed. You can also follow them in Discussions.</p></div><div class="loop-links"><a class="btn ghost sm" href="${url("feed.xml")}">Atom feed</a><a class="btn ghost sm" href="https://github.com/${esc(C.repo || "vibe-garage/vibe-garage")}/discussions" target="_blank" rel="noopener noreferrer">Discussions</a></div>`;
      const cols = footer.querySelector(".cols");
      footer.insertBefore(div, cols || footer.firstChild);
    }
    watchGiscus();
    applyTheme(currentTheme(), false);
    mountAnalytics();
    ensureSearchModal();
  }

  function globals() {
    $(".burger")?.addEventListener("click", () => {
      const n = $("nav.main");
      if (!n) return;
      const o = n.classList.toggle("open");
      $(".burger").setAttribute("aria-expanded", o ? "true" : "false");
    });
    document.addEventListener("click", (e) => {
      const opener = e.target.closest("#search-open, [data-open-search]");
      if (opener) {
        e.preventDefault();
        const modal = $("#search-modal");
        if (modal && !modal.hidden) closeSearch();
        else openSearch("");
        return;
      }
      const nav = $("nav.main");
      if (nav && nav.classList.contains("open") && !e.target.closest("nav.main") && !e.target.closest(".burger")) {
        nav.classList.remove("open");
        $(".burger")?.setAttribute("aria-expanded", "false");
      }
      const toastBtn = e.target.closest("[data-toast]");
      if (toastBtn) { e.preventDefault(); toast(toastBtn.dataset.toast, "info"); return; }
      const react = e.target.closest("button.react");
      if (react) {
        const n = react.querySelector("b");
        const on = react.classList.toggle("on");
        if (n) n.textContent = String((+n.textContent || 0) + (on ? 1 : -1));
        react.classList.remove("pop");
        void react.offsetWidth;
        react.classList.add("pop");
      }
    });
    document.addEventListener("keydown", (e) => {
      const modal = $("#search-modal");
      const open = modal && !modal.hidden;
      if (open && e.key === "Tab") {
        const box = $(".search-dialog");
        const f = box ? [...box.querySelectorAll("button, input, a")].filter((el) => !el.hidden) : [];
        if (f.length) {
          const first = f[0];
          const last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      if (e.key === "Escape") {
        if (open) { e.preventDefault(); closeSearch(); return; }
        const nav = $("nav.main");
        if (nav && nav.classList.contains("open")) { nav.classList.remove("open"); $(".burger")?.setAttribute("aria-expanded", "false"); }
        return;
      }
      if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); moveSearch(e.key === "ArrowDown" ? 1 : -1); return; }
      if (open && e.key === "Enter") {
        const sel = $('#search-results [role="option"][aria-selected="true"] button');
        if (sel) { e.preventDefault(); location.href = sel.getAttribute("data-href"); }
        return;
      }
      if (!open && e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !typingTarget(e.target)) {
        e.preventDefault();
        openSearch("");
      }
    });
    $("#theme-toggle")?.addEventListener("click", () => applyTheme(currentTheme() === "light" ? "dark" : "light", true));
    mountNavTheme();
    $$("[data-avatars]").forEach((el) => { el.innerHTML = (D.members || []).slice(0, +el.dataset.avatars || 6).map((m) => av(m.handle || m.login)).join(""); });
    if ($$("[data-stat]").length) {
      Promise.all([api.projects(), api.threads(), membersJSON()]).then(([ps, ts, mem]) => {
        const whoSet = new Set([...ps, ...ts].map((x) => x.by).filter(Boolean));
        const builders = (mem.members && mem.members.length) || whoSet.size;
        const v = { projects: ps.length, threads: ts.length, replies: ts.reduce((n, t) => n + (t.replies || 0), 0), builders };
        $$("[data-stat]").forEach((el) => { el.textContent = (v[el.dataset.stat] || 0).toLocaleString(); });
      }).catch(() => {});
    }
    $$("[data-count]").forEach((el) => {
      const end = +el.dataset.count;
      if (reduce) { el.textContent = end.toLocaleString(); return; }
      const t0 = performance.now();
      const step = (t) => { const k = Math.min(1, (t - t0) / 1400); el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))).toLocaleString(); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
    $$("[data-tools-marquee]").forEach((el) => { const chips = (D.tools || []).map((t) => `<span class="tool-chip"><i style="background:${t.color}"></i>${esc(t.name)}</span>`).join(""); el.innerHTML = chips + chips; });
    if (document.body.dataset.page === "home") {
      const q = qs("q");
      if (q) openSearch(q);
    }
  }

  const pages = {
    async home() {
      const b = $("#bento"); const h = $("#hot"); const t = $("#home-threads");
      if (!b || !h || !t) return;
      b.innerHTML = skel(1, "cover") + skel(5); h.innerHTML = skel(4); t.innerHTML = "";
      const [ps, gj] = await Promise.all([api.projects(), guidesJSON()]);
      const top = sortProjects(ps, "reacted");
      const sub = `<a class="btn sm" href="${url("submit.html")}">${ic("rocket")} Submit a project</a>`;
      // Fresh Drops: projects first (the newest is the cover story), then guides, six cards at most.
      // The empty state shows only when there are no projects and no guides.
      const guideCards = [...siteGuides().map((g) => siteGuideCard(g, { kind: true })), ...(gj.guides || []).map((g) => guideCard(g, { kind: true }))];
      // Keep at least one slot for a guide when there are any, so a full showroom doesn't hide them.
      const maxProjects = guideCards.length ? 5 : 6;
      const projectCards = ps.length ? [card(ps[0], "cover", { cover: true }), ...ps.slice(1, maxProjects).map((p) => card(p))] : [];
      const drops = [...projectCards, ...guideCards].slice(0, 6);
      // Guides but no projects yet: keep the invitation to submit next to the guide cards.
      if (!projectCards.length && drops.length) drops.push(`<article class="card drops-invite reveal"><div class="body"><h3>No projects yet</h3><p>Share yours and it becomes the first cover story.</p><p>${sub}</p></div></article>`);
      b.innerHTML = drops.length ? drops.join("") : empty("The showroom is empty", "No projects yet. Share yours and it becomes the first cover story.", sub);
      b.style.display = drops.length ? "" : "block";
      // Guides section: skip site guides already shown in Fresh Drops (they come first among the guide
      // cards there, so the first `6 - projects shown` of them made it in). Hide the section if none are left;
      // the Fresh Drops header already links to All guides.
      const hg = $("#home-guides");
      if (hg && siteGuides().length) {
        const inDrops = new Set(siteGuides().slice(0, Math.max(0, 6 - projectCards.length)).map((g) => g.href));
        const rest = siteGuides().filter((g) => !inDrops.has(g.href)).slice(0, 3);
        hg.innerHTML = rest.map((g) => siteGuideCard(g)).join("");
        const sec = hg.closest("section");
        if (sec) sec.style.display = rest.length ? "" : "none";
      }
      h.innerHTML = top.length > 1 ? top.slice(0, 5).map((p, i) => card(p, "", { rank: i + 1, noFb: true, ribbon: `<span class="ribbon hot">${ic("flame")} hot</span>` })).join("") : "";
      if (top.length < 2) { const sec = h.closest("section"); if (sec) sec.style.display = "none"; }
      const ts = await api.threads();
      t.innerHTML = ts.length ? ts.slice(0, 4).map(threadRow).join("") : empty("Quiet in here", "No threads yet. Start the first one!", "");
      const hf = $("#hero-float");
      if (hf && top.length >= 2) { const a = top[0]; const c = top[1]; hf.innerHTML = `<div class="fc">${art(a)}</div><div class="fc">${art(c)}</div><div class="float-badge glass">${av(a.by, "", a.avatar)}<span><b>@${esc(a.by)}</b> got 💜 ${reacted(a)}</span></div>`; }
      reveal();
    },
    async projects() {
      const grid = $("#pgrid");
      if (!grid) return;
      grid.innerHTML = skel(6);
      const ps = await api.projects();
      const allowed = ["newest", "reacted", "discussed"];
      const st = { tool: qs("tool") || "all", tag: qs("tag") || "all", q: qs("q") || "", sort: allowed.includes(qs("sort")) ? qs("sort") : "newest" };
      const tools = [...new Set(ps.flatMap((p) => p.tools || []))].sort();
      const tags = [...new Set(ps.flatMap((p) => p.tags || []))].sort();
      const toolBox = $("#f-tool"); const tagBox = $("#f-tag");
      if (toolBox) toolBox.innerHTML = `<span class="lbl">tool</span>` + ["all", ...tools].map((t) => `<button type="button" class="fbtn" data-v="${esc(t)}">${t === "all" ? "All" : esc(t)}</button>`).join("");
      if (tagBox) tagBox.innerHTML = `<span class="lbl">tag</span>` + ["all", ...tags].map((t) => `<button type="button" class="fbtn" data-v="${esc(t)}">${t === "all" ? "All" : "#" + esc(t)}</button>`).join("");
      const search = $("#psearch");
      if (search) {
        search.value = st.q;
        // Full placeholder gets clipped on narrow phones; use the short one there.
        const fullPh = search.getAttribute("placeholder");
        const mq = window.matchMedia("(max-width: 520px)");
        const setPh = () => search.setAttribute("placeholder", mq.matches ? "Search projects…" : fullPh);
        setPh();
        if (mq.addEventListener) mq.addEventListener("change", setPh);
      }
      const draw = () => {
        const q = st.q.toLowerCase();
        const list = sortProjects(ps.filter((p) => {
          const toolsOf = p.tools || [];
          const tagsOf = p.tags || [];
          const blob = (p.name + " " + (p.pitch || "") + " " + (p.by || "") + " " + toolsOf.join(" ") + " " + tagsOf.join(" ")).toLowerCase();
          return (st.tool === "all" || toolsOf.includes(st.tool)) && (st.tag === "all" || tagsOf.includes(st.tag)) && (!q || blob.includes(q));
        }), st.sort);
        const count = $("#pcount");
        if (count) count.textContent = `${list.length} project${list.length === 1 ? "" : "s"}`;
        markGroup("tool", st.tool); markGroup("tag", st.tag); markGroup("sort", st.sort);
        writeQuery((p) => { setOrDel(p, "tool", st.tool, "all"); setOrDel(p, "tag", st.tag, "all"); setOrDel(p, "q", st.q.trim(), ""); setOrDel(p, "sort", st.sort, "newest"); });
        grid.style.display = list.length ? "" : "block";
        grid.innerHTML = list.length ? list.map((p) => card(p)).join("") : !ps.length ? empty("No projects yet", "The showroom opens with the first submission. Share what you’re building, finished or not.", `<p style="display:flex;justify-content:center"><a class="btn sm" href="${url("submit.html")}">${ic("rocket")} Submit a project</a></p>`) : empty("Nothing here… yet", "No projects match that combo. Maybe you’re the one to build it?", `<p style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button type="button" class="btn ghost sm" id="reset">${ic("x")} Clear filters</button><a class="btn sm" href="${url("submit.html")}">${ic("rocket")} Submit a project</a></p>`);
        $("#reset")?.addEventListener("click", () => { st.tool = "all"; st.tag = "all"; st.q = ""; if (search) search.value = ""; draw(); });
        reveal(grid);
      };
      $$(".filters").forEach((g) => g.addEventListener("click", (e) => { const b = e.target.closest(".fbtn"); if (!b || !g.dataset.group) return; st[g.dataset.group] = b.dataset.v; draw(); }));
      search?.addEventListener("input", (e) => { st.q = e.target.value; draw(); });
      draw();
    },
    async project() {
      const root = $("#pdetail");
      if (!root) return;
      root.innerHTML = `<div class="grid2">${skel(2)}</div>`;
      const p = await api.project(qs("id") || "");
      if (!p) {
        setSeo({ title: "Project not found · Vibe Garage", description: "That project is not in the latest Vibe Garage snapshot.", path: "project.html" });
        root.innerHTML = empty("Project not found", "That link might be old, or the project is not in this snapshot yet.", `<a class="btn sm" href="${url("projects.html")}">${ic("arrow-left")} Back to projects</a>`);
        return;
      }
      const canonPath = "project.html?id=" + encodeURIComponent(p.id);
      const canon = setSeo({ title: p.name + " · Vibe Garage", description: p.pitch || p.name, path: canonPath, type: "article" });
      const live = httpUrl(p.url);
      const repo = repoUrl(p.repo);
      const f = FB[p.fb] || FB.gentle;
      const all = await api.projects();
      const code = p.code || "";
      const author = p.by || "ghost";
      const native = Boolean(p.native);
      let ownerMe = null;
      if (native && window.VGN) {
        try { ownerMe = await VGN.me(); } catch (e) { ownerMe = null; }
      }
      const isOwner = Boolean(native && ownerMe && ownerMe.id === p.byId);
      const feedbackBlock = native || !FB[p.fb] ? "" : `<div class="fbbig ${esc(p.fb || "gentle")}"><span class="em">${f[1]}</span><div><b>Feedback wanted: ${f[0]}</b><br><small class="muted">${f[2]}</small></div></div>`;
      const hero = native && p.image
        ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover">`
        : art(p);
      injectLd({
        "@context": "https://schema.org",
        "@type": ["SoftwareApplication", "CreativeWork"],
        name: p.name,
        description: p.pitch || "",
        url: canon,
        applicationCategory: "WebApplication",
        ...(p.createdAt ? { datePublished: p.createdAt } : {}),
        ...(p.updatedAt ? { dateModified: p.updatedAt } : {}),
        author: { "@type": "Person", name: author, url: pageUrl(native ? "profile.html?n=" + encodeURIComponent(p.byId) : "profile.html?u=" + encodeURIComponent(author)) },
        ...(repo ? { codeRepository: repo } : {}),
        ...(live ? { sameAs: live } : {})
      });
      root.innerHTML = `<div class="page-head" style="padding-top:30px"><a class="kicker" href="${url("projects.html")}">${ic("arrow-left")} all projects</a><h1 style="margin-top:.3em">${esc(p.name)}</h1><p>${esc(p.pitch || "")}</p><div class="tags">${(p.tools || []).map(toolTag).join("")}${(p.tags || []).map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}</div></div>
<div class="detail"><div><div class="hero-art reveal">${hero}</div>
<div class="panel reveal" style="margin-top:22px"><h3>${ic("code")} The code</h3><p class="muted" style="margin-top:0">${repo ? `${ic("git-branch")} <a class="mono" href="${esc(repo)}" target="_blank" rel="noopener noreferrer">${esc(repo.replace(/^https:\/\/github.com\//, "github.com/"))}</a>` : "No repo linked."}</p>${code ? `<div style="position:relative"><pre class="code">${esc(code)}</pre><button type="button" class="btn ghost sm copy" data-copy>${ic("code")} Copy</button></div>` : `<p class="muted">No code pasted.</p>`}</div>
<div class="panel reveal"><h3>${ic("wand-sparkles")} Prompts they shared</h3><p class="muted" style="margin-top:0">The secret sauce. Steal freely.</p>${(p.prompts || []).map((x) => `<div class="prompt">${ic("terminal")}${esc(x)}</div>`).join("") || `<p class="muted">No prompts shared.</p>`}</div>
<div class="panel reveal"><h3>${ic("share")} Share</h3>${shareBar(canon, p.name)}</div></div>
<aside>${feedbackBlock || live ? `<div class="panel glass">${feedbackBlock}
${live ? `<p style="margin:18px 0 6px"><a class="btn" style="width:100%" href="${esc(live)}" target="_blank" rel="noopener noreferrer">${ic("external-link")} Open it live</a></p>` : ""}</div>` : ""}
${native ? "" : reactionBlock(p.reactions, p.discussionUrl)}
<div class="panel"><h3>${ic("user")} Builder</h3><div style="display:flex;gap:12px;align-items:center">${native ? whoNative(author, p.avatar, p.byId) : who(author, p.avatar)}</div></div>
${isOwner ? ownerPanel(url("submit.html?edit=" + encodeURIComponent(p.postId))) : ""}</aside></div>
${native ? "" : (p.number ? giscus(p.number) : "")}
<section><div class="sec-h"><h2>More from the garage</h2></div><div class="grid3">${all.filter((o) => o.id !== p.id).slice(0, 3).map((o) => card(o)).join("") || `<p class="muted">Nothing else yet. <a href="${url("submit.html")}">Share yours</a>.</p>`}</div></section>`;
      if (!native && p.number) mountGiscus(p.number);
      bindShare(root);
      bindOwnerDelete(root, p.postId);
      $("[data-copy]", root)?.addEventListener("click", () => { navigator.clipboard?.writeText(code).then(() => toast("Code copied"), () => toast("Copy not allowed here", "warn")); });
      reveal();
    },
    async forum() {
      const list = $("#tlist");
      if (!list) return;
      list.innerHTML = Array.from({ length: 5 }, () => '<div class="thread skel"><span class="chan-ico ln" style="width:44px;height:44px"></span><div><div class="ln h"></div><div class="ln w40"></div></div><div></div></div>').join("");
      const ts = await api.threads();
      const sorts = ["newest", "active", "top"];
      let cur = qs("c") || "all";
      let sort = sorts.includes(qs("sort")) ? qs("sort") : "newest";
      const chList = [{ id: "all", name: "All channels", icon: "sparkles" }, ...(ts.some((t) => t.channel === "announcements") ? [ANN] : []), ...(D.channels || [])];
      const chans = $("#chans");
      if (chans) chans.innerHTML = chList.map((c) => `<button type="button" class="chan ${c.id === cur ? "on" : ""}" data-chan="${esc(c.id)}" aria-pressed="${c.id === cur ? "true" : "false"}">${ic(c.icon)}<span>${esc(c.name)}</span><small>${c.id === "all" ? ts.length : ts.filter((t) => t.channel === c.id).length}</small></button>`).join("");
      const draw = () => {
        const c = cur === "announcements" ? ANN : (D.channels || []).find((x) => x.id === cur);
        const title = $("#chan-title");
        if (title) title.innerHTML = c ? `${ic(c.icon)} ${esc(c.name)} <small class="muted" style="font:500 .95rem var(--body)">· ${esc(c.blurb || "")}</small>` : `${ic("sparkles")} Everything`;
        markGroup("sort", sort);
        $$("#chans .chan").forEach((b) => { const on = b.dataset.chan === cur; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
        writeQuery((p) => { setOrDel(p, "c", cur, "all"); setOrDel(p, "sort", sort, "newest"); });
        const ch = cur === "all" || cur === "announcements" ? "newbie-corner" : cur;
        api.categorySlug(ch).then((slug) => {
          const threadUrl = api.newDiscussionUrl(slug, "", "<!-- What's up? Share what you built, what you're stuck on, or what you learned. -->\n");
          $$("[data-newthread]").forEach((a) => { a.href = threadUrl; a.removeAttribute("data-toast"); });
        }).catch(() => {});
        const l = sortThreads(ts.filter((t) => cur === "all" || t.channel === cur), sort);
        list.innerHTML = l.length ? l.map(threadRow).join("") : empty("Quiet in here", "No threads in this channel yet. Start the first one!", `<a class="btn sm" data-newthread target="_blank" rel="noopener noreferrer" href="https://github.com/${esc(C.repo || "vibe-garage/vibe-garage")}/discussions">${ic("send")} Start a thread</a>`);
        reveal(list);
      };
      chans?.addEventListener("click", (e) => { const b = e.target.closest(".chan"); if (!b) return; cur = b.dataset.chan; draw(); });
      $("#forum-sort")?.addEventListener("click", (e) => { const b = e.target.closest(".fbtn"); if (!b) return; sort = b.dataset.v; draw(); });
      draw();
    },
    async thread() {
      const root = $("#thread");
      if (!root) return;
      root.innerHTML = skel(2);
      const t = await api.thread(qs("id") || "");
      if (!t) {
        setSeo({ title: "Thread not found · Vibe Garage", description: "That thread is not in the latest Vibe Garage snapshot.", path: "thread.html" });
        root.innerHTML = empty("Thread not found", "It may have been moved, or it is not in this snapshot yet.", `<a class="btn sm" href="${url("forum.html")}">${ic("arrow-left")} Back to forum</a>`);
        return;
      }
      const c = chan(t.channel);
      const canonPath = "thread.html?id=" + encodeURIComponent(t.id);
      const description = stripHtml(t.bodyHTML).slice(0, 180) || t.title;
      const canon = setSeo({ title: t.title + " · Vibe Garage", description, path: canonPath, type: "article" });
      const text = stripHtml(t.bodyHTML).slice(0, 5000);
      injectLd({
        "@context": "https://schema.org",
        "@type": "DiscussionForumPosting",
        headline: t.title,
        publisher: { "@type": "Organization", name: "NeoZones Productions", url: "https://neozonesproductions.com/" },
        url: canon,
        ...(t.createdAt ? { datePublished: t.createdAt } : {}),
        ...(t.updatedAt ? { dateModified: t.updatedAt } : {}),
        ...(text ? { text } : {}),
        author: { "@type": "Person", name: t.by || "ghost", url: pageUrl("profile.html?u=" + encodeURIComponent(t.by || "ghost")) },
        interactionStatistic: [
          { "@type": "InteractionCounter", interactionType: "https://schema.org/CommentAction", userInteractionCount: t.replies || 0 },
          { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: (t.reactions && t.reactions.total) || 0 }
        ]
      });
      const body = t.bodyHTML ? `<div class="gh-body">${sanitize(t.bodyHTML)}</div>` : `<p class="muted">This post has no body text.</p>`;
      if (t.real !== false) {
        root.innerHTML = `<div class="page-head" style="padding-top:30px"><a class="kicker" href="${url("forum.html" + (c.id ? "?c=" + encodeURIComponent(c.id) : ""))}">${ic("arrow-left")} ${esc(c.name)}</a><h1 style="font-size:clamp(2rem,5vw,3.6rem);margin-top:.35em">${esc(t.title)}</h1>
<div class="tags">${t.pinned ? `<span class="tag fb">${ic("pin")} pinned</span>` : ""}${t.channel === "announcements" ? "" : fbTag(t.fb)}<span class="tag">${esc(t.category || c.name)}</span></div></div>
<article class="post op reveal ${t.pinned ? "pinned" : ""}"><div class="who">${who(t.by, t.avatar)}<span class="badge">author</span><small class="muted">${esc(ago(t.createdAt))}${t.updatedAt && t.updatedAt !== t.createdAt ? " · updated " + esc(ago(t.updatedAt)) : ""}</small></div>${body}</article>
<div class="panel reveal"><h3>${ic("share")} Share</h3>${shareBar(canon, t.title)}</div>
${reactionBlock(t.reactions, t.url)}
${giscus(t.number)}`;
        if (t.number) mountGiscus(t.number);
        bindShare(root);
        reveal();
        return;
      }
      const posts = Array.isArray(t.posts) ? t.posts : [];
      const post = (p, i) => `<article class="post reveal ${p.pinned ? "pinned" : ""} ${i === 0 ? "op" : ""}">${p.pinned ? `<div class="pin">${ic("pin")} pinned helpful answer</div>` : ""}<div class="who">${who(p.by)}${i === 0 ? `<span class="badge">author</span>` : ""}<small class="muted">${esc(p.ago || "")}</small></div>${sanitize(p.html || "")}</article>`;
      root.innerHTML = `<div class="page-head" style="padding-top:30px"><a class="kicker" href="${url("forum.html?c=" + encodeURIComponent(c.id || ""))}">${ic("arrow-left")} ${esc(c.name)}</a><h1 style="font-size:clamp(2rem,5vw,3.6rem);margin-top:.35em">${esc(t.title)}</h1><div class="tags">${t.channel === "announcements" ? "" : fbTag(t.fb)}</div></div>${posts.length ? posts.map(post).join("") : empty("No replies yet", "Open the thread on GitHub to reply.", t.url ? `<a class="btn sm" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">Open on GitHub</a>` : "")}<div class="panel reveal"><h3>${ic("share")} Share</h3>${shareBar(canon, t.title)}</div>`;
      bindShare(root);
      reveal();
    },
    async challenges() {
      const g = $("#chgrid");
      if (!g) return;
      const [data, slug] = await Promise.all([challengesJSON(), categorySlugByName("Polls", "polls")]);
      const propose = api.newDiscussionUrl(slug, "[Challenge] ", "Deadline: YYYY-MM-DD\n\nWhat should we build?\n");
      $$("[data-propose]").forEach((a) => { a.href = propose; });
      const list = data.challenges || [];
      if (!list.length) {
        g.style.display = "block";
        g.innerHTML = empty("No challenge running yet", "Pitch a theme and the garage can vote on it. Challenge posts show up here.", `<a class="btn sm" data-propose target="_blank" rel="noopener noreferrer" href="${esc(propose)}">${ic("send")} Propose a challenge</a>`);
        reveal(g);
        return;
      }
      g.style.display = "";
      g.innerHTML = list.map(challengeCard).join("");
      const hash = location.hash.replace(/^#/, "");
      if (hash) document.getElementById(hash)?.scrollIntoView();
      reveal(g);
    },
    async learn() {
      const g = $("#lgrid");
      const root = $("#learn-root");
      const fg = $("#featured-guides");
      if (fg && siteGuides().length) fg.innerHTML = siteGuides().map((sg) => siteGuideCard(sg)).join("");
      const [data, slug] = await Promise.all([guidesJSON(), api.categorySlug("prompt-craft")]);
      const write = nativePosts ? url("submit.html?kind=guide") : api.newDiscussionUrl(slug, "[Guide] ", "What this guide covers:\n\n");
      const writeAttrs = nativePosts ? "" : ' target="_blank" rel="noopener noreferrer"';
      $$("[data-guide]").forEach((a) => {
        a.href = write;
        if (nativePosts) { a.removeAttribute("target"); a.removeAttribute("rel"); }
      });
      const guides = data.guides || [];
      const pid = qs("p");
      if (pid) {
        const guide = guides.find((row) => row.native && (String(row.postId) === String(pid) || row.id === "vg-" + pid));
        const host = root || g;
        if (!host) return;
        if (!guide) {
          setSeo({ title: "Guide not found · Vibe Garage", description: "That guide is not in the latest Vibe Garage snapshot.", path: "learn.html" });
          host.innerHTML = empty("Guide not found", "It may have been renamed, or it is not in this snapshot yet.", `<a class="btn sm" href="${url("learn.html")}">${ic("arrow-left")} All guides</a>`);
          return;
        }
        const canon = setSeo({ title: (guide.title || "Guide") + " · Vibe Garage", description: guide.excerpt || guide.title, path: "learn.html?p=" + encodeURIComponent(guide.postId) });
        const tags = (guide.tags || guide.labels || []).map((t) => `<span class="tag">#${esc(t)}</span>`).join("");
        let ownerMe = null;
        if (window.VGN) {
          try { ownerMe = await VGN.me(); } catch (e) { ownerMe = null; }
        }
        const isOwner = Boolean(ownerMe && ownerMe.id === guide.byId);
        const live = httpUrl(guide.link);
        const cover = guide.image ? `<div class="hero-art reveal" style="margin-bottom:22px"><img src="${esc(guide.image)}" alt="${esc(guide.title)}" loading="lazy" style="width:100%;height:100%;object-fit:cover"></div>` : "";
        const linkButton = live ? `<p style="margin:18px 0 0"><a class="btn sm" href="${esc(live)}" target="_blank" rel="noopener noreferrer">${ic("external-link")} Open the link</a></p>` : "";
        host.innerHTML = `<div class="page-head"><a class="kicker" href="${url("learn.html")}">${ic("arrow-left")} all guides</a><h1 style="margin-top:.35em">${esc(guide.title || "Guide")}</h1><p>${whoNative(guide.by, guide.avatar, guide.byId)} · ${esc(day(guide.createdAt) || "")}</p><div class="tags">${tags}</div></div>${cover}<article class="post op reveal"><div class="gh-body">${sanitize(guide.bodyHTML || "")}</div>${linkButton}</article><div class="panel reveal"><h3>${ic("share")} Share</h3>${shareBar(canon, guide.title || "Guide")}</div>${isOwner ? ownerPanel(url("submit.html?kind=guide&edit=" + encodeURIComponent(guide.postId))) : ""}<p><a class="btn ghost sm" data-guide${writeAttrs} href="${esc(write)}">${ic("book-open")} Write a guide</a></p>`;
        bindShare(host);
        bindOwnerDelete(host, guide.postId, "learn.html");
        reveal(host);
        return;
      }
      const num = qs("g");
      if (num) {
        const guide = guides.find((row) => String(row.number) === String(num) || row.id === "gh-" + num);
        const host = root || g;
        if (!host) return;
        if (!guide) {
          setSeo({ title: "Guide not found · Vibe Garage", description: "That guide is not in the latest Vibe Garage snapshot.", path: "learn.html" });
          host.innerHTML = empty("Guide not found", "It may have been renamed, or it is not in this snapshot yet.", `<a class="btn sm" href="${url("learn.html")}">${ic("arrow-left")} All guides</a>`);
          return;
        }
        const author = guide.by || (guide.author && guide.author.login) || "ghost";
        const canon = setSeo({ title: (guide.title || "Guide") + " · Vibe Garage", description: guide.excerpt || guide.title, path: "learn.html?g=" + encodeURIComponent(guide.number) });
        const tags = (guide.tags || guide.labels || []).map((t) => `<span class="tag">#${esc(t)}</span>`).join("");
        host.innerHTML = `<div class="page-head"><a class="kicker" href="${url("learn.html")}">${ic("arrow-left")} all guides</a><h1 style="margin-top:.35em">${esc(guide.title || "Guide")}</h1><p>${who(author, guide.avatar || (guide.author && guide.author.avatar))} · ${esc(day(guide.createdAt) || "")}</p><div class="tags">${tags}</div></div><article class="post op reveal"><div class="gh-body">${guide.bodyHTML ? sanitize(guide.bodyHTML) : "<p class=\"muted\">This guide has no body text.</p>"}</div></article><div class="panel reveal"><h3>${ic("share")} Share</h3>${shareBar(canon, guide.title || "Guide")}</div>${reactionBlock(guide.reactions, guide.discussionUrl || guide.url)}<p><a class="btn ghost sm" data-guide${writeAttrs} href="${esc(write)}">${ic("book-open")} Write a guide</a></p>`;
        bindShare(host);
        reveal(host);
        return;
      }
      if (!g) return;
      if (!guides.length) {
        g.style.display = "block";
        g.innerHTML = empty("No community guides yet", "Figured something out the hard way? Write it up and it can become the first community guide in the library.", `<a class="btn sm" data-guide${writeAttrs} href="${esc(write)}">${ic("book-open")} Write a guide</a>`);
        reveal(g);
        return;
      }
      g.style.display = "";
      g.innerHTML = guides.map(guideCard).join("");
      reveal(g);
    },
    async profile() {
      const login = (qs("u") || "").trim();
      const [memData, projects, threads] = await Promise.all([membersJSON(), api.projects(), api.threads()]);
      const members = memData.members || [];
      const root = $("#profile-root");
      const nativeId = (qs("n") || "").trim();
      if (nativeId) {
        if (!root) return;
        let payload = null;
        try {
          const response = await fetch(url("api/users/" + encodeURIComponent(nativeId)), { cache: "no-store" });
          if (response.ok) payload = await response.json();
        } catch (e) {
          payload = null;
        }
        if (!payload || !payload.user) {
          setSeo({ title: "Builder not found · Vibe Garage", description: "That builder is not in Vibe Garage.", path: "profile.html" });
          root.innerHTML = empty("Builder not found", "That profile link might be old, or the account no longer exists.", `<a class="btn sm" href="${url("profile.html")}">${ic("arrow-left")} All builders</a>`);
          return;
        }
        const user = payload.user;
        const name = user.display_name || "Builder";
        const avatar = user.avatar || "";
        const items = (payload.posts || []).map((post) => post.kind === "guide" ? guideCard(normalizeNativeGuide(post)) : card(normalizeNativeProject(post)));
        const joined = user.created_at ? day(new Date(user.created_at * 1000).toISOString()) : "";
        setSeo({ title: name + " · Vibe Garage", description: name + " on Vibe Garage. " + items.length + " post" + (items.length === 1 ? "" : "s") + ".", path: "profile.html?n=" + encodeURIComponent(user.id) });
        root.innerHTML = `<div class="page-head"><div class="aurora" aria-hidden="true"><i></i><i></i><i></i><i></i></div><a class="kicker" href="${url("profile.html")}">${ic("arrow-left")} all builders</a><div class="prof"><div class="av lg">${avatar ? `<img src="${esc(avatar)}" alt="" style="width:100%;height:100%;object-fit:cover">` : esc(name[0].toUpperCase())}</div><div><h1>${esc(name)}</h1><p>${esc(user.bio || "No bio yet.")}</p><div class="pstats"><div><b>${items.length}</b><small>posts</small></div></div><p class="muted">${joined ? "Joined " + esc(joined) : ""}</p></div></div></div><section><div class="sec-h"><h2>Posts</h2></div><div class="grid3">${items.length ? items.join("") : `<p class="muted">No posts from ${esc(name)} yet.</p>`}</div></section>`;
        reveal(root);
        return;
      }
      if (login) {
        if (!root) return;
        const m = members.find((row) => String(row.login).toLowerCase() === login.toLowerCase());
        if (!m) {
          setSeo({ title: "Builder not found · Vibe Garage", description: "That builder is not in the latest Vibe Garage snapshot.", path: "profile.html" });
          const safe = /^[A-Za-z0-9-]+$/.test(login);
          root.innerHTML = empty("Builder not in this snapshot", safe ? `We don’t have @${esc(login)} in the latest sync. They may not have posted yet.` : "That profile link doesn’t look right.", safe ? `<p style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><a class="btn sm" href="https://github.com/${esc(login)}" target="_blank" rel="noopener noreferrer">GitHub profile</a><a class="btn ghost sm" href="${url("profile.html")}">All builders</a></p>` : `<a class="btn sm" href="${url("profile.html")}">All builders</a>`);
          return;
        }
        const mineP = projects.filter((p) => p.by === m.login);
        const mineT = threads.filter((t) => t.by === m.login);
        const gh = httpUrl(m.url) || ( /^[A-Za-z0-9-]+$/.test(m.login) ? "https://github.com/" + m.login : "");
        setSeo({ title: "@" + m.login + " · Vibe Garage", description: "@" + m.login + " on Vibe Garage. " + (m.projects || 0) + " projects, " + (m.threads || 0) + " threads, score " + (m.score || 0) + ".", path: "profile.html?u=" + encodeURIComponent(m.login) });
        root.innerHTML = `<div class="page-head"><div class="aurora" aria-hidden="true"><i></i><i></i><i></i><i></i></div><a class="kicker" href="${url("profile.html")}">${ic("arrow-left")} all builders</a><div class="prof"><div class="av lg">${m.avatar ? `<img src="${esc(m.avatar)}" alt="" style="width:100%;height:100%;object-fit:cover">` : esc(m.login[0].toUpperCase())}</div><div><h1>@${esc(m.login)}</h1><p>${gh ? `<a href="${esc(gh)}" target="_blank" rel="noopener noreferrer">${ic("github")} GitHub profile</a>` : ""}</p><div class="pstats"><div><b>${m.score || 0}</b><small>score</small></div><div><b>${m.projects || 0}</b><small>projects</small></div><div><b>${m.threads || 0}</b><small>threads</small></div><div><b>${m.replies || 0}</b><small>replies</small></div><div><b>${m.reactions || 0}</b><small>reactions</small></div></div><p class="muted">${m.firstSeen ? "First seen " + esc(day(m.firstSeen)) : ""}${m.lastSeen ? " · last seen " + esc(day(m.lastSeen)) : ""}</p></div></div></div><section><div class="sec-h"><h2>Projects</h2></div><div class="grid3">${mineP.length ? mineP.map((p) => card(p)).join("") : `<p class="muted">No projects from @${esc(m.login)} yet.</p>`}</div></section><section><div class="sec-h"><h2>Threads</h2></div><div class="threads">${mineT.length ? mineT.map(threadRow).join("") : `<p class="muted">No threads from @${esc(m.login)} yet.</p>`}</div></section>`;
        reveal(root);
        return;
      }
      const box = $("#pbuilders");
      const input = $("#bsearch");
      if (!box) return;
      const draw = () => {
        const q = (input && input.value || "").trim().toLowerCase();
        const list = members.filter((m) => !q || String(m.login).toLowerCase().includes(q)).slice().sort((a, b) => (b.score || 0) - (a.score || 0) || String(a.login).localeCompare(String(b.login)));
        box.innerHTML = list.length ? `<ol class="board">${list.map((m, i) => memberRow(m, i + 1)).join("")}</ol>` : members.length ? empty("No builders match", "Try a different name.", "") : empty("No builders yet", "Be the first to post a project or a guide. Your Vibe Garage account becomes your profile.", `<a class="btn sm" href="${url("submit.html")}">${ic("rocket")} Submit a project</a>`);
        reveal(box);
      };
      input?.addEventListener("input", draw);
      draw();
    },
    async account() {
      const root = $("#account-root");
      if (!root) return;
      if (!window.VGN) {
        root.innerHTML = `<div class="page-head"><span class="kicker">your garage id</span><h1>Your account</h1><p>The account tools are still loading. Try again in a moment.</p></div>`;
        return;
      }

      const me = await VGN.me().catch(() => null);
      if (!me) {
        root.innerHTML = `<div class="page-head"><div class="aurora" aria-hidden="true"><i></i><i></i><i></i><i></i></div><span class="kicker">your garage id</span><h1>Your account</h1><p>Sign in or create a free Vibe Garage account to publish projects and guides under your display name.</p></div><div id="account-auth"></div>`;
        const host = $("#account-auth");
        VGN.authPanel(host, {
          mode: qs("mode") === "signup" ? "signup" : "signin",
          onDone: (user) => {
            setAccountLink(user);
            pages.account();
          }
        });
        return;
      }

      let posts = [];
      try { posts = await VGN.listPosts({ user: me.id }); } catch (e) { posts = []; }
      const name = me.display_name || "Builder";
      const avatar = userAvatar(me);
      const rows = posts.map((post) => {
        const edit = post.kind === "guide"
          ? url("submit.html?kind=guide&edit=" + encodeURIComponent(post.id))
          : url("submit.html?edit=" + encodeURIComponent(post.id));
        const view = post.kind === "guide"
          ? url("learn.html?p=" + encodeURIComponent(post.id))
          : url("project.html?id=vg-" + encodeURIComponent(post.id));
        return `<li class="account-post" data-post-id="${esc(post.id)}"><div><a href="${view}">${esc(post.title)}</a><small class="muted">${post.kind === "guide" ? "Guide" : "Project"}</small></div><div style="display:flex;gap:8px"><a class="btn ghost sm" href="${edit}">Edit</a><button type="button" class="btn ghost sm" data-account-delete="${esc(post.id)}">Delete</button></div></li>`;
      }).join("");

      root.innerHTML = `<div class="page-head"><div class="aurora" aria-hidden="true"><i></i><i></i><i></i><i></i></div><span class="kicker">your garage id</span><h1>${esc(name)}</h1><p>Signed in as <b>${esc(name)}</b>.</p></div>
<div class="grid2">
<div class="panel"><h3>${ic("user")} Profile</h3><form id="account-profile" novalidate><div class="field"><label for="acc-name">Display name</label><div class="inp"><input id="acc-name" type="text" maxlength="40" value="${esc(name)}"></div></div><div class="field"><label for="acc-bio">Bio <small>optional</small></label><textarea id="acc-bio" maxlength="280" rows="4">${esc(me.bio || "")}</textarea></div><p class="hint err" id="account-error" role="alert" style="min-height:1.2em;margin:0 0 10px"></p><button type="submit" class="btn" id="account-save">Save changes</button></form></div>
<div class="panel"><h3>${ic("user")} Avatar</h3><div style="display:flex;gap:14px;align-items:center;margin:4px 0 16px">${av(name, "lg", avatar)}</div><div class="field"><label for="acc-avatar-file">Upload a new avatar</label><input type="file" id="acc-avatar-file" accept="image/*"><div class="hint" id="account-avatar-hint" data-def=""></div></div></div>
</div>
<div class="panel"><h3>${ic("book-open")} Your posts</h3>${posts.length ? `<ul class="account-posts">${rows}</ul>` : `<p class="muted">You have not published anything yet. <a href="${url("submit.html")}">Share a project</a>.</p>`}</div>
<p style="margin-top:20px"><button type="button" class="btn ghost" id="account-signout">Sign out</button></p>`;

      const profile = $("#account-profile");
      profile?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const errorBox = $("#account-error");
        const save = $("#account-save");
        const displayName = $("#acc-name").value.trim();
        const bio = $("#acc-bio").value.trim();
        if (displayName.length < 2 || displayName.length > 40) {
          if (errorBox) errorBox.textContent = "Display name must be 2 to 40 characters.";
          return;
        }
        if (errorBox) errorBox.textContent = "";
        if (save) save.disabled = true;
        try {
          const user = await VGN.updateMe({ display_name: displayName, bio });
          setAccountLink(user);
          toast("Profile saved");
          await pages.account();
        } catch (err) {
          if (errorBox) errorBox.textContent = err.message || "Could not save your profile.";
          toast(err.message || "Could not save your profile.", "warn");
          if (save) save.disabled = false;
        }
      });

      $("#acc-avatar-file")?.addEventListener("change", async (event) => {
        const input = event.target;
        const hint = $("#account-avatar-hint");
        const file = input.files && input.files[0];
        if (!file) return;
        input.disabled = true;
        if (hint) hint.textContent = "Uploading…";
        try {
          const blob = await VGN.resizeImage(file, 512);
          const user = await VGN.uploadAvatar(blob);
          setAccountLink(user);
          toast("Avatar updated");
          await pages.account();
        } catch (err) {
          if (hint) hint.textContent = err.message || "Could not upload that image.";
          toast(err.message || "Could not upload that image.", "warn");
          input.disabled = false;
        }
      });

      $$("[data-account-delete]", root).forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!confirm("Delete this post? This cannot be undone.")) return;
          btn.disabled = true;
          try {
            await VGN.deletePost(btn.dataset.accountDelete);
            toast("Post deleted");
            await pages.account();
          } catch (err) {
            btn.disabled = false;
            toast(err.message || "Could not delete this post.", "warn");
          }
        });
      });

      $("#account-signout")?.addEventListener("click", async (event) => {
        const btn = event.currentTarget;
        btn.disabled = true;
        try {
          await VGN.logout();
          setAccountLink(null);
          toast("Signed out");
          await pages.account();
        } catch (err) {
          btn.disabled = false;
          toast(err.message || "Could not sign out.", "warn");
        }
      });

      reveal(root);
    },
    async leaderboard() {
      const box = $("#board");
      if (!box) return;
      const data = await membersJSON();
      const w = data.weights || { projects: 10, threads: 3, replies: 1, reactions: 1 };
      const sample = data.commentSample || 50;
      const formula = data.score || `projects*${w.projects} + threads*${w.threads} + replies*${w.replies} + reactions*${w.reactions}`;
      const members = (data.members || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0) || String(a.login).localeCompare(String(b.login)));
      const note = `<div class="panel glass reveal"><h3>${ic("info")} How scoring works</h3><p>Score = projects × ${esc(w.projects)} + threads × ${esc(w.threads)} + replies × ${esc(w.replies)} + reactions received × ${esc(w.reactions)}.</p><p class="muted">A project counts as a project. Every other discussion counts as a thread. Replies are comments they wrote. The sync reads up to ${esc(sample)} comments on each discussion, so reply totals use that sample. Reactions are the ones they received on their posts and those comments.</p><p class="mono muted">${esc(formula)}</p></div>`;
      const list = members.length ? `<ol class="board">${members.map((m, i) => memberRow(m, i + 1)).join("")}</ol>` : empty("No one on the board yet", "Scores show up after someone posts a project, a thread, or a reply.", `<a class="btn sm" href="https://github.com/${esc(C.repo || "vibe-garage/vibe-garage")}/discussions" target="_blank" rel="noopener noreferrer">${ic("message-circle")} Open Discussions</a>`);
      box.innerHTML = note + list;
      reveal(box);
    },
    async submit() {
      const editId = qs("edit");
      if (nativePosts && editId) {
        if (!window.VGN) { editError("The publishing tools are still loading. Try again in a moment."); return; }
        let editPost = null;
        let me = null;
        try { editPost = await VGN.getPost(editId); } catch (err) { editPost = null; }
        if (!editPost) { editError("We could not find that post. It may have been deleted."); return; }
        try { me = await VGN.me(); } catch (err) { me = null; }
        if (!me) { editError("Sign in as the author to edit this post."); return; }
        if (me.id !== editPost.author.id) { editError("You can only edit your own posts."); return; }
        if (editPost.kind === "guide") guideForm(editPost);
        else wizard(editPost);
        return;
      }
      if (nativePosts && qs("kind") === "guide") { guideForm(); return; }
      if ($("#wizard")) wizard();
    }
  };

  const PATTERNS = [[/sk-(?:proj-|ant-)?[A-Za-z0-9_\-]{16,}/g, "OpenAI/Anthropic-style key (sk-…)"], [/xai-[A-Za-z0-9]{20,}/g, "xAI-style key (xai-…)"], [/gh[pousr]_[A-Za-z0-9]{20,}/g, "GitHub token (ghp_…)"], [/github_pat_[A-Za-z0-9_]{20,}/g, "GitHub fine-grained token"], [/AKIA[0-9A-Z]{16}/g, "AWS access key ID (AKIA…)"], [/AIza[0-9A-Za-z_\-]{30,}/g, "Google API key (AIza…)"], [/xox[abpr]-[A-Za-z0-9\-]{10,}/g, "Slack token (xox…)"], [/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "Private key block"], [/\b(?:password|passwd|pwd|secret|api[_-]?key|token)\s*[:=]\s*["']?[^\s"']{4,}/gi, "Hard-coded password/secret"]];
  function scanSecrets(fields) { const hits = []; for (const [label, v] of Object.entries(fields)) for (const [re, name] of PATTERNS) { re.lastIndex = 0; let m; while ((m = re.exec(v || ""))) { const s = m[0]; hits.push(`${label}: ${name} → ${s.slice(0, 6)}${"•".repeat(Math.min(10, Math.max(3, s.length - 6)))}`); } } return hits; }
  window.VG.scanSecrets = scanSecrets;
  function editError(message) {
    const main = $("#main");
    if (!main) return;
    main.innerHTML = `<div class="wrap narrow"><div class="alert warn show"><div><b>Can’t edit this post.</b> ${esc(message)}</div></div><p><a class="btn sm" href="${url("projects.html")}">${ic("arrow-left")} Back to projects</a></p></div>`;
  }
  function challengeNumber() { const raw = String(qs("challenge") || "").replace(/^#/, "").trim(); return /^\d+$/.test(raw) ? raw : ""; }
  function guideForm(editPost = null) {
    const form = $("#guide-form");
    if (!form) return;

    const wiz = $("#wizard");
    if (wiz) wiz.style.display = "none";
    $$(".progress, .steps").forEach((el) => { el.style.display = "none"; });
    const head = $(".page-head");
    if (head) {
      const heading = $("h1", head);
      if (heading) heading.innerHTML = `Write a <span class="grad-text">guide</span>`;
      const intro = $("p", head);
      if (intro) intro.textContent = "Teach one small thing you figured out. Markdown is welcome, and the garage learns from your notes.";
    }
    form.hidden = false;
    setSeo({
      title: "Write a guide · Vibe Garage",
      description: "Write a Vibe Garage guide and publish it under your account display name.",
      path: "submit.html?kind=guide"
    });

    const title = $("#gtitle");
    const body = $("#gbody");
    const link = $("#glink");
    const tagsInput = $("#gtags");
    const coverInput = $("#gcover");
    const coverName = $("#gcovername");
    const count = $("#gbodycount");
    const publishButton = $("#guidePublish");
    const alertBox = $("#guideAlert");
    const alertBody = $("#guideAlertBody");
    let coverFile = null;
    let busy = false;
    const editing = editPost ? editPost.id : "";

    if (editing && publishButton) publishButton.textContent = "Save changes";

    const updateCount = () => { if (count) count.textContent = `${body.value.length}/50000`; };
    body.addEventListener("input", updateCount);
    if (editPost) {
      title.value = editPost.title || "";
      body.value = editPost.body_md || "";
      link.value = editPost.link || "";
      tagsInput.value = (editPost.tags || []).join(", ");
    }
    updateCount();

    coverInput?.addEventListener("change", () => {
      const picked = (coverInput.files && coverInput.files[0]) || null;
      if (picked && !isAllowedImage(picked)) {
        coverFile = null;
        coverInput.value = "";
        if (coverName) { coverName.textContent = IMAGE_TYPE_ERROR; coverName.classList.add("err"); }
        toast(IMAGE_TYPE_ERROR, "warn");
        return;
      }
      coverFile = picked;
      if (coverName) { coverName.classList.remove("err"); coverName.textContent = coverFile ? "✔ " + coverFile.name : ""; }
    });

    const showError = (message) => {
      if (alertBody) alertBody.innerHTML = esc(message);
      if (alertBox) alertBox.classList.add("show");
      toast(message, "warn");
    };
    const showSecret = (hits) => {
      if (alertBody) alertBody.innerHTML = `<b>Hold up! This looks like a secret.</b> We found something that could be a key or password. Remove it before publishing:<ul>${hits.map((hit) => `<li>${esc(hit)}</li>`).join("")}</ul>`;
      if (alertBox) alertBox.classList.add("show");
      toast("Possible secret found. Not published", "warn");
    };

    async function publish() {
      if (busy) return;
      if (!window.VGN) { showError("The publishing tools are still loading. Try again in a moment."); return; }

      const guideTitle = title.value.trim();
      const guideBody = body.value;
      const guideLink = link.value.trim();
      const rawTags = tagsInput.value;

      if (guideTitle.length < 3 || guideTitle.length > 120) {
        showError("Give your guide a title (3 to 120 characters).");
        title.focus();
        return;
      }
      if (guideBody.trim().length < 20) {
        showError("Write at least 20 characters of guide body.");
        body.focus();
        return;
      }
      if (guideLink && !/^https:\/\/\S+$/.test(guideLink)) {
        showError("Link must start with https://.");
        link.focus();
        return;
      }

      const hits = scanSecrets({ Title: guideTitle, "Guide body": guideBody, Link: guideLink });
      if (hits.length) { showSecret(hits); return; }
      alertBox?.classList.remove("show");

      busy = true;
      if (publishButton) publishButton.disabled = true;
      try {
        let user = null;
        try {
          user = await VGN.me();
        } catch (err) {
          showError(err.message || "Could not check your account.");
          return;
        }

        if (!user) {
          const host = $("#guide-auth");
          host.innerHTML = "";
          VGN.authPanel(host, { onDone: () => { host.innerHTML = ""; publish(); } });
          host.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
          return;
        }
        $("#guide-auth")?.replaceChildren();

        if (coverFile && !isAllowedImage(coverFile)) {
          showError(IMAGE_TYPE_ERROR);
          return;
        }

        let image_key;
        if (coverFile && isAllowedImage(coverFile)) {
          const blob = await VGN.resizeImage(coverFile);
          const uploaded = await VGN.uploadImage(blob);
          image_key = uploaded.key;
        }

        const tags = rawTags.split(",").map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean).slice(0, 12);
        const payload = {
          kind: "guide",
          title: guideTitle,
          body_md: guideBody,
          link: guideLink,
          prompts: [],
          tools: [],
          tags,
          image_key,
        };
        const post = editing ? await VGN.updatePost(editing, payload) : await VGN.createPost(payload);

        toast(editing ? "Saved!" : "Published!");
        setTimeout(() => { location.href = url("learn.html?p=" + encodeURIComponent(post.id)); }, 900);
      } catch (err) {
        showError(err.message || "Could not publish. Try again.");
      } finally {
        busy = false;
        if (publishButton) publishButton.disabled = false;
      }
    }

    form.addEventListener("submit", (event) => { event.preventDefault(); publish(); });
  }
  function wizard(editPost = null) {
    const wiz = $("#wizard");
    if (!wiz) return;
    let step = 1;
    const max = 3;
    const next = $("#next");
    const back = $("#back");
    const challengeNum = challengeNumber();
    if (challengeNum) {
      const note = document.createElement("div");
      note.className = "alert ok show";
      note.innerHTML = `<div><b>Entering challenge #${esc(challengeNum)}.</b> Your published project will include a <span class="mono">Challenge: #${esc(challengeNum)}</span> line and a challenge tag.</div>`;
      wiz.prepend(note);
      setSeo({ title: "Enter challenge #" + challengeNum + " · Vibe Garage", description: "Submit a Vibe Garage project for challenge #" + challengeNum + ".", path: "submit.html?challenge=" + challengeNum });
    }
    $("#tools-opts").innerHTML = (D.tools || []).map((t) => `<label><input type="checkbox" name="tools" value="${esc(t.name)}"><span><i style="width:8px;height:8px;border-radius:50%;background:${t.color};display:inline-block"></i>${esc(t.name)}</span></label>`).join("");
    $("#tags-opts").innerHTML = ["web app", "game", "bot", "ai", "music", "creative", "productivity", "learning", "fun", "mobile", "api", "hardware"].map((t) => `<label><input type="checkbox" name="tags" value="${t}"><span>#${t}</span></label>`).join("");
    const pitch = $("#ppitch");
    pitch.addEventListener("input", () => { $("#pitchcount").textContent = `${pitch.value.length}/120`; });
    if (editPost) {
      $("#pname").value = editPost.title || "";
      pitch.value = editPost.pitch || "";
      $("#pitchcount").textContent = `${pitch.value.length}/120`;
      $("#plink").value = editPost.link || "";
      $("#prepo").value = editPost.repo || "";
      $("#pcode").value = editPost.code || "";
      $("#pprompts").value = (editPost.prompts || []).join("\n");
      $$("input[name=tools]").forEach((input) => { input.checked = (editPost.tools || []).includes(input.value); });
      $$("input[name=tags]").forEach((input) => { input.checked = (editPost.tags || []).includes(input.value); });
    }
    const drop = $("#drop");
    const file = $("#pfile");
    drop.addEventListener("click", () => file.click());
    drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } });
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    let selectedFile = null;
    const preview = (f) => {
      if (!f) return;
      const old = $("img", drop); if (old) old.remove();
      if (!isAllowedImage(f)) {
        selectedFile = null;
        file.value = "";
        $("#pfilename").textContent = IMAGE_TYPE_ERROR;
        $("#pfilename").classList.add("err");
        toast(IMAGE_TYPE_ERROR, "warn");
        return;
      }
      selectedFile = f;
      $("#pfilename").classList.remove("err");
      $("#pfilename").textContent = "✔ " + f.name + " (will be uploaded when you publish)";
      const im = new Image(); im.src = URL.createObjectURL(f); im.alt = "preview"; drop.appendChild(im);
    };
    drop.addEventListener("drop", (e) => preview(e.dataTransfer.files[0]));
    file.addEventListener("change", () => preview(file.files[0]));
    const val = () => ({ name: $("#pname").value.trim(), pitch: pitch.value.trim(), link: $("#plink").value.trim(), repo: $("#prepo").value.trim(), code: $("#pcode").value, prompts: $("#pprompts").value, tools: $$("input[name=tools]:checked").map((i) => i.value), tags: $$("input[name=tags]:checked").map((i) => i.value) });
    function show() {
      $$(".wstep").forEach((s) => s.classList.toggle("on", +s.dataset.step === step));
      $$(".step-pill").forEach((p) => { const n = +p.dataset.pill; p.classList.toggle("on", n === step); p.classList.toggle("done", n < step); });
      $(".progress i").style.width = (step / max * 100) + "%";
      back.style.visibility = step > 1 ? "visible" : "hidden";
      next.innerHTML = step < max ? `Next ${ic("arrow-right")}` : editPost ? `${ic("rocket")} Save changes` : `${ic("rocket")} Publish`;
      $("#secretAlert").classList.remove("show");
      $("#okAlert").classList.remove("show");
      if (step === 3) {
        const v = val();
        $("#review").innerHTML = `<dt>name</dt><dd>${esc(v.name)}</dd>${challengeNum ? `<dt>challenge</dt><dd>Challenge: #${esc(challengeNum)}</dd>` : ""}<dt>pitch</dt><dd>${esc(v.pitch) || "<span class=\"muted\">none</span>"}</dd><dt>link</dt><dd>${esc(v.link) || "<span class=\"muted\">none</span>"}</dd><dt>code</dt><dd>${v.repo ? esc(v.repo) : v.code ? `${v.code.split("\n").length} lines pasted` : "<span class=\"muted\">none</span>"}</dd>`;
      }
    }
    const fieldErr = (id, msg) => { const w = $("#" + id).closest(".inp"); w.classList.toggle("err", !!msg); const h = w.parentElement.querySelector(".hint"); if (h) { h.textContent = msg || h.dataset.def || ""; h.classList.toggle("err", !!msg); } };
    next.addEventListener("click", () => {
      const v = val();
      if (step === 1) { fieldErr("pname", v.name ? "" : "Give your project a name ✨"); const bad = v.link && !/^https?:\/\/\S+\.\S+/.test(v.link); fieldErr("plink", bad ? "That doesn’t look like a link (start with https://)" : ""); if (!v.name || bad) { toast("A couple of things need a look", "warn"); return; } }
      if (step === 2) { const bad = v.repo && !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+/.test(v.repo); fieldErr("prepo", bad ? "Use a full GitHub URL like https://github.com/you/project" : ""); if (bad) return; }
      if (step < max) { step++; show(); wiz.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); return; }
      const hits = scanSecrets({ "Project name": v.name, Pitch: v.pitch, "Live link": v.link, "Repo URL": v.repo, Code: v.code, Prompts: v.prompts });
      if (hits.length) { $("#secretList").innerHTML = hits.map((h) => `<li>${esc(h)}</li>`).join(""); $("#secretAlert").classList.add("show"); $("#okAlert").classList.remove("show"); toast("Possible secret found. Not published", "warn"); return; }
      $("#secretAlert").classList.remove("show");
      if (window.VG.onPublish) window.VG.onPublish(v);
      else { $("#okAlert").classList.add("show"); toast("Looks clean!"); }
    });
    back.addEventListener("click", () => { if (step > 1) { step--; show(); } });
    show();

    async function nativePublish(v) {
      const alertBox = $("#okAlert");
      const setAlert = (html, status = "ok") => {
        alertBox.classList.toggle("ok", status === "ok");
        alertBox.classList.toggle("warn", status !== "ok");
        $("#okAlert div").innerHTML = html;
        alertBox.classList.add("show");
      };

      if (!window.VGN) {
        toast("The publishing tools are still loading. Try again in a moment.", "warn");
        return;
      }
      if (nativePublish.busy) return;
      nativePublish.busy = true;

      try {
        let user = null;
        try {
          user = await VGN.me();
        } catch (err) {
          setAlert(`<b>${esc(err.message || "Could not check your account.")}</b>`, "warn");
          return;
        }

        if (!user) {
          setAlert("<b>Looks clean!</b> Sign in or create an account to publish.");
          let host = $("#native-auth");
          if (!host) {
            host = document.createElement("div");
            host.id = "native-auth";
            wiz.appendChild(host);
          }
          host.innerHTML = "";
          VGN.authPanel(host, { onDone: () => { host.remove(); nativePublish(v); } });
          host.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
          return;
        }
        $("#native-auth")?.remove();
        setAlert(editPost ? "<b>Looks clean! Saving…</b>" : "<b>Looks clean! Publishing…</b>");

        if (selectedFile && !isAllowedImage(selectedFile)) {
          setAlert(`<b>${esc(IMAGE_TYPE_ERROR)}</b>`, "warn");
          return;
        }

        let image_key;
        if (selectedFile && isAllowedImage(selectedFile)) {
          const blob = await VGN.resizeImage(selectedFile);
          const uploaded = await VGN.uploadImage(blob);
          image_key = uploaded.key;
        }

        const tags = v.tags.slice();
        if (challengeNum && !tags.includes("challenge")) tags.push("challenge");
        const prompts = v.prompts.split(/\n+/).map((line) => line.trim()).filter(Boolean);
        const bodyMd = challengeNum ? "Challenge: #" + challengeNum : (editPost ? editPost.body_md || "" : "");

        const payload = {
          kind: "project",
          title: v.name,
          body_md: bodyMd,
          pitch: v.pitch,
          link: v.link,
          repo: v.repo,
          code: v.code,
          prompts,
          tools: v.tools,
          tags,
          image_key,
        };
        const post = editPost ? await VGN.updatePost(editPost.id, payload) : await VGN.createPost(payload);

        const target = url("project.html?id=vg-" + encodeURIComponent(post.id));
        setAlert(editPost
          ? `<b>Looks clean!</b> Saved! Your changes are live.<p style="margin:12px 0 0"><a class="btn sm" href="${esc(target)}">${ic("external-link")} View your project</a></p>`
          : `<b>Looks clean!</b> Published! Your project is live.<p style="margin:12px 0 0"><a class="btn sm" href="${esc(target)}">${ic("external-link")} View your project</a></p>`);
        toast(editPost ? "Saved!" : "Published!");
        setTimeout(() => { location.href = target; }, 1200);
      } catch (err) {
        setAlert(`<b>${esc(err.message || "Could not publish. Try again.")}</b>`, "warn");
        toast(err.message || "Could not publish. Try again.", "warn");
      } finally {
        nativePublish.busy = false;
      }
    }

    window.VG.onPublish = async (v) => {
      if (nativePosts) {
        await nativePublish(v);
        return;
      }
      let code = v.code.trim();
      const limit = 3500;
      let cut = false;
      if (code.length > limit) { code = code.slice(0, limit); cut = true; }
      const tags = v.tags.slice();
      if (challengeNum && !tags.includes("challenge")) tags.push("challenge");
      const lines = [C.projectMarker || "<!-- vibe-garage:project -->", ""];
      if (challengeNum) lines.push("Challenge: #" + challengeNum, "");
      lines.push("### Pitch", v.pitch || "_No response_", "", "### Live link", v.link || "_No response_", "", "### Repo", v.repo || "_No response_", "", "### Tools", v.tools.join(", ") || "_No response_", "", "### Tags", tags.join(", ") || "_No response_", "", "### Code", code ? "```\n" + code + "\n```" + (cut ? "\n_(trimmed, paste the rest below)_" : "") : "_No response_", "", "### Prompts", v.prompts.trim() ? v.prompts.trim().split(/\n+/).map((x) => "- " + x).join("\n") : "_No response_", "", "---", "_Posted from the Vibe Garage submit form. Add a screenshot by dragging it into this box!_");
      const body = lines.join("\n");
      const discuss = api.newDiscussionUrl(await api.categorySlug("projects"), "[Project] " + v.name, body);
      $("#okAlert div").innerHTML = `<b>Looks clean! One last step on GitHub.</b> No secrets spotted. We opened a draft discussion in a new tab. Log in there, add your screenshot, and hit <b>Start discussion</b>. Your project shows up in the gallery shortly after.<p style="margin:12px 0 0"><a class="btn sm" href="${esc(discuss)}" target="_blank" rel="noopener noreferrer">${ic("external-link")} Open the GitHub post</a></p>`;
      $("#okAlert").classList.add("show");
      window.VG.lastSubmitUrl = discuss;
      const w = window.open(discuss, "_blank");
      if (w) w.opener = null;
      toast(!w ? "Pop-up blocked. Use the button below" : "Opened GitHub to finish posting", w === null ? "warn" : "ok");
    };
  }

  document.addEventListener("DOMContentLoaded", () => {
    ensureChrome();
    globals();
    loadAccountLink();
    try {
      const pendingToast = sessionStorage.getItem("vg-toast");
      if (pendingToast) {
        sessionStorage.removeItem("vg-toast");
        toast(pendingToast);
      }
    } catch (e) { /* storage can be blocked */ }
    const fn = pages[document.body.dataset.page];
    Promise.resolve(fn ? fn() : reveal()).catch(() => {
      const main = $("#main");
      if (!main || main.dataset.vgErr) return;
      main.dataset.vgErr = "1";
      const wrap = document.createElement("div");
      wrap.className = "wrap";
      wrap.innerHTML = empty("Something glitched", "Reload the page. If it keeps happening, the latest snapshot may be missing.", `<a class="btn sm" href="${url("index.html")}">Back home</a>`);
      main.appendChild(wrap);
    });
  });
})();
