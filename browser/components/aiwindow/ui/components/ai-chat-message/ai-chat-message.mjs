/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import {
  defaultMarkdownParser,
  DOMSerializer,
} from "chrome://browser/content/multilineeditor/prosemirror.bundle.mjs";

const SERIALIZER = DOMSerializer.fromSchema(defaultMarkdownParser.schema);

// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/ai-chat-search-button.mjs";

/**
 * A custom element for managing AI Chat Content
 */
export class AIChatMessage extends MozLitElement {
  #lastMessage = null;
  #lastMessageElement = "";

  static properties = {
    role: { type: String }, // "user" | "assistant"
    message: { type: String },
  };

  constructor() {
    super();
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener(
      "AIWindow:chat-search",
      this.handleSearchHandoffEvent.bind(this)
    );
  }

  /**
   * Handle search handoff events
   *
   * @param {CustomEvent} event - The custom event containing the search query.
   */
  handleSearchHandoffEvent(event) {
    const e = new CustomEvent("AIChatContent:DispatchSearch", {
      detail: event.detail,
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(e);
  }

  /**
   * Parse markdown content to HTML using ProseMirror
   *
   * @param {string} markdown the Markdown to parse
   * @param {Element} element the element in which to insert the parsed markdown.
   */
  parseMarkdown(markdown, element) {
    const node = defaultMarkdownParser.parse(markdown);
    const fragment = SERIALIZER.serializeFragment(node.content);

    // Convert DocumentFragment to HTML string
    const container = this.ownerDocument.createElement("div");
    container.appendChild(fragment);
    const containerString = container.innerHTML;

    // Sanitize the HTML string by using "setHTML"
    element.setHTML(containerString);
  }

  /**
   * Ensure our message element is up to date. This gets called from
   * render and memoizes based on `this.message` to avoid re-renders.
   *
   * @returns {Element} HTML element containing the parsed markdown
   */
  getAssistantMessage() {
    if (this.message == this.#lastMessage) {
      return this.#lastMessageElement;
    }
    let messageElement = this.ownerDocument.createElement("div");
    messageElement.className = "message-" + this.role;
    if (!this.message) {
      return messageElement;
    }

    this.parseMarkdown(this.message, messageElement);

    this.#lastMessage = this.message;
    this.#lastMessageElement = messageElement;

    return messageElement;
  }

  getUserMessage() {
    return html`<div class=${"message-" + this.role}>
        <!-- TODO: Parse user prompt to add any mentions pills -->
        ${this.message}
      </div>
      <!-- TODO: update props based on assistant response -->
      <ai-chat-search-button
        query="Ada Lovelace"
        label="Ada Lovelace"
      ></ai-chat-search-button>`;
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/ai-chat-message.css"
      />

      <article>
        ${this.role === "user"
          ? this.getUserMessage()
          : this.getAssistantMessage()}
      </article>
    `;
  }
}

customElements.define("ai-chat-message", AIChatMessage);
