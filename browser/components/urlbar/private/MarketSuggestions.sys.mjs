/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { RealtimeSuggestProvider } from "resource:///modules/urlbar/private/RealtimeSuggestProvider.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  UrlbarSearchUtils: "resource:///modules/UrlbarSearchUtils.sys.mjs",
});

/**
 * A feature that supports Market suggestions like stocks, indexes, and funds.
 */
export class MarketSuggestions extends RealtimeSuggestProvider {
  get realtimeType() {
    return "market";
  }

  get isSponsored() {
    return false;
  }

  get merinoProvider() {
    return "polygon";
  }

  makeMerinoResult(queryContext, suggestion, searchString) {
    if (!suggestion.custom_details?.polygon?.values?.length) {
      return null;
    }

    let engine = lazy.UrlbarSearchUtils.getDefaultEngine(
      queryContext.isPrivate
    );
    if (!engine) {
      return null;
    }

    let result = super.makeMerinoResult(queryContext, suggestion, searchString);
    if (!result) {
      return null;
    }

    result.payload.engine = engine.name;

    return result;
  }

  getViewTemplate(result) {
    return {
      children: result.payload.polygon.values.map((_v, i) => ({
        name: `item_${i}`,
        tag: "span",
        classList: ["urlbarView-button", "urlbarView-market-item"],
        attributes: {
          selectable: "",
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
              },
              {
                name: `last_price_${i}`,
                tag: "span",
                classList: ["urlbarView-market-last-price"],
              },
            ],
          },
        ],
      })),
    };
  }

  getViewUpdate(result) {
    return Object.fromEntries(
      result.payload.polygon.values.flatMap((v, i) => {
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

        return Object.entries({
          [`item_${i}`]: {
            dataset: {
              query: v.query,
            },
          },
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
            classList: todaysChangePercClassList,
          },
          [`last_price_${i}`]: {
            textContent: v.last_price,
          },
        });
      })
    );
  }
}
