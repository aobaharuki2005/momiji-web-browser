/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  openAIEngine,
  renderPrompt,
} from "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs";
import { titleGenerationPrompt } from "moz-src:///browser/components/aiwindow/models/prompts/TitleGenerationPrompts.sys.mjs";

/**
 * Generate a default title from the first four words of a message.
 *
 * @param {string} message - The user's message
 * @returns {string} The default title
 */
function generateDefaultTitle(message) {
  if (!message || typeof message !== "string") {
    return "New Chat";
  }

  const words = message
    .trim()
    .split(/\s+/)
    .filter(word => !!word.length);

  if (words.length === 0) {
    return "New Chat";
  }

  const titleWords = words.slice(0, 4);
  return titleWords.join(" ") + "...";
}

/**
 * Generate a chat title based on the user's message and current tab information.
 *
 * @param {string} message - The user's message
 * @param {object} current_tab - Object containing current tab information
 * @returns {Promise<string>} The generated chat title
 */
export async function generateChatTitle(message, current_tab) {
  try {
    // Build the OpenAI engines
    const engine = await openAIEngine.build();

    const tabInfo = current_tab || { url: "", title: "", description: "" };

    // Render the prompt with actual values
    const systemPrompt = await renderPrompt(titleGenerationPrompt, {
      current_tab: JSON.stringify(tabInfo),
    });

    // Prepare messages for the LLM
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ];

    // Call the LLM
    const response = await engine.run({ messages });

    // Extract the generated title from the response
    const title =
      response?.choices?.[0]?.message?.content?.trim() ||
      generateDefaultTitle(message);

    return title;
  } catch (error) {
    console.error("Failed to generate chat title:", error);
    return generateDefaultTitle(message);
  }
}
