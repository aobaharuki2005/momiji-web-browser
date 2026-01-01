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
    conversationState: { type: Array },
  };

  constructor() {
    super();
    this.conversationState = [];
  }

  connectedCallback() {
    super.connectedCallback();
    this.#initEventListeners();
  }

  /**
   * Initialize event listeners for AI chat content events
   */

  #initEventListeners() {
    this.addEventListener(
      "aiChatContentActor:message",
      this.messageEvent.bind(this)
    );
  }

  messageEvent(event) {
    const message = event.detail;
    if (message.role === "assistant") {
      this.handleAIResponseEvent(event);
      return;
    }
    this.handleUserPromptEvent(event);
  }

  /**
   *  Handle user prompt events
   *
   * @param {CustomeEvent} event - The custom event containing the user prompt
   */

  handleUserPromptEvent(event) {
    const { content } = event.detail;

    this.conversationState.push({ role: "user", content });

    this.requestUpdate();
  }

  /**
   * Handle AI response events
   *
   * @param {CustomEvent} event - The custom event containing the response
   */

  handleAIResponseEvent(event) {
    const { ordinal } = event.detail;

    this.conversationState[ordinal] = event.detail;

    this.requestUpdate();
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/ai-chat-content.css"
      />
      <div class="chat-content-wrapper">
        ${this.conversationState.map(msg => {
          return html`<ai-chat-message
            .message=${msg.content.body}
            .role=${msg.role}
          ></ai-chat-message>`;
        })}
      </div>
    `;
  }
}

customElements.define("ai-chat-content", AIChatContent);
