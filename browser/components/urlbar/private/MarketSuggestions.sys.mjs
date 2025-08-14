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
 * A feature that supports Market suggestions like stocks, indexes, and funds.
 */
export class MarketSuggestions extends SuggestProvider {
  get enablingPreferences() {
    return ["suggest.market", "suggest.quicksuggest.nonsponsored"];
  }

  get primaryUserControlledPreferences() {
    return ["suggest.market"];
  }

  get merinoProvider() {
    return "polygon";
  }

  getSuggestionTelemetryType() {
    return "market";
  }

  getResultCommands() {
    let commands = [
      {
        name: "not_interested",
        l10n: {
          id: "urlbar-result-menu-dont-show-market",
        },
      },
    ];

    if (this.canShowLessFrequently) {
      commands.push({
        name: "show_less_frequently",
        l10n: {
          id: "urlbar-result-menu-show-less-frequently",
        },
      });
    }

    commands.push(
      { name: "separator" },
      {
        name: "manage",
        l10n: {
          id: "urlbar-result-menu-manage-firefox-suggest",
        },
      },
      {
        name: "help",
        l10n: {
          id: "urlbar-result-menu-learn-more-about-firefox-suggest",
        },
      }
    );

    return commands;
  }

  getViewTemplate(result) {
    return {
      children: result.payload.polygon.values.map((v, i) => {
        let todaysChangePercClassList = [
          "urlbarView-market-todays-change-perc",
        ];
        let todaysChangePerc = Number(v.todays_change_perc);
        if (todaysChangePerc < 0) {
          todaysChangePercClassList.push(
            "urlbarView-market-todays-change-perc-minus"
          );
        } else if (todaysChangePerc > 0) {
          todaysChangePercClassList.push(
            "urlbarView-market-todays-change-perc-plus"
          );
        }

        return {
          name: "item",
          tag: "span",
          classList: ["urlbarView-button"],
          attributes: {
            selectable: "",
            query: v.query,
          },
          children: [
            {
              name: `image_${i}`,
              tag: "img",
              classList: ["urlbarView-market-image"],
            },
            {
              tag: "span",
              classList: ["urlbarView-market-description"],
              children: [
                {
                  name: `name_${i}`,
                  tag: "span",
                  classList: ["urlbarView-market-name"],
                },
                {
                  name: `todays_change_perc_${i}`,
                  tag: "span",
                  classList: todaysChangePercClassList,
                },
                {
                  name: `last_price_${i}`,
                  tag: "span",
                  classList: ["urlbarView-market-last-price"],
                },
              ],
            },
          ],
        };
      }),
    };
  }

  getViewUpdate(result) {
    return Object.assign(
      {},
      ...result.payload.polygon.values.map((v, i) => ({
        [`image_${i}`]: {
          attributes: {
            src: v.image_url || "chrome://global/skin/icons/search-glass.svg",
          },
        },
        [`name_${i}`]: {
          textContent: v.name,
        },
        [`todays_change_perc_${i}`]: {
          textContent: `${v.todays_change_perc}%`,
        },
        [`last_price_${i}`]: {
          textContent: v.last_price,
        },
      }))
    );
  }

  async makeResult(queryContext, suggestion, searchString) {
    if (!this.isEnabled) {
      return null;
    }

    if (
      this.showLessFrequentlyCount &&
      searchString.length < this.#minKeywordLength
    ) {
      return null;
    }

    return Object.assign(
      new lazy.UrlbarResult(
        lazy.UrlbarUtils.RESULT_TYPE.DYNAMIC,
        lazy.UrlbarUtils.RESULT_SOURCE.SEARCH,
        {
          ...suggestion.custom_details,
          dynamicType: "market",
        }
      ),
      {
        isBestMatch: true,
        hideRowLabel: true,
      }
    );
  }

  onEngagement(_queryContext, controller, details, searchString) {
    let { result } = details;
    switch (details.selType) {
      case "help":
      case "manage": {
        // "help" and "manage" are handled by UrlbarInput, no need to do
        // anything here.
        return;
      }
      case "not_interested": {
        lazy.UrlbarPrefs.set("suggest.market", false);
        result.acknowledgeDismissalL10n = {
          id: "urlbar-result-dismissal-acknowledgment-market",
        };
        controller.removeResult(result);
        return;
      }
      case "show_less_frequently": {
        controller.view.acknowledgeFeedback(result);
        this.incrementShowLessFrequentlyCount();
        if (!this.canShowLessFrequently) {
          controller.view.invalidateResultMenuCommands();
        }
        lazy.UrlbarPrefs.set(
          "market.minKeywordLength",
          searchString.length + 1
        );
        return;
      }
    }

    let query = details.element.getAttribute("query");
    let [url] = lazy.UrlbarUtils.getSearchQueryUrl(
      Services.search.defaultEngine,
      query
    );
    controller.browserWindow.openTrustedLinkIn(url, "current");
  }

  incrementShowLessFrequentlyCount() {
    if (this.canShowLessFrequently) {
      lazy.UrlbarPrefs.set(
        "market.showLessFrequentlyCount",
        this.showLessFrequentlyCount + 1
      );
    }
  }

  get showLessFrequentlyCount() {
    const count = lazy.UrlbarPrefs.get("market.showLessFrequentlyCount") || 0;
    return Math.max(count, 0);
  }

  get canShowLessFrequently() {
    const cap =
      lazy.UrlbarPrefs.get("marketShowLessFrequentlyCap") ||
      lazy.QuickSuggest.config.showLessFrequentlyCap ||
      0;
    return !cap || this.showLessFrequentlyCount < cap;
  }

  get #minKeywordLength() {
    let hasUserValue = Services.prefs.prefHasUserValue(
      "browser.urlbar.market.minKeywordLength"
    );
    let nimbusValue = lazy.UrlbarPrefs.get("marketMinKeywordLength");
    let minLength =
      hasUserValue || nimbusValue === null
        ? lazy.UrlbarPrefs.get("market.minKeywordLength")
        : nimbusValue;
    return Math.max(minLength, 0);
  }
}
