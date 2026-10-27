# Vibe Garage

A community hub for people who build with AI: a project showcase, a forum, challenges, guides, and builder profiles. Projects and guides can be published with a native Vibe Garage account; forum threads, replies, reactions, and challenges still use GitHub Discussions.

**Live site:** https://vibegarage.neozonesproductions.com/

## How it works

- **Forum and project submissions run on [GitHub Discussions](https://github.com/vibe-garage/vibe-garage/discussions).** The submit form checks a post for API keys and passwords in the browser, then opens a pre-filled discussion for you to publish.
- **Replies and reactions on a project or thread** are embedded with [giscus](https://giscus.app) (`repoId` `R_kgDOVRg6Zw`). giscus reads and writes the same GitHub Discussion.
- **Listings are a snapshot.** `scripts/sync-discussions.mjs` reads Discussions with `gh api graphql` (or with `GITHUB_TOKEN` set) and writes the JSON, Atom feed, sitemap, and `robots.txt` below. Until something is posted, the site shows an empty state instead of placeholder content.
- **Backend config** lives in `assets/config.js` (repo, category names, giscus theme, site URL, analytics). The sync script loads that same file.
- **Site guides** are listed once in `assets/config.js` under `siteGuides` (`href`, `title`, `summary`, `tags`, `keywords`, `published`). Each entry shows as a card with a "Guide" tag in Fresh Drops on the homepage, and also appears at the top of `learn.html` and in site search. The homepage Guides section lists only guides that didn't fit in Fresh Drops, and it hides itself when there are none (the Fresh Drops header links to All guides). To add a guide page, add one entry, then run `node scripts/cache-bust.mjs`. The hand-written cards in `index.html` and `learn.html` are the no-JS fallback; the script replaces them from `siteGuides`.

The site is plain HTML, CSS, and vanilla JS served by the Cloudflare Worker. There is no build step and no npm install.

## Native accounts and posts (v1)

Vibe Garage has its own email/password accounts for projects and guides. The Cloudflare Worker in `worker/` serves the API and the static files; D1 stores the data and KV stores uploaded images.

- **D1 tables.** `users` (email, password hash, display name, avatar key, bio), `sessions` (hashed session tokens), `posts` (kind `project` or `guide`, Markdown body, pitch, links, code, prompts, tools, tags, feedback level, image key, timestamps, soft-delete), and `rate_limits`.
- **Routes.** `GET /api/config`, `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET/PATCH /api/me`, `PUT /api/me/avatar`, `GET/POST /api/posts`, `GET/PATCH/DELETE /api/posts/:id`, `GET /api/users/:id`, `PUT /api/images`. Images are served from `/img/:key`.
- **Pages.** Account settings live at `account.html`, native profiles at `profile.html?n=<userId>`, native projects at `project.html?id=vg-<postId>`, and native guides at `learn.html?p=<postId>`. The submit wizard edits projects with `submit.html?edit=<postId>` and guides with `submit.html?kind=guide&edit=<postId>`.
- **Local development.**
  ```sh
  npm install
  npx wrangler d1 migrations apply vibe_garage --local
  npx wrangler dev --local
  ```
  Use Node 22 for Wrangler. The local D1 database lives under `.wrangler/state`.
- **Still on GitHub.** Forum threads, replies, reactions, challenges, and their giscus embeds continue to use GitHub Discussions. Native projects show no giscus panel in v1.

## Pages

| Page | Role |
| --- | --- |
| `index.html` | Home |
| `projects.html`, `project.html?id=gh-N` | Showcase and one project (giscus on the project page) |
| `forum.html`, `thread.html?id=gh-N` | Channels and one thread (giscus on the thread page) |
| `challenges.html` | Challenges, fed by `data/challenges.json` |
| `learn.html`, `learn.html?g=N` | Guide list and one guide, fed by `data/guides.json` |
| `profile.html`, `profile.html?u=<login>` | Builders directory and one member, fed by `data/members.json` |
| `leaderboard.html` | Ranked builders from `data/members.json` (`projects*10 + threads*3 + replies*1 + reactions`) |
| `submit.html` | Three-step project form with the leaked-secret check. `?challenge=N` pre-fills `Challenge: #N` and a `challenge` tag |
| `guidelines.html` | Community guidelines, reporting, moderation |
| `404.html` | Missing-page screen. Asset and in-site links use root-absolute `/` paths (custom domain) so the Worker can serve it at any depth |

## On the site

- **Search.** The header button, or `/` when you are not typing in a field, searches projects, threads, guides, challenges, and builders. Esc closes it. Arrow keys and Enter move through the results. On the home page, `?q=` opens that search.
- **Sort and filter.** Projects keep `sort` (`newest`, `reacted`, `discussed`), `tool`, `tag`, and `q` in the URL. The forum keeps the channel in `c` and `sort` (`newest`, `active`, `top`).
- **Reactions and share.** Project and thread pages show all eight GitHub reaction counts and a link to react on the discussion. Share copies the link or opens X, Bluesky, or Reddit, and uses `navigator.share` when the browser has it.
- **Profiles.** Every `@handle` links to `profile.html?u=<login>`.
- **Challenges and guides.** Challenge cards show deadline, status, poll bars, and a GitHub thumbs-up vote link. "Enter this challenge" opens `submit.html?challenge=N`. "Propose a challenge" and "Write a guide" open a GitHub Discussion titled `[Challenge] ` or `[Guide] `.
- **Stay in the loop.** Home and the footer link the Atom feed, the GitHub watch page, and Discussions. Every page has `<link rel="alternate" type="application/atom+xml">`.
- **Theme.** The header toggle stores `light` or `dark` in `localStorage` (`vg-theme`). A script in `<head>` applies it before CSS paints. giscus follows the same theme.
- **Analytics.** Cloudflare Web Analytics (free, cookieless) is on via `analytics.cfBeacon` in `assets/config.js`; set it to `""` to turn it off. Stats: Cloudflare dashboard > Analytics & Logs > Web Analytics > vibegarage.neozonesproductions.com. GoatCounter stays off while `analytics.goatcounter` is empty. A site code loads `https://gc.zgo.at/count.js` with `data-goatcounter`. See below.
- **First-party metrics.** The Worker adds a ~270-byte inline beacon to the HTML pages it serves (`worker/metrics.js`). It POSTs to `/api/hit`, which stores one row per view in the D1 `pageviews` table: time, path, post id (`?p=`), external referrer host, `utm_source`/`utm_medium`/`utm_campaign`, country, mobile/desktop, and a visitor hash (SHA-256 of a random per-UTC-day salt + IP + User-Agent; old salts are deleted). No raw IPs, emails or cookies are stored. Bot UAs, `navigator.webdriver` clients and unknown paths are skipped; views with a session cookie are flagged `signed_in` and left out by default. Owner-only views: `/stats.html` and `/api/stats?days=30` (owners are the user ids in `STATS_OWNER_IDS`; everyone else gets a 404). Rows older than 400 days are pruned. Migration: `migrations/0003_metrics.sql`.

## Posting conventions

The sync classifies a discussion from its title, category, and body.

- **Project.** Body contains `<!-- vibe-garage:project -->`, or the discussion is in a category literally named `Projects`. The submit form writes the marker and `### Pitch`, `### Tools`, `### Tags`, `### Feedback wanted`, `### Live link`, `### Repo`, `### Code`, and `### Prompts` sections. A title may start with `[project]`; the showcase drops that prefix.
- **Guide.** Title starts with `[Guide]`. Synced to `data/guides.json` (and still listed as a forum thread unless it is also a project).
- **Challenge.** Title starts with `[Challenge]`, or the discussion is in the **Polls** category. Synced to `data/challenges.json`.
- **Deadline.** A line `Deadline: YYYY-MM-DD` in the body sets `deadline`. Any other date shape is ignored.
- **Poll.** A GitHub Discussion poll is stored as `poll.question` and `poll.options[].option` / `totalVoteCount`. Thumbs-up reactions are stored separately as `thumbsUp` for challenges that are voted that way.
- **Status.** `open` or `closed`, from the discussion's closed flag.
- **Everything else** is a forum thread. Category names map to site channels in `assets/config.js`.

Feedback lines (`Feedback level:` / `Feedback wanted:`) map to `vibes`, `gentle`, or `tear`.

## Data files

All JSON files include `generated` (ISO time of the sync) and `real: true` on each record. An empty Discussions repo still produces valid files with empty arrays.

| File | Contents |
| --- | --- |
| `data/discussions.json` | Categories, channel map, and forum threads. Each thread has the full reaction breakdown. |
| `data/projects.json` | Showcase projects parsed from the `###` sections, plus the same reaction breakdown. `likes` is reaction total plus GitHub upvotes. |
| `data/members.json` | One row per discussion or comment author: `login`, `avatar`, `url`, `projects`, `threads`, `replies`, `reactions` (reactions received), `score`, `firstSeen`, `lastSeen`. |
| `data/challenges.json` | Challenge cards: title, author, body HTML, excerpt, labels, deadline, status, thumbs-up count, poll options and vote counts, reactions, dates, discussion URL. |
| `data/guides.json` | Guides: title (prefix removed), author, `bodyHTML`, excerpt, tags/labels, reactions, URL, dates. |
| `feed.xml` | Atom feed. Links are absolute URLs from `siteUrl` (`project.html?id=` or `thread.html?id=`). |
| `sitemap.xml` | Every root `*.html` page except `404.html`, plus each `project.html?id=` and `thread.html?id=` URL. Home is the site root. |
| `robots.txt` | `Allow: /` for all user agents, plus a `Sitemap:` line. |

### Reaction breakdown

Every project, thread, guide, and challenge stores all eight GitHub reaction types: `thumbsUp`, `thumbsDown`, `laugh`, `hooray`, `confused`, `heart`, `rocket`, `eyes`, plus `total`. `thumbs` is the same number as `thumbsUp`, kept so older readers still work.

### Leaderboard score

```
score = projects*10 + threads*3 + replies*1 + reactions
```

`reactions` is the total reactions received on that person's discussions and on their comments. A project counts as a project. Any other discussion (thread, guide, challenge, announcement) counts as a thread. Replies are comments they wrote.

`commentSample` in `members.json` is 50. The sync reads `comments(first: 50)`, so reply totals and comment-author rows cover the first 50 comments on each discussion. The `replies` field on a thread still uses GitHub's full comment count.

`firstSeen` / `lastSeen` are the earliest and latest `createdAt` among that person's discussions and sampled comments.

## Feed, sitemap, robots

- **Feed:** `https://vibegarage.neozonesproductions.com/feed.xml`
- **Sitemap:** `https://vibegarage.neozonesproductions.com/sitemap.xml`
- **Watch the repo:** https://github.com/vibe-garage/vibe-garage/subscription
- **Discussions:** https://github.com/vibe-garage/vibe-garage/discussions

The feed's `<updated>` time is the newest entry. With no discussions it stays `1970-01-01T00:00:00Z`, so an empty feed does not change on every run. Sitemap `<lastmod>` is set only on project and thread URLs, from that discussion's `updatedAt`.

## Cache-busting

Every page loads the shared CSS and JS with a `?v=` version, for example `assets/style.css?v=0568fbb44c`. The version is the first 10 hex characters of the file's SHA-256. After you edit anything in `assets/` (`style.css`, `config.js`, `data.js`, `icons.js`, `art.js`, `app.js`, `guide.js`), run:

```bash
node scripts/cache-bust.mjs
```

It rewrites the `?v=` values in every `*.html` file in the repo root, and only for files whose content changed. Running it again changes nothing. Existing `?v=` values are matched in upper- or lowercase hex. New values are always lowercase.

The giscus theme stylesheets (`giscus-theme.css` and `giscus-theme-light.css`) are loaded by URL from JS rather than from HTML. The script stamps those URL strings in `assets/app.js` (`siteBase() + "assets/giscus-theme-light.css?v=..."`) and `assets/config.js` (`giscus.theme`) first. It then hashes the pages' assets, so the `app.js` and `config.js` versions in the HTML are current. The URLs stay absolute, because the giscus iframe on giscus.app fetches the theme from this site.

## Refreshing the snapshot

The site is served by the Cloudflare Worker; a push to `main` runs the sync-and-deploy workflow. No build step is needed. To refresh the snapshot by hand, use a checkout with the [`gh`](https://cli.github.com/) CLI logged in (`gh auth login`) or with `GITHUB_TOKEN` set:

```bash
./scripts/refresh.sh
```

`scripts/refresh.sh` (`set -euo pipefail`):

1. `cd` to the repo root.
2. `git pull --rebase`.
3. `node scripts/sync-discussions.mjs`.
4. If `data/`, `feed.xml`, `sitemap.xml`, or `robots.txt` changed beyond the JSON `"generated"` timestamp, `git add` those paths, commit `Sync discussions snapshot`, and `push`.

A run that only refreshes `"generated"` does not create a commit. The script does not deploy anything itself; the workflow deploys the Worker after the push.

To regenerate the files without committing:

```bash
node scripts/sync-discussions.mjs
```

The script calls `gh` with `FORCE_COLOR=0`, `NO_COLOR=1`, `CLICOLOR=0`, and `GH_FORCE_TTY=0`, then strips ANSI color codes before `JSON.parse`. That matters when the parent environment sets `FORCE_COLOR`, because `gh` will otherwise color its JSON and the parse will fail.

Auth order: `GITHUB_TOKEN` uses the GitHub GraphQL API directly. With no token, the script shells out to `gh`.

The sync keeps up to 300 discussions (6 pages of 50), newest update first.

## Analytics (optional, off by default)

[GoatCounter](https://www.goatcounter.com/) is a free, lightweight counter. It stays **off** until you set a site code.

In `assets/config.js`:

```js
analytics: { goatcounter: "" }
```

An empty string means analytics are disabled and no analytics script is loaded.

To enable:

1. Create a free site at https://www.goatcounter.com/.
2. Set `goatcounter` to the site code only, the subdomain of `https://CODE.goatcounter.com`. For `https://vibe-garage.goatcounter.com`, the flag is `"vibe-garage"`.
3. A non-empty code turns the counter on. The site then loads `https://gc.zgo.at/count.js` with `data-goatcounter="https://CODE.goatcounter.com/count"`. Leave the string empty and that script stays unloaded. The code must be 1–64 letters, numbers, or hyphens.

Set it back to `""` to turn analytics off again.

## Tech

Plain HTML, CSS, and vanilla JS. Icons: [Lucide](https://lucide.dev) (ISC), inlined. Fonts: Space Grotesk, IBM Plex Sans and JetBrains Mono from Google Fonts (all SIL OFL 1.1). The hero network art (`assets/hero-net.webp`, `assets/hero-net-mobile.webp`) is original procedural artwork made for the site, with no AI imagery, people, logos or text. Project cover art is generated in the browser. `assets/og.png`, `assets/icon-192.png`, and `assets/icon-512.png` are the share image and icons.
