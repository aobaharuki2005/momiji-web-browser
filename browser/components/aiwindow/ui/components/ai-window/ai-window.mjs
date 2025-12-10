/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

/**
 * A custom element for managing AI Window
 */
export class AIWindow extends MozLitElement {
  static properties = {};

  constructor() {
    super();
    this._browser = null;
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

  async _submitUserPrompt() {
    const mockPrompt = "This is a test prompt, how are you?";

    // Call AI service directly from this instance
    const response = this._fetchAIResponse(mockPrompt);

    // Dispatch directly to our browser's actor
    await this._dispatchAIResponseToBrowser(response);
  }

  _fetchAIResponse(userPrompt) {
    // TODO - Add actual call to LLM service here
    const mockResponse = `this is a response to ${userPrompt}`;
    return mockResponse;
  }

  async _dispatchAIResponseToBrowser(response) {
    if (!this._browser) {
      console.warn("AI browser not set, cannot dispatch response");
      return null;
    }

    const windowGlobal = this._browser.browsingContext?.currentWindowGlobal;

    if (!windowGlobal) {
      console.warn("No window global found for AI browser");
      return null;
    }

    try {
      const actor = windowGlobal.getActor("AIChatContent");
      return await actor.dispatchAIResponse(response);
    } catch (error) {
      console.error("Failed to dispatch AI response:", error);
      return null;
    }
  }

  _handleSubmit() {
    this._submitUserPrompt();
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
        <moz-button type="primary" size="small" @click=${this._handleSubmit}>
          Submit mock prompt
        </moz-button>
      </div>
    `;
  }
}

customElements.define("ai-window", AIWindow);
