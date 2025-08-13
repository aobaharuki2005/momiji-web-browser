/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  // eslint-disable-next-line mozilla/valid-lazy
  GuardianClient: "resource:///modules/ipprotection/GuardianClient.sys.mjs",
  // eslint-disable-next-line mozilla/valid-lazy
  IPPChannelFilter: "resource:///modules/ipprotection/IPPChannelFilter.sys.mjs",
  UIState: "resource://services-sync/UIState.sys.mjs",
});

/**
 * A singleton service that manages proxy integration and backend functionality.
 *
 * @fires event:"IPProtectionService:Started"
 *  When the proxy has started and includes the timestamp of when
 *  it was activated as `detail.activatedAt`.
 * @fires event:"IPProtectionService:Stopped"
 *  When the proxy is stopped
 * @fires event:"IPProtectionService:SignedIn"
 *  When user signs into their account
 * @fires event:"IPProtectionService:SignedOut"
 *  When user signs out of their account
 */
class IPProtectionServiceSingleton extends EventTarget {
  isActive = false;
  activatedAt = null;
  deactivatedAt = null;
  sessionLength = 0;
  isSignedIn = false;

  #inited = false;

  constructor() {
    super();
  }

  init() {
    if (this.#inited) {
      return;
    }

    this.updateSignInStatus();
    this.addSignInStateObserver();

    this.#inited = true;
  }

  uninit() {
    if (this.fxaObserver) {
      Services.obs.removeObserver(this.fxaObserver, lazy.UIState.ON_UPDATE);
      this.fxaObserver = null;
    }
    if (this.isActive) {
      this.stop(false);
    }

    this.isSignedIn = false;

    this.#inited = false;
  }

  /**
   * Start the proxy if the user is signed in.
   *
   * TODO: Add logic to start the proxy connection.
   *
   * @param {boolean} userAction
   * True if started by user action, false if system action
   */
  start(userAction = true) {
    if (!this.isSignedIn) {
      return;
    }
    this.isActive = true;
    this.activatedAt = Cu.now();
    this.dispatchEvent(
      new CustomEvent("IPProtectionService:Started", {
        bubbles: true,
        composed: true,
        detail: {
          activatedAt: this.activatedAt,
        },
      })
    );
    Glean.ipprotection.toggled.record({
      userAction,
      enabled: true,
    });
  }

  /**
   * Stops the proxy.
   *
   * TODO: Add logic to stop the proxy connection.
   *
   * @param {boolean} userAction
   * True if started by user action, false if system action
   */
  stop(userAction = true) {
    this.isActive = false;

    let deactivatedAt = Cu.now();
    let sessionLength = this.activatedAt - deactivatedAt;

    Glean.ipprotection.toggled.record({
      userAction,
      duration: sessionLength,
      enabled: false,
    });

    this.activatedAt = null;
    this.dispatchEvent(
      new CustomEvent("IPProtectionService:Stopped", {
        bubbles: true,
        composed: true,
      })
    );
  }

  /**
   * Adds an observer for the FxA sign-in state.
   */
  addSignInStateObserver() {
    let manager = this;
    this.fxaObserver = {
      QueryInterface: ChromeUtils.generateQI([
        Ci.nsIObserver,
        Ci.nsISupportsWeakReference,
      ]),

      observe() {
        manager.updateSignInStatus();
      },
    };

    Services.obs.addObserver(this.fxaObserver, lazy.UIState.ON_UPDATE);
  }

  /**
   * Updates the `isSignedIn` property based on the UIState status.
   *
   * Dispatch events when the sign-in state changes:
   *  - "IPProtectionService:SignedIn"
   *  - "IPProtectionService:SignedOut"
   */
  updateSignInStatus() {
    let { status } = lazy.UIState.get();
    this.isSignedIn = status == lazy.UIState.STATUS_SIGNED_IN;
    if (this.isSignedIn) {
      this.dispatchEvent(
        new CustomEvent("IPProtectionService:SignedIn", {
          bubbles: true,
          composed: true,
        })
      );
    } else {
      this.dispatchEvent(
        new CustomEvent("IPProtectionService:SignedOut", {
          bubbles: true,
          composed: true,
        })
      );
    }
  }
}

const IPProtectionService = new IPProtectionServiceSingleton();

export { IPProtectionService };
