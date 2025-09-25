/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { SmartAssistEngine } = ChromeUtils.importESModule(
  "moz-src:///browser/components/genai/SmartAssistEngine.sys.mjs"
);

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

// Prefs
const PREF_API_KEY = "browser.ml.smartAssist.apiKey";
const PREF_ENDPOINT = "browser.ml.smartAssist.endpoint";
const PREF_MODEL = "browser.ml.smartAssist.model";

// Clean prefs after all tests
registerCleanupFunction(() => {
  for (let pref of [PREF_API_KEY, PREF_ENDPOINT, PREF_MODEL]) {
    if (Services.prefs.prefHasUserValue(pref)) {
      Services.prefs.clearUserPref(pref);
    }
  }
});

add_task(async function test_createOpenAIEngine_uses_prefs_and_static_fields() {
  // Arrange known prefs
  Services.prefs.setStringPref(PREF_API_KEY, "test-key-123");
  Services.prefs.setStringPref(PREF_ENDPOINT, "https://example.test/v1");
  Services.prefs.setStringPref(PREF_MODEL, "gpt-fake");

  const sb = sinon.createSandbox();
  try {
    // Stub _createEngine to capture options
    const fakeEngine = { run: sb.stub().resolves({ finalOutput: "" }) };
    const stub = sb
      .stub(SmartAssistEngine, "_createEngine")
      .resolves(fakeEngine);

    const engine = await SmartAssistEngine.createOpenAIEngine();

    Assert.strictEqual(
      engine,
      fakeEngine,
      "Should return engine resolved by _createEngine"
    );
    Assert.ok(stub.calledOnce, "_createEngine should be called once");

    const passed = stub.firstCall.args[0];
    Assert.equal(passed.apiKey, "test-key-123", "apiKey should come from pref");
    Assert.equal(
      passed.baseURL,
      "https://example.test/v1",
      "baseURL should come from pref"
    );
    Assert.equal(passed.modelId, "gpt-fake", "modelId should come from pref");
  } finally {
    sb.restore();
  }
});

add_task(
  async function test_fetchWithHistory_returns_finalOutput_and_forwards_args() {
    const sb = sinon.createSandbox();
    try {
      let capturedArgs = null;
      const fakeEngine = {
        async run({ args }) {
          capturedArgs = args;
          return { finalOutput: "Hello from fake engine!" };
        },
      };

      sb.stub(SmartAssistEngine, "_createEngine").resolves(fakeEngine);

      const messages = [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hi there" },
      ];

      const out = await SmartAssistEngine.fetchWithHistory(messages);

      Assert.equal(out, "Hello from fake engine!", "Should return finalOutput");
      Assert.deepEqual(
        capturedArgs,
        messages,
        "Should forward messages unmodified as 'args' to engine.run()"
      );
    } finally {
      sb.restore();
    }
  }
);

add_task(
  async function test_fetchWithHistory_propagates_engine_creation_rejection() {
    const sb = sinon.createSandbox();
    try {
      const err = new Error("creation failed (generic)");
      const stub = sb.stub(SmartAssistEngine, "_createEngine").rejects(err);

      const messages = [{ role: "user", content: "Hi" }];

      await Assert.rejects(
        SmartAssistEngine.fetchWithHistory(messages),
        e => e === err, // exact error propagated
        "Should propagate the same error thrown by _createEngine"
      );

      Assert.ok(stub.calledOnce, "_createEngine should be called once");
    } finally {
      sb.restore();
    }
  }
);
