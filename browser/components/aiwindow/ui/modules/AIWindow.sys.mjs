/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const AIWINDOW_URL = "chrome://browser/content/aiwindow/aiWindow.html";
const AIWINDOW_URI = Services.io.newURI(AIWINDOW_URL);

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ChatStore:
    "moz-src:///browser/components/aiwindow/ui/modules/ChatStore.sys.mjs",

  AIWindowMenu:
    "moz-src:///browser/components/aiwindow/ui/modules/AIWindowMenu.sys.mjs",
});

/**
 * AI Window Service
 */

export const AIWindow = {
  _initialized: false,
  _windowStates: new Map(),
  _aiWindowMenu: null,

  /**
   * Handles startup tasks
   */

  init(win) {
    if (this._initialized) {
      return;
    }

    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "AIWindowEnabled",
      "browser.aiwindow.enabled",
      false
    );

    ChromeUtils.defineLazyGetter(this, "chatStore", () => new lazy.ChatStore());

    this._initialized = true;
    this._windowStates.set(win, {});
  },

  /**
   * Sets options for new AI Window if new or inherited conditions are met
   *
   * @param {object} options Used in BrowserWindowTracker.openWindow
   * @param {object} options.openerWindow Window making the BrowserWindowTracker.openWindow call
   * @param {object} options.args Array of arguments to pass to new window
   * @param {boolean} [options.aiWindow] Should new window be AI Window (true), Classic Window (false), or inherited from opener (undefined, default)
   * @param {boolean} [options.private] Should new window be Private Window
   * @param {boolean} [options.restoreSession] Should previous AI Window session be restored
   *
   * @returns {object} Modified arguments appended to the options object
   */
  handleAIWindowOptions({
    openerWindow,
    args,
    aiWindow = undefined,
    private: isPrivate = false,
    restoreSession = false,
  } = {}) {
    // Indicates whether the new window should inherit AI Window state from opener window
    const canInheritAIWindow =
      this.isAIWindowActiveAndEnabled(openerWindow) &&
      !isPrivate &&
      typeof aiWindow === "undefined";

    const willOpenAIWindow =
      (aiWindow && this.isAIWindowEnabled()) || canInheritAIWindow;

    if (!willOpenAIWindow) {
      return args;
    }

    args ??= Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);

    if (!args.length) {
      const aiWindowURI = Cc["@mozilla.org/supports-string;1"].createInstance(
        Ci.nsISupportsString
      );
      aiWindowURI.data = restoreSession ? "" : AIWINDOW_URL;
      args.appendElement(aiWindowURI);

      const aiOption = Cc["@mozilla.org/hash-property-bag;1"].createInstance(
        Ci.nsIWritablePropertyBag2
      );
      aiOption.setPropertyAsBool("ai-window", aiWindow);
      args.appendElement(aiOption);
    }

    return args;
  },

  /**
   * Is current window an AI Window
   *
   * @param {Window} win current Window
   * @returns {boolean} whether current Window is an AI Window
   */
  isAIWindowActive(win) {
    return !!win && win.document.documentElement.hasAttribute("ai-window");
  },

  /**
   * Is AI Window enabled
   *
   * @returns {boolean} whether AI Window is enabled
   */
  isAIWindowEnabled() {
    return this.AIWindowEnabled;
  },

  isAIWindowActiveAndEnabled(win) {
    return this.isAIWindowActive(win) && this.AIWindowEnabled;
  },

  /**
   * Check if window is being opened as an AI Window.
   *
   * @param {Window} win - The window to check
   * @returns {boolean} whether the window is being opened as an AI Window
   */
  isOpeningAIWindow(win) {
    const windowArgs = win?.arguments?.[1];
    if (!(windowArgs instanceof Ci.nsIPropertyBag2)) {
      return false;
    }

    return windowArgs.hasKey("ai-window");
  },

  /**
   * Is AI Window content page active
   *
   * @param {nsIURI} uri current URI
   * @returns {boolean} whether AI Window content page is active
   */
  isAIWindowContentPage(uri) {
    return AIWINDOW_URI.equalsExceptRef(uri);
  },

  /**
   * Adds the AI Window app menu options
   *
   * @param {Event} event - History menu click event
   * @param {Window} win - current Window reference
   *
   * @returns {Promise} - Resolves when menu is done being added
   */
  appMenu(event, win) {
    if (!this._aiWindowMenu) {
      this._aiWindowMenu = new lazy.AIWindowMenu();
    }

    return this._aiWindowMenu.addMenuitems(event, win);
  },

  get newTabURL() {
    return AIWINDOW_URL;
  },
};
