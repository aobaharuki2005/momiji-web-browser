/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
});

export let UnexpectedScriptObserver = {
  _notificationHasBeenShown: false,

  async onFirstWindowShown() {
    this.observe(null, "UnexpectedJavaScriptLoad-CheckInitialState");
  },

  async observe(aSubject, aTopic, aScriptName) {
    if (
      aTopic != "UnexpectedJavaScriptLoad-Live" &&
      aTopic != "UnexpectedJavaScriptLoad-CheckInitialState"
    ) {
      return;
    }

    if (aTopic == "UnexpectedJavaScriptLoad-CheckInitialState") {
      aScriptName =
        Services.scriptSecurityManager.firstUnexpectedJavaScriptLoad;
      if (!aScriptName) {
        return;
      }
    }

    const NOTIFICATION_VALUE = "unexpected-script-notification";
    if (!lazy.BrowserWindowTracker.getTopWindow()?.gNotificationBox) {
      // We don't have a top window, or we don't have a notification box
      // This happens (and is expected) when the script is loaded very early in startup
      // (like a PAC script).  We handle that situation by checking the value of
      // Services.scriptSecurityManager.getUnexpectedJavaScriptLoad() in browser-init.js
      return;
    }
    if (
      this._notificationHasBeenShown ||
      lazy.BrowserWindowTracker.getTopWindow().gNotificationBox.getNotificationWithValue(
        NOTIFICATION_VALUE
      )
    ) {
      // There is already a notification bar, or we showed one in the past and we
      // won't show it again until browser restart
      return;
    }

    this._notificationHasBeenShown = true;
  },
};
