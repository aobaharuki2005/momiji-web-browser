/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

/**
 * A custom element for managing AI Chat Content
 */
export class AIChatMessage extends MozLitElement {
  /**
   * @member {object} message - {role:"user"|"assistant" , content: string}
   */

  static properties = {
    message: { type: Object },
  };

  constructor() {
    super();
  }

  connectedCallback() {
    super.connectedCallback();
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/ai-chat-message.css"
      />

      <article>
        <div class=${"message-" + this.message.role}>
          <!-- TODO: Add markdown parsing here -->
          ${this.message.content}
        </div>
      </article>
    `;
  }
}

customElements.define("ai-chat-message", AIChatMessage);
