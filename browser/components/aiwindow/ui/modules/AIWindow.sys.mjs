/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

/**
 * AI Window Service
 */

export const AIWindow = {
  _initialized: false,
  _windowStates: new Map(),

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

    this._initialized = true;
    this._windowStates.set(win, {});
  },

  /**
   * Sets options for new AI Window if new or inherited conditions are met
   *
   * @param {object} options Used in BrowserWindowTracker.openWindow
   * @param {object} options.openerWindow Window making the BrowserWindowTracker.openWindow call
   * @param {object} options.args Array of arguments to pass to new window
   * @param {boolean} options.aiWindow Should new window be AI Window
   * @param {boolean} options.private Should new window be Private Window
   *
   * @returns {object} Modified arguments appended to the options object
   */
  handleAIWindowOptions({
    openerWindow,
    args,
    aiWindow,
    private: isPrivate,
  } = {}) {
    // Indicates whether the new window should inherit AI Window state from opener window
    const canInheritAIWindow =
      this.isAIWindowEnabled() &&
      this.isAIWindowActive(openerWindow) &&
      !isPrivate &&
      !aiWindow;

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
      aiWindowURI.data = "chrome://browser/content/aiwindow/aiWindow.html";
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
   * @param {object} win current Window
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
};
