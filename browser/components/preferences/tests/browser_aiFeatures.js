/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

describe("settings ai features", () => {
  let doc, win;

  beforeEach(async function setup() {
    await SpecialPowers.pushPrefEnv({
      set: [
        ["browser.ml.chat.provider", ""],
        ["browser.settings-redesign.aiFeatures.enabled", true],
      ],
    });
    await openPreferencesViaOpenPreferencesAPI("general", { leaveOpen: true });
    doc = gBrowser.selectedBrowser.contentDocument;
    win = doc.ownerGlobal;
  });

  afterEach(() => {
    BrowserTestUtils.removeTab(gBrowser.selectedTab);
    gBrowser.ownerGlobal.SidebarController.hide();
  });

  it("can change the chatbot provider value", async () => {
    const categoryButton = doc.getElementById("category-ai-features");
    Assert.ok(categoryButton, "category exists");
    Assert.ok(
      BrowserTestUtils.isVisible(categoryButton),
      "category is visible"
    );

    const paneLoaded = waitForPaneChange("aiFeatures");
    categoryButton.scrollIntoView();
    EventUtils.synthesizeMouseAtCenter(categoryButton, {}, win);
    await paneLoaded;

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
  });
});
