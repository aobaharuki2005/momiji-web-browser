/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// conversation starter/followup generation functions

import {
  openAIEngine,
  renderPrompt,
} from "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs";

import {
  conversationStarterPrompt,
  conversationFollowupPrompt,
  conversationInsightsPrompt,
} from "moz-src:///browser/components/aiwindow/models/prompts/ConversationSuggestionsPrompts.sys.mjs";

import { MESSAGE_ROLE } from "moz-src:///browser/components/aiwindow/ui/modules/ChatStore.sys.mjs";

import { InsightsManager } from "moz-src:///browser/components/aiwindow/models/InsightsManager.sys.mjs";

// Max number of insights to include in prompts
const MAX_NUM_INSIGHTS = 8;

/**
 * Helper to trim conversation history to recent messages, dropping empty messages, tool calls and responses
 *
 * @param {Array} messages - Array of chat messages
 * @param {number} maxMessages - Max number of messages to keep (default 15)
 * @returns {Array} Trimmed array of user/assistant messages
 */
export function trimConversation(messages, maxMessages = 15) {
  const out = [];

  for (const m of messages) {
    if (
      (m.role === MESSAGE_ROLE.USER || m.role === MESSAGE_ROLE.ASSISTANT) &&
      m.content &&
      m.content.trim()
    ) {
      const roleString = m.role === MESSAGE_ROLE.USER ? "user" : "assistant";
      out.push({ role: roleString, content: m.content });
    }
  }

  return out.slice(-maxMessages);
}

/**
 * Helper to add insights to base prompt if applicable
 *
 * @param {string} base - base prompt
 * @returns {Promise<string>} - prompt with insights added if applicable
 */
export async function addInsightsToPrompt(base) {
  let insightSummaries =
    await InsightsGetterForSuggestionPrompts.getInsightSummariesForPrompt(
      MAX_NUM_INSIGHTS
    );
  if (insightSummaries.length) {
    const insightsBlock = insightSummaries.map(s => `- ${s}`).join("\n");
    const insightPrompt = await renderPrompt(conversationInsightsPrompt, {
      insights: insightsBlock,
    });
    return `${base}\n${insightPrompt}`;
  }
  return base;
}

/**
 * Cleans inference output into array of prompts
 *
 * @param {*} result - Inference output result object
 * @returns {Array<string>} - Cleaned array of prompts
 */
export function cleanInferenceOutput(result) {
  const text = (result.finalOutput || "").trim();
  const lines = text
    .split(/\n+/)
    .map(l => l.trim())
    .filter(Boolean);

  const prompts = lines
    .map(line => line.replace(/^[-*\d.)\[\]]+\s*/, ""))
    .filter(p => p.length)
    .map(p => p.replace(/\.$/, "").replace(/^[^:]*:\s*/, ""));
  return prompts;
}

/**
 * Format object to JSON string safely
 *
 * @param {*} obj - Object to format
 * @returns {string} JSON string or string representation
 */
const formatJson = obj => {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(obj);
  }
};

export const NewTabStarterGenerator = {
  writingPrompts: [
    "Write a first draft",
    "Improve writing",
    "Proofread a message",
  ],

  planningPrompts: ["Simplify a topic", "Brainstorm ideas", "Help make a plan"],

  // TODO: discuss with design about updating phrasing to "pages" instead of "tabs"
  browsingPrompts: [
    { text: "Find tabs in history", minTabs: 0 },
    { text: "Summarize tabs", minTabs: 1 },
    { text: "Compare tabs", minTabs: 2 },
  ],

  getRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  },

  /**
   * Generate conversation starter prompts based on number of open tabs
   *
   * @param {number} tabCount - number of open tabs
   * @returns {Promise<Array>} Array of {text, type} suggestion objects
   */
  async getPrompts(tabCount) {
    const validBrowsingPrompts = this.browsingPrompts.filter(
      p => tabCount >= p.minTabs
    );

    const writingPrompt = this.getRandom(this.writingPrompts);
    const planningPrompt = this.getRandom(this.planningPrompts);
    const browsingPrompt = validBrowsingPrompts.length
      ? this.getRandom(validBrowsingPrompts)
      : this.browsingPrompts[0];

    return [
      { text: writingPrompt, type: "chat" },
      { text: planningPrompt, type: "chat" },
      { text: browsingPrompt.text, type: "chat" },
    ];
  },
};

/**
 * Generates conversation starter prompts based on tab context + (optional) user insights
 *
 * @param {Array} contextTabs - Array of tab objects with title, url, favicon
 * @param {number} n - Number of suggestions to generate (default 6)
 * @param {boolean} useInsights - Whether to include user insights in prompt (default false)
 * @returns {Promise<Array>} Array of {text, type} suggestion objects
 */
export async function generateConversationStartersSidebar(
  contextTabs = [],
  n = 2,
  useInsights = false
) {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Format current tab (first in context or empty)
    const currentTab = contextTabs.length
      ? formatJson({ title: contextTabs[0].title, url: contextTabs[0].url })
      : "No current tab";

    // Format opened tabs
    let openedTabs;
    if (contextTabs.length >= 1) {
      openedTabs =
        contextTabs.length === 1
          ? "Only current tab is open"
          : formatJson(
              contextTabs.slice(1).map(t => ({ title: t.title, url: t.url }))
            );
    } else {
      openedTabs = "No tabs available";
    }

    // Base template
    const base = await renderPrompt(conversationStarterPrompt, {
      current_tab: currentTab,
      open_tabs: openedTabs,
      n: String(n),
      date: today,
    });

    let filled = useInsights
      ? await addInsightsToPrompt(base, useInsights)
      : base;

    const engineInstance = await openAIEngine.build("starter");

    const result = await engineInstance.run({
      messages: [
        {
          role: "system",
          content: "Return only the requested suggestions, one per line.",
        },
        { role: "user", content: filled },
      ],
    });

    const prompts = cleanInferenceOutput(result);

    return prompts.slice(0, n).map(t => ({ text: t, type: "chat" }));
  } catch (e) {
    console.warn(
      "[ConversationSuggestions][sidebar-conversation-starters] failed:",
      e
    );
    return [];
  }
}

/**
 * Generates followup prompt suggestions based on conversation history
 *
 * @param {Array} conversationHistory - Array of chat messages
 * @param {object} currentTab - Current tab object with title, url
 * @param {number} n - Number of suggestions to generate (default 6)
 * @param {boolean} useInsights - Whether to include user insights in prompt (default false)
 * @returns {Promise<Array>} Array of {text, type} suggestion objects
 */
export async function generateFollowupPrompts(
  conversationHistory,
  currentTab,
  n = 2,
  useInsights = false
) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const convo = trimConversation(conversationHistory);
    const currentTabStr =
      currentTab && Object.keys(currentTab).length
        ? formatJson({ title: currentTab.title, url: currentTab.url })
        : "No tab";
    const base = await renderPrompt(conversationFollowupPrompt, {
      current_tab: currentTabStr,
      conversation: formatJson(convo),
      n: String(n),
      date: today,
    });

    let filled = useInsights
      ? await addInsightsToPrompt(base, useInsights)
      : base;

    const engineInstance = await openAIEngine.build("followup");

    const result = await engineInstance.run({
      messages: [
        {
          role: "system",
          content: "Return only the requested suggestions, one per line.",
        },
        { role: "user", content: filled },
      ],
    });

    const prompts = cleanInferenceOutput(result);

    return prompts.slice(0, n).map(t => ({ text: t, type: "chat" }));
  } catch (e) {
    console.warn("[ConversationSuggestions][followup-prompts] failed:", e);
    return [];
  }
}

export const InsightsGetterForSuggestionPrompts = {
  /**
   * Gets the requested number of unique insight summaries for prompt inclusion
   *
   * @param {number} maxInsights - Max number of insights to return (default MAX_NUM_INSIGHTS)
   * @returns {Promise<Array>} Array of string insight summaries
   */

  async getInsightSummariesForPrompt(maxInsights) {
    const insightSummaries = [];
    const insightEntries = (await InsightsManager.getAllInsights()) || {};
    const seenSummaries = new Set();

    for (const { insight_summary } of insightEntries) {
      const summaryText = String(insight_summary ?? "").trim();
      if (!summaryText) {
        continue;
      }
      const lower = summaryText.toLowerCase();
      if (seenSummaries.has(lower)) {
        continue;
      }
      seenSummaries.add(lower);
      insightSummaries.push(summaryText);
      if (insightSummaries.length >= maxInsights) {
        break;
      }
    }

    return insightSummaries;
  },
};
