/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * This module defines functions to generate, deduplicate, and filter insights.
 *
 * The primary method in this module is `generateInsights`, which orchestrates the entire pipeline:
 * 1. Generates initial insights from a specified user data user
 * 2. Deduplicates the newly generated insights against all existing insights
 * 3. Filters out insights with sensitive content (i.e. financial, medical, etc.)
 * 4. Returns the final list of insights objects
 *
 * `generateInsights` requires 3 arguments:
 * 1. `engine`: an instance of `openAIEngine` to call the LLM API
 * 2. `sources`: an object mapping user data source types to aggregated records (i.e., {history: [domainItems, titleItems, searchItems]})
 * 3. `existingInsightsList`: an array of existing insight summary strings to deduplicate against
 *
 * Example Usage:
 * const engine = await openAIEngine.build();
 * const sources = {history: [domainItems, titleItems, searchItems]};
 * const existingInsightsList = [...]; // Array of existing insight summary strings; this should be fetched from insight storage
 * const newInsights = await generateInsights(engine, sources, existingInsightsList);
 *
 */

import { renderPrompt } from "./Utils.sys.mjs";

import {
  HISTORY,
  CATEGORIES,
  CATEGORIES_LIST,
  INTENTS,
  INTENTS_LIST,
} from "./InsightsConstants.sys.mjs";

import {
  initialInsightsGenerationSystemPrompt,
  initialInsightsGenerationPrompt,
  insightsDeduplicationSystemPrompt,
  insightsDeduplicationPrompt,
  insightSensitivityFilterSystemPrompt,
  insightsSensitivityFilterPrompt,
} from "moz-src:///browser/components/aiwindow/models/prompts/InsightsPrompts.sys.mjs";

import {
  INITIAL_INSIGHTS_SCHEMA,
  INSIGHTS_DEDUPLICATION_SCHEMA,
  INSIGHTS_NON_SENSITIVE_SCHEMA,
} from "moz-src:///browser/components/aiwindow/models/InsightsSchemas.sys.mjs";

/**
 * Generates, deduplicates, and filters insights end-to-end
 *
 * This is the main pipeline function.
 *
 * @param {OpenAIEngine} engine                 openAIEngine instance to call LLM API
 * @param {object} sources                      User data source type to aggregrated records (i.e., {history: [domainItems, titleItems, searchItems]})
 * @param {Array<string>} existingInsightsList  List of existing insight summary strings to deduplicate against
 * @returns {Promise<Array<Map<{
 *  category: string,
 *  intent: string,
 *  insight_summary: string,
 *  score: number,
 * }>>>}                                        Promise resolving the final list of generated, deduplicated, and filtered insight objects
 */
export async function generateInsights(engine, sources, existingInsightsList) {
  // Step 1: Generate initial insights
  const initialInsights = await generateInitialInsightsList(engine, sources);
  // If we don't generate any new insights, just return an empty list immediately instead of doing the rest of the steps
  if (!initialInsights || initialInsights.length === 0) {
    return [];
  }

  // Step 2: Deduplicate against existing insights
  const initialInsightsSummaries = initialInsights.map(
    insight => insight.insight_summary
  );
  const dedupedInsightsSummaries = await deduplicateInsights(
    engine,
    existingInsightsList,
    initialInsightsSummaries
  );
  // If we don't have any deduped insights, no new insights were generated or we ran into an unexpected JSON parse error, so return an empty list
  if (!dedupedInsightsSummaries || dedupedInsightsSummaries.length === 0) {
    return [];
  }

  // Step 3: Filter out sensitive insights
  const nonSensitiveInsightsSummaries = await filterSensitiveInsights(
    engine,
    dedupedInsightsSummaries
  );

  // Step 4: Map back to full insight objects and return
  return await mapFilteredInsightsToInitialList(
    initialInsights,
    nonSensitiveInsightsSummaries
  );
}

/**
 * Formats a list of strings into a prompt-friendly bullet list
 *
 * @param {List<string>} list
 * @returns {string}
 */
export function formatListForPrompt(list) {
  return list.map(item => `- "${item}"`).join("\n");
}

/**
 * Utility function to cleanly get bullet-formatted category and insight lists
 *
 * @param {string} attributeName  "categories" or "intents"
 * @returns {string}              Formatted list string
 */
export function getFormattedInsightAttributeList(attributeName) {
  if (attributeName === CATEGORIES) {
    return formatListForPrompt(CATEGORIES_LIST);
  } else if (attributeName === INTENTS) {
    return formatListForPrompt(INTENTS_LIST);
  }
  throw new Error(`Unsupported insight attribute name: ${attributeName}`);
}

/**
 * Extracts a JSON as a map from an LLM response (handles markdown-formatted code blocks)
 *
 * @param {any} response  LLM response
 * @param {any} fallback  Fallback value if parsing fails to protect downstream code
 * @returns {Map}         Parsed JSON object
 */
export function parseAndExtractJSON(response, fallback) {
  const rawContent = response?.finalOutput ?? "";
  const markdownMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const payload = markdownMatch ? markdownMatch[1] : rawContent;
  try {
    return JSON.parse(payload);
  } catch (e) {
    // If we can't parse a JSON from the LLM response, return a tailored fallback value to prevent downstream code failures
    if (e instanceof SyntaxError) {
      console.warn(
        `Could not parse JSON from LLM response; using fallback (${fallback}): ${e.message}`
      );
      return fallback;
    }
    throw new Error(
      `Unexpected error parsing JSON from LLM response: ${e.message}`
    );
  }
}

/**
 * Renders recent history records into CSV tables for prompt input
 *
 * @param {Array<Array<string>>} domainItems   List of aggregated domain items
 * @param {Array<Array<string>>} titleItems    List of aggregated title items
 * @param {Array<object>} searchItems          List of aggregated search items
 * @returns {Promise<string>}   Promise resolving recent browser history rendered as CSV tables
 */
export async function renderRecentHistoryForPrompt(
  domainItems,
  titleItems,
  searchItems
) {
  let finalCSV = "";

  if (domainItems.length) {
    let domainRecordsTable = ["Domain,Importance Score"];
    for (const domainItem of domainItems) {
      domainRecordsTable.push(domainItem.join(","));
    }
    finalCSV += "# Domains\n" + domainRecordsTable.join("\n") + "\n\n";
  }

  if (titleItems.length) {
    let titleRecordsTable = ["Title,Importance Score"];
    for (const titleItem of titleItems) {
      titleRecordsTable.push(titleItem.join(","));
    }
    finalCSV += "# Titles\n" + titleRecordsTable.join("\n") + "\n\n";
  }

  if (searchItems.length) {
    let searchRecordsTable = ["Search,Importance Score"];
    for (const searchItem of searchItems) {
      searchRecordsTable.push(`${searchItem.q},${searchItem.r}`);
    }
    finalCSV += "# Searches\n" + searchRecordsTable.join("\n");
  }

  return finalCSV.trim();
}

/**
 * Builds the initial insights generation prompt, pulling profile information based on given source
 *
 * @param {object} sources      User data source type to aggregrated records (i.e., {history: [domainItems, titleItems, searchItems]})
 * @returns {Promise<string>}   Promise resolving the generated insights generation prompt with profile records injected
 */
export async function buildInitialInsightsGenerationPrompt(sources) {
  let profileRecordsRenderedStr = "";

  // Allow for multiple sources in the future
  if (sources.hasOwnProperty(HISTORY)) {
    const [domainItems, titleItems, searchItems] = sources[HISTORY];
    profileRecordsRenderedStr += await renderRecentHistoryForPrompt(
      domainItems,
      titleItems,
      searchItems
    );
  }

  if (!profileRecordsRenderedStr) {
    throw new Error(
      `No valid sources provided to build insights generation prompt: ${Object.keys(sources).join(", ")}`
    );
  }

  return await renderPrompt(initialInsightsGenerationPrompt, {
    categoriesList: getFormattedInsightAttributeList(CATEGORIES),
    intentsList: getFormattedInsightAttributeList(INTENTS),
    profileRecordsRenderedStr,
  });
}

/**
 * Builds the insights deduplication prompt
 *
 * @param {Array<string>} existingInsightsList  List of existing insights
 * @param {Array<string>} newInsightsList       List of newly generated insights
 * @returns {Promise<string>}                   Promise resolving the generated deduplication prompt with existing and new insights lists injected
 */
export async function buildInsightsDeduplicationPrompt(
  existingInsightsList,
  newInsightsList
) {
  const existingInsightsListStr = formatListForPrompt(existingInsightsList);
  const newInsightsListStr = formatListForPrompt(newInsightsList);

  return await renderPrompt(insightsDeduplicationPrompt, {
    existingInsightsList: existingInsightsListStr,
    newInsightsList: newInsightsListStr,
  });
}

/**
 * Builds the insights sensitivity filter prompt
 *
 * @param {Array<string>} insightsList  List of insights to filter
 * @returns {Promise<string>}           Promise resolving the generated sensitivity filter prompt with insights list injected
 */
export async function buildInsightsSensitivityFilterPrompt(insightsList) {
  const insightsListStr = formatListForPrompt(insightsList);

  return await renderPrompt(insightsSensitivityFilterPrompt, {
    insightsList: insightsListStr,
  });
}

/**
 * Sanitizes a single insight object from LLM output, checking required fields and normalizing score
 *
 * @param {*} insight               Raw insight object from LLM
 * @returns {Map<{
 *  category: string|null,
 *  intent: string|null,
 *  insight_summary: string|null,
 *  score: number,
 * }>|null}                         Sanitized insight or null if invalid
 */
function sanitizeInsight(insight) {
  // Shortcut to return nothing if insight is bad
  if (!insight || typeof insight !== "object") {
    return null;
  }

  // Check that the candidate insight object has all the required string fields
  for (const field of ["category", "intent", "insight_summary"]) {
    if (!(field in insight) && typeof insight[field] !== "string") {
      return null;
    }
  }

  // Clamp score to [1,5]; treat missing/invalid as 1
  let score = Number.isFinite(insight.score) ? Math.round(insight.score) : 1;
  if (score < 1) {
    score = 1;
  } else if (score > 5) {
    score = 5;
  }

  return {
    category: insight.category,
    intent: insight.intent,
    insight_summary: insight.insight_summary,
    score,
  };
}

/**
 * Normalizes and validates parsed LLM output into a list of insights to handle LLM output variability
 *
 * @param {*} parsed                JSON-parsed LLM output
 * @returns {Array<Map<{
 *  category: string,
 *  intent: string,
 *  insight_summary: string,
 *  score: number,
 * }>>}                             List of sanitized insights
 */
function normalizeInsightList(parsed) {
  let list = parsed;
  if (!Array.isArray(list)) {
    // If list isn't an array, check that it's an object with a nested "items" array
    if (list && Array.isArray(list.items)) {
      list = list.items;
    } else if (list && typeof list === "object") {
      // If list isn't an array, check that it's a least a single object, so check that list has insight-like keys
      const looksLikeInsight =
        "category" in list || "intent" in list || "insight_summary" in list;
      if (looksLikeInsight) {
        list = [list];
      }
    }
  }
  if (!Array.isArray(list)) {
    return [];
  }

  return list.map(sanitizeInsight).filter(Boolean);
}

/**
 * Prompts an LLM to generate an initial, unfiltered list of candidate insights from user data
 *
 * @param {openAIEngine} engine     openAIEngine instance to call LLM API
 * @param {object} sources          User data source type to aggregrated records (i.e., {history: [domainItems, titleItems, searchItems]})
 * @returns {Promise<Array<Map<{
 *  category: string,
 *  intent: string,
 *  insight_summary: string,
 *  score: number,
 * }>>>}                            Promise resolving the list of generated insights
 */
export async function generateInitialInsightsList(engine, sources) {
  const promptText = await buildInitialInsightsGenerationPrompt(sources);
  const response = await engine.run({
    args: [
      {
        role: "system",
        content: initialInsightsGenerationSystemPrompt,
      },
      { role: "user", content: promptText },
    ],
    responseFormat: { type: "json_schema", schema: INITIAL_INSIGHTS_SCHEMA },
  });

  const parsed = parseAndExtractJSON(response, []);
  return normalizeInsightList(parsed);
}

/**
 * Prompts an LLM to deduplicate new insights against existing ones
 *
 * @param {OpenAIEngine} engine                 openAIEngine instance to call LLM API
 * @param {Array<string>} existingInsightsList  List of existing insight summary strings
 * @param {Array<string>} newInsightsList       List of new insight summary strings to deduplicate
 * @returns {Promise<Array<string>>}            Promise resolving the final list of deduplicated insight summary strings
 */
export async function deduplicateInsights(
  engine,
  existingInsightsList,
  newInsightsList
) {
  const dedupPrompt = await buildInsightsDeduplicationPrompt(
    existingInsightsList,
    newInsightsList
  );
  const response = await engine.run({
    args: [
      {
        role: "system",
        content: insightsDeduplicationSystemPrompt,
      },
      { role: "user", content: dedupPrompt },
    ],
    responseFormat: {
      type: "json_schema",
      schema: INSIGHTS_DEDUPLICATION_SCHEMA,
    },
  });

  const parsed = parseAndExtractJSON(response, { unique_insights: [] });

  // Able to extract a JSON, so the fallback wasn't used, but the LLM didn't follow the schema
  if (
    parsed.unique_insights === undefined ||
    !Array.isArray(parsed.unique_insights)
  ) {
    return [];
  }

  // Make sure we filter out any invalid main_insight entries before returning
  return parsed.unique_insights
    .filter(
      item =>
        item.main_insight !== undefined && typeof item.main_insight === "string"
    )
    .map(item => item.main_insight);
}

/**
 * Prompts an LLM to filter out sensitive insights from an insights list
 *
 * @param {OpenAIEngine} engine         openAIEngine instance to call LLM API
 * @param {Array<string>} insightsList  List of insight summary strings to filter
 * @returns {Promise<Array<string>>}    Promise resolving the final list of non-sensitive insight summary strings
 */
export async function filterSensitiveInsights(engine, insightsList) {
  const sensitivityFilterPrompt =
    await buildInsightsSensitivityFilterPrompt(insightsList);
  const response = await engine.run({
    args: [
      {
        role: "system",
        content: insightSensitivityFilterSystemPrompt,
      },
      { role: "user", content: sensitivityFilterPrompt },
    ],
    responseFormat: {
      type: "json_schema",
      schema: INSIGHTS_NON_SENSITIVE_SCHEMA,
    },
  });

  const parsed = parseAndExtractJSON(response, { non_sensitive_insights: [] });

  // Able to extract a JSON, so the fallback wasn't used, but the LLM didn't follow the schema
  if (
    parsed.non_sensitive_insights === undefined ||
    !Array.isArray(parsed.non_sensitive_insights)
  ) {
    return [];
  }

  // Make sure we filter out any invalid entries before returning
  return parsed.non_sensitive_insights.filter(item => typeof item === "string");
}

/**
 *
 * @param {Map<string, any>} initialInsights    List of original, unfiltered insight objects
 * @param {Array<string>} filteredInsightsList  List of deduplicated and sensitivity-filtered insight summary strings
 * @returns {Promise<Map<string, any>>}         Promise resolving the final list of insight objects
 */
export async function mapFilteredInsightsToInitialList(
  initialInsights,
  filteredInsightsList
) {
  return initialInsights.filter(insight =>
    filteredInsightsList.includes(insight.insight_summary)
  );
}
