/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Telemetry test for the visual search content context menu item, the one
// labeled "Search Image with {engine}".

// Expected source and action recorded by `BrowserSearchTelemetry`.
const EXPECTED_TELEMETRY_SOURCE = "contextmenu_visual";
const EXPECTED_TELEMETRY_ACTION = "search";

const CONTEXT_MENU_ID = "contentAreaContextMenu";
const VISUAL_SEARCH_MENUITEM_ID = "context-visual-search";

const TEST_PAGE_URL =
  "http://mochi.test:8888/browser/browser/components/search/test/browser/telemetry/browser_contentContextMenu.xhtml";

// The URL of the image in the test page.
const IMAGE_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAATklEQVRYhe3SIQ4AIBADwf7/04elBAtrVlSduGnSTDJ7cuT1PQJwwO+Hl7sAGAA07gjAAfgIBeAAoHFHAA7ARygABwCNOwJwAD5CATRgAYXh+kypw86nAAAAAElFTkSuQmCC";

const ENGINE_ID = "visual-search";
const ENGINE_NAME = "Visual Search Engine";
const ENGINE_URL = "https://example.com/visual-search";

const SEARCH_CONFIG = [
  {
    recordType: "engine",
    identifier: ENGINE_ID,
    base: {
      name: ENGINE_NAME,
      // Make sure the engine has a partner code so we can verify it's excluded
      // from telemetry.
      partnerCode: "test-partner-code",
      urls: {
        visualSearch: {
          base: ENGINE_URL,
          searchTermParamName: "url",
        },
      },
    },
    variants: [
      {
        environment: { allRegionsAndLocales: true },
      },
    ],
  },
  {
    recordType: "defaultEngines",
    globalDefault: ENGINE_ID,
    specificDefaults: [],
  },
  {
    recordType: "engineOrders",
    orders: [],
  },
];

SearchTestUtils.init(this);
SearchUITestUtils.init(this);

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["test.wait300msAfterTabSwitch", true],
      ["browser.search.visualSearch.featureGate", true],
    ],
  });

  await SearchTestUtils.updateRemoteSettingsConfig(SEARCH_CONFIG);

  let engine = await Services.search.getDefault();
  Assert.equal(
    engine.id,
    ENGINE_ID,
    "Sanity check: The visual search engine should be default"
  );
  Assert.equal(
    engine.partnerCode,
    "test-partner-code",
    "Sanity check: The visual search engine should have a partner code"
  );

  // Enable local telemetry recording for the duration of the tests.
  let canRecord = Services.telemetry.canRecordExtended;
  Services.telemetry.canRecordExtended = true;
  registerCleanupFunction(() => {
    Services.telemetry.canRecordExtended = canRecord;
  });

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    TEST_PAGE_URL
  );
  registerCleanupFunction(() => BrowserTestUtils.removeTab(tab));
});

add_task(async function nonPrivateWindow() {
  Services.fog.testResetFOG();
  TelemetryTestUtils.getAndClearKeyedHistogram("SEARCH_COUNTS");

  await openMenuAndClickItem();

  // sap.impression_counts labeled counter
  Assert.equal(
    Glean.sapImpressionCounts.contextmenuVisual[ENGINE_ID].testGetValue(),
    1,
    "contextmenuVisual should be recorded once for metric impressionCounts"
  );

  // `sap.counts` event and legacy `SEARCH_COUNTS` histogram
  await SearchUITestUtils.assertSAPTelemetry({
    // The partner code should be excluded.
    partnerCode: null,
    // `SEARCH_COUNTS` should not be updated.
    expectLegacyTelemetry: false,
    engineId: ENGINE_ID,
    engineName: ENGINE_NAME,
    source: EXPECTED_TELEMETRY_SOURCE,
    count: 1,
  });

  // `browser.engagement.navigation` labeled counter
  Assert.equal(
    Glean.browserEngagementNavigation.contextmenuVisual[
      EXPECTED_TELEMETRY_ACTION
    ].testGetValue(),
    1,
    "contextmenuVisual should be recorded once for metric browserEngagementNavigation"
  );
});

add_task(async function privateWindow_countsEnabled() {
  await doPrivateWindowTest(true);
});

add_task(async function privateWindow_countsDisabled() {
  await doPrivateWindowTest(false);
});

async function doPrivateWindowTest(shouldRecordCounts) {
  Services.fog.testResetFOG();
  TelemetryTestUtils.getAndClearKeyedHistogram("SEARCH_COUNTS");

  await SpecialPowers.pushPrefEnv({
    // This pref is the opposite of what it seems like it should be.
    set: [["browser.engagement.search_counts.pbm", !shouldRecordCounts]],
  });

  let win = await BrowserTestUtils.openNewBrowserWindow({
    private: true,
  });
  await BrowserTestUtils.openNewForegroundTab(win.gBrowser, TEST_PAGE_URL);

  await openMenuAndClickItem({ win });

  let expectedCount = shouldRecordCounts ? 1 : null;

  // sap.impression_counts labeled counter
  Assert.equal(
    Glean.sapImpressionCounts.contextmenuVisual[ENGINE_ID].testGetValue(),
    expectedCount,
    "contextmenuVisual should be recorded as expected for metric impressionCounts"
  );

  // `sap.counts` event and legacy `SEARCH_COUNTS` histogram
  if (expectedCount) {
    await SearchUITestUtils.assertSAPTelemetry({
      // The partner code should be excluded.
      partnerCode: null,
      // `SEARCH_COUNTS` should not be updated.
      expectLegacyTelemetry: false,
      engineId: ENGINE_ID,
      engineName: ENGINE_NAME,
      source: EXPECTED_TELEMETRY_SOURCE,
      count: expectedCount,
    });
  } else {
    Assert.equal(
      Glean.sap.counts.testGetValue(),
      null,
      "No sap.counts events should be recorded"
    );
  }

  // browser.engagement.navigation labeled counter
  Assert.equal(
    Glean.browserEngagementNavigation.contextmenuVisual[
      EXPECTED_TELEMETRY_ACTION
    ].testGetValue(),
    expectedCount,
    "contextmenuVisual should be recorded as expected for metric browserEngagementNavigation"
  );

  await BrowserTestUtils.closeWindow(win);
  await SpecialPowers.popPrefEnv();
}

async function openMenuAndClickItem({
  expectedEngineNameInLabel = ENGINE_NAME,
  expectedBaseUrl = ENGINE_URL,
  win = window,
} = {}) {
  let testTab = win.gBrowser.selectedTab;

  let { menu, item } = await openAndCheckMenu({
    win,
    expectedEngineNameInLabel,
    shouldBeShown: true,
  });

  // Click the visual search menuitem and wait for the SERP to load.
  let loadPromise = BrowserTestUtils.waitForNewTab(
    win.gBrowser,
    expectedBaseUrl + "?url=" + encodeURIComponent(IMAGE_URL),
    true
  );
  menu.activateItem(item);

  info("Waiting for visual search SERP to load");
  let serpTab = await loadPromise;
  info("Visual search SERP loaded");

  BrowserTestUtils.removeTab(serpTab);
  BrowserTestUtils.switchTab(win.gBrowser, testTab);
}

async function openAndCheckMenu({
  win,
  shouldBeShown,
  expectedEngineNameInLabel,
  selector = "#image",
}) {
  let menu = win.document.getElementById(CONTEXT_MENU_ID);
  let popupPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");

  info("Opening context menu");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    selector,
    { type: "contextmenu", button: 2 },
    win.gBrowser.selectedBrowser
  );

  info("Waiting for context menu to open");
  await popupPromise;
  info("Context menu opened");

  let item = win.document.getElementById(VISUAL_SEARCH_MENUITEM_ID);
  Assert.ok(item, "The visual search menuitem should exist");
  Assert.equal(
    item.hidden,
    !shouldBeShown,
    "The visual search menuitem should be shown as expected"
  );
  if (shouldBeShown) {
    Assert.equal(
      item.label,
      `Search Image with ${expectedEngineNameInLabel}`,
      "The visual search menuitem should have the expected label"
    );
  }

  return { menu, item };
}
