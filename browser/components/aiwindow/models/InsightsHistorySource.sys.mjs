/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This module handles the visit extraction data from browsing history
 */

import { PlacesUtils } from "resource://gre/modules/PlacesUtils.sys.mjs";

/**
 * Fetch recent browsing history from Places (SQL), aggregate by URL,
 * tag "search" vs "history", and filter low-visit URLs.
 *
 * @param {object} opts
 * @param {number} [opts.days=60]          How far back to look
 * @param {number} [opts.maxResults=3000]   Max rows to return (after sort)
 * @returns {Promise<Array<{url:string,title:string,domain:string,visit_time:string,visit_count:number,source:'history'|'search'}>>}
 */
export async function getRecentHistory(opts = {}) {
  const MS_PER_DAY = 86400000;
  const MICROS_PER_MS = 1000;
  const DEFAULT_DAYS = 60;
  const DEFAULT_MAX_RESULTS = 3000;

  const SEARCH_ENGINE_DOMAINS = [
    "google",
    "bing",
    "duckduckgo",
    "search.brave",
    "yahoo",
    "startpage",
    "ecosia",
    "baidu",
    "yandex",
  ];

  const days = opts.days ?? DEFAULT_DAYS;
  const maxResults = opts.maxResults ?? DEFAULT_MAX_RESULTS;

  // Places stores visit_date in microseconds since epoch.
  const cutoffMicros = Math.max(
    0,
    (Date.now() - days * MS_PER_DAY) * MICROS_PER_MS
  );

  const isSearchVisit = urlStr => {
    try {
      const { hostname, pathname, search } = new URL(urlStr);

      const searchEnginePattern = new RegExp(
        `(^|\\.)(${SEARCH_ENGINE_DOMAINS.join("|")})\\.`,
        "i"
      );
      const isSearchEngine = searchEnginePattern.test(hostname);

      const looksLikeSearch =
        /search|results|query/i.test(pathname) ||
        /[?&](q|query|p)=/i.test(search);

      return isSearchEngine && looksLikeSearch;
    } catch (e) {
      console.error("isSearchVisit: failed to parse URL", {
        error: String(e),
        urlLength: typeof urlStr === "string" ? urlStr.length : -1,
      });
      return false;
    }
  };

  const SQL = `
    WITH visit_info AS (
      SELECT
        p.id                     AS place_id,
        p.url                    AS url,
        o.host                   AS host,
        p.title                  AS title,
        v.visit_date             AS visit_date,
        p.frecency               AS frecency,
        CASE WHEN o.frecency = -1 THEN 1 ELSE o.frecency END AS domain_frecency
      FROM moz_places p
      JOIN moz_historyvisits v ON v.place_id = p.id
      JOIN moz_origins o       ON p.origin_id = o.id
      WHERE v.visit_date >= :cutoff
        AND p.title IS NOT NULL
        AND p.frecency IS NOT NULL
      ORDER BY v.visit_date DESC
      LIMIT :limit
    ),

    /* Collapse to one row per place to compute percentiles (like your groupby/place_id mean) */
    per_place AS (
      SELECT
        place_id,
        MAX(frecency)         AS frecency,
        MAX(domain_frecency)  AS domain_frecency
      FROM visit_info
      GROUP BY place_id
    ),

    /* Percentiles using window function CUME_DIST() */
    per_place_with_pct AS (
      SELECT
        place_id,
        ROUND(100.0 * CUME_DIST() OVER (ORDER BY frecency), 2) AS frecency_pct,
        ROUND(100.0 * CUME_DIST() OVER (ORDER BY domain_frecency), 2) AS domain_frecency_pct
      FROM per_place
    )

    /* Final rows: original visits + joined percentiles + source label */
    SELECT
      v.url,
      v.host,
      v.title,
      v.visit_date,
      p.frecency_pct,
      p.domain_frecency_pct
    FROM visit_info v
    JOIN per_place_with_pct p USING (place_id)
    ORDER BY v.visit_date DESC
  `;

  try {
    const rows = await PlacesUtils.withConnectionWrapper(
      "smartwindow-getRecentHistory",
      async db => {
        const stmt = await db.execute(SQL, {
          cutoff: cutoffMicros,
          limit: maxResults,
        });

        const out = [];
        for (const row of stmt) {
          const url = row.getResultByName("url");
          const host = row.getResultByName("host");
          const title = row.getResultByName("title") || "";
          const visitDateMicros = row.getResultByName("visit_date") || 0;
          const frequencyPct = row.getResultByName("frecency_pct") || 0;
          const domainFrequencyPct =
            row.getResultByName("domain_frecency_pct") || 0;

          out.push({
            url,
            domain: host,
            title,
            visitDateMicros,
            frequencyPct,
            domainFrequencyPct,
            source: isSearchVisit(url) ? "search" : "history",
          });
        }
        return out;
      }
    );
    return rows;
  } catch (error) {
    console.error("Failed to fetch Places history via SQL:", error);
    return [];
  }
}
