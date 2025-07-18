/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { ExperimentAPI } = ChromeUtils.importESModule(
  "resource://nimbus/ExperimentAPI.sys.mjs"
);
const { NimbusTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/NimbusTestUtils.sys.mjs"
);

add_task(async function test_nimbus_experiments() {
  // Enable DiscoveryStream
  // NOTE: This must be enabled to test any DiscoveryStream-related features.
  // DiscoveryStream is disabled by default in browser tests.
  await pushPrefs([
    "browser.newtabpage.activity-stream.discoverystream.config",
    JSON.stringify({
      collapsible: true,
      enabled: true,
    }),
  ]);

  // Disable Sponsored Stories/Shortcuts
  await pushPrefs(["browser.newtabpage.activity-stream.showSponsored", false]);

  // Disable Sponsored Stories
  await pushPrefs([
    "browser.newtabpage.activity-stream.discoverystream.endpoints",
    "https://merino.services.mozilla.com/",
  ]);

  await ExperimentAPI.ready();

  // Enroll in Experiment
  let doExperimentCleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: "newtabWidgets",
    value: {
      listsEnabled: true,
      timerEnabled: true,
    },
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:newtab" },
    async function (browser) {
      let listsWidget = await SpecialPowers.spawn(
        browser,
        [],
        async function () {
          await ContentTaskUtils.waitForCondition(() =>
            content.document.querySelector("#widget-timer")
          );
          return true;
        }
      );

      let focusTimerWidget = await SpecialPowers.spawn(
        browser,
        [],
        async function () {
          await ContentTaskUtils.waitForCondition(() =>
            content.document.querySelector("#widget-timer")
          );
          return true;
        }
      );

      ok(listsWidget, "Rendered the lists widget");
      ok(focusTimerWidget, "Rendered the focus timer widget");
    }
  );

  await doExperimentCleanup();
});
