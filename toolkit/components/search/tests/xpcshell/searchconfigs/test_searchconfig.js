/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const test = new SearchConfigTest([
  {
    identifier: "amazondotcom-us",
    default: {
      // Not default anywhere.
    },
    available: {
      included: [
        {
          // The main regions we ship Amazon to. Below this are special cases.
          regions: ["us"],
        },
      ],
    },
    details: [
      {
        domain: "amazon.com",
        telemetryId: "amazondotcom-us-adm",
        aliases: ["@amazon"],
        included: [
          {
            regions: ["us"],
          },
        ],
        noSuggestionsURL: true,
        searchUrlCode: "tag=admarketus-20",
      },
    ],
  },
  {
    identifier: "baidu",
    aliases: ["@百度", "@baidu"],
    default: {
      included: [
        {
          regions: ["cn"],
          locales: ["zh-CN"],
        },
      ],
    },
    available: {
      included: [
        {
          locales: ["zh-CN"],
        },
      ],
    },
    details: [
      {
        included: [{}],
        domain: "baidu.com",
        telemetryId: "baidu",
      },
    ],
  },
  {
    identifier: "bing",
    aliases: ["@bing"],
    default: {
      // Not included anywhere.
    },
    available: {
      excluded: [
        // Should be available everywhere.
      ],
    },
    details: [
      {
        included: [{}],
        domain: "bing.com",
        telemetryId:
          SearchUtils.MODIFIED_APP_CHANNEL == "esr" ? "bing-esr" : "bing",
        searchUrlCode:
          SearchUtils.MODIFIED_APP_CHANNEL == "esr" ? "pc=MOZR" : "pc=MOZI",
      },
    ],
  },
  {
    identifier: "ddg",
    aliases: ["@duckduckgo", "@ddg"],
    default: {
      // Not included anywhere.
    },
    available: {
      excluded: [
        // Should be available everywhere.
      ],
    },
    details: [
      {
        included: [{}],
        domain: "duckduckgo.com",
        telemetryId:
          SearchUtils.MODIFIED_APP_CHANNEL == "esr" ? "ddg-esr" : "ddg",
        searchUrlCode:
          SearchUtils.MODIFIED_APP_CHANNEL == "esr" ? "t=ftsa" : "t=ffab",
      },
    ],
  },
  {
    identifier: "ecosia",
    aliases: [],
    default: {
      // Not default anywhere.
    },
    available: {
      included: [
        {
          locales: ["de"],
        },
        {
          regions: ["at", "be", "ch", "de", "es", "it", "nl", "se"],
        },
      ],
    },
    details: [
      {
        included: [{}],
        domain: "www.ecosia.org",
        telemetryId: "ecosia",
        searchUrlCode: "tt=mzl",
      },
    ],
  },
  {
    identifier: "qwant",
    aliases: ["@qwant"],
    default: {
      // Not default anywhere.
    },
    available: {
      included: [
        {
          locales: ["fr"],
        },
        {
          regions: ["be", "ch", "es", "fr", "it", "nl"],
        },
      ],
    },
    details: [
      {
        included: [{}],
        domain: "www.qwant.com",
        telemetryId: "qwant",
        searchUrlCode: "client=brz-moz",
        suggestUrlCode: "client=opensearch",
      },
    ],
  },
  {
    identifier: "yahoo-jp",
    aliases: [],
    default: {
      // Not default anywhere.
    },
    available: {
      included: [
        {
          locales: ["ja", "ja-JP-macos"],
        },
      ],
    },
    details: [
      {
        included: [{}],
        domain: "search.yahoo.co.jp",
        telemetryId: "yahoo-jp",
        searchUrlCode: "fr=mozff",
      },
    ],
  },
]);

add_setup(async function () {
  await test.setup();
});

add_task(async function test_searchConfigs() {
  await test.run();
});
