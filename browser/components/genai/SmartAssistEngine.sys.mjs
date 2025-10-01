/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { createEngine } from "chrome://global/content/ml/EngineProcess.sys.mjs";

/**
 * Smart Assist Engine
 */
export const SmartAssistEngine = {
  /**
   * Exposing createEngine for testing purposes.
   */

  _createEngine: createEngine,

  /**
   * Creates an OpenAI engine instance configured with Smart Assists preferences.
   *
   * @returns {Promise<object>} The configured engine instance
   */

  async createOpenAIEngine() {
    try {
      const engineInstance = await this._createEngine({
        apiKey: Services.prefs.getStringPref("browser.ml.smartAssist.apiKey"),
        backend: "openai",
        baseURL: Services.prefs.getStringPref(
          "browser.ml.smartAssist.endpoint"
        ),
        modelId: Services.prefs.getStringPref("browser.ml.smartAssist.model"),
        modelRevision: "main",
        taskName: "text-generation",
      });

      return engineInstance;
    } catch (error) {
      console.error("Failed to create OpenAI engine:", error);

      throw error;
    }
  },

  /**
   * Fetches a response from the OpenAI engine with message history.
   *
   * @param {Array} messages - Array of message objects with role and content
   * @returns {string} AI response
   */

  async *fetchWithHistory(messages) {
    const engineInstance = await this.createOpenAIEngine();
    // Use runWithGenerator to get streaming chunks directly
    for await (const chunk of engineInstance.runWithGenerator({
      streamOptions: { enabled: true },
      args: messages,
    })) {
      if (chunk.text) {
        yield chunk.text;
      }
    }
  },
};
