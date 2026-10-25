/* Vibe Garage backend config: GitHub Discussions + giscus. Shared by the front end and scripts/sync-discussions.mjs. */
window.VG_CONFIG = {
  nativePosts: true,
  turnstileSiteKey: "1x00000000000000000000AA",
  repo: "vibe-garage/vibe-garage",
  repoId: "R_kgDOVRg6Zw",
  siteUrl: "https://vibegarage.neozonesproductions.com/",
  // Site channel -> GitHub Discussion category names, in order of preference.
  // The first name is the dedicated category; later names are GitHub's default categories used until the dedicated one exists.
  channels: {
    "show-and-tell":    ["Show & Tell", "Show and tell"],
    "help-me-unstick":  ["Help Me Unstick", "Q&A"],
    "prompt-craft":     ["Prompt Craft", "Ideas"],
    "tools-and-models": ["Tools & Models"],
    "newbie-corner":    ["Newbie Corner"],
    "off-topic-lounge": ["Off-Topic Lounge", "General"]
  },
  projectsCategory: ["Projects", "Show and tell"],
  announcementsCategory: ["Announcements"],
  // Fallback slugs (GitHub's defaults). Real slugs come from data/discussions.json once the sync runs.
  fallbackSlugs: { "Show and tell": "show-and-tell", "Q&A": "q-a", "Ideas": "ideas", "General": "general", "Announcements": "announcements", "Tools & Models": "tools-models", "Newbie Corner": "newbie-corner" },
  // Discussion category IDs (from giscus.app/api/discussions/categories). giscus maps by discussion number, so these are reference/fallback only.
  categoryIds: { "Announcements": "DIC_kwDOVRg6Z84DJNda", "General": "DIC_kwDOVRg6Z84DJNdb", "Ideas": "DIC_kwDOVRg6Z84DJNdd", "Newbie Corner": "DIC_kwDOVRg6Z84DJOmr", "Polls": "DIC_kwDOVRg6Z84DJNdf", "Q&A": "DIC_kwDOVRg6Z84DJNdc", "Show and tell": "DIC_kwDOVRg6Z84DJNde", "Tools & Models": "DIC_kwDOVRg6Z84DJOmq" },
  projectMarker: "<!-- vibe-garage:project -->",
  // Hand-written guide pages in this repo. Each one shows as a "Guide" card in Fresh Drops on the homepage,
  // in the homepage Guides section, at the top of learn.html, and in site search. Add one entry per guide page.
  // href: page path; title and summary: card text; tags: shown as #tags; keywords: extra search terms; published: YYYY-MM-DD.
  siteGuides: [
    {
      href: "local-llm-guide.html",
      title: "Run a Local LLM on Your AMD GPU That Actually Does Your Job",
      summary: "Check what your Radeon or Ryzen AI hardware supports, pick ROCm or Vulkan, fit a model to your memory, then test it on your own tasks.",
      tags: ["local-llm", "amd", "rocm"],
      keywords: "guide guides local llm local-llm amd radeon ryzen rocm vulkan ollama lm studio llama.cpp quant vram",
      published: "2026-10-23"
    }
  ],
  giscus: { enabled: true, theme: "https://vibegarage.neozonesproductions.com/assets/giscus-theme.css?v=4214d84c9a" },
  // GoatCounter site code: the subdomain of https://<code>.goatcounter.com.
  // An empty string keeps analytics off, and no analytics script is loaded.
  // cfBeacon: Cloudflare Web Analytics token (free, cookieless, no personal data). Empty string turns it off.
  analytics: { goatcounter: "", cfBeacon: "f6b0c50f9cf5430c9792ce3c762bd50e" }
};
