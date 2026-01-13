/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

describe("settings ai features", () => {
  let doc, win;

  beforeEach(async function setup() {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.settings-redesign.aiFeatures.enabled", true]],
    });
    await openPreferencesViaOpenPreferencesAPI("general", { leaveOpen: true });
    doc = gBrowser.selectedBrowser.contentDocument;
    win = doc.ownerGlobal;
  });

  afterEach(() => {
    BrowserTestUtils.removeTab(gBrowser.selectedTab);
  });

  async function openAiFeaturePanel() {
    const paneLoaded = waitForPaneChange("aiFeatures");
    const categoryButton = doc.getElementById("category-ai-features");
    categoryButton.scrollIntoView();
    EventUtils.synthesizeMouseAtCenter(categoryButton, {}, win);
    await paneLoaded;
  }

  it("can change the chatbot provider value", async () => {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.ml.chat.provider", ""]],
    });

    const categoryButton = doc.getElementById("category-ai-features");
    Assert.ok(categoryButton, "category exists");
    Assert.ok(
      BrowserTestUtils.isVisible(categoryButton),
      "category is visible"
    );

    await openAiFeaturePanel();

    const providerControl = doc.getElementById("chatbotProvider");
    Assert.ok(providerControl, "control exists");
    Assert.ok(
      BrowserTestUtils.isVisible(providerControl),
      "control is visible"
    );
    Assert.equal(
      Services.prefs.getStringPref("browser.ml.chat.provider"),
      "",
      "Pref is empty"
    );

    Assert.equal(providerControl.value, "", "No provider set");

    const settingChanged = waitForSettingChange(providerControl.setting);
    providerControl.focus();
    const pickerOpened = BrowserTestUtils.waitForSelectPopupShown(
      win.docShell.chromeEventHandler.ownerGlobal
    );
    EventUtils.sendKey("space");
    await pickerOpened;
    EventUtils.sendKey("down");
    EventUtils.sendKey("return");
    await settingChanged;

    Assert.notEqual(providerControl.value, "", "Provider changed");
    Assert.notEqual(
      Services.prefs.getStringPref("browser.ml.chat.provider"),
      "",
      "Pref is not empty"
    );

    await gBrowser.ownerGlobal.SidebarController.hide();
  });

  it("hides AI Window when preferences not enabled", async () => {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.aiwindow.preferences.enabled", false]],
    });

    await openAiFeaturePanel();

    const aiWindowItem = doc.getElementById("AIWindowItem");
    const aiWindowFeatures = doc.getElementById("aiFeaturesAIWindowGroup");

    Assert.ok(
      !BrowserTestUtils.isVisible(aiWindowItem),
      "AIWindowItem is hidden when preferences not enabled"
    );
    Assert.ok(
      !BrowserTestUtils.isVisible(aiWindowFeatures),
      "aiWindowFeatures is hidden when preferences not enabled"
    );
  });

  it("shows AI Window activate when preferences enabled and feature not enabled", async () => {
    await SpecialPowers.pushPrefEnv({
      set: [
        ["browser.aiwindow.preferences.enabled", true],
        ["browser.aiwindow.enabled", false],
      ],
    });

    await openAiFeaturePanel();

    const aiWindowItem = doc.getElementById("AIWindowItem");
    Assert.ok(
      BrowserTestUtils.isVisible(aiWindowItem),
      "AIWindowItem is visible when preferences enabled and feature not enabled"
    );
  });

  it("hides AI Window activate when feature enabled", async () => {
    await SpecialPowers.pushPrefEnv({
      set: [
        ["browser.aiwindow.preferences.enabled", true],
        ["browser.aiwindow.enabled", true],
      ],
    });

    await openAiFeaturePanel();

    const aiWindowItem = doc.getElementById("AIWindowItem");
    Assert.ok(
      !BrowserTestUtils.isVisible(aiWindowItem),
      "AIWindowItem is hidden when feature enabled"
    );
  });

  // TODO: Add tests for aiFeaturesAIWindowGroup when Model and Insight options are added
});
