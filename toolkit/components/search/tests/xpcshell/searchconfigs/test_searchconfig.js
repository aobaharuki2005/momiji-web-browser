/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Wikipedia locale-to-domain mapping configuration
const WIKIPEDIA_LOCALES_INFO = [
  [["af"]],
  [["an"]],
  [["ar"]],
  [["ast"]],
  [["az"]],
  [["be"]],
  [["bg"]],
  [["bn"]],
  [["br"]],
  [["bs"]],
  [["ca", "ca-valencia"], "ca", "ca"],
  [["cs"], "cs", "cz"],
  [["cy"]],
  [["da"]],
  [["de"]],
  [["dsb"]],
  [["el"]],
  [["eo"]],
  [["cak", "es-AR", "es-CL", "es-ES", "es-MX", "trs"], "es", "es"],
  [["et"]],
  [["eu"]],
  [["fa"]],
  [["fi"]],
  [["fr", "ff", "son"], "fr", "fr"],
  [["fy-NL"], "fy", "fy-NL"],
  [["ga-IE"], "ga", "ga-IE"],
  [["gd"]],
  [["gl"]],
  [["gn"]],
  [["gu-IN"], "gu", "gu"],
  [["hi-IN"], "hi", "hi"],
  [["he"]],
  [["hr"]],
  [["hsb"]],
  [["hu"]],
  [["hy-AM"], "hy", "hy"],
  [["ia"]],
  [["id"]],
  [["is"]],
  [["ja", "ja-JP-macos"], "ja", "ja"],
  [["ka"]],
  [["kab"]],
  [["kk"]],
  [["km"]],
  [["kn"]],
  [["ko"], "ko", "kr"],
  [["it", "fur", "sc"], "it", "it"],
  [["lij"]],
  [["lo"]],
  [["lt"]],
  [["ltg"]],
  [["lv"]],
  [["mk"]],
  [["mr"]],
  [["ms"]],
  [["my"]],
  [["nb-NO"], "no", "NO"],
  [["ne-NP"], "ne", "ne"],
  [["nl"]],
  [["nn-NO"], "nn", "NN"],
  [["oc"]],
  [["pa-IN"], "pa", "pa"],
  [["pl", "szl"], "pl", "pl"],
  [["pt-BR", "pt-PT"], "pt", "pt"],
  [["rm"]],
  [["ro"]],
  [["ru"]],
  [["si"]],
  [["sk"]],
  [["sl"]],
  [["sq"]],
  [["sr"]],
  [["sv-SE"], "sv", "sv-SE"],
  [["ta"]],
  [["te"]],
  [["th"]],
  [["tl"]],
  [["tr"]],
  [["uk"]],
  [["ur"]],
  [["uz"]],
  [["vi"]],
  [["wo"]],
  [["zh-CN"], "zh", "zh-CN"],
  [["zh-TW"], "zh", "zh-TW"],
];

const wikipediaConfig = {
  identifierStartsWith: "wikipedia",
  default: {
    // Not default anywhere.
  },
  available: {
    excluded: [
      // Should be available everywhere.
    ],
  },
  details: [
    // Details will be populated in populateWikipediaConfig.
  ],
};

/**
 * Generates the expected details for the given locales and inserts
 * them into the wikipediaConfig.
 *
 * @param {string[]} locales
 *   The locales for this details entry - which locales this variant of
 *   Wikipedia is expected to be deployed to.
 * @param {string} [subDomainName]
 *   The expected sub domain name for this variant of Wikipedia. If not
 *   specified, defaults to the first item in the locales array.
 * @param {string} [telemetrySuffix]
 *   The expected suffix used when this variant is reported via telemetry. If
 *   not specified, defaults to the first item in the array. If this is the
 *   empty string, then it "wikipedia" (i.e. no suffix) will be the expected
 *   value.
 */
function generateExpectedDetails(locales, subDomainName, telemetrySuffix) {
  if (!subDomainName) {
    subDomainName = locales[0];
  }
  if (telemetrySuffix == undefined) {
    telemetrySuffix = locales[0];
  }
  wikipediaConfig.details.push({
    domain: `${subDomainName}.wikipedia.org`,
    telemetryId: telemetrySuffix ? `wikipedia-${telemetrySuffix}` : "wikipedia",
    required_aliases: ["@wikipedia"],
    included: [{ locales }],
  });
}

/**
 * Populates the Wikipedia configuration with locale-to-domain mappings.
 * For the "en" version of Wikipedia, we ship it to all locales where other
 * Wikipedias are not shipped.
 */
async function populateWikipediaConfig() {
  const allLocales = await test.getLocales();

  // Build list of locales for en.wikipedia.org
  let enLocales = [];
  for (let locale of allLocales) {
    if (!WIKIPEDIA_LOCALES_INFO.find(d => d[0].includes(locale))) {
      enLocales.push(locale);
    }
  }

  console.log("en.wikipedia.org expected locales are:", enLocales);
  generateExpectedDetails(enLocales, "en", "");

  for (let details of WIKIPEDIA_LOCALES_INFO) {
    generateExpectedDetails(...details);
  }
}

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
  wikipediaConfig,
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
  await populateWikipediaConfig();
  await test.setup();
});

add_task(async function test_searchConfigs() {
  await test.run();
});
