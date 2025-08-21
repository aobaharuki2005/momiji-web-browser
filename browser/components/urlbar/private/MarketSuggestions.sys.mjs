/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { RealtimeSuggestProvider } from "resource:///modules/urlbar/private/RealtimeSuggestProvider.sys.mjs";

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

    return super.makeMerinoResult(queryContext, suggestion, searchString);
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
}
