/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const REMOTE_SETTINGS_RECORDS = [
  {
    type: "dynamic-suggestions",
    suggestion_type: "important_dates",
    attachment: [
      {
        keywords: [["event", [" 1"]]],
        data: {
          result: {
            isImportantDate: true,
            payload: {
              dates: ["2025-03-05", "2026-02-18"],
              name: "Event 1",
              notes: "Always the first Monday in January.",
            },
          },
        },
      },
      {
        keywords: [["multi d", ["ay event"]]],
        data: {
          result: {
            isImportantDate: true,
            payload: {
              dates: [
                ["2025-06-10", "2025-06-20"],
                ["2026-06-10", "2026-06-20"],
              ],
              name: "Multi Day Event",
            },
          },
        },
      },
    ],
  },
];

let SystemDate;

add_setup(async function () {
  await QuickSuggestTestUtils.ensureQuickSuggestInit({
    remoteSettingsRecords: REMOTE_SETTINGS_RECORDS,
    prefs: [
      ["quicksuggest.dynamicSuggestionTypes", "important_dates"],
      ["suggest.quicksuggest.nonsponsored", true],
      ["suggest.quicksuggest.sponsored", true],
      ["quicksuggest.ampTopPickCharThreshold", 0],
    ],
  });
  await Services.search.init();

  SystemDate = Cu.getGlobalForObject(QuickSuggestTestUtils).Date;
});

add_task(async function fourDaysBefore() {
  setTime("2025-03-01T00:00");

  let query = "event 1";
  let expected = makeExpectedResult({
    date: "Wednesday, March 5, 2025",
    name: "Event 1",
    descriptionL10n: {
      id: "urlbar-result-dates-countdown",
      args: { daysUntilStart: 4 },
    },
  });

  await checkDatesResults(query, expected);
});

add_task(async function onDayOfEvent() {
  setTime("2025-03-05T00:00");

  let query = "event 1";
  let expected = makeExpectedResult({
    date: "Wednesday, March 5, 2025",
    name: "Event 1",
    descriptionL10n: { id: "urlbar-result-dates-today" },
  });

  await checkDatesResults(query, expected);
});

add_task(async function oneDayAfter() {
  setTime("2025-03-06T00:00");

  let query = "event 1";
  let expected = makeExpectedResult({
    // Should select the event in the next year.
    date: "Wednesday, February 18, 2026",
    name: "Event 1",
    // Since the event is over SHOW_COUNTDOWN_THRESHOLD_DAYS days away,
    // it should display the formula instead of the countdown.
    description: "Always the first Monday in January.",
  });

  await checkDatesResults(query, expected);
});

add_task(async function afterAllInstances() {
  setTime("2027-01-01T00:00");

  let query = "event 1";
  let expected = null;

  await checkDatesResults(query, expected);
});

add_task(async function beforeMultiDay() {
  setTime("2025-06-09T23:59");

  let query = "multi day event";
  let expected = makeExpectedResult({
    date: "June 10 – 20, 2025",
    name: "Multi Day Event",
    descriptionL10n: {
      id: "urlbar-result-dates-countdown-range",
      args: { daysUntilStart: 1 },
    },
  });

  await checkDatesResults(query, expected);
});

add_task(async function duringMultiDay() {
  setTime("2025-06-19T00:00");

  let query = "multi day event";
  let expected = makeExpectedResult({
    date: "June 10 – 20, 2025",
    name: "Multi Day Event",
    descriptionL10n: {
      id: "urlbar-result-dates-ongoing",
      args: { daysUntilEnd: 1 },
    },
  });

  await checkDatesResults(query, expected);
});

add_task(async function lastDayDuringMultiDay() {
  setTime("2025-06-20T00:00");

  let query = "multi day event";
  let expected = makeExpectedResult({
    date: "June 10 – 20, 2025",
    name: "Multi Day Event",
    descriptionL10n: { id: "urlbar-result-dates-ends-today" },
  });

  await checkDatesResults(query, expected);
});

/**
 * Stubs the Date object of the system global to use timeStr
 * when the constructor is called without arguments.
 *
 * @param {string} timeStr
 *   An ISO time string.
 */
function setTime(timeStr) {
  let DateStub = function (...args) {
    if (!args.length) {
      return new SystemDate(timeStr);
    }
    return new SystemDate(...args);
  };
  DateStub.prototype = SystemDate.prototype;

  Object.getOwnPropertyNames(SystemDate).forEach(prop => {
    const desc = Object.getOwnPropertyDescriptor(SystemDate, prop);
    Object.defineProperty(DateStub, prop, desc);
  });

  Cu.getGlobalForObject(QuickSuggestTestUtils).Date = DateStub;
}

async function checkDatesResults(query, expected) {
  info(
    "Doing query: " +
      JSON.stringify({
        query,
        expected,
      })
  );
  await check_results({
    context: createContext(query, {
      providers: [UrlbarProviderQuickSuggest.name],
      isPrivate: false,
    }),
    matches: expected ? [expected] : [],
  });
}

function makeExpectedResult({
  date,
  name,
  description,
  descriptionL10n,
  isSponsored = false,
  isBestMatch = true,
  isRichSuggestion = undefined,
}) {
  return {
    type: UrlbarUtils.RESULT_TYPE.URL,
    source: UrlbarUtils.RESULT_SOURCE.SEARCH,
    heuristic: false,
    isBestMatch,
    isRichSuggestion,
    payload: {
      titleL10n: {
        id: "urlbar-result-dates-title",
        args: { date, name },
        parseMarkup: true,
        cacheable: true,
        excludeArgsFromCacheKey: true,
      },
      url: Services.search.defaultEngine.getSubmission(name).uri.spec,
      description,
      descriptionL10n: descriptionL10n
        ? { cacheable: true, excludeArgsFromCacheKey: true, ...descriptionL10n }
        : undefined,
      isSponsored,
      telemetryType: "important_dates",
      source: "rust",
      provider: "Dynamic",
      isManageable: true,
      isBlockable: true,
      helpUrl: QuickSuggest.HELP_URL,
      icon: "chrome://global/skin/icons/search-glass.svg",
    },
  };
}
