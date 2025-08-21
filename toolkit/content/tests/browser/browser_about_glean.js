/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["test.wait300msAfterTabSwitch", true]],
  });
});

add_task(async function test_about_glean_redesign_views_hidden_behind_pref() {
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("about.glean.redesign.enabled");
  });

  await BrowserTestUtils.withNewTab("about:glean", async browser => {
    ok(!browser.isRemoteBrowser, "Browser should not be remote.");
    await ContentTask.spawn(browser, null, async () => {
      let metrics_table_category_button = content.document.getElementById(
        "category-metrics-table"
      );
      is(metrics_table_category_button, null);
    });
  });

  Services.prefs.setBoolPref("about.glean.redesign.enabled", true);
  await BrowserTestUtils.withNewTab("about:glean", async browser => {
    ok(!browser.isRemoteBrowser, "Browser should not be remote.");
    await ContentTask.spawn(browser, null, async () => {
      let metrics_table_category_button = content.document.getElementById(
        "category-metrics-table"
      );
      Assert.notEqual(
        metrics_table_category_button,
        null,
        "Metrics table category button should not be null"
      );
    });
  });
});
