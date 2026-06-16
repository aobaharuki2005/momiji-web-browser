/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests for the input-model-select component in the Smartbar.
 */

"use strict";

const { _clearModelsDataCacheForTesting, FALLBACK_MODELS } =
  ChromeUtils.importESModule(
    "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
  );

const DEFAULT_MODEL_CHOICE_ID = "2";

add_setup(async function () {
  _clearModelsDataCacheForTesting();
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.firstrun.modelChoice", DEFAULT_MODEL_CHOICE_ID],
    ],
  });
});

add_task(async function test_smartbar_model_select_shows_default_model() {
  const { restore } = await stubEngineNetworkBoundaries({
    serverOptions: null,
  });

  try {
    const expectedDefaultModel = FALLBACK_MODELS[DEFAULT_MODEL_CHOICE_ID].model;
    const win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    const { selectedModelId } = await getSmartbarModelSelectData(browser);
    Assert.equal(
      selectedModelId,
      expectedDefaultModel,
      "Should show the default model based on modelChoice pref"
    );

    await BrowserTestUtils.closeWindow(win);
  } finally {
    await restore();
  }
});

add_task(async function test_smartbar_model_select_panel_shows_default_badge() {
  const { restore } = await stubEngineNetworkBoundaries({
    serverOptions: null,
  });

  try {
    const win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    const defaultItemHasBadge = await SpecialPowers.spawn(
      browser,
      [DEFAULT_MODEL_CHOICE_ID],
      async defaultModelChoiceId => {
        const aiWindowElement = content.document.querySelector("ai-window");
        const smartbar = aiWindowElement.shadowRoot.querySelector(
          "#ai-window-smartbar"
        );
        const modelSelect = smartbar.querySelector("input-model-select");
        const triggerButton =
          modelSelect.shadowRoot.querySelector("moz-button");
        triggerButton.click();

        const panelList = modelSelect.shadowRoot.querySelector("panel-list");
        await ContentTaskUtils.waitForMutationCondition(
          panelList,
          { attributes: true },
          () => panelList.hasAttribute("open")
        );

        const defaultItem = panelList.querySelector(
          `button.model-item:has(.model-item-icon[src*="model-choice-${defaultModelChoiceId}.svg"])`
        );
        return !!defaultItem.querySelector("moz-badge");
      }
    );

    Assert.ok(defaultItemHasBadge, "Default model item should have the badge");

    await BrowserTestUtils.closeWindow(win);
  } finally {
    await restore();
  }
});

add_task(
  async function test_smartbar_model_select_shows_custom_model_when_configured() {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.smartwindow.endpoint", "https://custom.endpoint/v1"]],
    });

    const { restore } = await stubEngineNetworkBoundaries({
      serverOptions: null,
    });

    try {
      const win = await openAIWindow();
      const browser = win.gBrowser.selectedBrowser;

      const { availableModels } = await getSmartbarModelSelectData(browser);

      const hasCustomModel = Object.values(availableModels).some(
        m => m.model === "custom-model"
      );
      Assert.ok(hasCustomModel, "Custom model should show when configured");

      await BrowserTestUtils.closeWindow(win);
    } finally {
      await restore();
      await SpecialPowers.popPrefEnv();
    }
  }
);

add_task(
  async function test_smartbar_model_select_hides_custom_model_without_custom_endpoint() {
    await SpecialPowers.pushPrefEnv({
      clear: [["browser.smartwindow.endpoint"]],
    });

    const { restore } = await stubEngineNetworkBoundaries({
      serverOptions: null,
    });

    try {
      const win = await openAIWindow();
      const browser = win.gBrowser.selectedBrowser;

      const { availableModels } = await getSmartbarModelSelectData(browser);

      const hasCustomModel = Object.values(availableModels).some(
        m => m.model === "custom-model"
      );
      Assert.ok(
        !hasCustomModel,
        "Custom model should NOT be available without a custom endpoint"
      );

      await BrowserTestUtils.closeWindow(win);
    } finally {
      await restore();
      await SpecialPowers.popPrefEnv();
    }
  }
);

add_task(async function test_model_switch_uses_correct_model_for_requests() {
  const { restore } = await stubEngineNetworkBoundaries({
    serverOptions: null,
  });

  try {
    const win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    const { selectedModelId: initialModelId } =
      await getSmartbarModelSelectData(browser);

    await switchSmartbarModel(browser, 1);
    const { selectedModelId: updatedModelId } =
      await getSmartbarModelSelectData(browser);

    Assert.notEqual(
      initialModelId,
      updatedModelId,
      "Model should have changed"
    );

    await BrowserTestUtils.closeWindow(win);
  } finally {
    await restore();
  }
});

add_task(
  async function test_model_switch_updates_system_prompt_mid_conversation() {
    let { promise: requestPromise, resolve: resolveRequest } =
      Promise.withResolvers();

    const { restore } = await stubEngineNetworkBoundaries({
      serverOptions: {
        streamChunks: ["Hello", "from mock server."],
        onRequest(body) {
          resolveRequest(body);
          ({ promise: requestPromise, resolve: resolveRequest } =
            Promise.withResolvers());
        },
      },
    });

    try {
      const win = await openAIWindow();
      const browser = win.gBrowser.selectedBrowser;

      await typeInSmartbar(browser, "First message");
      await submitSmartbar(browser);
      const firstRequest = await requestPromise;

      await switchSmartbarModel(browser, 1);

      await typeInSmartbar(browser, "Second message");
      await submitSmartbar(browser);
      const secondRequest = await requestPromise;

      const userMessages = secondRequest.messages
        .filter(message => message.role === "user")
        .map(message => message.content);

      Assert.notEqual(
        firstRequest.model,
        secondRequest.model,
        "Model should change after model switch"
      );
      Assert.ok(
        userMessages.some(message => message.includes("First message")),
        "Should include first message"
      );
      Assert.ok(
        userMessages.some(message => message.includes("Second message")),
        "Should include second message"
      );

      await BrowserTestUtils.closeWindow(win);
    } finally {
      await restore();
    }
  }
);

add_task(async function test_model_choice_pref_change_updates_selected_model() {
  const { restore } = await stubEngineNetworkBoundaries({
    serverOptions: null,
  });

  try {
    const win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    const { selectedModelId: initialModelId } =
      await getSmartbarModelSelectData(browser);
    Assert.equal(
      initialModelId,
      FALLBACK_MODELS[DEFAULT_MODEL_CHOICE_ID].model,
      "Should be the initial default model"
    );

    const newModelChoiceId = "1";
    const expectedNewModel = FALLBACK_MODELS[newModelChoiceId].model;
    await SpecialPowers.pushPrefEnv({
      set: [["browser.smartwindow.firstrun.modelChoice", newModelChoiceId]],
    });

    await SpecialPowers.spawn(
      browser,
      [expectedNewModel],
      async expectedModel => {
        const aiWindowElement = content.document.querySelector("ai-window");
        await ContentTaskUtils.waitForMutationCondition(
          aiWindowElement,
          { attributes: true },
          () => aiWindowElement.selectedModelId === expectedModel
        );
      }
    );

    const { selectedModelId: updatedModelId } =
      await getSmartbarModelSelectData(browser);
    Assert.equal(
      updatedModelId,
      expectedNewModel,
      "Selected model should update when pref changes"
    );

    await BrowserTestUtils.closeWindow(win);
  } finally {
    await restore();
    await SpecialPowers.popPrefEnv();
  }
});
