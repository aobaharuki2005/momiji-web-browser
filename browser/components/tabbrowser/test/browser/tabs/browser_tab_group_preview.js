/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const PREVIEW_PANEL_ID = "tabgroup-preview-panel";

async function openPreview(group, win = window) {
  const previewElement = win.document.getElementById(PREVIEW_PANEL_ID);
  Assert.ok(previewElement.state, "closed");

  const previewShown = BrowserTestUtils.waitForPopupEvent(
    previewElement,
    "shown"
  );
  EventUtils.synthesizeMouseAtCenter(
    group.labelElement,
    { type: "mouseover" },
    win
  );
  return previewShown;
}

async function closePreviews(win = window) {
  const tabs = win.document.getElementById("tabbrowser-tabs");
  const previewHidden = BrowserTestUtils.waitForPopupEvent(
    win.document.getElementById(PREVIEW_PANEL_ID),
    "hidden"
  );
  EventUtils.synthesizeMouse(
    tabs,
    0,
    tabs.outerHeight + 1,
    {
      type: "mouseout",
    },
    win
  );
  return previewHidden;
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.groups.hoverPreview.enabled", true]],
  });
});

add_task(async function panelAppearsOnTabGroupHover() {
  const tab1 = await addTabTo(gBrowser, "about:robots");
  const tab2 = await addTabTo(gBrowser, "about:mozilla");

  const group = gBrowser.addTabGroup([tab1, tab2]);
  group.collapsed = true;

  // Tabs from the control group should not appear in the list
  const controlTab = await addTabTo(gBrowser, "https://example.com/");
  const controlGroup = gBrowser.addTabGroup([controlTab]);
  controlGroup.collapsed = true;

  await openPreview(group);

  const previewPanel = window.document.getElementById(PREVIEW_PANEL_ID);

  Assert.equal(
    previewPanel.children.length,
    2,
    "Preview panel has one menuitem for each tab in the group"
  );
  Assert.equal(
    previewPanel.children[0].tagName,
    "menuitem",
    "First child is a menuitem"
  );
  Assert.equal(
    previewPanel.children[0].label,
    tab1.label,
    "First child has correct label"
  );
  Assert.equal(
    previewPanel.children[0].getAttribute("tooltiptext"),
    previewPanel.children[0].label,
    "First child has a tooltip that is identical to the label"
  );
  Assert.equal(
    previewPanel.children[1].tagName,
    "menuitem",
    "Second child is a menuitem"
  );
  Assert.equal(
    previewPanel.children[1].label,
    tab2.label,
    "Second child has correct label"
  );
  Assert.equal(
    previewPanel.children[1].getAttribute("tooltiptext"),
    previewPanel.children[1].label,
    "Second child has a tooltip that is identical to the label"
  );

  await closePreviews();

  await removeTabGroup(group);
  await removeTabGroup(controlGroup);
});

add_task(async function panelDoesNotAppearForExpandedTabGroups() {
  const group = gBrowser.addTabGroup([
    BrowserTestUtils.addTab(gBrowser, "about:robots"),
  ]);
  group.collapsed = true;

  // Panel must be opened at least once to ensure the component is lazy-loaded
  await openPreview(group);
  await closePreviews();

  const previewPanelComponent =
    window.gBrowser.tabContainer.tabGroupPreviewPanel;

  Assert.notEqual(
    previewPanelComponent,
    null,
    "Sanity check: preview panel component is loaded"
  );
  Assert.equal(
    previewPanelComponent.panel.state,
    "closed",
    "Sanity check: preview panel is closed"
  );

  sinon.spy(previewPanelComponent, "activate");

  group.collapsed = false;

  EventUtils.synthesizeMouseAtCenter(
    group.labelElement,
    { type: "mouseover" },
    window
  );
  await BrowserTestUtils.waitForCondition(() => {
    return previewPanelComponent.activate.calledOnce;
  }, "Waiting for activate to be called");

  Assert.equal(
    previewPanelComponent.panel.state,
    "closed",
    "Preview panel does not open on an expanded tab group"
  );

  await removeTabGroup(group);
  sinon.restore();
});

add_task(async function panelClickElementSwitchesTabs() {
  const tabs = [
    BrowserTestUtils.addTab(gBrowser, "about:robots"),
    BrowserTestUtils.addTab(gBrowser, "about:mozilla"),
  ];
  const group = gBrowser.addTabGroup(tabs);
  group.collapsed = true;

  Assert.equal(
    gBrowser.selectedTab,
    gBrowser.tabs[0],
    "Selected tab is first tab on tab strip before clicking the panel item"
  );

  await openPreview(group);
  const previewPanel = window.document.getElementById(PREVIEW_PANEL_ID);

  EventUtils.synthesizeMouseAtCenter(previewPanel.children[1], {}, window);

  await BrowserTestUtils.waitForCondition(() => {
    return gBrowser.selectedTab != gBrowser.tabs[0];
  }, "Waiting for selected tab to change");
  Assert.equal(
    gBrowser.selectedTab,
    gBrowser.tabs[2],
    "Selected tab is second tab within the tab group after clicking panel item"
  );
  Assert.ok(
    group.collapsed,
    "Group is still in collapsed state even though it has the active tab"
  );

  await removeTabGroup(group);
});
