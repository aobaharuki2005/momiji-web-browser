/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { getRecentHistory } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/InsightsHistorySource.sys.mjs"
);

add_task(async function test_basic_history_fetch_and_shape() {
  // Seed a few visits spanning search + normal history.
  const now = Date.now();

  const seeded = [
    {
      url: "https://www.google.com/search?q=firefox+history",
      title: "Google Search: firefox history",
      visits: [{ date: new Date(now - 5 * 60 * 1000) }], // 5 min ago
    },
    {
      url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
      title: "JavaScript | MDN",
      visits: [{ date: new Date(now - 10 * 60 * 1000) }], // 10 min ago
    },
    {
      url: "https://news.ycombinator.com/",
      title: "Hacker News",
      visits: [{ date: new Date(now - 15 * 60 * 1000) }],
    },
    {
      url: "https://search.brave.com/search?q=mozsqlite",
      title: "Brave Search: mozsqlite",
      visits: [{ date: new Date(now - 20 * 60 * 1000) }],
    },
    {
      url: "https://mozilla.org/en-US/",
      title: "Internet for people, not profit — Mozilla",
      visits: [{ date: new Date(now - 25 * 60 * 1000) }],
    },
  ];

  // Insert via high-level API; Places will populate moz_origins/visits.
  await PlacesUtils.history.insertMany(seeded);

  const rows = await getRecentHistory({ days: 1, maxResults: 100 });
  Assert.ok(Array.isArray(rows), "Should return an array");
  Assert.greaterOrEqual(
    rows.length,
    seeded.length,
    "Should return at least seeded rows"
  );

  // Verify required fields & types on a sample.
  for (const row of rows.slice(0, 5)) {
    Assert.strictEqual(typeof row.url, "string", "url is a string");
    Assert.ok(row.url.length, "url present");
    Assert.strictEqual(typeof row.domain, "string", "domain is a string");
    Assert.ok(row.domain.length, "domain present");
    Assert.strictEqual(typeof row.title, "string", "title is a string");
    Assert.ok(typeof row.title.length, "title present");
    Assert.strictEqual(
      typeof row.frequencyPct,
      "number",
      "frequencyPct is a number"
    );
    Assert.strictEqual(
      typeof row.domainFrequencyPct,
      "number",
      "domainFrequencyPct is a number"
    );
    Assert.ok(
      row.source === "search" || row.source === "history",
      "source labeled"
    );
    Assert.ok(
      row.frequencyPct >= 0 && row.frequencyPct <= 100,
      "frequencyPct within 0–100"
    );
    Assert.ok(
      row.domainFrequencyPct >= 0 && row.domainFrequencyPct <= 100,
      "domainFrequencyPct within 0–100"
    );

    Assert.strictEqual(
      typeof row.visitDateMicros,
      "number",
      "visitDateMicros is a number"
    );
    Assert.ok(
      Number.isFinite(row.visitDateMicros),
      "visitDateMicros is finite"
    );
    Assert.greaterOrEqual(
      row.visitDateMicros,
      0,
      "visitDateMicros non-negative"
    );
  }

  // Check ordering: newest first by visit_date.
  const copy = rows.map(r => r.visitDateMicros);
  const sorted = [...copy].sort((a, b) => b - a);
  Assert.deepEqual(
    copy.slice(0, 10),
    sorted.slice(0, 10),
    "Rows are ordered by visit date desc"
  );

  // Search-source tagging should catch major engines with query paths.
  const byUrl = new Map(rows.map(r => [r.url, r]));
  Assert.equal(
    byUrl.get(seeded[0].url).source,
    "search",
    "Google search tagged as 'search'"
  );
  Assert.equal(
    byUrl.get(seeded[3].url).source,
    "search",
    "Brave search tagged as 'search'"
  );
  Assert.equal(
    byUrl.get(seeded[1].url).source,
    "history",
    "MDN should be 'history'"
  );
  Assert.equal(
    byUrl.get(seeded[2].url).source,
    "history",
    "Hacker News should be 'history'"
  );
  Assert.equal(
    byUrl.get(seeded[4].url).source,
    "history",
    "Internet for people, not profit — Mozilla"
  );
});

add_task(async function test_maxResults_is_respected() {
  // Create a burst of visits so we can test LIMIT behavior.
  await PlacesUtils.history.clear();

  const base = Date.now();
  const toInsert = [];
  for (let i = 0; i < 50; i++) {
    toInsert.push({
      url: `https://example.com/page-${i}`,
      title: `Example Page ${i}`,
      visits: [{ date: new Date(base - i * 1000) }],
    });
  }
  await PlacesUtils.history.insertMany(toInsert);

  const rows10 = await getRecentHistory({ days: 1, maxResults: 10 });
  Assert.equal(rows10.length, 10, "maxResults=10 respected");

  const rows5 = await getRecentHistory({ days: 1, maxResults: 5 });
  Assert.equal(rows5.length, 5, "maxResults=5 respected");
});

add_task(async function test_days_cutoff_is_respected() {
  await PlacesUtils.history.clear();

  // One old (2 days), one recent (within 1 hour)
  const now = Date.now();
  await PlacesUtils.history.insertMany([
    {
      url: "https://old.example.com/",
      title: "Old Visit",
      visits: [{ date: new Date(now - 2 * 24 * 60 * 60 * 1000) }],
    },
    {
      url: "https://recent.example.com/",
      title: "Recent Visit",
      visits: [{ date: new Date(now - 30 * 60 * 1000) }],
    },
  ]);

  const rows = await getRecentHistory({ days: 1, maxResults: 50 });
  const urls = rows.map(r => r.url);
  Assert.ok(
    urls.includes("https://recent.example.com/"),
    "Recent visit present"
  );
  Assert.ok(
    !urls.includes("https://old.example.com/"),
    "Old visit filtered by days cutoff"
  );
});
