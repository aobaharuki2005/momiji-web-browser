/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const OFFLINE_REMOTE_SETTINGS = [
  {
    type: "dynamic-suggestions",
    suggestion_type: "realtime_opt_in",
    attachment: [
      {
        keywords: ["stock"],
        data: {
          result: {
            isBestMatch: true,
            realtimeType: "market",
            testAttribute: "market-test",
            payload: {
              type: "realtime_opt_in",
              icon: "chrome://browser/skin/illustrations/market-opt-in.svg",
              titleL10n: {
                id: "urlbar-result-market-opt-in-title",
              },
              descriptionL10n: {
                id: "urlbar-result-market-opt-in-description",
              },
            },
          },
        },
      },
      {
        keywords: ["sports"],
        data: {
          result: {
            isBestMatch: true,
            realtimeType: "sports",
            testAttribute: "sports-test",
            payload: {
              type: "realtime_opt_in",
              icon: "chrome://browser/skin/illustrations/market-opt-in.svg",
              titleL10n: {
                id: "urlbar-result-market-opt-in-title",
              },
              descriptionL10n: {
                id: "urlbar-result-market-opt-in-description",
              },
            },
          },
        },
      },
    ],
  },
];

const TEST_MERINO_SINGLE = [
  {
    provider: "polygon",
    is_sponsored: false,
    score: 0,
    custom_details: {
      polygon: {
        values: [
          {
            image_url: "https://example.com/aapl.svg",
            query: "AAPL stock",
            name: "Apple Inc",
            ticker: "AAPL",
            todays_change_perc: "-0.54",
            last_price: "$181.98 USD",
          },
        ],
      },
    },
  },
];

add_setup(async function () {
  await QuickSuggestTestUtils.ensureQuickSuggestInit({
    remoteSettingsRecords: OFFLINE_REMOTE_SETTINGS,
    merinoSuggestions: TEST_MERINO_SINGLE,
  });
  await UrlbarTestUtils.initNimbusFeature({
    quickSuggestDynamicSuggestionTypes: "realtime_opt_in",
  });

  registerCleanupFunction(() => {
    UrlbarPrefs.clear("suggest.realtimeOptIn");
    UrlbarPrefs.clear("quicksuggest.dataCollection.enabled");
  });
});

add_task(async function opt_in() {
  UrlbarPrefs.set("quicksuggest.dataCollection.enabled", false);

  let { element, result } = await openRealtimeSuggestion({ input: "stock" });
  Assert.ok(result.isBestMatch);
  Assert.equal(result.realtimeType, "market");
  Assert.equal(result.testAttribute, "market-test");
  Assert.equal(result.type, UrlbarUtils.RESULT_TYPE.TIP);

  info(
    "Click allow button that changes dataCollection pref and starts new query with same keyword"
  );
  let allowButton = element.row.querySelector(".urlbarView-button-0");
  EventUtils.synthesizeMouseAtCenter(allowButton, {});
  await UrlbarTestUtils.promiseSearchComplete(window);
  let { result: merinoResult } = await UrlbarTestUtils.getDetailsOfResultAt(
    window,
    1
  );
  Assert.ok(UrlbarPrefs.get("quicksuggest.dataCollection.enabled"));
  Assert.equal(merinoResult.payload.source, "merino");
  Assert.equal(merinoResult.payload.provider, "polygon");
  Assert.equal(merinoResult.payload.dynamicType, "market");
  info("Allow button works");

  await UrlbarTestUtils.promisePopupClose(window);

  UrlbarPrefs.clear("quicksuggest.dataCollection.enabled");
});

add_task(async function dismiss() {
  UrlbarPrefs.set("quicksuggest.dataCollection.enabled", false);
  UrlbarPrefs.clear("quicksuggest.realtimeOptIn.notNowTimeSeconds");
  UrlbarPrefs.clear("quicksuggest.realtimeOptIn.notNowTypes");
  UrlbarPrefs.clear("quicksuggest.realtimeOptIn.dismissTypes");
  UrlbarPrefs.set("quicksuggest.realtimeOptIn.notNowReshowAfterPeriodDays", 3);

  info("Check the initial dismiss button state");
  let { element } = await openRealtimeSuggestion({ input: "stock" });
  let dismissButton = element.row.querySelector(".urlbarView-button-1");
  Assert.equal(dismissButton.dataset.command, "not_now");
  Assert.equal(
    dismissButton.dataset.l10nId,
    "urlbar-result-realtime-opt-in-not-now"
  );

  info("Check 'Not now' button behavior");
  EventUtils.synthesizeMouseAtCenter(dismissButton, {});
  await TestUtils.waitForCondition(
    () =>
      UrlbarPrefs.get("quicksuggest.realtimeOptIn.notNowTypes").has("market"),
    "Wait until quicksuggest.realtimeOptIn.notNowTypes pref changes"
  );
  Assert.notEqual(
    UrlbarPrefs.get("quicksuggest.realtimeOptIn.notNowTimeSeconds"),
    0
  );
  Assert.equal(
    UrlbarPrefs.get("quicksuggest.realtimeOptIn.dismissTypes").size,
    0
  );
  info("Not now button works");
  await UrlbarTestUtils.promisePopupClose(window);

  info(
    "Check whether the opt-in result will not be shown until having passed notNowReshowAfterPeriodDays days"
  );
  await assertOptInVisibility({ input: "stock", expectedVisibility: false });
  info("Simulate the passage of one day");
  let notNowTimeSeconds = UrlbarPrefs.get(
    "quicksuggest.realtimeOptIn.notNowTimeSeconds"
  );
  moveNotNowTimeSecondsEalier(notNowTimeSeconds, 1);
  await assertOptInVisibility({ input: "stock", expectedVisibility: false });
  info("Simulate the passage of two days");
  moveNotNowTimeSecondsEalier(notNowTimeSeconds, 2);
  await assertOptInVisibility({ input: "stock", expectedVisibility: false });
  info("Simulate the passage of three days");
  moveNotNowTimeSecondsEalier(notNowTimeSeconds, 3);
  await assertOptInVisibility({ input: "stock", expectedVisibility: true });
  notNowTimeSeconds = UrlbarPrefs.get(
    "quicksuggest.realtimeOptIn.notNowTimeSeconds"
  );

  info(
    "Check the dismiss button state after having passed notNowReshowAfterPeriodDays days"
  );
  element = (await openRealtimeSuggestion({ input: "stock" })).element;
  dismissButton = element.row.querySelector(".urlbarView-button-1");
  Assert.equal(dismissButton.dataset.command, "dismiss");
  Assert.equal(
    dismissButton.dataset.l10nId,
    "urlbar-result-realtime-opt-in-dismiss"
  );

  info("Check 'Dismiss' button behavior");
  EventUtils.synthesizeMouseAtCenter(dismissButton, {});
  await TestUtils.waitForCondition(
    () =>
      UrlbarPrefs.get("quicksuggest.realtimeOptIn.dismissTypes").has("market"),
    "Wait until quicksuggest.realtimeOptIn.dismissTypes pref changes"
  );
  Assert.equal(
    UrlbarPrefs.get("quicksuggest.realtimeOptIn.notNowTimeSeconds"),
    notNowTimeSeconds,
    "Not now time does not change"
  );
  Assert.ok(
    UrlbarPrefs.get("quicksuggest.realtimeOptIn.notNowTypes").size == 1 &&
      UrlbarPrefs.get("quicksuggest.realtimeOptIn.notNowTypes").has("market"),
    "notNowTypes does not change"
  );
  info("Dismiss button works");
  await UrlbarTestUtils.promisePopupClose(window);

  info("Once dismissed, the realtime type opt-in result shoud never shown");
  await assertOptInVisibility({ input: "stock", expectedVisibility: false });
  info("Simulate the passage of 1000 days");
  moveNotNowTimeSecondsEalier(notNowTimeSeconds, 1000);
  await assertOptInVisibility({ input: "stock", expectedVisibility: false });

  UrlbarPrefs.clear("quicksuggest.dataCollection.enabled");
  UrlbarPrefs.clear("quicksuggest.realtimeOptIn.notNowTimeSeconds");
  UrlbarPrefs.clear("quicksuggest.realtimeOptIn.notNowTypes");
  UrlbarPrefs.clear("quicksuggest.realtimeOptIn.dismissTypes");
  UrlbarPrefs.clear("quicksuggest.realtimeOptIn.notNowReshowAfterPeriodDays");
});

add_task(async function dismiss_with_another_type() {
  UrlbarPrefs.set("quicksuggest.dataCollection.enabled", false);
  UrlbarPrefs.clear("quicksuggest.realtimeOptIn.notNowTimeSeconds");
  UrlbarPrefs.clear("quicksuggest.realtimeOptIn.notNowTypes");
  UrlbarPrefs.clear("quicksuggest.realtimeOptIn.dismissTypes");
  UrlbarPrefs.set("quicksuggest.realtimeOptIn.notNowReshowAfterPeriodDays", 3);

  info("Sanity check - both types shoud be shown");
  await assertOptInVisibility({ input: "stock", expectedVisibility: true });
  await assertOptInVisibility({ input: "sports", expectedVisibility: true });

  info("Simulate user clicks 'Not now' for Market suggestion");
  UrlbarPrefs.set("quicksuggest.realtimeOptIn.notNowTypes", "market");
  let { element: marketElement } = await openRealtimeSuggestion({
    input: "stock",
  });
  let marketDismissButton = marketElement.row.querySelector(
    ".urlbarView-button-1"
  );
  Assert.equal(marketDismissButton.dataset.command, "dismiss");
  Assert.equal(
    marketDismissButton.dataset.l10nId,
    "urlbar-result-realtime-opt-in-dismiss"
  );
  await UrlbarTestUtils.promisePopupClose(window);
  let { element: sportsElement } = await openRealtimeSuggestion({
    input: "sports",
  });
  let sportsDismissButton = sportsElement.row.querySelector(
    ".urlbarView-button-1"
  );
  Assert.equal(sportsDismissButton.dataset.command, "not_now");
  Assert.equal(
    sportsDismissButton.dataset.l10nId,
    "urlbar-result-realtime-opt-in-not-now"
  );
  await UrlbarTestUtils.promisePopupClose(window);

  info("Simulate user clicks 'Dismiss' for Market suggestion");
  UrlbarPrefs.set("quicksuggest.realtimeOptIn.dismissTypes", "market");
  await assertOptInVisibility({ input: "stock", expectedVisibility: false });
  await assertOptInVisibility({ input: "sports", expectedVisibility: true });

  info("Click 'Not now' for sports suggestion");
  sportsElement = (await openRealtimeSuggestion({ input: "sports" })).element;
  sportsDismissButton = sportsElement.row.querySelector(".urlbarView-button-1");
  EventUtils.synthesizeMouseAtCenter(sportsDismissButton, {});
  await TestUtils.waitForCondition(
    () =>
      UrlbarPrefs.get("quicksuggest.realtimeOptIn.notNowTypes").has("sports"),
    "Wait until quicksuggest.realtimeOptIn.notNowTypes pref changes"
  );
  let notNowTimeSeconds = UrlbarPrefs.get(
    "quicksuggest.realtimeOptIn.notNowTimeSeconds"
  );
  Assert.notEqual(notNowTimeSeconds, 0);
  await assertOptInVisibility({ input: "stock", expectedVisibility: false });
  await assertOptInVisibility({ input: "sports", expectedVisibility: false });

  info("Simulate the passage of three days");
  moveNotNowTimeSecondsEalier(notNowTimeSeconds, 3);
  await assertOptInVisibility({ input: "stock", expectedVisibility: false });
  await assertOptInVisibility({ input: "sports", expectedVisibility: true });

  UrlbarPrefs.clear("quicksuggest.dataCollection.enabled");
  UrlbarPrefs.clear("quicksuggest.realtimeOptIn.notNowTimeSeconds");
  UrlbarPrefs.clear("quicksuggest.realtimeOptIn.notNowTypes");
  UrlbarPrefs.clear("quicksuggest.realtimeOptIn.dismissTypes");
  UrlbarPrefs.clear("quicksuggest.realtimeOptIn.notNowReshowAfterPeriodDays");
});

add_task(async function not_interested() {
  UrlbarPrefs.set("quicksuggest.dataCollection.enabled", false);
  UrlbarPrefs.set("suggest.realtimeOptIn", true);

  info("Click on dropdown button");
  let { element } = await openRealtimeSuggestion({ input: "stock" });

  const popup = gURLBar.view.resultMenu;
  const onPopupShown = BrowserTestUtils.waitForEvent(popup, "popupshown");
  const dropmarker = element.row.querySelector(
    ".urlbarView-splitbutton-dropmarker"
  );
  EventUtils.synthesizeMouseAtCenter(dropmarker, {});
  await onPopupShown;

  info("Activate the reject item");
  const onPopupHidden = BrowserTestUtils.waitForEvent(popup, "popuphidden");
  const targetMenuItem = popup.querySelector("menuitem");
  if (AppConstants.platform == "macosx") {
    // Synthesized clicks don't work in the native Mac menu.
    targetMenuItem.doCommand();
    popup.hidePopup(true);
  } else {
    EventUtils.synthesizeMouseAtCenter(targetMenuItem, {});
  }
  await onPopupHidden;
  await TestUtils.waitForCondition(
    () => !UrlbarPrefs.get("suggest.realtimeOptIn"),
    "Wait until suggest.realtimeOptIn pref changes"
  );
  info("Dismiss all item works");

  info("Any realtime type suggestoin never be shown");
  await assertOptInVisibility({ input: "stock", expectedVisibility: false });
  await assertOptInVisibility({ input: "sports", expectedVisibility: false });

  UrlbarPrefs.clear("quicksuggest.dataCollection.enabled");
  UrlbarPrefs.clear("suggest.realtimeOptIn");
});

async function openRealtimeSuggestion({ input }) {
  await BrowserTestUtils.waitForCondition(async () => {
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: input,
    });

    let result = UrlbarTestUtils.getResultCount(window) == 2;
    if (!result) {
      await UrlbarTestUtils.promisePopupClose(window);
    }
    return result;
  });
  return UrlbarTestUtils.getDetailsOfResultAt(window, 1);
}

async function assertOptInVisibility({ input, expectedVisibility }) {
  if (expectedVisibility) {
    let { result } = await openRealtimeSuggestion({ input });
    Assert.equal(
      result.payload.type,
      "realtime_opt_in",
      "Realtime suggestion opt-in result shoud be shown"
    );
  } else {
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: input,
    });
    const count = UrlbarTestUtils.getResultCount(window);
    Assert.equal(count, 1);
    let { result } = await UrlbarTestUtils.getDetailsOfResultAt(window, 0);
    Assert.notEqual(
      result.payload.type,
      "realtime_opt_in",
      "Realtime suggestion opt-in result shoud not be shown"
    );
  }

  await UrlbarTestUtils.promisePopupClose(window);
}

function moveNotNowTimeSecondsEalier(currentTime, days) {
  // Subtract an extra 60s just to make sure the returned time is at least
  // `days` ago.
  let newTime = currentTime - days * 24 * 60 * 60 - 60;
  UrlbarPrefs.set("quicksuggest.realtimeOptIn.notNowTimeSeconds", newTime);
}
