/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

/**
 * A custom element for managing AI Chat Content
 */
export class AIChatContent extends MozLitElement {
  static properties = {
    messages: { type: Array },
  };

  constructor() {
    super();
    this.messages = [];
  }

  connectedCallback() {
    super.connectedCallback();

    // Listen for ai-response events as fallback
    this.addEventListener("ai-response", this.handleAIResponseEvent.bind(this));
  }

  /**
   * Add an AI response to the chat
   *
   * @param {string} response - The AI response text
   */
  addAIResponse(response) {
    this.messages = [...this.messages, { type: "ai", content: response }];
    this.requestUpdate();
  }

  /**
   * Handle AI response events
   *
   * @param {CustomEvent} event - The custom event containing the response
   */
  handleAIResponseEvent(event) {
    console.warn("Received AI response event:", event);
    // TODO - Use Markdown to render rich text responses
    this.addAIResponse(event.detail);
  }

  render() {
    return html`
      <div>
        <div>
          ${this.messages.map(
            (message, index) => html`
              <div key=${index}>
                <strong>${message.type === "ai" ? "AI" : "User"}:</strong>
                ${message.content}
              </div>
            `
          )}
          ${this.messages.length === 0
            ? html`<div>Chat will appear here...</div>`
            : ""}
        </div>
      </div>
    `;
  }
}

customElements.define("ai-chat-content", AIChatContent);
