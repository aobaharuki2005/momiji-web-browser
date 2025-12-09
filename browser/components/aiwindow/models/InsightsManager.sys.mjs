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
} from "moz-src:///browser/components/aiwindow/models/InsightsConstants.sys.mjs";
import {
  getFormattedInsightAttributeList,
  parseAndExtractJSON,
} from "moz-src:///browser/components/aiwindow/models/Insights.sys.mjs";
import {
  messageInsightClassificationSystemPrompt,
  messageInsightClassificationPrompt,
} from "moz-src:///browser/components/aiwindow/models/prompts/insightsPrompts.sys.mjs";
import { INSIGHTS_MESSAGE_CLASSIFY_SCHEMA } from "moz-src:///browser/components/aiwindow/models/InsightsSchemas.sys.mjs";

const K_DOMAINS = 30;
const K_TITLES = 60;
const K_SEARCHES = 10;

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
      k_domains: K_DOMAINS,
      k_titles: K_TITLES,
      k_searches: K_SEARCHES,
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
