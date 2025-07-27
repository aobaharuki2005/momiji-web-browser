/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SuggestProvider } from "resource:///modules/urlbar/private/SuggestFeature.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  UrlbarResult: "resource:///modules/UrlbarResult.sys.mjs",
  UrlbarUtils: "resource:///modules/UrlbarUtils.sys.mjs",
});

/**
 * A feature that supports Stocks suggestions.
 */
export class StocksSuggestions extends SuggestProvider {
  get enablingPreferences() {
    return ["suggest.stocks", "suggest.quicksuggest.sponsored"];
  }

  get primaryUserControlledPreference() {
    return "suggest.stocks";
  }

  get merinoProvider() {
    return "polygon";
  }

  getViewTemplate(result) {
    return {
      children: result.payload.polygon.values.map((v, i) => {
        let todaysChangePercClassList = [
          "urlbarView-stocks-todays-change-perc",
        ];
        let todaysChangePerc = Number(v.todays_change_perc);
        if (todaysChangePerc < 0) {
          todaysChangePercClassList.push(
            "urlbarView-stocks-todays-change-perc-minus"
          );
        } else if (todaysChangePerc > 0) {
          todaysChangePercClassList.push(
            "urlbarView-stocks-todays-change-perc-plus"
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
              classList: ["urlbarView-stocks-image"],
            },
            {
              tag: "span",
              classList: ["urlbarView-stocks-description"],
              children: [
                {
                  name: `name_${i}`,
                  tag: "span",
                  classList: ["urlbarView-stocks-name"],
                },
                {
                  name: `todays_change_perc_${i}`,
                  tag: "span",
                  classList: todaysChangePercClassList,
                },
                {
                  name: `last_price_${i}`,
                  tag: "span",
                  classList: ["urlbarView-stocks-last-price"],
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
            src: v.image_url,
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

  async makeResult(queryContext, suggestion) {
    if (!this.isEnabled) {
      return null;
    }

    return new lazy.UrlbarResult(
      lazy.UrlbarUtils.RESULT_TYPE.DYNAMIC,
      lazy.UrlbarUtils.RESULT_SOURCE.SEARCH,
      {
        ...suggestion.custom_details,
        dynamicType: "stocks",
      }
    );
  }

  onEngagement(_queryContext, controller, details, _searchString) {
    let query = details.element.getAttribute("query");
    let [url] = lazy.UrlbarUtils.getSearchQueryUrl(
      Services.search.defaultEngine,
      query
    );
    controller.browserWindow.openTrustedLinkIn(url, "current");
  }
}
