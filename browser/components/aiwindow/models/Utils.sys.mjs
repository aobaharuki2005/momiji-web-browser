/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * This module defines utility functions and classes needed for invoking LLMs such as:
 * - Creating and running OpenAI engine instances
 * - Rendering prompts from files
 */

import { createEngine } from "chrome://global/content/ml/EngineProcess.sys.mjs";
import { getFxAccountsSingleton } from "resource://gre/modules/FxAccounts.sys.mjs";
import {
  OAUTH_CLIENT_ID,
  SCOPE_PROFILE,
} from "resource://gre/modules/FxAccountsCommon.sys.mjs";

/**
 * openAIEngine class
 *
 * Contains methods to create engine instances and estimate token usage.
 */
export class openAIEngine {
  /**
   * Exposing createEngine for testing purposes.
   */
  static _createEngine = createEngine;

  /**
   * Returns an OpenAIEngine instance with the specified engine and service types
   *
   * @param {string} engineId     The identifier for the engine instance
   * @param {string} serviceType  The type of message to be sent ("ai", "memories", "s2s")
   * @returns {Promise<openAIEngine>}  The OpenAIEngine instance
   */
  static async build(engineId = "smart-openai", serviceType = "ai") {
    const engine = new openAIEngine();
    engine.engineInstance = await openAIEngine.#createOpenAIEngine(
      engineId,
      serviceType
    );
    return engine;
  }

  /**
   * Retrieves the Firefox account token
   *
   * @returns {Promise<string|null>}   The Firefox account token (string) or null
   */
  static async getFxAccountToken() {
    try {
      const fxAccounts = getFxAccountsSingleton();
      return await fxAccounts.getOAuthToken({
        // Scope needs to be updated in accordance with https://bugzilla.mozilla.org/show_bug.cgi?id=2005290
        scope: SCOPE_PROFILE,
        client_id: OAUTH_CLIENT_ID,
      });
    } catch (error) {
      console.warn("Error obtaining FxA token:", error);
      return null;
    }
  }

  /**
   * Creates an OpenAI engine instance
   *
   * @param {string} engineId     The identifier for the engine instance
   * @param {string} serviceType  The type of message to be sent ("ai", "memories", "s2s")
   * @returns {Promise<object>}   The configured engine instance
   */
  static async #createOpenAIEngine(engineId, serviceType) {
    const extraHeadersPref = Services.prefs.getStringPref(
      "browser.aiwindow.extraHeaders",
      "{}"
    );
    let extraHeaders = {};
    try {
      extraHeaders = JSON.parse(extraHeadersPref);
    } catch (e) {
      console.error("Failed to parse extra headers from prefs:", e);
      Services.prefs.clearUserPref("browser.aiwindow.extraHeaders");
    }

    try {
      const engineInstance = await openAIEngine._createEngine({
        apiKey: Services.prefs.getStringPref("browser.aiwindow.apiKey"),
        backend: "openai",
        baseURL: Services.prefs.getStringPref("browser.aiwindow.endpoint"),
        engineId,
        modelId: Services.prefs.getStringPref("browser.aiwindow.model"),
        modelRevision: "main",
        taskName: "text-generation",
        serviceType,
        extraHeaders,
      });
      return engineInstance;
    } catch (error) {
      console.error("Failed to create OpenAI engine:", error);
      throw error;
    }
  }

  /**
   * Wrapper around engine.run to send message to the LLM
   * Will eventually use `usage` from the LiteLLM API response for token telemetry
   *
   * @param {Map<string, any>} content  OpenAI formatted messages to be sent to the LLM
   * @returns {object}                  LLM response
   */
  async run(content) {
    return await this.engineInstance.run(content);
  }

  /**
   * Wrapper around engine.runWithGenerator to send message to the LLM
   * Will eventually use `usage` from the LiteLLM API response for token telemetry
   *
   * @param {Map<string, any>} options  OpenAI formatted messages with streaming and tooling options to be sent to the LLM
   * @returns {object}                  LLM response
   */
  runWithGenerator(options) {
    return this.engineInstance.runWithGenerator(options);
  }
}

/**
 * Renders a prompt from a string, replacing placeholders with provided strings.
 *
 * @param {string} rawPromptContent               The raw prompt as a string
 * @param {Map<string, string>} stringsToReplace  A map of placeholder strings to their replacements
 * @returns {Promise<string>}                     The rendered prompt
 */
export async function renderPrompt(rawPromptContent, stringsToReplace = {}) {
  let finalPromptContent = rawPromptContent;

  for (const [orig, repl] of Object.entries(stringsToReplace)) {
    const regex = new RegExp(`{${orig}}`, "g");
    finalPromptContent = finalPromptContent.replace(regex, repl);
  }

  return finalPromptContent;
}
