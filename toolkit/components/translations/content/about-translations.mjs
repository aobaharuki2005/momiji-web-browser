/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The following globals are injected via the AboutTranslationsChild actor.
// about-translations.mjs is running in an unprivileged context, and these injected functions
// allow for the page to get access to additional privileged features.

/* global AT_getSupportedLanguages, AT_log, AT_getScriptDirection,
   AT_logError, AT_createTranslationsPort, AT_isHtmlTranslation,
   AT_isTranslationEngineSupported, AT_identifyLanguage, AT_telemetry */

import { Translator } from "chrome://global/content/translations/Translator.mjs";
import { TranslationsUtils } from "chrome://global/content/translations/TranslationsUtils.mjs";

// Allow tests to override this value so that they can run faster.
// This is the delay in milliseconds.
window.DEBOUNCE_DELAY = 200;
// Allow tests to test the debounce behavior by counting debounce runs.
window.DEBOUNCE_RUN_COUNT = 0;

// Limits how long the "text" parameter can be in the URL.
const URL_MAX_TEXT_LENGTH = 5000;

/**
 * Listen for events coming from the AboutTranslations actor.
 */
window.addEventListener("AboutTranslationsChromeToContent", ({ detail }) => {
  switch (detail.type) {
    case "enable": {
      // While the feature is in development, hide the feature behind a pref. See the
      // "browser.translations.enable" pref in modules/libpref/init/all.js and Bug 971044
      // for the status of enabling this project.
      if (window.translationsState) {
        throw new Error("about:translations was already initialized.");
      }
      AT_isTranslationEngineSupported().then(isSupported => {
        window.translationsState = new TranslationsState(isSupported);
      });
      document.body.style.visibility = "visible";
      break;
    }
    case "rebuild-translator": {
      window.translationsState.maybeCreateNewTranslator();
      break;
    }
    default:
      throw new Error("Unknown AboutTranslationsChromeToContent event.");
  }
});

/**
 * Debounce a function so that it is only called after some wait time with no activity.
 * This is good for grouping text entry via keyboard.
 *
 * @param {object} settings
 * @param {Function} settings.onDebounce
 * @param {Function} settings.doEveryTime
 * @returns {Function}
 */
function debounce({ onDebounce, doEveryTime }) {
  /** @type {number | null} */
  let timeoutId = null;
  let lastDispatch = null;

  return (...args) => {
    doEveryTime(...args);

    const now = Date.now();
    if (lastDispatch === null) {
      // This is the first call to the function.
      lastDispatch = now;
    }

    const timeLeft = lastDispatch + window.DEBOUNCE_DELAY - now;

    // Always discard the old timeout, either the function will run, or a new
    // timer will be scheduled.
    clearTimeout(timeoutId);

    if (timeLeft <= 0) {
      // It's been long enough to go ahead and call the function.
      timeoutId = null;
      lastDispatch = null;
      window.DEBOUNCE_RUN_COUNT += 1;
      onDebounce(...args);
      return;
    }

    // Re-set the timeout with the current time left.
    clearTimeout(timeoutId);

    timeoutId = setTimeout(() => {
      // Timeout ended, call the function.
      timeoutId = null;
      lastDispatch = null;
      window.DEBOUNCE_RUN_COUNT += 1;
      onDebounce(...args);
    }, timeLeft);
  };
}
