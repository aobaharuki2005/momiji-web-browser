/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  IPProtectionService:
    "resource:///modules/ipprotection/IPProtectionService.sys.mjs",
});

/**
 * Manages updates for a IP Protection panelView in a given browser window.
 */
export class IPProtectionPanel {
  static CONTENT_TAGNAME = "ipprotection-content";
  static CUSTOM_ELEMENTS_SCRIPT =
    "chrome://browser/content/ipprotection/ipprotection-customelements.js";

  static PANEL_ID = "PanelUI-ipprotection";
  static TITLE_L10N_ID = "ipprotection-title";

  // TODO: this is temporary URL. Update it once finalized (Bug 1972462).
  static HELP_PAGE_URL =
    "https://support.mozilla.org/en-US/products/firefox-private-network-vpn";
  /**
   * Loads the ipprotection custom element script
   * into a given window.
   *
   * Called on IPProtection.init for a new browser window.
   *
   * @param {Window} window
   */
  static loadCustomElements(window) {
    Services.scriptloader.loadSubScriptWithOptions(
      IPProtectionPanel.CUSTOM_ELEMENTS_SCRIPT,
      {
        target: window,
        async: true,
      }
    );
  }

  /**
   * @typedef {object} State
   * @property {boolean} isProtectionEnabled
   *  True if IP Protection via the proxy is enabled
   * @property {Date} protectionEnabledSince
   *  The timestamp in milliseconds since IP Protection was enabled
   * @property {boolean} isSignedIn
   *  True if signed in to account
   * @property {string} location
   *  The name of the location the proxy is connected to
   */

  /**
   * @type {State}
   */
  state = {};
  panel = null;

  /**
   * Check the state of the enclosing panel to see if
   * it is active (open or showing).
   */
  get active() {
    let panelParent = this.panel?.closest("panel");
    if (!panelParent) {
      return false;
    }
    return panelParent.state == "open" || panelParent.state == "showing";
  }

  /**
   * Creates an instance of IPProtectionPanel for a specific browser window.
   *
   * Inserts the panel component customElements registry script.
   *
   * @param {Window} window
   *   Window containing the panelView to manage.
   */
  constructor(window) {
    this.handleEvent = this.#handleEvent.bind(this);

    let {
      isSignedIn,
      isActive: isProtectionEnabled,
      activatedAt: protectionEnabledSince,
    } = lazy.IPProtectionService;

    this.state = {
      isSignedIn,
      isProtectionEnabled,
      protectionEnabledSince,
      location: "United States",
    };

    if (window) {
      IPProtectionPanel.loadCustomElements(window);
    }

    this.#addProxyListeners();
  }

  /**
   * Set the state for this panel.
   *
   * Updates the current panel component state,
   * if the panel is currently active (showing or not hiding).
   *
   * @example
   * panel.setState({
   *  isSomething: true,
   * });
   *
   * @param {object} state
   *    The state object from IPProtectionPanel.
   */
  setState(state) {
    Object.assign(this.state, state);

    if (this.active) {
      this.updateState();
    }
  }

  /**
   * Updates the state of the panel component.
   *
   * @param {object} state
   *   The state object from IPProtectionPanel.
   * @param {Element} panelEl
   *   The panelEl element to update the state on.
   */
  updateState(state = this.state, panelEl = this.panel) {
    if (!panelEl?.isConnected || !panelEl.state) {
      return;
    }

    panelEl.state = state;
    panelEl.requestUpdate();
  }

  #startProxy() {
    lazy.IPProtectionService.start();
  }

  #stopProxy() {
    lazy.IPProtectionService.stop();
  }

  showHelpPage() {
    let win = this.panel.ownerGlobal;
    if (win && !Cu.isInAutomation) {
      win.openWebLinkIn(IPProtectionPanel.HELP_PAGE_URL, "tab");
      this.close();
    }
  }

  /**
   * Updates the visibility of the panel components before they will shown.
   *
   * - If the panel component has already been created, updates the state.
   * - Creates a panel component if need, state will be updated on once it has
   *   been connected.
   *
   * @param {XULElement} panelView
   *   The panelView element from the CustomizableUI widget callback.
   */
  showing(panelView) {
    if (this.panel) {
      this.updateState();
    } else {
      this.#createPanel(panelView);
    }
  }

  /**
   * Called when the panel elements will be hidden.
   *
   * Disables updates to the panel.
   */
  hiding() {
    this.destroy();
  }

  /**
   * Creates a panel component in a panelView.
   *
   * @param {XULBrowserElement} panelView
   */
  #createPanel(panelView) {
    let { ownerDocument } = panelView;

    let contentEl = ownerDocument.createElement(
      IPProtectionPanel.CONTENT_TAGNAME
    );
    this.panel = contentEl;

    contentEl.dataset.capturesFocus = "true";

    this.#addPanelListeners(ownerDocument);

    panelView.appendChild(contentEl);
  }

  /**
   * Close the containing panel popup.
   */
  close() {
    let panelParent = this.panel?.closest("panel");
    if (!panelParent) {
      return;
    }
    panelParent.hidePopup();
  }

  /**
   * Remove added elements and listeners.
   */
  destroy() {
    if (this.panel) {
      this.panel.remove();
      this.#removePanelListeners(this.panel.ownerDocument);
      this.panel = null;
    }
  }

  uninit() {
    this.destroy();
    this.#removeProxyListeners();
  }

  #addPanelListeners(doc) {
    doc.addEventListener("IPProtection:Init", this.handleEvent);
    doc.addEventListener("IPProtection:Close", this.handleEvent);
    doc.addEventListener("IPProtection:UserEnable", this.handleEvent);
    doc.addEventListener("IPProtection:UserDisable", this.handleEvent);
    doc.addEventListener("IPProtection:ShowHelpPage", this.handleEvent);
  }

  #removePanelListeners(doc) {
    doc.removeEventListener("IPProtection:Init", this.handleEvent);
    doc.removeEventListener("IPProtection:Close", this.handleEvent);
    doc.removeEventListener("IPProtection:UserEnable", this.handleEvent);
    doc.removeEventListener("IPProtection:UserDisable", this.handleEvent);
    doc.removeEventListener("IPProtection:ShowHelpPage", this.handleEvent);
  }

  #addProxyListeners() {
    lazy.IPProtectionService.addEventListener(
      "IPProtectionService:SignedIn",
      this.handleEvent
    );
    lazy.IPProtectionService.addEventListener(
      "IPProtectionService:SignedOut",
      this.handleEvent
    );
    lazy.IPProtectionService.addEventListener(
      "IPProtectionService:Started",
      this.handleEvent
    );
    lazy.IPProtectionService.addEventListener(
      "IPProtectionService:Stopped",
      this.handleEvent
    );
  }

  #removeProxyListeners() {
    lazy.IPProtectionService.removeEventListener(
      "IPProtectionService:SignedIn",
      this.handleEvent
    );
    lazy.IPProtectionService.removeEventListener(
      "IPProtectionService:SignedOut",
      this.handleEvent
    );
    lazy.IPProtectionService.removeEventListener(
      "IPProtectionService:Started",
      this.handleEvent
    );
    lazy.IPProtectionService.removeEventListener(
      "IPProtectionService:Stopped",
      this.handleEvent
    );
  }

  #handleEvent(event) {
    if (event.type == "IPProtection:Init") {
      this.updateState();
    } else if (event.type == "IPProtection:Close") {
      this.close();
    } else if (event.type == "IPProtection:UserEnable") {
      this.#startProxy();
    } else if (event.type == "IPProtection:UserDisable") {
      this.#stopProxy();
    } else if (event.type == "IPProtection:ShowHelpPage") {
      this.showHelpPage();
    } else if (event.type == "IPProtectionService:SignedIn") {
      this.setState({
        isSignedIn: true,
      });
    } else if (event.type == "IPProtectionService:SignedOut") {
      this.setState({
        isSignedIn: false,
      });
    } else if (event.type == "IPProtectionService:Started") {
      this.setState({
        isProtectionEnabled: true,
        protectionEnabledSince: event.detail?.activatedAt,
      });
    } else if (event.type == "IPProtectionService:Stopped") {
      this.setState({
        isProtectionEnabled: false,
        protectionEnabledSince: null,
      });
    }
  }
}
