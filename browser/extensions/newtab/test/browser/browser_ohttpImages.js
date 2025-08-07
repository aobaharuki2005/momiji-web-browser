/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { ExperimentAPI } = ChromeUtils.importESModule(
  "resource://nimbus/ExperimentAPI.sys.mjs"
);
const { NimbusTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/NimbusTestUtils.sys.mjs"
);

add_task(async function test_nimbus_experiment_enabled() {
  const onActionSpy = sinon.spy(DiscoveryStreamFeed.prototype, "onAction");

  await ExperimentAPI.ready();
  let doExperimentCleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: "newtabOhttpImages",
    value: { enabled: true },
  });

  is(
    onActionSpy.firstCall.args[0].data.name,
    "ohttpImagesConfig",
    "Nimbus config update happened"
  );

  is(
    onActionSpy.firstCall.args[0].data.value.enabled,
    true,
    "Nimbus value update happened"
  );

  await doExperimentCleanup();
});
