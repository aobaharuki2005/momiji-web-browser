/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  IPProtectionService:
    "resource:///modules/ipprotection/IPProtectionService.sys.mjs",
  IPPSignInWatcher: "resource:///modules/ipprotection/IPPSignInWatcher.sys.mjs",
});

const LOG_PREF = "browser.ipProtection.log";

ChromeUtils.defineLazyGetter(lazy, "logConsole", function () {
  return console.createInstance({
    prefix: "IPPEnrollHelper",
    maxLogLevel: Services.prefs.getBoolPref(LOG_PREF, false) ? "Debug" : "Warn",
  });
});

/**
 * A class that manages the enrolling state.
 */
class IPPEnrollHelperSingleton {
  #isEnrolled = false;
  #enrolling = null;

  constructor() {
    this.handleEvent = this.#handleEvent.bind(this);
  }

  init() {
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
          isEnrolled => this.#setEnrolled(isEnrolled),
          () => {
            // We don't want to report errors during the initialization
          }
        );
    } catch (_) {
      // If we are not enrolled. It's not a big deal.
    }
  }

  uninit() {
    lazy.IPPSignInWatcher.removeEventListener(
      "IPPSignInWatcher:StateChanged",
      this.handleEvent
    );
  }

  #handleEvent(_event) {
    if (!lazy.IPPSignInWatcher.isSignedIn) {
      this.#setEnrolled(false);
      return;
    }

    this.maybeEnroll();
  }

  async maybeEnroll() {
    if (this.#isEnrolled) {
      return Promise.resolve({ isEnrolled: true });
    }

    try {
      this.#setEnrolled(
        await lazy.IPProtectionService.guardian.isLinkedToGuardian(
          /* only cache: */ false
        )
      );
    } catch (error) {
      return Promise.resolve({ isEnrolled: false, error: error?.message });
    }

    if (this.#isEnrolled) {
      return Promise.resolve({ isEnrolled: true });
    }

    if (this.#enrolling) {
      return this.#enrolling;
    }

    this.#enrolling = lazy.IPProtectionService.guardian
      .enroll()
      .then(enrollment => {
        let isEnrolled = enrollment?.ok;

        lazy.logConsole.debug(
          "Guardian:",
          isEnrolled ? "Enrolled" : "Enrollment Failed"
        );

        this.#setEnrolled(isEnrolled);
        return { isEnrolled, error: enrollment?.error };
      })
      .catch(error => {
        return { isEnrolled: false, error: error?.message };
      })
      .finally(() => {
        this.#enrolling = null;
      });

    return this.#enrolling;
  }

  get isEnrolled() {
    return this.#isEnrolled;
  }

  #setEnrolled(isEnrolled) {
    if (this.#isEnrolled === isEnrolled) {
      return;
    }

    this.#isEnrolled = isEnrolled;
    lazy.IPProtectionService.updateState();
  }
}

const IPPEnrollHelper = new IPPEnrollHelperSingleton();

export { IPPEnrollHelper };
