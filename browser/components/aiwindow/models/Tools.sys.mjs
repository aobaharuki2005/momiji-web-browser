/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * This file contains LLM tool abscrations and tool definitions.
 */

import { searchBrowsingHistory as implSearchBrowsingHistory } from "moz-src:///browser/components/aiwindow/models/SearchBrowsingHistory.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
  PageDataService:
    "moz-src:///browser/components/pagedata/PageDataService.sys.mjs",
});

const GET_OPEN_TABS = "get_open_tabs";
const SEARCH_BROWSING_HISTORY = "search_browsing_history";

// eslint-disable-next-line no-unused-vars
const TOOLS = [GET_OPEN_TABS, SEARCH_BROWSING_HISTORY];

// eslint-disable-next-line no-unused-vars
const toolsConfig = [
  {
    type: "function",
    function: {
      name: GET_OPEN_TABS,
      description:
        "Access the user's browser and return a list of most recently browsed tabs. Each tab is represented by a JSON with the page's url, title and description if available. Default to return maximum 15 tabs.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: SEARCH_BROWSING_HISTORY,
      description:
        'Refind pages from the user\'s PAST BROWSING HISTORY. Use this whenever the user wants to recall, review, list, or see pages they visited earlier (for a topic, site, or time period). Also use this when the user requests all pages from a past time period (e.g., "yesterday", "last week"), even if no topic is specified. Do NOT use for open tabs, completely general web questions, or abstract questions about "history" or habits.',
      parameters: {
        type: "object",
        properties: {
          searchTerm: {
            type: "string",
            description:
              "A detailed, noun-heavy phrase (~2-12 meaningful tokens) summarizing the user's intent for semantic retrieval. Include the main entity/topic plus 1-3 contextual qualifiers (e.g., library name, purpose, site, or timeframe). Avoid vague or single-word queries.",
          },
          startTs: {
            type: "string",
            description:
              "Inclusive lower bound of the time window as an ISO 8601 datetime string (e.g., '2025-11-07T09:00:00-05:00'). Use when the user asks for results within a time or range start, such as 'last week', 'since yesterday', or 'last night'. This must be before the user's current datetime.",
            default: null,
          },
          endTs: {
            type: "string",
            description:
              "Inclusive upper bound of the time window as an ISO 8601 datetime string (e.g., '2025-11-07T21:00:00-05:00'). Use when the user asks for results within a time or range end, such as 'last week', 'between 2025-10-01 and 2025-10-31', or 'before Monday'. This must be before the user's current datetime.",
            default: null,
          },
        },
        required: [],
      },
    },
  },
];

/**
 * Retrieves a list of (up to n) the latest open tabs from the current active browser window.
 * Ignores config pages (about:xxx).
 * TODO: Ignores chat-only pages (FE to implement isSidebarMode flag).
 *
 * @param {number} n
 *  Maximum number of tabs to return. Defaults to 15.
 * @returns {Promise<Array<object>>}
 *  A promise resolving to an array of tab metadata objects, each containing:
 *  - url {string}: The tab's current URL
 *  - title {string}: The tab's title
 *  - description {string}: Optional description (empty string if not available)
 *  - lastAccessed {number}: Last accessed timestamp in milliseconds
 *  Tabs are sorted by most recently accessed and limited to the first n results.
 */
export async function getOpenTabs(n = 15) {
  const tabs = [];

  const win = lazy.BrowserWindowTracker.getTopWindow();
  if (!win || win.closed || !win.gBrowser) {
    return [];
  }

  for (const tab of win.gBrowser.tabs) {
    const browser = tab.linkedBrowser;
    const url = browser?.currentURI?.spec;
    const title = tab.label;

    if (url && !url.startsWith("about:")) {
      tabs.push({
        url,
        title,
        lastAccessed: tab.lastAccessed,
      });
    }
  }

  tabs.sort((a, b) => b.lastAccessed - a.lastAccessed);

  const topTabs = tabs.slice(0, n);

  return Promise.all(
    topTabs.map(async ({ url, title, lastAccessed }) => {
      let description = "";
      if (url) {
        description =
          lazy.PageDataService.getCached(url)?.description ||
          (await lazy.PageDataService.fetchPageData(url))?.description ||
          "";
      }
      return { url, title, description, lastAccessed };
    })
  );
}

/**
 * Tool entrypoint for browsing history search.
 *
 * Parameters (defaults shown):
 * - searchTerm: ""        - string used for search
 * - startTs: null         - ISO timestamp lower bound, or null
 * - endTs: null           - ISO timestamp upper bound, or null
 * - historyLimit: 15      - max number of results
 *
 * Detailed behavior and implementation are in SearchBrowsingHistory.sys.mjs.
 *
 * @param {object} params
 *  The search parameters.
 * @param {string} params.searchTerm
 *  The search string. If null or empty, semantic search is skipped and
 *  results are filtered by time range and sorted by last_visit_date and frecency.
 * @param {string|null} params.startTs
 *  Optional ISO-8601 start timestamp (e.g. "2025-11-07T09:00:00-05:00").
 * @param {string|null} params.endTs
 *  Optional ISO-8601 end timestamp (e.g. "2025-11-07T09:00:00-05:00").
 * @param {number} params.historyLimit
 *  Maximum number of history results to return.
 * @returns {Promise<object>}
 *  A promise resolving to an object with the search term and history results.
 *  Includes `count` when matches exist, a `message` when none are found, or an
 *  `error` string on failure.
 */
export async function searchBrowsingHistory({
  searchTerm = "",
  startTs = null,
  endTs = null,
  historyLimit = 15,
}) {
  return implSearchBrowsingHistory({
    searchTerm,
    startTs,
    endTs,
    historyLimit,
  });
}

/**
 * Strips heavy or unnecessary fields from a browser history search result.
 *
 * @param {string} result
 *  A JSON string representing the history search response.
 * @returns {string}
 *  The sanitized JSON string with large fields (e.g., favicon, thumbnail)
 *  removed, or the original string if parsing fails.
 */
export function stripSearchBrowsingHistoryFields(result) {
  try {
    const data = JSON.parse(result);
    if (
      data.error ||
      !Array.isArray(data.results) ||
      data.results.length === 0
    ) {
      return result;
    }

    // Remove large or unnecessary fields to save tokens
    const OMIT_KEYS = ["favicon", "thumbnail"];
    for (const item of data.results) {
      if (item && typeof item === "object") {
        for (const k of OMIT_KEYS) {
          delete item[k];
        }
      }
    }
    return JSON.stringify(data);
  } catch {
    return result;
  }
}
