/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AsyncSetting } from "chrome://global/content/preferences/AsyncSetting.mjs";
import { Preference } from "chrome://global/content/preferences/Preference.mjs";
import { Setting } from "chrome://global/content/preferences/Setting.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  DeferredTask: "resource://gre/modules/DeferredTask.sys.mjs",
});

const domContentLoadedPromise = new Promise(resolve => {
  window.addEventListener("DOMContentLoaded", resolve, {
    capture: true,
    once: true,
  });
});

export const Preferences = {
  _all: {},
  _settings: new Map(),

  _add(prefInfo) {
    if (this._all[prefInfo.id]) {
      throw new Error(`preference with id '${prefInfo.id}' already added`);
    }
    const pref = new Preference(prefInfo);
    this._all[pref.id] = pref;
    domContentLoadedPromise.then(() => {
      if (!this.updateQueued) {
        pref.updateElements();
      }
    });
    return pref;
  },

  add(prefInfo) {
    const pref = this._add(prefInfo);
    return pref;
  },

  addAll(prefInfos) {
    prefInfos.map(prefInfo => this._add(prefInfo));
  },

  get(id) {
    return this._all[id] || null;
  },

  getAll() {
    return Object.values(this._all);
  },

  addSetting(settingConfig) {
    this._settings.set(
      settingConfig.id,
      new Setting(settingConfig.id, settingConfig)
    );
  },

  getSetting(settingId) {
    return this._settings.get(settingId);
  },

  defaultBranch: Services.prefs.getDefaultBranch(""),

  get type() {
    return document.documentElement.getAttribute("type") || "";
  },

  get instantApply() {
    // The about:preferences page forces instantApply.
    // TODO: Remove forceEnableInstantApply in favor of always applying in a
    // parent and never applying in a child (bug 1775386).
    if (this._instantApplyForceEnabled) {
      return true;
    }

    // Dialogs of type="child" are never instantApply.
    return this.type !== "child";
  },

  _instantApplyForceEnabled: false,

  // Override the computed value of instantApply for this window.
  forceEnableInstantApply() {
    this._instantApplyForceEnabled = true;
  },

  observe(subject, topic, data) {
    const pref = this._all[data];
    if (pref) {
      pref.value = pref.valueFromPreferences;
    }
  },

  updateQueued: false,

  queueUpdateOfAllElements() {
    if (this.updateQueued) {
      return;
    }

    this.updateQueued = true;

    Services.tm.dispatchToMainThread(() => {
      let startTime = ChromeUtils.now();

      const elements = document.querySelectorAll("[preference]");
      for (const element of elements) {
        const id = element.getAttribute("preference");
        let preference = this.get(id);
        if (!preference) {
          console.error(`Missing preference for ID ${id}`);
          continue;
        }

        preference.setElementValue(element);
      }

      ChromeUtils.addProfilerMarker(
        "Preferences",
        { startTime },
        `updateAllElements: ${elements.length} preferences updated`
      );

      this.updateQueued = false;
    });
  },

  onUnload() {
    this._settings.forEach(setting => setting?.destroy?.());
    Services.prefs.removeObserver("", this);
  },

  QueryInterface: ChromeUtils.generateQI(["nsITimerCallback", "nsIObserver"]),

  _deferredValueUpdateElements: new Set(),

  writePreferences(aFlushToDisk) {
    // Write all values to preferences.
    if (this._deferredValueUpdateElements.size) {
      this._finalizeDeferredElements();
    }

    const preferences = Preferences.getAll();
    for (const preference of preferences) {
      preference.batching = true;
      preference.valueFromPreferences = preference.value;
      preference.batching = false;
    }
    if (aFlushToDisk) {
      Services.prefs.savePrefFile(null);
    }
  },

  getPreferenceElement(aStartElement) {
    let temp = aStartElement;
    while (
      temp &&
      temp.nodeType == Node.ELEMENT_NODE &&
      !temp.hasAttribute("preference")
    ) {
      temp = temp.parentNode;
    }
    return temp && temp.nodeType == Node.ELEMENT_NODE ? temp : aStartElement;
  },

  _deferredValueUpdate(aElement) {
    delete aElement._deferredValueUpdateTask;
    const prefID = aElement.getAttribute("preference");
    const preference = Preferences.get(prefID);
    const prefVal = preference.getElementValue(aElement);
    preference.value = prefVal;
    this._deferredValueUpdateElements.delete(aElement);
  },

  _finalizeDeferredElements() {
    for (const el of this._deferredValueUpdateElements) {
      if (el._deferredValueUpdateTask) {
        el._deferredValueUpdateTask.finalize();
      }
    }
  },

  userChangedValue(aElement) {
    const element = this.getPreferenceElement(aElement);
    if (element.hasAttribute("preference")) {
      if (element.getAttribute("delayprefsave") != "true") {
        const preference = Preferences.get(element.getAttribute("preference"));
        const prefVal = preference.getElementValue(element);
        preference.value = prefVal;
      } else {
        if (!element._deferredValueUpdateTask) {
          element._deferredValueUpdateTask = new lazy.DeferredTask(
            this._deferredValueUpdate.bind(this, element),
            1000
          );
          this._deferredValueUpdateElements.add(element);
        } else {
          // Each time the preference is changed, restart the delay.
          element._deferredValueUpdateTask.disarm();
        }
        element._deferredValueUpdateTask.arm();
      }
    }
  },

  onCommand(event) {
    // This "command" event handler tracks changes made to preferences by
    // the user in this window.
    if (event.sourceEvent) {
      event = event.sourceEvent;
    }
    this.userChangedValue(event.target);
  },

  onChange(event) {
    // This "change" event handler tracks changes made to preferences by
    // the user in this window.
    this.userChangedValue(event.target);
  },

  onInput(event) {
    // This "input" event handler tracks changes made to preferences by
    // the user in this window.
    this.userChangedValue(event.target);
  },

  _fireEvent(aEventName, aTarget) {
    try {
      const event = new CustomEvent(aEventName, {
        bubbles: true,
        cancelable: true,
      });
      return aTarget.dispatchEvent(event);
    } catch (e) {
      console.error(e);
    }
    return false;
  },

  onDialogAccept(event) {
    let dialog = document.querySelector("dialog");
    if (!this._fireEvent("beforeaccept", dialog)) {
      event.preventDefault();
      return false;
    }
    this.writePreferences(true);
    return true;
  },

  close(event) {
    if (Preferences.instantApply) {
      window.close();
    }
    event.stopPropagation();
    event.preventDefault();
  },

  handleEvent(event) {
    switch (event.type) {
      case "toggle":
      case "change":
        return this.onChange(event);
      case "command":
        return this.onCommand(event);
      case "dialogaccept":
        return this.onDialogAccept(event);
      case "input":
        return this.onInput(event);
      case "unload":
        return this.onUnload(event);
      default:
        return undefined;
    }
  },

  _syncFromPrefListeners: new WeakMap(),
  _syncToPrefListeners: new WeakMap(),

  addSyncFromPrefListener(aElement, callback) {
    this._syncFromPrefListeners.set(aElement, callback);
    if (this.updateQueued) {
      return;
    }
    // Make sure elements are updated correctly with the listener attached.
    let elementPref = aElement.getAttribute("preference");
    if (elementPref) {
      let pref = this.get(elementPref);
      if (pref) {
        pref.updateElements();
      }
    }
  },

  addSyncToPrefListener(aElement, callback) {
    this._syncToPrefListeners.set(aElement, callback);
    if (this.updateQueued) {
      return;
    }
    // Make sure elements are updated correctly with the listener attached.
    let elementPref = aElement.getAttribute("preference");
    if (elementPref) {
      let pref = this.get(elementPref);
      if (pref) {
        pref.updateElements();
      }
    }
  },

  removeSyncFromPrefListener(aElement) {
    this._syncFromPrefListeners.delete(aElement);
  },

  removeSyncToPrefListener(aElement) {
    this._syncToPrefListeners.delete(aElement);
  },

  AsyncSetting,
  Preference,
  Setting,
};

Services.prefs.addObserver("", Preferences);
window.addEventListener("toggle", Preferences);
window.addEventListener("change", Preferences);
window.addEventListener("command", Preferences);
window.addEventListener("dialogaccept", Preferences);
window.addEventListener("input", Preferences);
window.addEventListener("select", Preferences);
window.addEventListener("unload", Preferences, { once: true });
