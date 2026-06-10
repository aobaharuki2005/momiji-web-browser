/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Test that we don't show the backup section if backup is disabled
 */
add_task(async function () {
  await openPreferencesViaOpenPreferencesAPI("paneSync", {
    leaveOpen: true,
  });

  await SpecialPowers.pushPrefEnv({
    set: [["browser.backup.archive.enabled", false]],
  });

  let settings = gBrowser.contentDocument.querySelector(
    "setting-group[groupid='backup']"
  );
  ok(
    BrowserTestUtils.isHidden(settings),
    "backup setting-group is not visible"
  );

  // Check that we don't get any results in sync when searching:
  await evaluateSearchResults("backup", "no-results-message");

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

/**
 * Test that we don't show the backup section if backup is disabled
 */
add_task(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.backup.archive.enabled", true]],
  });

  await openPreferencesViaOpenPreferencesAPI("paneSync", {
    leaveOpen: true,
  });

  let settings = gBrowser.contentDocument.querySelector(
    "setting-group[groupid='backup']"
  );
  ok(BrowserTestUtils.isVisible(settings), "backup setting-group is visible");

  // Check that we don't get any results in sync when searching:
  await evaluateSearchResults("backup", "backup");

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});
