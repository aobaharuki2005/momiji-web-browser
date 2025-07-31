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
      { realtimeType }
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
      case "not_now":
        lazy.UrlbarPrefs.set(
          "quicksuggest.realtimeOptIn.notNowTimeSeconds",
          Date.now() / 1000
        );
        let notNowTypes = lazy.UrlbarPrefs.get(
          "quicksuggest.realtimeOptIn.notNowTypes"
        );
        notNowTypes.add(details.result.realtimeType);
        lazy.UrlbarPrefs.set(
          "quicksuggest.realtimeOptIn.notNowTypes",
          [...notNowTypes].join(",")
        );
        controller.removeResult(details.result);
        break;
      case "dismiss":
        let dismissTypes = lazy.UrlbarPrefs.get(
          "quicksuggest.realtimeOptIn.dismissTypes"
        );
        dismissTypes.add(details.result.realtimeType);
        lazy.UrlbarPrefs.set(
          "quicksuggest.realtimeOptIn.dismissTypes",
          [...dismissTypes].join(",")
        );
        details.result.acknowledgeDismissalL10n = {
          id: "urlbar-result-dismissal-acknowledgment-market",
        };
        controller.removeResult(details.result);
        break;
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
