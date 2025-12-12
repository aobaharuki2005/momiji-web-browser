/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
  TabNotes: "moz-src:///browser/components/tabnotes/TabNotes.sys.mjs",
});
ChromeUtils.defineLazyGetter(lazy, "logConsole", function () {
  return console.createInstance({
    prefix: "TabNotes",
    maxLogLevel: Services.prefs.getBoolPref("browser.tabs.notes.debug", false)
      ? "Debug"
      : "Warn",
  });
});
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "TAB_NOTES_ENABLED",
  "browser.tabs.notes.enabled",
  false
);

const EVENTS = [
  "CanonicalURL:Identified",
  "TabNote:Created",
  "TabNote:Edited",
  "TabNote:Removed",
];

/**
 * Orchestrates the tab notes life cycle.
 *
 * Singleton class within Firefox that observes tab notes-related topics,
 * listens for tab notes-related events, and ensures that the state of the
 * tabbrowser stays in sync with the TabNotes repository.
 *
 * Registers with the category manager in order to initialize on Firefox
 * startup and be notified when windows are opened/closed.
 *
 * @see https://firefox-source-docs.mozilla.org/browser/CategoryManagerIndirection.html
 */
class TabNotesControllerClass {
  /**
   * Registered with `browser-first-window-ready` to be notified of
   * app startup.
   *
   * @see tabnotes.manifest
   */
  init() {
    if (lazy.TAB_NOTES_ENABLED) {
      lazy.TabNotes.init();
    } else {
      lazy.logConsole.info("Tab notes disabled");
    }
  }

  /**
   * Registered with `browser-window-delayed-startup` to be notified of new
   * windows.
   *
   * @param {Window} win
   * @see tabnotes.manifest
   */
  registerWindow(win) {
    if (lazy.TAB_NOTES_ENABLED) {
      EVENTS.forEach(eventName => win.addEventListener(eventName, this));
      win.gBrowser.addTabsProgressListener(this);
      lazy.logConsole.debug("registerWindow", EVENTS, win);
    }
  }

  /**
   * Registered with `browser-window-unload` to be notified of unloaded windows.
   *
   * @param {Window} win
   * @see tabnotes.manifest
   */
  unregisterWindow(win) {
    if (lazy.TAB_NOTES_ENABLED) {
      EVENTS.forEach(eventName => win.removeEventListener(eventName, this));
      win.gBrowser.removeTabsProgressListener(this);
      lazy.logConsole.debug("unregisterWindow", EVENTS, win);
    }
  }

  /**
   * Registered with `browser-quit-application-granted` to be notified of
   * app shutdown.
   *
   * @see tabnotes.manifest
   */
  quit() {
    if (lazy.TAB_NOTES_ENABLED) {
      lazy.TabNotes.deinit();
    }
  }

  /**
   * @param {CanonicalURLIdentifiedEvent|TabNoteCreatedEvent|TabNoteRemovedEvent} event
   */
  handleEvent(event) {
    switch (event.type) {
      case "CanonicalURL:Identified":
        {
          // A browser identified its canonical URL, so we can determine whether
          // the tab has an associated note and should therefore display a tab
          // notes icon.
          const browser = event.target;
          const { canonicalUrl } = event.detail;
          const gBrowser = browser.getTabBrowser();
          const tab = gBrowser.getTabForBrowser(browser);
          tab.canonicalUrl = canonicalUrl;
          lazy.TabNotes.has(tab).then(hasTabNote => {
            tab.hasTabNote = hasTabNote;
          });

          lazy.logConsole.debug("CanonicalURL:Identified", tab, canonicalUrl);
        }
        break;
      case "TabNote:Created":
        {
          // A new tab note was created for a specific canonical URL. Ensure that
          // all tabs with the same canonical URL also indicate that there is a
          // tab note.
          const { canonicalUrl } = event.target;
          for (const win of lazy.BrowserWindowTracker.orderedWindows) {
            for (const tab of win.gBrowser.tabs) {
              if (tab.canonicalUrl == canonicalUrl) {
                tab.hasTabNote = true;
              }
            }
          }
          lazy.logConsole.debug("TabNote:Created", canonicalUrl);
        }
        break;
      case "TabNote:Removed":
        {
          // A new tab note was removed from a specific canonical URL. Ensure that
          // all tabs with the same canonical URL also indicate that there is no
          // longer a tab note.
          const { canonicalUrl } = event.target;
          for (const win of lazy.BrowserWindowTracker.orderedWindows) {
            for (const tab of win.gBrowser.tabs) {
              if (tab.canonicalUrl == canonicalUrl) {
                tab.hasTabNote = false;
              }
            }
          }
          lazy.logConsole.debug("TabNote:Removed", canonicalUrl);
        }
        break;
    }
  }

  /**
   * Invoked by Tabbrowser after we register with `Tabbrowser.addProgressListener`.
   *
   * Clears the tab note icon and canonical URL from a tab when navigation starts
   * within a tab.
   *
   * The CanonicalURL actor running in this tab's browser will report the canonical
   * URL of the new destination in the browser, which will determine whether the
   * new destination has an associated tab note.
   *
   * @type {TabbrowserWebProgressListener<"onLocationChange">}
   */
  onLocationChange(aBrowser, aWebProgress, aRequest, aLocation, aFlags) {
    // Tab notes only apply to the top-level frames loaded in tabs.
    if (!aWebProgress.isTopLevel) {
      return;
    }
    // If we're still on the same page, the tab note indicator does not need to change.
    if (aFlags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT) {
      return;
    }

    const tab = aBrowser.ownerGlobal.gBrowser.getTabForBrowser(aBrowser);
    tab.canonicalUrl = undefined;
    tab.hasTabNote = false;
    lazy.logConsole.debug("clear tab note due to location change", tab);
  }
}

export const TabNotesController = new TabNotesControllerClass();
