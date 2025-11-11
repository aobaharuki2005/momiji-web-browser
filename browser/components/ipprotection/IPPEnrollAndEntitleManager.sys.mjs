/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  IPPStartupCache: "resource:///modules/ipprotection/IPPStartupCache.sys.mjs",
  IPProtectionService:
    "resource:///modules/ipprotection/IPProtectionService.sys.mjs",
  IPPSignInWatcher: "resource:///modules/ipprotection/IPPSignInWatcher.sys.mjs",
});

const LOG_PREF = "browser.ipProtection.log";

ChromeUtils.defineLazyGetter(lazy, "logConsole", function () {
  return console.createInstance({
    prefix: "IPPEnrollAndEntitleManager",
    maxLogLevel: Services.prefs.getBoolPref(LOG_PREF, false) ? "Debug" : "Warn",
  });
});

/**
 * This class manages the enrolling and entitlement.
 */
class IPPEnrollAndEntitleManagerSingleton extends EventTarget {
  #runningPromise = null;

  #isEnrolled = false;
  #entitlement = null;

  constructor() {
    super();

    this.handleEvent = this.#handleEvent.bind(this);
  }

  init() {
    // We will use data from the cache until we are fully functional. Then we
    // will recompute the state in `initOnStartupCompleted`.
    this.#entitlement = lazy.IPPStartupCache.entitlement;
    this.#isEnrolled = !!this.#entitlement;

    lazy.IPPSignInWatcher.addEventListener(
      "IPPSignInWatcher:StateChanged",
      this.handleEvent
    );
  }

  initOnStartupCompleted() {
    if (!lazy.IPPSignInWatcher.isSignedIn) {
      return;
    }

    try {
      // This bit must be async because we want to trigger the updateState at
      // the end of the rest of the initialization.
      lazy.IPProtectionService.guardian
        .isLinkedToGuardian(/* only cache: */ true)
        .then(
          async isEnrolled => {
            this.#isEnrolled = isEnrolled;

            if (isEnrolled) {
              const data =
                await IPPEnrollAndEntitleManagerSingleton.#maybeEntitle();
              this.#setEntitlement(data.entitlement);
            } else {
              this.#setEntitlement(null);
            }
          },
          () => {
            // In case we were using cached values, it's time to reset them.
            this.#isEnrolled = false;
            this.#setEntitlement(null);
          }
        );
    } catch (_) {
      // In case we were using cached values, it's time to reset them.
      this.#isEnrolled = false;
      this.#setEntitlement(null);
    }
  }

  uninit() {
    lazy.IPPSignInWatcher.removeEventListener(
      "IPPSignInWatcher:StateChanged",
      this.handleEvent
    );

    this.#entitlement = null;
    this.#isEnrolled = false;
  }

  #handleEvent(_event) {
    if (!lazy.IPPSignInWatcher.isSignedIn) {
      this.#isEnrolled = false;
      this.#setEntitlement(null);
      return;
    }

    this.maybeEnrollAndEntitle();
  }

  maybeEnrollAndEntitle() {
    if (this.#runningPromise) {
      return this.#runningPromise;
    }

    if (this.#entitlement && this.#isEnrolled) {
      return Promise.resolve({ isEnrolledAndEntitled: true });
    }

    const enrollAndEntitle = async () => {
      if (!this.#isEnrolled) {
        const data = await IPPEnrollAndEntitleManagerSingleton.#maybeEnroll();
        if (!data.isEnrolled) {
          return { isEnrolledAndEntitled: false, error: data.error };
        }

        this.#isEnrolled = true;
      }

      const data = await IPPEnrollAndEntitleManagerSingleton.#maybeEntitle();
      if (!data.entitlement) {
        return { isEnrolledAndEntitled: false, error: data.error };
      }

      this.#setEntitlement(data.entitlement);
      return { isEnrolledAndEntitled: true };
    };

    this.#runningPromise = enrollAndEntitle().finally(() => {
      this.#runningPromise = null;
    });

    return this.#runningPromise;
  }

  // This method is static because we don't want to change the internal state
  // of the singleton.
  static async #maybeEnroll() {
    let isEnrolled = false;
    try {
      isEnrolled = await lazy.IPProtectionService.guardian.isLinkedToGuardian(
        /* only cache: */ false
      );
    } catch (error) {
      return { isEnrolled, error: error?.message };
    }

    if (isEnrolled) {
      return { isEnrolled };
    }

    try {
      const enrollment = await lazy.IPProtectionService.guardian.enroll();
      isEnrolled = !!enrollment?.ok;

      lazy.logConsole.debug(
        "Guardian:",
        isEnrolled ? "Enrolled" : "Enrollment Failed"
      );

      return { isEnrolled, error: enrollment?.error };
    } catch (error) {
      return { isEnrolled, error: error?.message };
    }
  }

  // This method is static because we don't want to change the internal state
  // of the singleton.
  static async #maybeEntitle() {
    let { status, entitlement, error } =
      await lazy.IPProtectionService.guardian.fetchUserInfo();
    lazy.logConsole.debug("Entitlement:", { status, entitlement, error });

    // If we see an error during the READY state, let's trigger an error state.
    if (error || !entitlement || status != 200) {
      return { entitlement: null, error: error || `Status: ${status}` };
    }

    return { entitlement };
  }

  #setEntitlement(entitlement) {
    this.#entitlement = entitlement;
    lazy.IPPStartupCache.storeEntitlement(this.#entitlement);

    lazy.IPProtectionService.updateState();

    this.dispatchEvent(
      new CustomEvent("IPPEnrollAndEntitleManager:StateChanged", {
        bubbles: true,
        composed: true,
      })
    );
  }

  get isEnrolledAndEntitled() {
    return this.#isEnrolled && !!this.#entitlement;
  }

  /**
   * Checks if a user has upgraded.
   *
   * @returns {boolean}
   */
  get hasUpgraded() {
    return this.#entitlement?.subscribed;
  }

  /**
   * Checks if the entitlement exists and it contains a UUID
   */
  get hasEntitlementUid() {
    return !!this.#entitlement?.uid;
  }

  /**
   * Checks if we have the entitlement
   */
  get hasEntitlement() {
    return !!this.#entitlement;
  }

  /**
   * Checks if we're running the Alpha variant based on
   * available features
   */
  get isAlpha() {
    return (
      !this.#entitlement?.autostart &&
      !this.#entitlement?.website_inclusion &&
      !this.#entitlement?.location_controls
    );
  }

  async refetchEntitlement() {
    this.#setEntitlement(null);
    await this.maybeEnrollAndEntitle();
  }

  resetEntitlement() {
    this.#setEntitlement(null);
  }
}

const IPPEnrollAndEntitleManager = new IPPEnrollAndEntitleManagerSingleton();

export { IPPEnrollAndEntitleManager };
