/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  IPProtectionServerlist:
    "moz-src:///browser/components/ipprotection/IPProtectionServerlist.sys.mjs",
  IPPProxyManager:
    "moz-src:///browser/components/ipprotection/IPPProxyManager.sys.mjs",
  IPPProxyStates:
    "moz-src:///browser/components/ipprotection/IPPProxyManager.sys.mjs",
  IPProtectionService:
    "moz-src:///browser/components/ipprotection/IPProtectionService.sys.mjs",
  IPProtectionStates:
    "moz-src:///browser/components/ipprotection/IPProtectionService.sys.mjs",
  SessionStartup: "resource:///modules/sessionstore/SessionStartup.sys.mjs",
});

const AUTOSTART_FEATURE_ENABLE_PREF = "browser.ipProtection.features.autoStart";
const AUTOSTART_PREF = "browser.ipProtection.autoStartEnabled";
const USER_ENABLED_PREF = "browser.ipProtection.userEnabled";
const AUTO_RESTORE_PREF = "browser.ipProtection.autoRestoreEnabled";

/**
 * This class monitors the auto-start pref and if it sees a READY state, it
 * calls `start()`. This is done only if the previous state was not a ACTIVE
 * because, in that case, more likely the VPN on/off state is an user decision.
 */
class IPPAutoStartSingleton {
  #shouldStartWhenReady = false;

  constructor() {
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "autoStartPref",
      AUTOSTART_PREF,
      false,
      (_pref, _oldVal, featureEnabled) => {
        if (featureEnabled) {
          this.init();
        } else {
          this.uninit();
        }
      }
    );

    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "autoStartFeatureEnablePref",
      AUTOSTART_FEATURE_ENABLE_PREF,
      false
    );
  }

  init() {
    if (this.autoStart && !this.handleEvent) {
      this.handleEvent = this.#handleEvent.bind(this);
      this.#shouldStartWhenReady = true;

      lazy.IPProtectionService.addEventListener(
        "IPProtectionService:StateChanged",
        this.handleEvent
      );
    }
  }

  initOnStartupCompleted() {}

  uninit() {
    if (this.handleEvent) {
      lazy.IPProtectionService.removeEventListener(
        "IPProtectionService:StateChanged",
        this.handleEvent
      );

      delete this.handleEvent;
      this.#shouldStartWhenReady = false;
    }
  }

  get autoStart() {
    // We activate the auto-start feature only if the pref is true and we have
    // the serverlist already.
    return (
      this.autoStartFeatureEnablePref &&
      this.autoStartPref &&
      lazy.IPProtectionServerlist.hasList
    );
  }

  #handleEvent(_event) {
    switch (lazy.IPProtectionService.state) {
      case lazy.IPProtectionStates.UNINITIALIZED:
      case lazy.IPProtectionStates.UNAVAILABLE:
      case lazy.IPProtectionStates.UNAUTHENTICATED:
        this.#shouldStartWhenReady = true;
        break;

      case lazy.IPProtectionStates.READY:
        if (this.#shouldStartWhenReady) {
          this.#shouldStartWhenReady = false;
          lazy.IPPProxyManager.start(/* user action: */ false);
        }
        break;

      default:
        break;
    }
  }
}

const IPPAutoStart = new IPPAutoStartSingleton();

/**
 * A helper that manages the auto-restore of the VPN connection on session restore.
 * If the user had the VPN active before closing the browser and the session is
 * being restored, this class will start the VPN again once the IPProtectionService
 * reaches the READY state.
 */
export class IPPAutoRestoreSingleton {
  #willRestore = false;
  #forceRestore = false;

  /**
   * @class
   * @param {boolean} forceRestore
   */
  constructor(forceRestore = false) {
    this.#forceRestore = forceRestore;
    this.handleEvent = this.#handleEvent.bind(this);

    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "userEnabled",
      USER_ENABLED_PREF,
      false
    );

    // If auto-start is enabled, auto-restore is not needed.
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "autoStartPref",
      AUTOSTART_PREF,
      false
    );

    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "autoRestorePref",
      AUTO_RESTORE_PREF,
      false
    );
  }

  init() {
    if (!this.shouldRestore) {
      return;
    }
    this.#willRestore = true;
    lazy.IPProtectionService.addEventListener(
      "IPProtectionService:StateChanged",
      this.handleEvent
    );
  }

  initOnStartupCompleted() {}

  uninit() {
    if (!this.#willRestore) {
      return;
    }
    this.#willRestore = false;
    lazy.IPProtectionService.removeEventListener(
      "IPProtectionService:StateChanged",
      this.handleEvent
    );
  }

  get shouldRestore() {
    if (!this.autoRestorePref || this.autoStartPref) {
      return false;
    }

    if (this.#forceRestore) {
      return this.userEnabled;
    }

    let willRestore =
      lazy.SessionStartup.willRestore() &&
      !lazy.SessionStartup.willRestoreAsCrashed();

    return (
      lazy.IPProtectionServerlist.hasList && willRestore && this.userEnabled
    );
  }

  #handleEvent(_event) {
    switch (lazy.IPProtectionService.state) {
      case lazy.IPProtectionStates.READY:
        lazy.IPPProxyManager.start(/* user action: */ false);
        break;

      default:
        break;
    }
    // Only get the cached state.
    this.uninit();
  }
}

const IPPAutoRestore = new IPPAutoRestoreSingleton();

/**
 * This class monitors the startup phases and registers/unregisters the channel
 * filter to avoid data leak. The activation of the VPN is done by the
 * IPPAutoStart and IPPAutoRestore objects above.
 */
class IPPEarlyStartupFilter {
  #autoStartAndAtStartup = false;

  constructor() {
    this.handleEvent = this.#handleEvent.bind(this);
    this.#autoStartAndAtStartup =
      IPPAutoStart.autoStart || IPPAutoRestore.shouldRestore;
  }

  init() {
    if (this.#autoStartAndAtStartup) {
      lazy.IPPProxyManager.createChannelFilter();

      lazy.IPProtectionService.addEventListener(
        "IPProtectionService:StateChanged",
        this.handleEvent
      );
      lazy.IPPProxyManager.addEventListener(
        "IPPProxyManager:StateChanged",
        this.handleEvent
      );
    }
  }

  initOnStartupCompleted() {}

  uninit() {
    if (this.autoStartAndAtStartup) {
      this.#autoStartAndAtStartup = false;

      lazy.IPPProxyManager.removeEventListener(
        "IPPProxyManager:StateChanged",
        this.handleEvent
      );
      lazy.IPProtectionService.removeEventListener(
        "IPProtectionService:StateChanged",
        this.handleEvent
      );
    }
  }

  #cancelChannelFilter() {
    lazy.IPPProxyManager.cancelChannelFilter();
  }

  #handleEvent(_event) {
    switch (lazy.IPProtectionService.state) {
      case lazy.IPProtectionStates.UNAVAILABLE:
      case lazy.IPProtectionStates.UNAUTHENTICATED:
        // These states block the auto-start at startup.
        this.#cancelChannelFilter();
        this.uninit();
        break;

      default:
        // Let's ignoring any other state.
        break;
    }

    if (lazy.IPPProxyManager.state === lazy.IPPProxyStates.ACTIVE) {
      // We have completed our task.
      this.uninit();
    }
  }
}

const IPPAutoStartHelpers = [
  IPPAutoRestore,
  IPPAutoStart,
  new IPPEarlyStartupFilter(),
];

export { IPPAutoStartHelpers };
