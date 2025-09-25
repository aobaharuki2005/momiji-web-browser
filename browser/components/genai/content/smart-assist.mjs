/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/sidebar/sidebar-panel-header.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  SmartAssistEngine:
    "moz-src:///browser/components/genai/SmartAssistEngine.sys.mjs",
});

export class SmartAssist extends MozLitElement {
  static properties = {
    userPrompt: { type: String },
    aiResponse: { type: String },
    conversationState: { type: Array },
  };

  constructor() {
    super();
    this.userPrompt = "";
    // TODO the conversation state will evenually need to be stored in a "higher" location
    // then just the state of this lit component. This is a Stub to get the convo started for now
    this.conversationState = [
      { role: "system", content: "You are a helpful assistant" },
    ];
  }

  connectedCallback() {
    super.connectedCallback();
  }

  /**
   * Adds a new message to the conversation history.
   *
   * @param {object} chatEntry - A message object to add to the conversation
   * @param {("system"|"user"|"assistant")} chatEntry.role - The role of the message sender
   * @param {string} chatEntry.content - The text content of the message
   */
  _updateConversationState = chatEntry => {
    this.conversationState = [...this.conversationState, chatEntry];
  };

  _handlePromptInput = e => {
    const value = e.target.value;
    this.userPrompt = value;
  };

  _handleSubmit = async () => {
    this._updateConversationState({ role: "user", content: this.userPrompt });
    const resp = await lazy.SmartAssistEngine.fetchWithHistory(
      this.conversationState
    );
    this.userPrompt = "";
    this._updateConversationState({ role: "assistant", content: resp });
  };

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/genai/content/smart-assist.css"
      />
      <div>
        <sidebar-panel-header
          data-l10n-id="genai-smart-assist-sidebar-title"
          data-l10n-attrs="heading"
          view="viewGenaiSmartAssistSidebar"
        ></sidebar-panel-header>
        <div class="wrapper">
          <div>
            ${this.conversationState
              .filter(msg => msg.role !== "system")
              .map(
                msg =>
                  html`<div class="message ${msg.role}">
                    <strong>${msg.role}:</strong> ${msg.content}
                  </div>`
              )}
          </div>
          <textarea
            .value=${this.userPrompt}
            class="prompt-textarea"
            @input=${e => this._handlePromptInput(e)}
          ></textarea>
          <moz-button
            id="submit-user-prompt-btn"
            type="primary"
            size="small"
            @click=${this._handleSubmit}
          >
            Submit
          </moz-button>
        </div>
      </div>
    `;
  }
}

customElements.define("smart-assist", SmartAssist);
