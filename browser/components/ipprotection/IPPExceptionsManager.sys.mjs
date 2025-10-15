/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

const MODE_PREF = "browser.ipProtection.exceptionsMode";
const EXCLUSIONS_PREF = "browser.ipProtection.domainExclusions";
const INCLUSIONS_PREF = "browser.ipProtection.domainInclusions";
const LOG_PREF = "browser.ipProtection.log";

const MODE = {
  ALL: "all",
  SELECT: "select",
};

ChromeUtils.defineLazyGetter(lazy, "logConsole", function () {
  return console.createInstance({
    prefix: "IPPExceptionsManager",
    maxLogLevel: Services.prefs.getBoolPref(LOG_PREF, false) ? "Debug" : "Warn",
  });
});

/**
 * Manages site inclusions and exclusions for IP Protection.
 */
class ExceptionsManager {
  #inited = false;
  #exclusions = null;
  #inclusions = null;
  #mode = MODE.ALL;

  /**
   * The set of domains to exclude from the VPN.
   *
   * @returns {Set<string>}
   *  A set of domain names as strings.
   *
   * @example
   *  Set { "https://www.example.com", "https://www.bbc.co.uk" }
   */
  get exclusions() {
    if (!this.#exclusions || !(this.#exclusions instanceof Set)) {
      this.#exclusions = new Set();
    }
    return this.#exclusions;
  }

  /**
   * The set of domains to include for VPN protection.
   *
   * @returns {Set<string>}
   *  A set of domain names as strings.
   *
   * @example
   *  Set { "https://www.example.com", "https://www.bbc.co.uk" }
   */
  get inclusions() {
    if (!this.#inclusions || !(this.#inclusions instanceof Set)) {
      this.#inclusions = new Set();
    }
    return this.#inclusions;
  }

  /**
   * The type of site exceptions for VPN.
   *
   * @see MODE
   */
  get mode() {
    return this.#mode;
  }

  init() {
    if (this.#inited) {
      return;
    }

    this.#mode = this.#getModePref();

    this.#exclusions = new Set();
    this.#inclusions = new Set();
    this.#loadExceptionsForPref(EXCLUSIONS_PREF);
    this.#loadExceptionsForPref(INCLUSIONS_PREF);

    this.#inited = true;
  }

  uninit() {
    if (!this.#inited) {
      return;
    }

    this.#unloadExceptions();
    this.#inited = false;
  }

  #getModePref() {
    let modePrefVal;

    try {
      modePrefVal = this.exceptionsMode;
    } catch (e) {
      lazy.logConsole.error(
        `Unable to read pref ${MODE_PREF}. Falling back to default.`
      );
      return MODE.ALL;
    }

    if (typeof modePrefVal !== "string") {
      lazy.logConsole.error(
        `Mode ${modePrefVal} is not a string. Falling back to default.`
      );
      return MODE.ALL;
    }

    return modePrefVal;
  }

  /**
   * Changes the protection exceptions mode.
   *
   * @param {"all"|"select"} newMode
   *  The type of exceptions
   *
   * @see MODE
   */
  changeMode(newMode) {
    if (!Object.values(MODE).includes(newMode)) {
      lazy.logConsole.error(
        `Invalid mode ${newMode} found. Falling back to default.`
      );
      newMode = MODE.ALL;
    }

    this.#mode = newMode;
    this.#updateModePref();
  }

  /**
   * Updates the value of browser.ipProtection.exceptionsMode
   * according to the current mode property.
   */
  #updateModePref() {
    Services.prefs.setStringPref(MODE_PREF, this.#mode);
  }

  #getExceptionPref(pref) {
    let prefString;

    if (pref === EXCLUSIONS_PREF) {
      prefString = this.domainExclusions;
    } else if (pref === INCLUSIONS_PREF) {
      prefString = this.domainInclusions;
    } else {
      lazy.logConsole.error(`Invalid pref ${pref} found.`);
      return "";
    }

    if (typeof prefString !== "string") {
      lazy.logConsole.error(`${prefString} is not a string`);
      return "";
    }

    return prefString;
  }

  /**
   * Initializes the exclusions set with domains from
   * browser.ipProtection.domainExclusions, or
   * initializes the inclusions set with domains from
   * browser.ipProtection.domainInclusions.
   *
   * @param {string} pref
   *  The exclusions pref (browser.ipProtection.domainExclusions)
   *  or inclusions pref (browser.ipProtection.domainInclusions).
   * @see exclusions
   * @see inclusions
   */
  #loadExceptionsForPref(pref) {
    let prefString = this.#getExceptionPref(pref);

    if (!prefString) {
      return;
    }

    let domains = prefString.trim().split(",");

    for (let domain of domains) {
      if (!this.#canCreateURI(domain)) {
        continue;
      }

      let uri = Services.io.newURI(domain);

      if (pref === EXCLUSIONS_PREF) {
        this.#exclusions.add(uri.prePath);
      } else if (pref === INCLUSIONS_PREF) {
        this.#inclusions.add(uri.prePath);
      }
    }
  }

  /**
   * Checks if we can add a domain as an exclusion or inclusion for VPN usage.
   *
   * @param {string} domain
   *  The domain name.
   * @returns {boolean}
   *  True if a URI can be created from the domain string.
   *  Else false.
   */
  #canCreateURI(domain) {
    try {
      return !!Services.io.newURI(domain);
    } catch (e) {
      lazy.logConsole.error(e);
      return false;
    }
  }

  /**
   * If mode is MODE.ALL, adds a new domain the exclusions set if the domain is valid.
   *
   * @param {string} domain
   *  The domain to add to the exclusions or inclusions set.
   *
   * @see MODE
   * @see exclusions
   */
  addException(domain) {
    // TODO: to be called by IPProtectionPanel or other classes (Bug 1990975, Bug 1990972)
    if (this.#mode === MODE.ALL) {
      this.#addExclusion(domain);
    } else if (this.#mode === MODE.SELECT) {
      this.#addInclusion(domain);
    }
  }

  #addExclusion(domain) {
    if (!this.#canCreateURI(domain)) {
      return;
    }

    this.#exclusions.add(domain);
    this.#updateExclusionPref();
  }

  #addInclusion(domain) {
    if (!this.#canCreateURI(domain)) {
      return;
    }

    this.#inclusions.add(domain);
    this.#updateInclusionPref();
  }

  /**
   * If mode is MODE.ALL, removes a domain from the exclusions set.
   *
   * @param {string} domain
   *  The domain to remove from the exclusions or inclusions set.
   *
   * @see MODE
   * @see exclusions
   */
  removeException(domain) {
    // TODO: to be called by IPProtectionPanel or other classes (Bug 1990975, Bug 1990972)
    if (this.#mode === MODE.ALL) {
      this.#removeExclusion(domain);
    } else if (this.#mode === MODE.SELECT) {
      this.#removeInclusion(domain);
    }
  }

  #removeExclusion(domain) {
    if (this.#exclusions.delete(domain)) {
      this.#updateExclusionPref();
    }
  }

  #removeInclusion(domain) {
    if (this.#inclusions.delete(domain)) {
      this.#updateInclusionPref();
    }
  }

  /**
   * Updates the value of browser.ipProtection.domainExclusions
   * according to the latest version of the exclusions set.
   */
  #updateExclusionPref() {
    let newPrefString = [...this.#exclusions].join(",");
    Services.prefs.setStringPref(EXCLUSIONS_PREF, newPrefString);
  }

  /**
   * Updates the value of browser.ipProtection.domainInclusions
   * according to the latest version of the inclusions set.
   */
  #updateInclusionPref() {
    let newPrefString = [...this.#inclusions].join(",");
    Services.prefs.setStringPref(INCLUSIONS_PREF, newPrefString);
  }

  /**
   * Clear the exclusions set.
   */
  #unloadExceptions() {
    this.#exclusions = null;
    this.#inclusions = null;
  }
}

const IPPExceptionsManager = new ExceptionsManager();

XPCOMUtils.defineLazyPreferenceGetter(
  IPPExceptionsManager,
  "domainExclusions",
  EXCLUSIONS_PREF,
  ""
);

XPCOMUtils.defineLazyPreferenceGetter(
  IPPExceptionsManager,
  "domainInclusions",
  INCLUSIONS_PREF,
  ""
);

XPCOMUtils.defineLazyPreferenceGetter(
  IPPExceptionsManager,
  "exceptionsMode",
  MODE_PREF,
  MODE.ALL
);

export { IPPExceptionsManager };
