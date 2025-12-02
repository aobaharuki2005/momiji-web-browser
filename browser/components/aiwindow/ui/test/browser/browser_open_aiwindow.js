/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Test that the 'New AI window' menu item visibility is controlled by the browser.aiwindow.enabled preference
 * and matches the PanelUI.isAIWindowEnabled state.
 */
add_task(async function test_ai_menuitem_pref_connection() {
  // Scenario 1: Pref is false: 'New AI window' menu item should be hidden
  await SpecialPowers.pushPrefEnv({
    set: [["browser.aiwindow.enabled", false]],
  });

  // Open the browser's hamburger menu
  const menuButton = document.getElementById("PanelUI-menu-button");
  const mainViewID = "appMenu-mainView";
  const mainView = PanelMultiView.getViewNode(document, mainViewID);
  let viewShownPromise = BrowserTestUtils.waitForEvent(mainView, "ViewShown");
  menuButton.click();
  await viewShownPromise;

  // Get the 'New AI window' item
  const aiMenuItem = document.getElementById("appMenu-new-ai-window-button");

  // Verify that PanelUI.isAIWindowEnabled is false
  Assert.equal(
    PanelUI.isAIWindowEnabled,
    false,
    "PanelUI.isAIWindowEnabled should be false when pref is false"
  );

  // Verify that the menu item is hidden
  Assert.ok(
    aiMenuItem.hidden,
    "AI menu item should be hidden when pref is false"
  );

  // Close the menu
  let panelHiddenPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("appMenu-popup"),
    "popuphidden"
  );
  PanelUI.hide();
  await panelHiddenPromise;

  // Test scenario 2: Pref is true: 'New AI window' menu item should NOT be hidden, etc.
  await SpecialPowers.pushPrefEnv({
    set: [["browser.aiwindow.enabled", true]],
  });

  viewShownPromise = BrowserTestUtils.waitForEvent(mainView, "ViewShown");
  menuButton.click();
  await viewShownPromise;

  Assert.equal(
    PanelUI.isAIWindowEnabled,
    true,
    "PanelUI.isAIWindowEnabled should be true when pref is true"
  );

  Assert.ok(
    !aiMenuItem.hidden,
    "AI menu item should be visible when pref is true"
  );

  panelHiddenPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("appMenu-popup"),
    "popuphidden"
  );
  PanelUI.hide();
  await panelHiddenPromise;

  // Clean up - reset pref
  await SpecialPowers.popPrefEnv();
  await SpecialPowers.popPrefEnv();
});

/**
 * Test that clicking the 'New AI window' menu item opens a new window with the ai-window attribute.
 */
add_task(async function test_ai_menuitem_opens_window_with_attribute() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.aiwindow.enabled", true]],
  });

  const menuButton = document.getElementById("PanelUI-menu-button");
  const mainView = document.getElementById("appMenu-mainView");
  const viewShownPromise = BrowserTestUtils.waitForEvent(mainView, "ViewShown");
  menuButton.click();
  await viewShownPromise;

  // Set up listeners for the new AI window
  const delayedStartupPromise = BrowserTestUtils.waitForNewWindow();

  const aiMenuItem = document.getElementById("appMenu-new-ai-window-button");
  aiMenuItem.click();

  // Wait for the new window to open
  const newWin = await delayedStartupPromise;

  Assert.ok(
    newWin.document.documentElement.hasAttribute("ai-window"),
    "New window should have the ai-window attribute"
  );

  await BrowserTestUtils.closeWindow(newWin);
  await SpecialPowers.popPrefEnv();
});
