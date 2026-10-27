// Owner-only metrics dashboard. Served by the Worker at /stats.html after an owner check,
// so it is not a public static asset. All data comes from GET /api/stats.
export const STATS_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Stats · Vibe Garage</title>
<style>
body{font:15px/1.45 system-ui,sans-serif;background:#0a0f17;color:#dbe4ef;margin:0;padding:24px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:0 0 8px;color:#8fd3ff}
.muted{color:#8a97a8;font-size:13px}.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));margin-top:16px}
.card{background:#111a26;border:1px solid #1f2d3f;border-radius:10px;padding:14px}
.big{font-size:26px;font-weight:600}table{width:100%;border-collapse:collapse;font-size:13px}
td{padding:3px 0;border-bottom:1px solid #1a2636}td.n{text-align:right;width:56px}
a{color:#8fd3ff}select,label{font:inherit;color:inherit}select{background:#111a26;border:1px solid #1f2d3f;border-radius:6px;padding:2px 6px}
</style></head><body>
<h1>Vibe Garage stats</h1>
<div class="muted">First-party, cookieless. Bots and our own signed-in visits are left out unless you include them.
Uniques are distinct visitors per UTC day.</div>
<p><label>Window <select id="days"><option>7</option><option selected>30</option><option>90</option></select> days</label>
&nbsp; <label><input type="checkbox" id="own"> include signed-in views</label></p>
<div id="out" class="muted">Loading…</div>
<script>
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const tbl = (title, rows, label) => '<div class="card"><h2>' + title + '</h2><table><tr class="muted"><td></td><td class="n">views</td><td class="n">uniq</td></tr>' +
  (rows.length ? rows.map((r) => '<tr><td>' + label(r) + '</td><td class="n">' + r.views + '</td><td class="n">' + r.uniques + '</td></tr>').join("") : '<tr><td class="muted">None yet</td></tr>') + '</table></div>';
const k = (r) => esc(r.k);
async function load() {
  const days = document.getElementById("days").value, own = document.getElementById("own").checked ? 1 : 0;
  const res = await fetch("/api/stats?days=" + days + "&include_signed_in=" + own, { credentials: "same-origin" });
  const out = document.getElementById("out");
  if (!res.ok) { out.textContent = "Not available. Sign in with the owner account."; return; }
  const d = await res.json(), t = d.totals;
  const box = (name, v) => '<div class="card"><h2>' + name + '</h2><div class="big">' + v.views + '</div><div class="muted">views · ' + v.uniques + ' uniques</div></div>';
  out.className = "";
  out.innerHTML = '<div class="grid">' + box("Today (UTC)", t.today) + box("Last 7 days", t.last_7d) + box("Last 30 days", t.last_30d) + '</div><div class="grid">' +
    tbl("Top posts", d.top_posts, (r) => '<a href="/learn.html?p=' + encodeURIComponent(r.id) + '">' + esc(r.title || r.id) + '</a>') +
    tbl("Pages", d.top_pages, k) + tbl("Referrers", d.referrers, k) + tbl("UTM source", d.utm_sources, k) +
    tbl("UTM medium", d.utm_mediums, k) + tbl("UTM campaign", d.utm_campaigns, k) + tbl("Countries", d.countries, k) +
    tbl("Devices", d.devices, k) + tbl("By day", d.daily.slice().reverse(), (r) => esc(r.day)) + '</div>' +
    '<p class="muted">Signed-in views left out: ' + d.signed_in_views_excluded + '. Generated ' + new Date(d.generated_at * 1000).toLocaleString() + '.</p>';
}
document.getElementById("days").onchange = load; document.getElementById("own").onchange = load; load();
</script></body></html>`;
