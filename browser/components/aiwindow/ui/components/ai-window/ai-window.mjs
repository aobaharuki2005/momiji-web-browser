/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  Chat: "moz-src:///browser/components/aiwindow/models/Chat.sys.mjs",
});

/**
 * State Management Strategy:
 *
 * - On initialization, this component will call `.renderState()` from ChatStore to hydrate the UI
 * - Currently using temporary local state (`this.conversationState`) that only tracks the current conversation turn
 * - When ChatStore is integrated, rely on it as the source of truth for full conversation history
 * - When calling Chat.sys.mjs to fetch responses, supplement the request with complete history from ChatStore
 */

/**
 * A custom element for managing AI Window
 */
export class AIWindow extends MozLitElement {
  static properties = {
    userPrompt: { type: String },
    conversationState: { type: Array },
  };

  constructor() {
    super();
    this._browser = null;
    this.userPrompt = "";
    this.conversationState = [];
  }

  connectedCallback() {
    super.connectedCallback();
  }

  firstUpdated() {
    // Create a real XUL <browser> element from the chrome document
    const doc = this.ownerDocument; // browser.xhtml
    const browser = doc.createXULElement("browser");

    browser.setAttribute("id", "aichat-browser");
    browser.setAttribute("type", "content");
    browser.setAttribute("maychangeremoteness", "true");
    browser.setAttribute("disableglobalhistory", "true");
    browser.setAttribute("src", "about:aichatcontent");

    const container = this.renderRoot.querySelector("#browser-container");
    container.appendChild(browser);

    this._browser = browser;
  }

  /**
   * Adds a new message to the conversation history.
   *
   * @param {object} chatEntry - A message object to add to the conversation
   * @param {("system"|"user"|"assistant")} chatEntry.role - The role of the message sender
   * @param {string} chatEntry.content - The text content of the message
   */

  // TODO - can remove this method after ChatStore is integrated
  #updateConversationState = chatEntry => {
    this.conversationState = [...this.conversationState, chatEntry];
  };

  /**
   * Fetches an AI response based on the current user prompt.
   * Validates the prompt, updates conversation state, streams the response,
   * and dispatches updates to the browser actor.
   *
   * @private
   */

  #fetchAIResponse = async () => {
    const formattedPrompt = (this.userPrompt || "").trim();
    if (!formattedPrompt) {
      return;
    }

    // Handle User Prompt
    await this.#dispatchMessageToChatContent({
      role: "user",
      content: this.userPrompt,
    });

    // TODO - can remove this call after ChatStore is integrated
    this.#updateConversationState({ role: "user", content: formattedPrompt });
    this.userPrompt = "";

    // Create an empty assistant placeholder.
    // TODO - can remove this call after ChatStore is integrated
    this.#updateConversationState({ role: "assistant", content: "" });
    const latestAssistantMessageIndex = this.conversationState.length - 1;

    let acc = "";
    try {
      // TODO - replace with ChatStore integration IE pass chatstore.getConversationState(this.userPrompt)
      const stream = lazy.Chat.fetchWithHistory(this.conversationState);
      for await (const chunk of stream) {
        acc += chunk;

        // TODO - can remove this after ChatStore is integrated
        this.conversationState[latestAssistantMessageIndex] = {
          ...this.conversationState[latestAssistantMessageIndex],
          content: acc,
        };

        // TODO - can pass chatstore.getLastturnIndex() instead of latestAssistantMessageIndex after ChatStore is integrated
        await this.#dispatchMessageToChatContent({
          role: "assistant",
          content: acc,
          latestAssistantMessageIndex,
        });
        this.requestUpdate?.();
      }
    } catch (e) {
      // TODO - handle error properly
      this.requestUpdate?.();
    }
  };

  /**
   * Retrieves the AIChatContent actor from the browser's window global.
   *
   * @returns {Promise<object|null>} The AIChatContent actor, or null if unavailable.
   * @private
   */

  async #getAIChatContentActor() {
    if (!this._browser) {
      console.warn("AI browser not set, cannot get AIChatContent actor");
      return null;
    }

    const windowGlobal = this._browser.browsingContext?.currentWindowGlobal;

    if (!windowGlobal) {
      console.warn("No window global found for AI browser");
      return null;
    }

    try {
      return windowGlobal.getActor("AIChatContent");
    } catch (error) {
      console.error("Failed to get AIChatContent actor:", error);
      return null;
    }
  }

  /**
   * Dispatches a message to the AIChatContent actor.
   *
   * @param {object} message - message to dispatch to chat content actor
   * @returns
   */

  async #dispatchMessageToChatContent(message) {
    const actor = await this.#getAIChatContentActor();
    return await actor.dispatchMessageToChatContent(message);
  }

  /**
   * Handles input events from the prompt textarea.
   * Updates the userPrompt property with the current input value.
   *
   * @param {Event} e - The input event.
   * @private
   */

  #handlePromptInput = async e => {
    const value = e.target.value;
    this.userPrompt = value;
  };

  /**
   * Handles the submit action for the user prompt.
   * Triggers the AI response fetch process.
   */

  #handleSubmit() {
    this.#fetchAIResponse();
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/ai-window.css"
      />
      <div>
        <div id="browser-container"></div>
        <!-- TODO : Remove place holder submit button, prompt will come from ai-input -->
        <textarea
          .value=${this.userPrompt}
          @input=${e => this.#handlePromptInput(e)}
        ></textarea>
        <moz-button type="primary" size="small" @click=${this.#handleSubmit}>
          Submit mock prompt
        </moz-button>
      </div>
    `;
  }
}

customElements.define("ai-window", AIWindow);
