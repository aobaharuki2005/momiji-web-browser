/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  getRecentHistory,
  sessionizeVisits,
  generateProfileInputs,
  aggregateSessions,
  topkAggregates,
} from "moz-src:///browser/components/aiwindow/models/InsightsHistorySource.sys.mjs";
import {
  openAIEngine,
  renderPrompt,
} from "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs";
import { InsightStore } from "moz-src:///browser/components/aiwindow/services/InsightStore.sys.mjs";
import {
  CATEGORIES,
  INTENTS,
  HISTORY as SOURCE_HISTORY,
  CONVERSATION as SOURCE_CONVERSATION,
} from "moz-src:///browser/components/aiwindow/models/InsightsConstants.sys.mjs";
import {
  getFormattedInsightAttributeList,
  parseAndExtractJSON,
  generateInsights,
} from "moz-src:///browser/components/aiwindow/models/Insights.sys.mjs";
import {
  messageInsightClassificationSystemPrompt,
  messageInsightClassificationPrompt,
} from "moz-src:///browser/components/aiwindow/models/prompts/insightsPrompts.sys.mjs";
import { INSIGHTS_MESSAGE_CLASSIFY_SCHEMA } from "moz-src:///browser/components/aiwindow/models/InsightsSchemas.sys.mjs";

const K_DOMAINS_FULL = 100;
const K_TITLES_FULL = 60;
const K_SEARCHES_FULL = 10;
const K_DOMAINS_DELTA = 30;
const K_TITLES_DELTA = 60;
const K_SEARCHES_DELTA = 10;

const DEFAULT_HISTORY_FULL_LOOKUP_DAYS = 60;
const DEFAULT_HISTORY_FULL_MAX_RESULTS = 3000;
const DEFAULT_HISTORY_DELTA_MAX_RESULTS = 500;

const LAST_HISTORY_INSIGHTS_TS_ATTRIBUTE = "last_history_insight_ts";
const LAST_CONVERSATION_INSIGHTS_TS_ATTRIBUTE = "last_chat_insight_ts";
/**
 * InsightsManager class
 */
export class InsightsManager {
  static #openAIEnginePromise = null;

  /**
   * Creates and returns an class-level openAIEngine instance if one has not already been created.
   * This current pulls from the general browser.aiwindow.* prefs, but will likely pull from insights-specific ones in the future
   *
   * @returns {Promise<openAIEngine>}  openAIEngine instance
   */
  static async ensureOpenAIEngine() {
    if (!this.#openAIEnginePromise) {
      this.#openAIEnginePromise = await openAIEngine.build();
    }
    return this.#openAIEnginePromise;
  }

  /**
   * Generates and persists insights derived from the user's recent browsing history.
   *
   * This method:
   *  1. Reads {@link last_history_insight_ts} via {@link getLastHistoryInsightsTimestamp}.
   *  2. Decides between:
   *     - Full processing (first run, no prior timestamp):
   *         * Uses a days-based cutoff (DEFAULT_HISTORY_FULL_LOOKUP_DAYS).
   *         * Uses max-results cap (DEFAULT_HISTORY_FULL_MAX_RESULTS).
   *         * Uses full top-k settings (K_DOMAINS_FULL, K_TITLES_FULL, K_SEARCHES_FULL).
   *     - Delta processing (subsequent runs, prior timestamp present):
   *         * Uses an absolute cutoff via `sinceMicros = lastTsMs * 1000`.
   *         * Uses a smaller max-results cap (DEFAULT_HISTORY_DELTA_MAX_RESULTS).
   *         * Uses delta top-k settings (K_DOMAINS_DELTA, K_TITLES_DELTA, K_SEARCHES_DELTA).
   *  3. Calls {@link getAggregatedBrowserHistory} with the computed options to obtain
   *     domain, title, and search aggregates.
   *  4. Fetches existing insights via {@link getAllInsights}.
   *  5. Ensures a shared OpenAI engine via {@link ensureOpenAIEngine} and calls
   *     {@link generateInsights} to produce new/updated insights.
   *  6. Persists those insights via {@link saveInsights}, which also updates
   *     `last_history_insight_ts` in {@link InsightStore.updateMeta}.
   *
   * @returns {Promise<Insight[]>}
   *          A promise that resolves to the list of persisted history insights
   *          (newly created or updated), sorted and shaped as returned by
   *          {@link InsightStore.addInsight}.
   */
  static async generateInsightsFromBrowsingHistory() {
    const now = Date.now();
    // get last history insight timestamp in ms
    const lastTsMs = await this.getLastHistoryInsightsTimestamp();
    const isDelta = typeof lastTsMs === "number" && lastTsMs > 0;
    // set up the options based on delta or full (first) run
    let recentHistoryOpts = {};
    let topkAggregatesOpts;
    if (isDelta) {
      recentHistoryOpts = {
        sinceMicros: lastTsMs * 1000,
        maxResults: DEFAULT_HISTORY_DELTA_MAX_RESULTS,
      };
      topkAggregatesOpts = {
        k_domains: K_DOMAINS_DELTA,
        k_titles: K_TITLES_DELTA,
        k_searches: K_SEARCHES_DELTA,
        now,
      };
    } else {
      recentHistoryOpts = {
        days: DEFAULT_HISTORY_FULL_LOOKUP_DAYS,
        maxResults: DEFAULT_HISTORY_FULL_MAX_RESULTS,
      };
      topkAggregatesOpts = {
        k_domains: K_DOMAINS_FULL,
        k_titles: K_TITLES_FULL,
        k_searches: K_SEARCHES_FULL,
        now,
      };
    }

    const [domainItems, titleItems, searchItems] =
      await this.getAggregatedBrowserHistory(
        recentHistoryOpts,
        topkAggregatesOpts
      );
    const sources = { history: [domainItems, titleItems, searchItems] };
    const existingInsights = await this.getAllInsights();
    const existingInsightsSummaries = existingInsights.map(
      i => i.insight_summary
    );
    const engine = await this.ensureOpenAIEngine();
    const insights = await generateInsights(
      engine,
      sources,
      existingInsightsSummaries
    );
    const { persistedInsights } = await this.saveInsights(
      insights,
      SOURCE_HISTORY,
      now
    );
    return persistedInsights;
  }

  /**
   * Retrieves and aggregates recent browser history into top-k domain, title, and search aggregates.
   *
   * @param {object} [recentHistoryOpts={}]
   * @param {number} [recentHistoryOpts.sinceMicros=null]
   *        Optional absolute cutoff in microseconds since epoch (Places
   *        visit_date). If provided, this is used directly as the cutoff:
   *        only visits with `visit_date >= sinceMicros` are returned.
   *
   *        This is the recommended way to implement incremental reads:
   *        store the max `visitDateMicros` from the previous run and pass
   *        it (or max + 1) back in as `sinceMicros`.
   *
   * @param {number} [recentHistoryOpts.days=DEFAULT_DAYS]
   *        How far back to look if `sinceMicros` is not provided.
   *        The cutoff is computed as:
   *          cutoff = now() - days * MS_PER_DAY
   *
   *        Ignored when `sinceMicros` is non-null.
   *
   * @param {number} [recentHistoryOpts.maxResults=DEFAULT_MAX_RESULTS]
   *        Maximum number of rows to return from the SQL query (after
   *        sorting by most recent visit). Note that this caps the number
   *        of visits, not distinct URLs.
   * @param {object} [topkAggregatesOpts]
   * @param {number} [topkAggregatesOpts.k_domains=30]    Max number of domain aggregates to return
   * @param {number} [topkAggregatesOpts.k_titles=60]     Max number of title aggregates to return
   * @param {number} [topkAggregatesOpts.k_searches=10]   Max number of search aggregates to return
   * @param {number} [topkAggregatesOpts.now]             Current time; seconds or ms, normalized internally.}
   * @returns {Promise<[Array, Array, Array]>}            Top-k domain, title, and search aggregates
   */
  static async getAggregatedBrowserHistory(
    recentHistoryOpts = {},
    topkAggregatesOpts = {
      k_domains: K_DOMAINS_DELTA,
      k_titles: K_TITLES_DELTA,
      k_searches: K_SEARCHES_DELTA,
      now: undefined,
    }
  ) {
    const recentVisitRecords = await getRecentHistory(recentHistoryOpts);
    const sessionized = sessionizeVisits(recentVisitRecords);
    const profilePreparedInputs = generateProfileInputs(sessionized);
    const [domainAgg, titleAgg, searchAgg] = aggregateSessions(
      profilePreparedInputs
    );

    return await topkAggregates(
      domainAgg,
      titleAgg,
      searchAgg,
      topkAggregatesOpts
    );
  }

  /**
   * Retrieves all stored insights.
   * This is a quick-access wrapper around InsightStore.getInsights() with no additional processing.
   *
   * @returns {Promise<Array<Map<{
   *  insight_summary: string,
   *  category: string,
   *  intent: string,
   *  score: number,
   * }>>>}                                    List of insights
   */
  static async getAllInsights() {
    return await InsightStore.getInsights();
  }

  /**
   * Returns the last timestamp (in ms since Unix epoch) when a history-based
   * insight was generated, as persisted in InsightStore.meta.
   *
   * If the store has never been updated, this returns 0.
   *
   * @returns {Promise<number>}  Milliseconds since Unix epoch
   */
  static async getLastHistoryInsightsTimestamp() {
    const meta = await InsightStore.getMeta();
    return meta.last_history_insights_ts || 0;
  }

  /**
   * Persist a list of generated insights and update the appropriate meta timestamp.
   *
   * @param {Array<object>|null|undefined} generatedInsights
   *        Array of InsightPartial-like objects to persist.
   * @param {"history"|"conversation"} source
   *        Source of these insights; controls which meta timestamp to update.
   * @param {number} [nowMs=Date.now()]
   *        Optional "now" timestamp in ms, for meta update fallback.
   *
   * @returns {Promise<{ persistedInsights: Array<object>, newTimestampMs: number | null }>}
   */
  static async saveInsights(generatedInsights, source, nowMs = Date.now()) {
    const persistedInsights = [];

    if (Array.isArray(generatedInsights)) {
      for (const insightPartial of generatedInsights) {
        const stored = await InsightStore.addInsight(insightPartial);
        persistedInsights.push(stored);
      }
    }

    // Decide which meta field to update
    let metaKey;
    if (source === SOURCE_HISTORY) {
      metaKey = LAST_HISTORY_INSIGHTS_TS_ATTRIBUTE;
    } else if (source === SOURCE_CONVERSATION) {
      metaKey = LAST_CONVERSATION_INSIGHTS_TS_ATTRIBUTE;
    } else {
      // Unknown source: don't update meta, just return persisted results.
      return {
        persistedInsights,
        newTimestampMs: null,
      };
    }

    // Compute new timestamp: prefer max(updated_at) if present, otherwise fall back to nowMs.
    let newTsMs = nowMs;
    if (persistedInsights.length) {
      const maxUpdated = persistedInsights.reduce(
        (max, i) => Math.max(max, i.updated_at ?? 0),
        0
      );
      if (maxUpdated > 0) {
        newTsMs = maxUpdated;
      }
    }

    await InsightStore.updateMeta({
      [metaKey]: newTsMs,
    });

    return {
      persistedInsights,
      newTimestampMs: newTsMs,
    };
  }

  /**
   * Builds the prompt to classify a user message into insight categories and intents.
   *
   * @param {string} message          User message to classify
   * @returns {Promise<string>}       Prompt string to send to LLM for classifying the message
   */
  static async buildMessageInsightClassificationPrompt(message) {
    const categories = getFormattedInsightAttributeList(CATEGORIES);
    const intents = getFormattedInsightAttributeList(INTENTS);

    return await renderPrompt(messageInsightClassificationPrompt, {
      message,
      categories,
      intents,
    });
  }

  /**
   * Classifies a user message into insight categories and intents.
   *
   * @param {string} message                                                        User message to classify
   * @returns {Promise<Map<{categories: Array<string>, intents: Array<string>}>>}}  Categories and intents into which the message was classified
   */
  static async insightClassifyMessage(message) {
    const messageClassifPrompt =
      await this.buildMessageInsightClassificationPrompt(message);

    const engine = await this.ensureOpenAIEngine();

    const response = await engine.run({
      args: [
        { role: "system", content: messageInsightClassificationSystemPrompt },
        { role: "user", content: messageClassifPrompt },
      ],
      responseFormat: {
        type: "json_schema",
        schema: INSIGHTS_MESSAGE_CLASSIFY_SCHEMA,
      },
    });

    const parsed = parseAndExtractJSON(response, {
      categories: [],
      intents: [],
    });
    if (!parsed.categories || !parsed.intents) {
      return { categories: [], intents: [] };
    }

    return parsed;
  }

  /**
   * Fetches relevant insights for a given user message.
   *
   * @param {string} message                  User message to find relevant insights for
   * @returns {Promise<Array<Map<{
   *  insight_summary: string,
   *  category: string,
   *  intent: string,
   *  score: number,
   * }>>>}                                    List of relevant insights
   */
  static async getRelevantInsights(message) {
    const existingInsights = await InsightsManager.getAllInsights();
    // Shortcut: if there aren't any existing insights, return empty list immediately
    if (existingInsights.length === 0) {
      return [];
    }

    const messageClassification =
      await InsightsManager.insightClassifyMessage(message);
    // Shortcut: if the message's category and/or intent is null, return empty list immediately
    if (!messageClassification.categories || !messageClassification.intents) {
      return [];
    }

    // Filter existing insights to those that match the message's category
    const candidateRelevantInsights = existingInsights.filter(insight => {
      return messageClassification.categories.includes(insight.category);
    });

    return candidateRelevantInsights;
  }
}
