/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SuggestProvider } from "resource:///modules/urlbar/private/SuggestFeature.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  QuickSuggest: "resource:///modules/QuickSuggest.sys.mjs",
  UrlbarPrefs: "resource:///modules/UrlbarPrefs.sys.mjs",
  UrlbarResult: "resource:///modules/UrlbarResult.sys.mjs",
  UrlbarUtils: "resource:///modules/UrlbarUtils.sys.mjs",
});

const SHOW_COUNTDOWN_THRESHOLD_DAYS = 30;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * A feature for dynamic suggestions served by the Suggest Rust component.
 * Dynamic Rust suggestions are not statically typed except for a few core
 * properties, so they can be used to serve many different types of suggestions
 * without any Rust changes. They are also used for hidden-exposure suggestions
 * (potential exposures).
 */
export class DynamicSuggestions extends SuggestProvider {
  get enablingPreferences() {
    return ["quicksuggest.dynamicSuggestionTypes"];
  }

  get additionalEnablingPredicate() {
    return !!this.dynamicSuggestionTypes.size;
  }

  get primaryUserControlledPreferences() {
    return ["suggest.realtimeOptIn"];
  }

  get rustSuggestionType() {
    return "Dynamic";
  }

  get rustProviderConstraints() {
    return {
      dynamicSuggestionTypes: [...this.dynamicSuggestionTypes],
    };
  }

  get dynamicSuggestionTypes() {
    // UrlbarPrefs converts this pref to a `Set` of type strings.
    return lazy.UrlbarPrefs.get("quicksuggest.dynamicSuggestionTypes");
  }

  isSuggestionSponsored(suggestion) {
    return !!suggestion.data?.result?.payload?.isSponsored;
  }

  getSuggestionTelemetryType(suggestion) {
    if (suggestion.data?.result?.payload?.hasOwnProperty("telemetryType")) {
      return suggestion.data.result.payload.telemetryType;
    }
    if (suggestion.data?.result?.isHiddenExposure) {
      return "exposure";
    }
    return suggestion.suggestionType;
  }

  makeResult(queryContext, suggestion, _searchString) {
    let { data } = suggestion;
    if (!data || typeof data != "object") {
      this.logger.warn(
        "suggestion.data is falsey or not an object, ignoring suggestion"
      );
      return null;
    }

    let { result } = data;
    if (!result || typeof result != "object") {
      this.logger.warn(
        "suggestion.data.result is falsey or not an object, ignoring suggestion"
      );
      return null;
    }

    let payload = {};
    if (result.hasOwnProperty("payload")) {
      if (typeof result.payload != "object") {
        this.logger.warn(
          "suggestion.data.result.payload is not an object, ignoring suggestion"
        );
        return null;
      }
      payload = result.payload;
    }

    if (result.isHiddenExposure) {
      return this.#makeExposureResult(suggestion, payload);
    }
    if (payload.type == "realtime_opt_in") {
      return this.#makeRealtimeOptInResult(suggestion, payload);
    }

    let isSponsored = !!payload.isSponsored;
    if (
      (isSponsored &&
        !lazy.UrlbarPrefs.get("suggest.quicksuggest.sponsored")) ||
      (!isSponsored &&
        !lazy.UrlbarPrefs.get("suggest.quicksuggest.nonsponsored"))
    ) {
      return null;
    }

    if (result.isImportantDate) {
      // @ts-ignore
      return this.#makeDateResult(payload);
    }

    let resultProperties = { ...result };
    delete resultProperties.payload;
    return Object.assign(
      new lazy.UrlbarResult(
        lazy.UrlbarUtils.RESULT_TYPE.URL,
        lazy.UrlbarUtils.RESULT_SOURCE.SEARCH,
        ...lazy.UrlbarResult.payloadAndSimpleHighlights(queryContext.tokens, {
          ...payload,
          isManageable: true,
          helpUrl: lazy.QuickSuggest.HELP_URL,
        })
      ),
      resultProperties
    );
  }

  /**
   * @typedef DatePayload
   *   The shape of an important dates suggestion payload.
   * @property {(string | [string, string])[]} dates
   *   An array of dates or date tuples in the format "YYYY-MM-DD".
   *   For a date tuple, the first value represents the start and the second
   *   the end date. This is assumed to be ordered oldest to newest.
   * @property {string} name
   *   The name of the event.
   */

  /**
   * Returns a string about the date of an event that can be displayed.
   *
   * @param {string | [string, string]} dateStr
   *   A string in the format "YYYY-MM-DD" representing a single
   *   day or a tuple of strings representing start and end days.
   * @returns {string}
   *   A localized string about the date of the event.
   */
  #formatDateOrRange(dateStr) {
    if (Array.isArray(dateStr)) {
      let format = new Intl.DateTimeFormat(Services.locale.appLocaleAsBCP47, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      let startDate = new Date(dateStr[0] + "T00:00");
      let endDate = new Date(dateStr[1] + "T00:00");
      return format.formatRange(startDate, endDate);
    }

    let format = new Intl.DateTimeFormat(Services.locale.appLocaleAsBCP47, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    let date = new Date(dateStr + "T00:00");
    return format.format(date);
  }

  /**
   * Returns a l10n object about the name of and time until an event
   * that can be used as the description of a urlbar result.
   *
   * @param {string | [string, string]} dateStr
   *   A string in the format "YYYY-MM-DD" representing a single
   *   day or a tuple of strings representing start and end days.
   * @param {string} name
   *   The name of the event.
   * @returns {?object}
   *   A l10n object or null if the event is in the past.
   */
  #formatDateCountdown(dateStr, name) {
    if (Array.isArray(dateStr)) {
      let daysUntilStart = this.#getDaysUntil(dateStr[0]);
      let daysUntilEnd = this.#getDaysUntil(dateStr[1]);
      if (daysUntilEnd < 0) {
        throw new Error("Date lies in the past.");
      }
      if (daysUntilStart > 0) {
        return {
          id: "urlbar-result-dates-countdown-range",
          args: { daysUntilStart, name },
        };
      }
      if (daysUntilEnd > 0) {
        return {
          id: "urlbar-result-dates-ongoing",
          args: { daysUntilEnd, name },
        };
      }
      return {
        id: "urlbar-result-dates-ends-today",
        args: { name },
      };
    }

    let daysUntil = this.#getDaysUntil(dateStr);
    if (daysUntil < 0) {
      throw new Error("Date lies in the past.");
    }
    if (daysUntil > 0) {
      return {
        id: "urlbar-result-dates-countdown",
        args: { daysUntilStart: daysUntil, name },
      };
    }
    return {
      id: "urlbar-result-dates-today",
      args: { name },
    };
  }

  /**
   * Returns the number of days until the specified date.
   *
   * @param {string} dateStr
   *   A string in the format "YYYY-MM-DD".
   * @returns {number}
   *   The time until the input date in days.
   */
  #getDaysUntil(dateStr) {
    let now = new Date();
    now.setHours(0, 0, 0, 0);
    let date = new Date(dateStr + "T00:00");

    let msUntil = date.getTime() - now.getTime();
    // Round to account for potential DST.
    return Math.round(msUntil / MS_PER_DAY);
  }

  /**
   * Creates a urlbar result from an important dates payload.
   *
   * @param {DatePayload} payload
   *   The important dates payload.
   * @returns {?UrlbarResult}
   *   A urlbar result or null if all instances are in the past.
   */
  #makeDateResult(payload) {
    let eventDateOrRange = payload.dates.find(
      // Find first entry where the end date is in the future.
      // This is always the upcoming occurrence since dates is ordered by time.
      d => this.#getDaysUntil(Array.isArray(d) ? d[1] : d) >= 0
    );
    if (!eventDateOrRange) {
      // All instances of the event are in the past.
      return null;
    }

    let daysUntilStart = this.#getDaysUntil(
      Array.isArray(eventDateOrRange) ? eventDateOrRange[0] : eventDateOrRange
    );

    let description, descriptionL10n;
    if (daysUntilStart > SHOW_COUNTDOWN_THRESHOLD_DAYS) {
      description = payload.name;
    } else {
      descriptionL10n = {
        ...this.#formatDateCountdown(eventDateOrRange, payload.name),
        cacheable: true,
        excludeArgsFromCacheKey: true,
      };
    }

    let dateString = this.#formatDateOrRange(eventDateOrRange);
    let [url] = lazy.UrlbarUtils.getSearchQueryUrl(
      Services.search.defaultEngine,
      payload.name
    );
    return Object.assign(
      new lazy.UrlbarResult(
        lazy.UrlbarUtils.RESULT_TYPE.URL,
        lazy.UrlbarUtils.RESULT_SOURCE.SEARCH,
        {
          title: dateString,
          description,
          descriptionL10n,
          url,
          icon: "chrome://browser/skin/calendar-24.svg",
          helpUrl: lazy.QuickSuggest.HELP_URL,
          isManageable: true,
          isBlockable: true,
        },
        {
          title: [
            // Make whole title bold.
            [0, dateString.length],
          ],
        }
      ),
      {
        isBestMatch: true,
        hideRowLabel: true,
        richSuggestionIconSize: 24,
      }
    );
  }

  onEngagement(_queryContext, controller, details, _searchString) {
    if (details.result.payload?.type == "realtime_opt_in") {
      this.#onRealtimeOptInEngagement(controller, details);
      return;
    }

    switch (details.selType) {
      case "manage":
        // "manage" is handled by UrlbarInput, no need to do anything here.
        break;
      case "dismiss": {
        let { result } = details;
        lazy.QuickSuggest.dismissResult(result);
        result.acknowledgeDismissalL10n = {
          id: "firefox-suggest-dismissal-acknowledgment-one",
        };
        controller.removeResult(result);
        break;
      }
    }
  }

  #makeExposureResult(suggestion, payload) {
    // It doesn't really matter what kind of result we return since it won't be
    // shown. Use a dynamic result since that kind of makes sense and there are
    // no requirements for its payload other than `dynamicType`.
    return Object.assign(
      new lazy.UrlbarResult(
        lazy.UrlbarUtils.RESULT_TYPE.DYNAMIC,
        lazy.UrlbarUtils.RESULT_SOURCE.SEARCH,
        {
          ...payload,
          dynamicType: "exposure",
        }
      ),
      {
        // Exposure suggestions should always be hidden, and it's assumed that
        // exposure telemetry should be recorded for them, so as a convenience
        // set `exposureTelemetry` here. Otherwise experiments would need to set
        // the corresponding Nimbus variables properly. (They can still do that,
        // it's just not required.)
        exposureTelemetry: lazy.UrlbarUtils.EXPOSURE_TELEMETRY.HIDDEN,
      }
    );
  }

  #makeRealtimeOptInResult(suggestion, payload) {
    let realtimeType = suggestion.data.result.realtimeType;

    if (!this.#shouldRealtimeOptInDisplay(realtimeType)) {
      return null;
    }

    let notNowTypes = lazy.UrlbarPrefs.get(
      "quicksuggest.realtimeOptIn.notNowTypes"
    );
    let splitButtonMain = notNowTypes.has(realtimeType)
      ? {
          command: "dismiss",
          l10n: { id: "urlbar-result-realtime-opt-in-dismiss" },
        }
      : {
          command: "not_now",
          l10n: { id: "urlbar-result-realtime-opt-in-not-now" },
        };

    let result = { ...suggestion.data.result };
    delete result.payload;

    return Object.assign(
      new lazy.UrlbarResult(
        lazy.UrlbarUtils.RESULT_TYPE.TIP,
        lazy.UrlbarUtils.RESULT_SOURCE.OTHER_LOCAL,
        {
          ...payload,
          buttons: [
            {
              command: "opt_in",
              l10n: { id: "urlbar-result-realtime-opt-in-allow" },
            },
            {
              ...splitButtonMain,
              menu: [
                {
                  name: "not_interested",
                  l10n: {
                    id: "urlbar-result-realtime-opt-in-dismiss-all",
                  },
                },
              ],
            },
          ],
        }
      ),
      { ...result }
    );
  }

  #shouldRealtimeOptInDisplay(realtimeType) {
    if (
      !lazy.UrlbarPrefs.get("suggest.realtimeOptIn") ||
      lazy.UrlbarPrefs.get("quicksuggest.dataCollection.enabled")
    ) {
      return false;
    }

    let dismissTypes = lazy.UrlbarPrefs.get(
      "quicksuggest.realtimeOptIn.dismissTypes"
    );
    if (dismissTypes.has(realtimeType)) {
      return false;
    }

    let notNowTimeSeconds = lazy.UrlbarPrefs.get(
      "quicksuggest.realtimeOptIn.notNowTimeSeconds"
    );
    if (!notNowTimeSeconds) {
      return true;
    }

    let notNowReshowAfterPeriodDays = lazy.UrlbarPrefs.get(
      "quicksuggest.realtimeOptIn.notNowReshowAfterPeriodDays"
    );

    let timeSecs = notNowReshowAfterPeriodDays * 24 * 60 * 60;
    return Date.now() / 1000 - notNowTimeSeconds > timeSecs;
  }

  #onRealtimeOptInEngagement(controller, details) {
    switch (details.selType) {
      case "opt_in":
        lazy.UrlbarPrefs.set("quicksuggest.dataCollection.enabled", true);
        controller.input.startQuery({ allowAutofill: false });
        break;
      case "not_now": {
        lazy.UrlbarPrefs.set(
          "quicksuggest.realtimeOptIn.notNowTimeSeconds",
          Date.now() / 1000
        );
        lazy.UrlbarPrefs.add(
          "quicksuggest.realtimeOptIn.notNowTypes",
          details.result.realtimeType
        );
        controller.removeResult(details.result);
        break;
      }
      case "dismiss": {
        lazy.UrlbarPrefs.add(
          "quicksuggest.realtimeOptIn.dismissTypes",
          details.result.realtimeType
        );
        details.result.acknowledgeDismissalL10n = {
          id: "urlbar-result-dismissal-acknowledgment-market",
        };
        controller.removeResult(details.result);
        break;
      }
      case "not_interested": {
        lazy.UrlbarPrefs.set("suggest.realtimeOptIn", false);
        details.result.acknowledgeDismissalL10n = {
          id: "urlbar-result-dismissal-acknowledgment-all",
        };
        controller.removeResult(details.result);
        break;
      }
    }
  }
}
