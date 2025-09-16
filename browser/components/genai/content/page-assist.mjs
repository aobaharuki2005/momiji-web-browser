/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/sidebar/sidebar-panel-header.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PageAssist: "moz-src:///browser/components/genai/PageAssist.sys.mjs",
  AboutReaderParent: "resource:///actors/AboutReaderParent.sys.mjs",
});

export class PageAssist extends MozLitElement {
  _topWin = null;
  _progressListener = null;
  _onTabSelect = null;
  _onReaderModeChange = null;

  static properties = {
    userPrompt: { type: String },
    aiResponse: { type: String },
    isCurrentPageReaderable: { type: Boolean },
  };

  constructor() {
    super();
    this.userPrompt = "";
    this.aiResponse = "";
    this.isCurrentPageReaderable = true;
  }

  connectedCallback() {
    super.connectedCallback();
    this._topWin = window.browsingContext.topChromeWindow;
    this._attachReaderModeListener();
    this._initURLChange();
  }

  disconnectedCallback() {
    try {
      const gBrowser = this._topWin?.gBrowser;
      if (gBrowser && this._progressListener) {
        gBrowser.removeTabsProgressListener(this._progressListener);
      }
      gBrowser?.tabContainer?.removeEventListener(
        "TabSelect",
        this._onTabSelect
      );
      if (this._onReaderModeChange) {
        lazy.AboutReaderParent.removeMessageListener(
          "Reader:UpdateReaderButton",
          this._onReaderModeChange
        );
      }
    } finally {
      super.disconnectedCallback();
    }
  }

  _attachReaderModeListener() {
    this._onReaderModeChange = {
      receiveMessage: msg => {
        // AboutReaderParent.callListeners sets msg.target = the <browser> element
        const browser = msg?.target;
        const selected = this._topWin?.gBrowser?.selectedBrowser;
        if (!browser || browser !== selected) {
          return; // only care about the active tab
        }
        // AboutReaderParent already set browser.isArticle for this message.
        this.isCurrentPageReaderable = !!browser.isArticle;
      },
    };

    lazy.AboutReaderParent.addMessageListener(
      "Reader:UpdateReaderButton",
      this._onReaderModeChange
    );
  }

  /**
   * Initialize URL change detection
   */
  _initURLChange() {
    const { gBrowser } = this._topWin;

    this._onTabSelect = () => {
      const browser = gBrowser.selectedBrowser;
      this.isCurrentPageReaderable = !!browser?.isArticle;
    };
    gBrowser.tabContainer.addEventListener("TabSelect", this._onTabSelect);

    this._progressListener = {
      onLocationChange: (browser, webProgress) => {
        if (!webProgress?.isTopLevel) {
          return;
        }
        this.isCurrentPageReaderable = !!browser?.isArticle;
      },
    };
    gBrowser.addTabsProgressListener(this._progressListener);

    // Initial check
    this._onTabSelect();
  }

  /**
   * Fetch Page Data
   *
   * @returns {Promise<null|
   * {
   *  url: string,
   *  title: string,
   *  content: string,
   *  textContent: string,
   *  excerpt: string,
   *  isReaderable: boolean
   * }>}
   */
  async _fetchPageData() {
    const { gBrowser } = this._topWin;

    const windowGlobal =
      gBrowser?.selectedBrowser?.browsingContext?.currentWindowGlobal;

    if (!windowGlobal) {
      return null;
    }

    // Get the parent actor instance
    const actor = windowGlobal.getActor("PageAssist");
    return await actor.fetchPageData();
  }

  _handlePromptInput = e => {
    const value = e.target.value;
    this.userPrompt = value;
  };

  _handleSubmit = async () => {
    const pageData = await this._fetchPageData();
    if (!pageData) {
      this.aiResponse = "No page data";
      return;
    }
    const aiResponse = await lazy.PageAssist.fetchAiResponse(
      this.userPrompt,
      pageData
    );
    this.aiResponse = aiResponse ?? "No response";
  };

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/genai/content/page-assist.css"
      />
      <div>
        <sidebar-panel-header
          data-l10n-id="genai-page-assist-sidebar-title"
          data-l10n-attrs="heading"
          view="viewGenaiPageAssistSidebar"
        ></sidebar-panel-header>
        <div class="wrapper">
          ${this.aiResponse
            ? html`<div class="ai-response">${this.aiResponse}</div>`
            : ""}
          <div>
            <textarea
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
      </div>
    `;
  }
}

customElements.define("page-assist", PageAssist);
