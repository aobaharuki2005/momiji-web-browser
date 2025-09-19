/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_back_button_disabled_after_history_clear() {
  // Start with a clean slate
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );

  registerCleanupFunction(() => {
    gBrowser.removeTab(tab);
  });

  // Navigate to create session history
  BrowserTestUtils.startLoadingURIString(
    tab.linkedBrowser,
    "https://example.org/"
  );
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);

  let backButton = document.getElementById("back-button");

  // Wait for back button to be enabled
  await TestUtils.waitForCondition(
    () => !backButton.disabled,
    "Back button should be enabled with history"
  );

  // Clear history using Sanitizer
  await Sanitizer.sanitize(["history"]);

  // Check webNavigation state
  await TestUtils.waitForCondition(
    () => !tab.linkedBrowser.webNavigation.canGoBack,
    "webNavigation.canGoBack should be false after clearing"
  );

  // Trigger UI update to reflect navigation state changes
  if (typeof gBrowser.updateBackForwardButtons === "function") {
    gBrowser.updateBackForwardButtons();
  } else {
    goUpdateCommand("Browser:Back");
  }

  // Wait for UI to update
  await TestUtils.waitForCondition(
    () => backButton.hasAttribute("disabled"),
    "Back button should be disabled after clearing history"
  );

  Assert.ok(
    backButton.hasAttribute("disabled"),
    "Back button should be disabled"
  );

  // To check that arrow is 'grayed out'
  let computedStyle = window.getComputedStyle(backButton);
  Assert.equal(
    computedStyle.getPropertyValue("opacity"),
    "0.4", // the opacity value
    "Back button should appear grayed out when disabled"
  );
});
