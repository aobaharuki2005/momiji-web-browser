/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { openAIEngine, MODEL_FEATURES, SERVICE_TYPES, PURPOSES } =
  ChromeUtils.importESModule(
    "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
  );

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const PREF_API_KEY = "browser.smartwindow.apiKey";
const PREF_ENDPOINT = "browser.smartwindow.endpoint";
const PREF_MODEL = "browser.smartwindow.model";

registerCleanupFunction(() => {
  for (const pref of [PREF_API_KEY, PREF_ENDPOINT, PREF_MODEL]) {
    if (Services.prefs.prefHasUserValue(pref)) {
      Services.prefs.clearUserPref(pref);
    }
  }
});

add_task(async function test_build_with_object_form_no_rs_read() {
  Services.prefs.setStringPref(PREF_API_KEY, "fake-key");
  Services.prefs.setStringPref(
    PREF_ENDPOINT,
    "https://api.fake-endpoint.com/v1"
  );

  const sb = sinon.createSandbox();
  try {
    const fakeEngine = { runWithGenerator() {} };
    const getRemoteClientSpy = sb.spy(openAIEngine, "getRemoteClient");
    sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);

    const config = {
      model: "gpt-oss-120b",
      serviceType: SERVICE_TYPES.AI,
      purpose: PURPOSES.CHAT,
      flowId: "test-flow-id",
      feature: MODEL_FEATURES.CHAT,
    };

    const engine = await openAIEngine.build(config);

    Assert.strictEqual(
      engine.engineInstance,
      fakeEngine,
      "engineInstance should be set from _createEngine"
    );
    Assert.equal(
      engine.model,
      config.model,
      "model should match passed-in config"
    );
    Assert.equal(
      engine.feature,
      config.feature,
      "feature should match passed-in config"
    );
    Assert.equal(
      getRemoteClientSpy.callCount,
      0,
      "getRemoteClient must not be called on object-form build"
    );
  } finally {
    sb.restore();
  }
});
