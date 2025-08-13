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

    let scriptOrigin;
    try {
      let scriptUrl = new URL(aScriptName);
      scriptOrigin = scriptUrl.hostname;

      if (scriptUrl.protocol != "http:" && scriptUrl.protocol != "https:") {
        // For this dialog, we only care about loading scripts from web origins
        return;
      }
    } catch (e) {
      console.error("Invalid scriptName URL:", aScriptName);
      // For this dialog, we only care about loading scripts from web origins,
      // so if we couldn't parse it, just exit.
      return;
    }

    let window = lazy.BrowserWindowTracker.getTopWindow();
    let MozXULElement = window.MozXULElement;
    let document = window.document;
    let notificationBox = window.gNotificationBox;

    MozXULElement.insertFTLIfNeeded("browser/unexpectedScript.ftl");
    let messageFragment = document.createDocumentFragment();
    let message = document.createElement("span");
    document.l10n.setAttributes(message, "unexpected-script-load-message", {
      origin: scriptOrigin,
    });
    messageFragment.appendChild(message);

    let buttons = [{ supportPage: "unexpected-script-load" }];
    buttons.push({
      "l10n-id": "unexpected-script-load-message-button-allow",
      callback() {
        window.gDialogBox.open(
          "chrome://browser/content/security/unexpectedScriptLoad.xhtml"
        );
        return true; // Do not close the dialog bar until the user has done so explcitly or taken an action
      },
    });
    buttons.push({
      "l10n-id": "unexpected-script-load-message-button-block",
      callback() {},
    });

    await notificationBox.appendNotification(
      NOTIFICATION_VALUE,
      {
        label: messageFragment,
        priority: notificationBox.PRIORITY_WARNING_HIGH,
      },
      buttons
    );

    this._notificationHasBeenShown = true;
  },
};
