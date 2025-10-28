/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = XPCOMUtils.declareLazy({
  GeolocationUtils:
    "moz-src:///browser/components/urlbar/private/GeolocationUtils.sys.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
});

/**
 *
 */
class _GeolocationTestUtils {
  /**
   * Initializes the utils.
   *
   * @param {object} scope
   *   The global JS scope where tests are being run. This allows the instance
   *   to access test helpers like `Assert` that are available in the scope.
   */
  init(scope) {
    if (!scope) {
      throw new Error(
        "GeolocationTestUtils.init() must be called with a scope"
      );
    }

    this.#scope = scope;
  }

  /**
   * Setup stub for GeolocationUtils.geolocation() using given geolocation.
   * If the geolocation parameter is null, set "San Francisco" geolocation.
   * NOTE: This returns function to restore the dummy function.
   *
   * @param {object} [geolocation]
   * @param {string} [geolocation.country_code]
   * @param {string} [geolocation.city]
   * @param {string} [geolocation.region_code]
   * @returns {Function} function to restore the stub.
   */
  stubGeolocation(geolocation) {
    if (!geolocation) {
      geolocation = {
        country_code: "US",
        city: "San Francisco",
        region_code: "CA",
      };
    }

    let sandbox = lazy.sinon.createSandbox();
    sandbox.stub(lazy.GeolocationUtils, "geolocation").resolves(geolocation);

    let cleanup = () => {
      sandbox.restore();
    };

    this.#scope.registerCleanupFunction?.(cleanup);

    return cleanup;
  }

  #scope;
}

export let GeolocationTestUtils = new _GeolocationTestUtils();
