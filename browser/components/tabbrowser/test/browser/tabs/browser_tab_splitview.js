/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["sidebar.verticalTabs", true]],
  });
});

registerCleanupFunction(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.verticalTabs", false],
      ["sidebar.revamp", false],
      ["browser.tabs.splitView.enabled", false],
    ],
  });
});

async function addTabAndLoadBrowser() {
  const tab = BrowserTestUtils.addTab(gBrowser, "https://example.com");
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  return tab;
}

async function checkSplitViewPanelVisible(tab, isVisible) {
  const panel = document.getElementById(tab.linkedPanel);
  await BrowserTestUtils.waitForMutationCondition(
    panel,
    { attributes: true },
    () => panel.classList.contains("split-view-panel") == isVisible
  );
  if (isVisible) {
    Assert.ok(
      gBrowser.splitViewBrowsers.includes(tab.linkedBrowser),
      "Split view panel is active."
    );
  } else {
    Assert.ok(
      !gBrowser.splitViewBrowsers.includes(tab.linkedBrowser),
      "Split view panel is inactive."
    );
  }
}

function dragSplitter(deltaX, splitter) {
  AccessibilityUtils.setEnv({ mustHaveAccessibleRule: false });
  EventUtils.synthesizeMouseAtCenter(splitter, { type: "mousedown" });
  EventUtils.synthesizeMouse(splitter, deltaX, 0, { type: "mousemove" });
  EventUtils.synthesizeMouse(splitter, 0, 0, { type: "mouseup" });
  AccessibilityUtils.resetEnv();
}

/**
 * @param {MozTabbrowserTab} tab
 * @param {function(splitViewMenuItem: Element, unsplitMenuItem: Element) => Promise<void>} callback
 */
const withTabMenu = async function (tab, callback) {
  const tabContextMenu = document.getElementById("tabContextMenu");
  Assert.equal(
    tabContextMenu.state,
    "closed",
    "context menu is initially closed"
  );
  const contextMenuShown = BrowserTestUtils.waitForPopupEvent(
    tabContextMenu,
    "shown"
  );

  EventUtils.synthesizeMouseAtCenter(
    tab,
    { type: "contextmenu", button: 2 },
    window
  );
  await contextMenuShown;

  const moveTabToNewSplitViewItem = document.getElementById(
    "context_moveTabToSplitView"
  );
  const unsplitTabItem = document.getElementById("context_separateSplitView");

  let contextMenuHidden = BrowserTestUtils.waitForPopupEvent(
    tabContextMenu,
    "hidden"
  );
  await callback(moveTabToNewSplitViewItem, unsplitTabItem);
  tabContextMenu.hidePopup();
  info("Hide popup");
  return contextMenuHidden;
};

add_task(async function test_splitViewCreateAndAddTabs() {
  let tab1 = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let tab2 = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let tab3 = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let tab4 = BrowserTestUtils.addTab(gBrowser, "about:blank");

  // Add tabs to split view
  let splitview = gBrowser.addTabSplitView([tab1, tab2]);
  let splitview2 = gBrowser.addTabSplitView([tab3, tab4]);
  let tabbrowserTabs = document.getElementById("tabbrowser-tabs");
  await BrowserTestUtils.waitForMutationCondition(
    tabbrowserTabs,
    { childList: true },
    () => tabbrowserTabs.querySelectorAll("tab-split-view-wrapper").length === 2
  );

  Assert.ok(splitview.splitViewId, "Split view has id");
  Assert.equal(splitview.tabs.length, 2, "Split view has 2 tabs");
  Assert.ok(splitview.tabs.includes(tab1), "tab1 is in split view wrapper");
  Assert.ok(splitview.tabs.includes(tab2), "tab2 is in split view wrapper");

  Assert.ok(
    splitview2.splitViewId && splitview.splitViewId !== splitview2.splitViewId,
    "Split view has different id than split view 2"
  );
  Assert.equal(splitview2.tabs.length, 2, "Split view 2 has 2 tabs");
  Assert.ok(splitview2.tabs.includes(tab3), "tab3 is in split view wrapper");
  Assert.ok(splitview2.tabs.includes(tab4), "tab4 is in split view wrapper");

  Assert.ok(
    !splitview.hasAttribute("hasactivetab"),
    "The split view wrapper has the expected attribute when it does not contain the selected tab"
  );

  gBrowser.selectTabAtIndex(tab1._tPos);
  await BrowserTestUtils.waitForMutationCondition(
    splitview,
    { attributes: true, attributeFilter: ["hasactivetab"] },
    () => splitview.hasAttribute("hasactivetab")
  );
  Assert.ok(
    splitview.hasAttribute("hasactivetab"),
    "The split view wrapper has the expected attribute when it contains the selected tab"
  );

  // Unsplit tabs
  splitview.unsplitTabs();
  await BrowserTestUtils.waitForMutationCondition(
    tabbrowserTabs,
    { childList: true },
    () => tabbrowserTabs.querySelectorAll("tab-split-view-wrapper").length === 1
  );
  Assert.strictEqual(
    document.querySelectorAll("tab-split-view-wrapper").length,
    1,
    "Tabs have been unsplit from split view"
  );

  // Add tabs back to split view
  splitview = gBrowser.addTabSplitView([tab1, tab2]);

  // Remove split view and close tabs
  splitview.close();
  splitview2.close();
});

add_task(async function test_split_view_panels() {
  const tab1 = await addTabAndLoadBrowser();
  const tab2 = await addTabAndLoadBrowser();
  const originalTab = gBrowser.selectedTab;
  await BrowserTestUtils.switchTab(gBrowser, tab1);

  info("Activate split view.");
  const splitView = gBrowser.addTabSplitView([tab1, tab2]);
  for (const tab of splitView.tabs) {
    await checkSplitViewPanelVisible(tab, true);
  }

  info("Select tabs using tab panels.");
  await SimpleTest.promiseFocus(tab1.linkedBrowser);
  let panel = document.getElementById(tab1.linkedPanel);
  Assert.ok(
    panel.classList.contains("deck-selected"),
    "First panel is selected."
  );

  await SimpleTest.promiseFocus(tab2.linkedBrowser);
  panel = document.getElementById(tab2.linkedPanel);
  Assert.ok(
    panel.classList.contains("deck-selected"),
    "Second panel is selected."
  );

  info("Switch to a non-split view tab.");
  await BrowserTestUtils.switchTab(gBrowser, originalTab);
  for (const tab of splitView.tabs) {
    await checkSplitViewPanelVisible(tab, false);
  }

  info("Switch back to a split view tab.");
  await BrowserTestUtils.switchTab(gBrowser, tab1);
  for (const tab of splitView.tabs) {
    await checkSplitViewPanelVisible(tab, true);
  }

  info("Remove the split view, keeping tabs intact.");
  splitView.unsplitTabs();
  await checkSplitViewPanelVisible(tab1, false);
  await checkSplitViewPanelVisible(tab2, false);

  BrowserTestUtils.removeTab(tab1);
  BrowserTestUtils.removeTab(tab2);
});

add_task(async function test_split_view_preserves_multiple_pairings() {
  info("Create four tabs for two split view pairings.");
  const tab1 = await addTabAndLoadBrowser();
  const tab2 = await addTabAndLoadBrowser();
  const tab3 = await addTabAndLoadBrowser();
  const tab4 = await addTabAndLoadBrowser();

  info("Create two split views (Tab 1 + Tab 2) & (Tab 3 + Tab 4).");
  const splitView1 = gBrowser.addTabSplitView([tab1, tab2]);
  const splitView2 = gBrowser.addTabSplitView([tab3, tab4]);

  info("Switch to Tab 1 to activate the first split view.");
  await BrowserTestUtils.switchTab(gBrowser, tab1);
  await checkSplitViewPanelVisible(tab1, true);
  await checkSplitViewPanelVisible(tab2, true);
  await checkSplitViewPanelVisible(tab3, false);
  await checkSplitViewPanelVisible(tab4, false);

  info("Switch to Tab 3 to activate the second split view.");
  await BrowserTestUtils.switchTab(gBrowser, tab3);
  await checkSplitViewPanelVisible(tab1, false);
  await checkSplitViewPanelVisible(tab2, false);
  await checkSplitViewPanelVisible(tab3, true);
  await checkSplitViewPanelVisible(tab4, true);

  info("Switch back to the first split view.");
  await BrowserTestUtils.switchTab(gBrowser, tab1);
  await checkSplitViewPanelVisible(tab1, true);
  await checkSplitViewPanelVisible(tab2, true);
  await checkSplitViewPanelVisible(tab3, false);
  await checkSplitViewPanelVisible(tab4, false);

  splitView1.close();
  splitView2.close();
});

add_task(async function test_resize_split_view_panels() {
  const tab1 = await addTabAndLoadBrowser();
  const tab2 = await addTabAndLoadBrowser();
  await BrowserTestUtils.switchTab(gBrowser, tab1);

  info("Activate split view.");
  const splitView = gBrowser.addTabSplitView([tab1, tab2]);
  const { tabpanels } = gBrowser;
  await BrowserTestUtils.waitForMutationCondition(
    tabpanels,
    { childList: true },
    () => tabpanels.querySelector(".split-view-splitter")
  );
  await BrowserTestUtils.waitForMutationCondition(
    tabpanels.splitViewSplitter,
    { attributes: true },
    () => BrowserTestUtils.isVisible(tabpanels.splitViewSplitter)
  );

  info("Resize split view panels.");
  const leftPanel = document.getElementById(tab1.linkedPanel);
  const rightPanel = document.getElementById(tab2.linkedPanel);
  const originalLeftWidth = leftPanel.getBoundingClientRect().width;
  const originalRightWidth = rightPanel.getBoundingClientRect().width;
  dragSplitter(-100, tabpanels.splitViewSplitter);
  Assert.less(
    leftPanel.getBoundingClientRect().width,
    originalLeftWidth,
    "Left panel is smaller."
  );
  Assert.greater(
    rightPanel.getBoundingClientRect().width,
    originalRightWidth,
    "Right panel is larger."
  );

  splitView.close();
});

add_task(async function test_tabGroupContextMenuMoveTabsToNewGroup() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.splitView.enabled", true]],
  });
  const tab1 = await addTabAndLoadBrowser();
  const tab2 = await addTabAndLoadBrowser();
  const tab3 = await addTabAndLoadBrowser();
  let tabs = [tab1, tab2, tab3];

  // Click the first tab in our test split view to make sure the default tab at the
  // start of the tab strip is deselected
  EventUtils.synthesizeMouseAtCenter(tab1, {});

  tabs.forEach(t => {
    EventUtils.synthesizeMouseAtCenter(
      t,
      { ctrlKey: true, metaKey: true },
      window
    );
  });

  let tabToClick = tab3;
  await withTabMenu(
    tabToClick,
    async (moveTabToNewSplitViewItem, unsplitTabItem) => {
      await BrowserTestUtils.waitForMutationCondition(
        moveTabToNewSplitViewItem,
        { attributes: true },
        () =>
          !moveTabToNewSplitViewItem.hidden &&
          moveTabToNewSplitViewItem.disabled,
        "moveTabToNewSplitViewItem is visible and disabled"
      );
      Assert.ok(
        !moveTabToNewSplitViewItem.hidden && moveTabToNewSplitViewItem.disabled,
        "moveTabToNewSplitViewItem is visible and disabled"
      );
      await BrowserTestUtils.waitForMutationCondition(
        unsplitTabItem,
        { attributes: true },
        () => unsplitTabItem.hidden,
        "unsplitTabItem is hidden"
      );
      Assert.ok(unsplitTabItem.hidden, "unsplitTabItem is hidden");
    }
  );

  // Test opening split view from 2 non-consecutive tabs
  let tabContainer = document.getElementById("tabbrowser-arrowscrollbox");
  let tab3Index = Array.from(tabContainer.children).indexOf(tab3);
  EventUtils.synthesizeMouseAtCenter(tab3, {});
  tabToClick = tab3;

  [tabs[0], tabs[2]].forEach(t => {
    gBrowser.addToMultiSelectedTabs(t);
    ok(t.multiselected, "added tab to mutliselection");
  });

  await withTabMenu(
    tabToClick,
    async (moveTabToNewSplitViewItem, unsplitTabItem) => {
      await BrowserTestUtils.waitForMutationCondition(
        moveTabToNewSplitViewItem,
        { attributes: true },
        () =>
          !moveTabToNewSplitViewItem.hidden &&
          !moveTabToNewSplitViewItem.disabled,
        "moveTabToNewSplitViewItem is visible and not disabled"
      );
      Assert.ok(
        !moveTabToNewSplitViewItem.hidden &&
          !moveTabToNewSplitViewItem.disabled,
        "moveTabToNewSplitViewItem is visible and not disabled"
      );
      await BrowserTestUtils.waitForMutationCondition(
        unsplitTabItem,
        { attributes: true },
        () => unsplitTabItem.hidden,
        "unsplitTabItem is hidden"
      );
      Assert.ok(unsplitTabItem.hidden, "unsplitTabItem is hidden");

      info("Click menu option to add new split view");
      moveTabToNewSplitViewItem.click();
    }
  );

  await BrowserTestUtils.waitForMutationCondition(
    tabContainer,
    { children: true },
    () => {
      return (
        Array.from(tabContainer.children).some(
          tabChild => tabChild.tagName === "tab-split-view-wrapper"
        ) &&
        tab1.splitview &&
        tab3.splitview
      );
    },
    "Split view has been added"
  );
  info("Split view has been added");

  let splitview = tab1.splitview;
  [tab1, tab3].forEach((t, idx) => {
    Assert.equal(t.splitview, splitview, `tabs[${idx}] is in split view`);
  });
  Assert.equal(
    Array.from(tabContainer.children).indexOf(splitview),
    tab3Index - 1,
    "Non-consecutive tabs have been added to split view and moved to active tab location"
  );

  info("Unsplit split view");
  splitview.unsplitTabs();

  await BrowserTestUtils.waitForMutationCondition(
    tabContainer,
    { children: true },
    () => {
      return (
        !Array.from(tabContainer.children).some(
          tabChild => tabChild.tagName === "tab-split-view-wrapper"
        ) &&
        !tab1.splitview &&
        !tab3.splitview
      );
    },
    "Split view has been removed"
  );
  info("Split view has been removed");

  // Test adding consecutive tabs to a new split view

  EventUtils.synthesizeMouseAtCenter(tab1, {});

  [tab1, tab2].forEach(t => {
    EventUtils.synthesizeMouseAtCenter(
      t,
      { ctrlKey: true, metaKey: true },
      window
    );
  });

  tabToClick = tab2;
  await withTabMenu(
    tabToClick,
    async (moveTabToNewSplitViewItem, unsplitTabItem) => {
      await BrowserTestUtils.waitForMutationCondition(
        moveTabToNewSplitViewItem,
        { attributes: true },
        () =>
          !moveTabToNewSplitViewItem.hidden &&
          !moveTabToNewSplitViewItem.disabled,
        "moveTabToNewSplitViewItem is visible and not disabled"
      );
      Assert.ok(
        !moveTabToNewSplitViewItem.hidden &&
          !moveTabToNewSplitViewItem.disabled,
        "moveTabToNewSplitViewItem is visible and not disabled"
      );
      await BrowserTestUtils.waitForMutationCondition(
        unsplitTabItem,
        { attributes: true },
        () => unsplitTabItem.hidden,
        "unsplitTabItem is hidden"
      );
      Assert.ok(unsplitTabItem.hidden, "unsplitTabItem is hidden");

      info("Click menu option to add new split view");
      moveTabToNewSplitViewItem.click();
    }
  );

  await BrowserTestUtils.waitForMutationCondition(
    tabContainer,
    { children: true },
    () => {
      return (
        Array.from(tabContainer.children).some(
          tabChild => tabChild.tagName === "tab-split-view-wrapper"
        ) &&
        tab1.splitview &&
        tab2.splitview
      );
    },
    "Split view has been added"
  );
  info("Split view has been added");

  splitview = tab1.splitview;

  Assert.ok(tab1.splitview, "tab is in split view");
  [tab1, tab2].forEach((t, idx) => {
    Assert.equal(t.splitview, splitview, `tabs[${idx}] is in split view`);
  });

  // Test unsplitting tabs using context menu

  await withTabMenu(
    tabToClick,
    async (moveTabToNewSplitViewItem, unsplitTabItem) => {
      await BrowserTestUtils.waitForMutationCondition(
        moveTabToNewSplitViewItem,
        { attributes: true },
        () => moveTabToNewSplitViewItem.hidden,
        "moveTabToNewSplitViewItem is hidden"
      );
      Assert.ok(
        moveTabToNewSplitViewItem.hidden,
        "moveTabToNewSplitViewItem is hidden"
      );
      await BrowserTestUtils.waitForMutationCondition(
        unsplitTabItem,
        { attributes: true },
        () => !unsplitTabItem.hidden,
        "unsplitTabItem is visible"
      );
      Assert.ok(!unsplitTabItem.hidden, "unsplitTabItem is visible");

      info("Unsplit split view using menu option");
      unsplitTabItem.click();
    }
  );

  await BrowserTestUtils.waitForMutationCondition(
    tabContainer,
    { children: true },
    () => {
      return (
        !Array.from(tabContainer.children).some(
          tabChild => tabChild.tagName === "tab-split-view-wrapper"
        ) &&
        !tab1.splitview &&
        !tab2.splitview
      );
    },
    "Split view has been removed"
  );
  info("Split view has been removed");

  // Test adding split view with one tab and new tab

  tabToClick = tab1;
  EventUtils.synthesizeMouseAtCenter(tab1, {});

  await withTabMenu(
    tabToClick,
    async (moveTabToNewSplitViewItem, unsplitTabItem) => {
      await BrowserTestUtils.waitForMutationCondition(
        moveTabToNewSplitViewItem,
        { attributes: true },
        () =>
          !moveTabToNewSplitViewItem.hidden &&
          !moveTabToNewSplitViewItem.disabled,
        "moveTabToNewSplitViewItem is visible and not disabled"
      );
      Assert.ok(
        !moveTabToNewSplitViewItem.hidden &&
          !moveTabToNewSplitViewItem.disabled,
        "moveTabToNewSplitViewItem is visible and not disabled"
      );
      await BrowserTestUtils.waitForMutationCondition(
        unsplitTabItem,
        { attributes: true },
        () => unsplitTabItem.hidden,
        "unsplitTabItem is hidden"
      );
      Assert.ok(unsplitTabItem.hidden, "unsplitTabItem is hidden");

      info("Click menu option to add new split view");
      moveTabToNewSplitViewItem.click();
    }
  );

  await BrowserTestUtils.waitForMutationCondition(
    tabContainer,
    { children: true },
    () => {
      return (
        Array.from(tabContainer.children).some(
          tabChild => tabChild.tagName === "tab-split-view-wrapper"
        ) && tab1.splitview
      );
    },
    "Split view has been added"
  );
  info("Split view has been added");

  splitview = tab1.splitview;

  Assert.equal(tab1.splitview, splitview, `tab1 is in split view`);
  Assert.equal(
    splitview.tabs[1],
    gBrowser.selectedTab,
    "New tab is active in split view"
  );
  Assert.ok(!tab2.splitview, "tab2 is not in split view");
  Assert.ok(!tab3.splitview, "tab3 is not in split view");

  splitview.close();
  while (gBrowser.tabs.length > 1) {
    BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
});
