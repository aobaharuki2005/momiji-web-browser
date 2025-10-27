"use strict";

add_setup(async function () {
  // We don't send events or call official addon APIs while running
  // these tests, so there a good chance that test-verify mode may
  // end up seeing the addon as "idle". This pref should avoid that.
  await SpecialPowers.pushPrefEnv({
    set: [["extensions.background.idle.timeout", 300_000]],
  });
});

function getConfig(id, interventions) {
  return {
    id,
    label: id,
    bugs: {
      issue1: {
        matches: ["*://example.com/*"],
      },
    },
    interventions: interventions.map(i => {
      if (!i.platforms) {
        i.platforms = "all";
      }
      const { css, js } = i;
      delete i.css;
      delete i.js;
      i.content_scripts = { css, js };
      return i;
    }),
  };
}

add_task(async function test_that_only_intended_interventions_are_activated() {
  const runningVersion = parseInt(
    navigator.userAgent.match("Firefox/([0-9]*)")[1]
  );

  // If we have multiple parts to an intervention, where only some of them are meant to
  // apply (like ones for different Firefox versions), we want to make sure that only the
  // intended ones are activated. Otherwise when we try to deactivate them in about:compat,
  // it will fail, and we also run the risk of enabling more than we intended to.
  const config = getConfig("test", [
    {
      min_version: runningVersion + 1,
      js: ["lib/intervention_helpers.js"],
    },
    {
      max_version: runningVersion,
      js: ["lib/ua_helpers.js"],
    },
    {
      js: ["lib/shim_messaging_helper.js"],
    },
    {
      platforms: ["invalid"],
      js: ["lib/messaging_helper.js"],
    },
  ]);

  const [{ interventions }] = await WebCompatExtension.updateInterventions([
    config,
  ]);
  Assert.deepEqual(
    interventions.map(i => i.enabled),
    [false, true, true, false],
    "The correct parts of the intervention were chosen to be enabled"
  );

  let reg = await WebCompatExtension.getRegisteredContentScriptsFor("test");
  Assert.deepEqual(
    reg.map(r => r.js).flat(),
    ["lib/ua_helpers.js", "lib/shim_messaging_helper.js"],
    "Content scripts were properly registered"
  );

  await WebCompatExtension.disableInterventions(["test"]);

  reg = await WebCompatExtension.getRegisteredContentScriptsFor(["test"]);
  Assert.deepEqual(
    reg.map(r => r.js).flat(),
    [],
    "Content scripts were properly unregistered"
  );
});

add_task(async function test_min_max_versions() {
  await WebCompatExtension.overrideFirefoxVersion("130.2");
  const config2 = getConfig("test2", [
    {
      min_version: 130,
      js: ["lib/run.js"],
    },
    {
      min_version: 130.1,
      js: ["lib/about_compat_broker.js"],
    },
    {
      min_version: 130.2,
      js: ["lib/custom_functions.js"],
    },
    {
      min_version: 130.3,
      js: ["lib/intervention_helpers.js"],
    },
    {
      min_version: 131,
      js: ["lib/interventions.js"],
    },
    {
      max_version: 129,
      js: ["lib/messaging_helper.js"],
    },
    {
      max_version: 130,
      js: ["lib/requestStorageAccess_helper.js"],
    },
    {
      max_version: 130.1,
      js: ["lib/shim_messaging_helper.js"],
    },
    {
      max_version: 130.2,
      js: ["lib/shims.js"],
    },
    {
      max_version: 130.3,
      js: ["lib/smartblock_embeds_helper.js"],
    },
    {
      max_version: 131,
      js: ["lib/ua_helpers.js"],
    },
  ]);
  const [{ interventions }] = await WebCompatExtension.updateInterventions([
    config2,
  ]);
  Assert.deepEqual(
    interventions.map(i => i.enabled),
    [true, true, true, false, false, false, true, false, true, true, true],
    "The correct parts of the intervention were chosen to be enabled"
  );
  const reg = await WebCompatExtension.getRegisteredContentScriptsFor(["test"]);
  Assert.deepEqual(
    reg.map(r => r.js).flat(),
    [
      "lib/run.js",
      "lib/about_compat_broker.js",
      "lib/custom_functions.js",
      "lib/requestStorageAccess_helper.js",
      "lib/shims.js",
      "lib/smartblock_embeds_helper.js",
      "lib/ua_helpers.js",
    ],
    "Correct content scripts were registered"
  );
  await WebCompatExtension.disableInterventions(["test2"]);
  await WebCompatExtension.overrideFirefoxVersion();
});

add_task(async function test_disabling_by_default() {
  // platforms=[] means disabled by default
  const config3 = getConfig("test3", [
    {
      platforms: [],
      js: ["lib/run.js"],
    },
  ]);
  // also check that other criteria not matching still disables completely
  const config4 = getConfig("test4", [
    {
      platforms: [],
      not_platforms: ["android", "desktop"],
      js: ["lib/shims.js"],
    },
  ]);
  const configs = await WebCompatExtension.updateInterventions([
    config3,
    config4,
  ]);
  Assert.deepEqual(
    configs.map(c => c.active),
    [false, false],
    "The correct interventions were activated on startup"
  );
  Assert.deepEqual(
    configs.map(c => c.interventions.map(i => i.enabled)),
    [[false], [false]],
    "The interventions were not enabled by default"
  );
  const reg = await WebCompatExtension.getRegisteredContentScriptsFor(["test"]);
  Assert.deepEqual(
    reg.map(r => r.js).flat(),
    [],
    "Content scripts were not registered"
  );

  const tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    opening: "about:compat",
    waitForLoad: true,
  });
  await SpecialPowers.spawn(tab.linkedBrowser, [], async function () {
    is(
      content.origin,
      "moz-extension://9a310967-e580-48bf-b3e8-4eafebbc122d",
      "Expected origin of about:compat"
    );
    await ContentTaskUtils.waitForCondition(
      () =>
        content.document.querySelector(
          "#interventions tr[data-id=test3] [data-l10n-id=label-enable]"
        ),
      "test3 is correctly shown"
    );
    ok(
      !content.document.querySelector("#interventions tr[data-id=test4]"),
      "test4 is correctly hidden"
    );

    // click enable, confirm it is enabled
    content.document
      .querySelector(
        "#interventions tr[data-id=test3] [data-l10n-id=label-enable]"
      )
      .click();
    await ContentTaskUtils.waitForCondition(
      () =>
        content.document.querySelector(
          "#interventions tr[data-id=test3] [data-l10n-id=label-disable]"
        ),
      "test3 is correctly enabled on click"
    );

    // now click disable, confirm it is disabled
    content.document
      .querySelector(
        "#interventions tr[data-id=test3] [data-l10n-id=label-disable]"
      )
      .click();
    await ContentTaskUtils.waitForCondition(
      () =>
        content.document.querySelector(
          "#interventions tr[data-id=test3] [data-l10n-id=label-enable]"
        ),
      "test3 is correctly disabled again on second click"
    );
  });
  await BrowserTestUtils.removeTab(tab);

  await WebCompatExtension.disableInterventions(["test3", "test4"]);
});
