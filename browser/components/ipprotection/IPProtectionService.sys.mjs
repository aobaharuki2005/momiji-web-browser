/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  GuardianClient: "resource:///modules/ipprotection/GuardianClient.sys.mjs",
  // eslint-disable-next-line mozilla/valid-lazy
  IPPChannelFilter: "resource:///modules/ipprotection/IPPChannelFilter.sys.mjs",
  UIState: "resource://services-sync/UIState.sys.mjs",
  SpecialMessageActions:
    "resource://messaging-system/lib/SpecialMessageActions.sys.mjs",
  IPProtection: "resource:///modules/ipprotection/IPProtection.sys.mjs",
  NimbusFeatures: "resource://nimbus/ExperimentAPI.sys.mjs",
});

import { SIGNIN_DATA } from "chrome://browser/content/ipprotection/ipprotection-constants.mjs";

const ENABLED_PREF = "browser.ipProtection.enabled";

/**
 * A singleton service that manages proxy integration and backend functionality.
 *
 * It exposes init and uninit for app startup.
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
  static WIDGET_ID = "ipprotection-button";
  static PANEL_ID = "PanelUI-ipprotection";

  isActive = false;
  activatedAt = null;
  deactivatedAt = null;
  sessionLength = 0;
  isSignedIn = null;
  isEnrolled = null;
  isEligible = null;

  guardian = null;

  #inited = false;
  #hasWidget = false;

  constructor() {
    super();

    this.guardian = new lazy.GuardianClient();

    this.updateEnabled = this.#updateEnabled.bind(this);
    this.updateSignInStatus = this.#updateSignInStatus.bind(this);
    this.updateEligibility = this.#updateEligibility.bind(this);
  }

  /**
   * Setups the IPProtectionService if enabled.
   */
  init() {
    if (this.#inited || !this.featureEnabled) {
      return;
    }

    this.#addSignInStateObserver();
    this.#addEligibilityListeners();

    this.#updateSignInStatus();
    this.#updateEligibility();
    this.#updateEnrollment();

    this.#inited = true;
  }

  /**
   * Removes the IPProtectionService and IPProtection widget.
   */
  uninit() {
    if (this.#hasWidget) {
      lazy.IPProtection.uninit();
    }

    if (this.fxaObserver) {
      Services.obs.removeObserver(this.fxaObserver, lazy.UIState.ON_UPDATE);
      this.fxaObserver = null;
    }
    if (this.isActive) {
      this.stop(false);
    }

    this.#removeEligibilityListeners();

    this.#hasWidget = false;
    this.#inited = false;
  }

  /**
   * Start the proxy if the user is eligible.
   *
   * TODO: Add logic to start the proxy connection.
   *
   * @param {boolean} userAction
   * True if started by user action, false if system action
   */
  async start(userAction = true) {
    let { isSignedIn, isEnrolled, isActive } = this;

    if (!isSignedIn || !isEnrolled || isActive) {
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
   * Checks if a user has signed in.
   *
   * @returns {boolean}
   */
  #isSignedIn() {
    let { status } = lazy.UIState.get();
    return status == lazy.UIState.STATUS_SIGNED_IN;
  }

  /**
   * Checks if the user has enrolled with FxA to use the proxy.
   *
   * @returns {Promise<boolean>}
   */
  async #isEnrolled() {
    if (!this.isSignedIn) {
      return false;
    }

    let isEnrolled = await this.guardian.isLinkedToGuardian();

    return isEnrolled;
  }

  /**
   * Check if this device is in the experiment with a variant branch.
   *
   * @returns {boolean}
   */
  #isEligible() {
    let inExperiment = lazy.NimbusFeatures.ipProtection.getEnrollmentMetadata();
    return inExperiment?.branch && inExperiment.branch !== "control";
  }

  /**
   * Checks whether the feature pref is enabled and
   * will init or uninit the IPProtectionService instance.
   */
  #updateEnabled() {
    if (this.featureEnabled) {
      this.init();
    } else {
      this.uninit();
    }
  }

  #addEligibilityListeners() {
    lazy.NimbusFeatures.ipProtection.onUpdate(this.updateEligibility);
  }

  #removeEligibilityListeners() {
    lazy.NimbusFeatures.ipProtection.offUpdate(this.updateEligibility);
  }

  /**
   * Adds an observer for the FxA sign-in state.
   */
  #addSignInStateObserver() {
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
   * If the status has changed, will update if the new user is enrolled
   * or clear enrollment.
   *
   * Dispatch events when the sign-in state changes:
   *  - "IPProtectionService:SignedIn"
   *  - "IPProtectionService:SignedOut"
   */
  async #updateSignInStatus() {
    let isSignedIn = this.#isSignedIn();

    if (this.isSignedIn == isSignedIn) {
      return;
    }

    this.isSignedIn = isSignedIn;

    if (!this.#inited) {
      return;
    }

    if (this.isSignedIn) {
      this.dispatchEvent(
        new CustomEvent("IPProtectionService:SignedIn", {
          bubbles: true,
          composed: true,
        })
      );
      await this.#updateEnrollment();
    } else {
      this.dispatchEvent(
        new CustomEvent("IPProtectionService:SignedOut", {
          bubbles: true,
          composed: true,
        })
      );
      this.isEnrolled = false;
    }
  }

  /**
   * Checks if a device is enrolled in an experiment that
   * allow using the VPN and if so adds the widget.
   *
   * If a user is signed in, checks if they are or can be
   * enrolled.
   *
   * @returns {Promise<void>}
   */
  async #updateEligibility() {
    this.isEligible = this.#isEligible();

    if (!this.isEligible) {
      return;
    }

    if (!this.#hasWidget) {
      lazy.IPProtection.init();
      this.#hasWidget = true;
    }

    if (this.#inited && this.isSignedIn) {
      this.#updateEnrollment();
    }
  }

  /**
   * Checks if a users FxA account has been enrolled to use the proxy and
   * updates the enrolled pref.
   *
   * If no user is signed in, the enrolled pref will set to false.
   *
   * If the user is not enrolled but meets the other conditions to use
   * the VPN they will be enrolled now.
   *
   * @returns {Promise<void>}
   */
  async #updateEnrollment() {
    this.isEnrolled = await this.#isEnrolled();

    if (this.isEnrolled && !this.#hasWidget) {
      lazy.IPProtection.init();
      this.#hasWidget = true;
      return;
    }

    if (
      !this.isEnrolled &&
      this.#hasWidget &&
      this.isEligible &&
      this.isSignedIn
    ) {
      this.isEnrolled = await this.#enroll();
    }
  }

  /**
   * Enrolls a users FxA account to use the proxy if they are eligible and not already
   * enrolled then updates the enrollment status.
   *
   * If they are enrolled, updates the enrollment status.
   *
   * If the user is already enrolled, this will do nothing.
   *
   * @returns {Promise<boolean | null>}
   */
  async #enroll() {
    let { isSignedIn, isEnrolled, isEligible } = this;
    if (!isSignedIn) {
      return null;
    }

    if (isEnrolled || !isEligible) {
      return null;
    }

    let enrollment = await this.guardian.enroll();
    this.isEnrolled = enrollment?.ok;
    return this.isEnrolled;
  }

  async startLoginFlow(browser) {
    return lazy.SpecialMessageActions.fxaSignInFlow(SIGNIN_DATA, browser);
  }
}

const IPProtectionService = new IPProtectionServiceSingleton();

XPCOMUtils.defineLazyPreferenceGetter(
  IPProtectionService,
  "featureEnabled",
  ENABLED_PREF,
  false,
  IPProtectionService.updateEnabled
);

export { IPProtectionService };
