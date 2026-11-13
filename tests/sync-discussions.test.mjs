import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSnapshot, publicPerson, SITE_PUBLIC_AUTHOR } from "../scripts/sync-discussions.mjs";

const config = {
  siteUrl: "https://vibegarage.neozonesproductions.com/",
  channels: { announcements: ["Announcements"] },
  announcementsCategory: ["Announcements"],
  projectsCategory: ["Show and tell"],
  projectMarker: "<!-- vibe-garage:project -->",
};

const categories = [{ name: "Announcements", slug: "announcements", emoji: ":mega:" }];

function author(login) {
  return {
    login,
    avatarUrl: `https://avatars.githubusercontent.com/${login}`,
    url: `https://github.com/${login}`,
  };
}

describe("publicPerson", () => {
  it("maps the personal login to the site identity and drops the GitHub profile URL", () => {
    assert.deepEqual(publicPerson(author("firestarterxox")), { ...SITE_PUBLIC_AUTHOR });
    assert.deepEqual(publicPerson(author("FireStarterXOX")), { ...SITE_PUBLIC_AUTHOR });
  });

  it("leaves other GitHub authors unchanged", () => {
    const other = author("some-builder");
    assert.deepEqual(publicPerson(other), {
      login: "some-builder",
      avatar: other.avatarUrl,
      url: other.url,
    });
  });

  it("returns null when there is no login", () => {
    assert.equal(publicPerson(null), null);
    assert.equal(publicPerson({ login: "" }), null);
  });
});

describe("buildSnapshot", () => {
  it("writes the site identity into threads, members, and keeps other authors", () => {
    const snap = buildSnapshot({
      discussions: [
        {
          number: 1,
          title: "Welcome",
          url: "https://github.com/vibe-garage/vibe-garage/discussions/1",
          body: "hello",
          bodyHTML: "<p>hello</p>",
          bodyText: "hello",
          createdAt: "2026-10-21T00:17:55Z",
          updatedAt: "2026-10-21T00:17:55Z",
          author: author("firestarterxox"),
          category: { name: "Announcements", slug: "announcements" },
          comments: {
            totalCount: 1,
            nodes: [{ author: author("some-builder"), createdAt: "2026-10-21T01:00:00Z", reactions: { totalCount: 0 } }],
          },
          reactions: { totalCount: 0 },
        },
      ],
      categories,
      pinned: [1],
      owner: "vibe-garage",
      name: "vibe-garage",
      config,
      htmlFiles: ["index.html"],
      now: "2026-11-13T00:00:00.000Z",
    });

    const thread = snap.discussions.threads[0];
    assert.equal(thread.by, "Vibe Garage team");
    assert.equal(thread.avatar, "/assets/icon-192.png");

    const logins = snap.members.members.map((m) => m.login).sort();
    assert.deepEqual(logins, ["Vibe Garage team", "some-builder"]);
    const site = snap.members.members.find((m) => m.login === "Vibe Garage team");
    assert.equal(site.url, "");
    assert.equal(site.avatar, "/assets/icon-192.png");
    assert.equal(site.threads, 1);
    const other = snap.members.members.find((m) => m.login === "some-builder");
    assert.equal(other.url, "https://github.com/some-builder");
    assert.equal(other.replies, 1);

    assert.doesNotMatch(JSON.stringify(snap.discussions), /firestarterxox/i);
    assert.doesNotMatch(JSON.stringify(snap.members), /firestarterxox/i);
    assert.doesNotMatch(snap.feed, /firestarterxox/i);
    assert.match(snap.feed, /<author><name>Vibe Garage<\/name><\/author>/);
  });
});
