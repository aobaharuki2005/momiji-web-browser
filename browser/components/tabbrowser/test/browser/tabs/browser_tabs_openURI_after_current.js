/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const {
  openFirefoxViewTab,
  closeFirefoxViewTab,
  init: FirefoxViewTestUtilsInit,
} = ChromeUtils.importESModule(
  "resource://testing-common/FirefoxViewTestUtils.sys.mjs"
);

FirefoxViewTestUtilsInit(this, window);

add_setup(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "browser.link.open_newwindow.override.external",
        Ci.nsIBrowserDOMWindow.OPEN_NEWTAB_AFTER_CURRENT,
      ],
    ],
  });
});

registerCleanupFunction(async () => {
  await SpecialPowers.popPrefEnv();
});

/**
 * Simulates opening a link external to Firefox, returning the newly created tab.
 *
 * @returns {Promise<MozTabbrowserTab>}
 */
async function openExternalLink() {
  const tabOpen = BrowserTestUtils.waitForEvent(window, "TabOpen");
  window.browserDOMWindow.openURI(
    Services.io.newURI("data:text/plain,external%20URL"),
    null,
    Ci.nsIBrowserDOMWindow.OPEN_DEFAULTWINDOW,
    Ci.nsIBrowserDOMWindow.OPEN_EXTERNAL,
    Services.scriptSecurityManager.createNullPrincipal({})
  );
  return (await tabOpen).target;
}

add_task(async function test_browser_tabs_openURI_after_current() {
  info("Set up the initial conditions");
  const initialTab = gBrowser.selectedTab;
  const pinnedTab1 = BrowserTestUtils.addTab(gBrowser, "about:blank", {
    skipAnimation: true,
    pinned: true,
  });
  const pinnedTab2 = BrowserTestUtils.addTab(gBrowser, "about:blank", {
    skipAnimation: true,
    pinned: true,
  });
  const groupedTab1 = BrowserTestUtils.addTab(gBrowser, "about:blank", {
    skipAnimation: true,
  });
  const groupedTab2 = BrowserTestUtils.addTab(gBrowser, "about:blank", {
    skipAnimation: true,
  });
  const tabGroup = gBrowser.addTabGroup([groupedTab1, groupedTab2]);
  const lastTab = BrowserTestUtils.addTab(gBrowser, "about:blank", {
    skipAnimation: true,
  });

  Assert.deepEqual(
    gBrowser.tabs,
    [pinnedTab1, pinnedTab2, initialTab, groupedTab1, groupedTab2, lastTab],
    "validating the correct initial conditions"
  );

  info(
    "When active tab is a pinned tab, external link should open as first unpinned tab"
  );
  gBrowser.selectedTab = pinnedTab1;
  const tabFromPinnedTab = await openExternalLink();
  Assert.equal(
    gBrowser.selectedTab,
    tabFromPinnedTab,
    "new tab should be the active tab"
  );
  Assert.ok(!tabFromPinnedTab.pinned, "new tab should not be pinned");
  Assert.equal(
    tabFromPinnedTab.elementIndex,
    gBrowser.pinnedTabCount,
    "new tab should be the first unpinned tab"
  );
  BrowserTestUtils.removeTab(tabFromPinnedTab);

  info(
    "When active tab is in a tab group, external link should open as first ungrouped tab after the tab group"
  );
  gBrowser.selectedTab = groupedTab1;
  const tabFromGroupedTab = await openExternalLink();
  Assert.equal(
    gBrowser.selectedTab,
    tabFromGroupedTab,
    "new tab should be the active tab"
  );
  Assert.ok(!tabFromGroupedTab.group, "new tab should not be in a tab group");
  Assert.equal(
    tabFromGroupedTab.elementIndex,
    tabGroup.tabs.at(-1).elementIndex + 1,
    "new tab should be just after the tab group"
  );
  BrowserTestUtils.removeTab(tabFromGroupedTab);

  info(
    "When active tab is Firefox View, external link should open at the end of the tab strip"
  );
  await openFirefoxViewTab(window);
  const tabFromFirefoxView = await openExternalLink();
  Assert.equal(
    gBrowser.selectedTab,
    tabFromFirefoxView,
    "new tab should be the active tab"
  );
  Assert.equal(
    tabFromFirefoxView,
    gBrowser.tabs.at(-1),
    "new tab should be the last tab in the tab strip"
  );
  BrowserTestUtils.removeTab(tabFromFirefoxView);
  closeFirefoxViewTab(window);

  info(
    "When active tab is ungrouped and unpinned, external link should open right after it"
  );
  gBrowser.selectedTab = initialTab;
  const tabFromInitialTab = await openExternalLink();
  Assert.equal(
    gBrowser.selectedTab,
    tabFromInitialTab,
    "new tab should be the active tab"
  );
  Assert.equal(
    tabFromInitialTab.elementIndex,
    initialTab.elementIndex + 1,
    "new tab should be after the previously active tab"
  );
  BrowserTestUtils.removeTab(tabFromInitialTab);

  info("Leave the test window with only the initial tab remaining");
  await TabGroupTestUtils.removeTabGroup(tabGroup);
  BrowserTestUtils.removeTab(pinnedTab1);
  BrowserTestUtils.removeTab(pinnedTab2);
  BrowserTestUtils.removeTab(lastTab);
});
