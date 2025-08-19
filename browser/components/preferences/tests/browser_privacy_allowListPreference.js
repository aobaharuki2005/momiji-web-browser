/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const BASELINE_PREF = "privacy.trackingprotection.allow_list.baseline.enabled";
const CONVENIENCE_PREF =
  "privacy.trackingprotection.allow_list.convenience.enabled";
const CB_CATEGORY_PREF = "browser.contentblocking.category";

const ETP_STANDARD_ID = "standardRadio";
const ETP_STRICT_ID = "strictRadio";
const ETP_CUSTOM_ID = "customRadio";

const STRICT_BASELINE_CHECKBOX_ID = "contentBlockingBaselineExceptionsStrict";
const STRICT_CONVENIENCE_CHECKBOX_ID =
  "contentBlockingConvenienceExceptionsStrict";
const CUSTOM_BASELINE_CHECKBOX_ID = "contentBlockingBaselineExceptionsCustom";
const CUSTOM_CONVENIENCE_CHECKBOX_ID =
  "contentBlockingConvenienceExceptionsCustom";

async function cleanUp() {
  await SpecialPowers.popPrefEnv();
  gBrowser.removeCurrentTab();
}

async function setup() {
  await SpecialPowers.pushPrefEnv({
    set: [[CB_CATEGORY_PREF, "standard"]],
  });
  Assert.ok(
    Services.prefs.getBoolPref(BASELINE_PREF),
    "The baseline preference should be initially true."
  );
  Assert.ok(
    Services.prefs.getBoolPref(CONVENIENCE_PREF),
    "The convenience preference should be initially true."
  );
}

add_task(async function test_standard_mode_no_checkboxes_and_prefs_true() {
  await setup();
  await openPreferencesViaOpenPreferencesAPI("privacy", {
    leaveOpen: true,
  });
  let doc = gBrowser.contentDocument;
  doc.getElementById(ETP_STANDARD_ID).click();
  is_element_hidden(
    doc.getElementById(STRICT_BASELINE_CHECKBOX_ID),
    "Strict mode's baseline checkbox should be hidden when ETP Standard is selected."
  );
  is_element_hidden(
    doc.getElementById(STRICT_CONVENIENCE_CHECKBOX_ID),
    "Strict mode's convenience checkbox should be hidden when ETP Standard is selected."
  );
  is_element_hidden(
    doc.getElementById(CUSTOM_BASELINE_CHECKBOX_ID),
    "Custom mode's baseline checkbox should be hidden when ETP Standard is selected."
  );
  is_element_hidden(
    doc.getElementById(CUSTOM_CONVENIENCE_CHECKBOX_ID),
    "Custom mode's convenience checkbox should be hidden when ETP Standard is selected."
  );
  Assert.ok(
    Services.prefs.getBoolPref(BASELINE_PREF),
    "The baseline preference should be true in ETP Standard mode."
  );
  Assert.ok(
    Services.prefs.getBoolPref(CONVENIENCE_PREF),
    "The convenience preference should be true in ETP Standard mode."
  );
  await cleanUp();
});

add_task(async function test_strict_mode_checkboxes_and_default_prefs() {
  await setup();
  await openPreferencesViaOpenPreferencesAPI("privacy", {
    leaveOpen: true,
  });
  let doc = gBrowser.contentDocument;
  doc.getElementById(ETP_STRICT_ID).click();
  let baselineCheckbox = doc.getElementById(STRICT_BASELINE_CHECKBOX_ID);
  let convenienceCheckbox = doc.getElementById(STRICT_CONVENIENCE_CHECKBOX_ID);
  is_element_visible(
    baselineCheckbox,
    "The baseline checkbox should be visible in ETP Strict mode."
  );
  is_element_visible(
    convenienceCheckbox,
    "The convenience checkbox should be visible in ETP Strict mode."
  );
  is(
    baselineCheckbox.checked,
    true,
    "The baseline checkbox should be checked by default in ETP Strict mode."
  );
  is(
    convenienceCheckbox.checked,
    false,
    "The convenience checkbox should be unchecked by default in ETP Strict mode."
  );
  Assert.ok(
    Services.prefs.getBoolPref(BASELINE_PREF),
    "The baseline preference should be true by default in ETP Strict mode."
  );
  Assert.ok(
    !Services.prefs.getBoolPref(CONVENIENCE_PREF),
    "The convenience preference should be false by default in ETP Strict mode."
  );
  await cleanUp();
});

add_task(
  async function test_strict_mode_convenience_false_when_baseline_false() {
    await setup();
    await openPreferencesViaOpenPreferencesAPI("privacy", {
      leaveOpen: true,
    });
    let doc = gBrowser.contentDocument;
    doc.getElementById(ETP_STRICT_ID).click();

    await clickCheckboxWithConfirmDialog(
      doc,
      STRICT_BASELINE_CHECKBOX_ID,
      BASELINE_PREF,
      false,
      1
    );

    Assert.ok(
      !Services.prefs.getBoolPref(BASELINE_PREF),
      "The baseline pref should be false after unchecking its checkbox in ETP Strict mode."
    );
    Assert.ok(
      !Services.prefs.getBoolPref(CONVENIENCE_PREF),
      "The convenience pref should remain false when the baseline checkbox is unchecked in ETP Strict mode."
    );
    await cleanUp();
  }
);

add_task(async function test_custom_mode_checkboxes_and_ids() {
  await setup();
  await openPreferencesViaOpenPreferencesAPI("privacy", {
    leaveOpen: true,
  });
  let doc = gBrowser.contentDocument;
  await doc.getElementById(ETP_CUSTOM_ID).click();
  let baselineCheckbox = doc.getElementById(CUSTOM_BASELINE_CHECKBOX_ID);
  let convenienceCheckbox = doc.getElementById(CUSTOM_CONVENIENCE_CHECKBOX_ID);
  is_element_visible(
    baselineCheckbox,
    "The baseline checkbox should be visible in ETP Custom mode."
  );
  is_element_visible(
    convenienceCheckbox,
    "The convenience checkbox should be visible in ETP Custom mode."
  );
  await cleanUp();
});

add_task(async function test_custom_mode_inherits_last_mode() {
  await setup();
  // Test switching from Standard to Custom
  await openPreferencesViaOpenPreferencesAPI("privacy", {
    leaveOpen: true,
  });
  let doc = gBrowser.contentDocument;
  doc.getElementById(ETP_STANDARD_ID).click();
  doc.getElementById(ETP_CUSTOM_ID).click();
  let baselineCheckbox = doc.getElementById(CUSTOM_BASELINE_CHECKBOX_ID);
  let convenienceCheckbox = doc.getElementById(CUSTOM_CONVENIENCE_CHECKBOX_ID);
  is(
    baselineCheckbox.checked,
    true,
    "Custom's baseline checkbox should be checked, inheriting state from Standard mode."
  );
  is(
    convenienceCheckbox.checked,
    true,
    "Custom's convenience checkbox should be checked, inheriting state from Standard mode."
  );
  gBrowser.removeCurrentTab();

  // Test switching from Strict (with baseline unchecked) to Custom
  await openPreferencesViaOpenPreferencesAPI("privacy", {
    leaveOpen: true,
  });
  doc = gBrowser.contentDocument;
  doc.getElementById(ETP_STRICT_ID).click();
  let convenienceCheckboxStrict = doc.getElementById(
    STRICT_CONVENIENCE_CHECKBOX_ID
  );
  is_element_visible(
    convenienceCheckboxStrict,
    "The convenience checkbox in Strict mode must be visible for this test."
  );
  await clickCheckboxWithConfirmDialog(
    doc,
    STRICT_BASELINE_CHECKBOX_ID,
    BASELINE_PREF,
    false,
    1
  );
  doc.getElementById(ETP_CUSTOM_ID).click();
  let baselineCheckboxCustom = doc.getElementById(CUSTOM_BASELINE_CHECKBOX_ID);
  let convenienceCheckboxCustom = doc.getElementById(
    CUSTOM_CONVENIENCE_CHECKBOX_ID
  );
  is(
    baselineCheckboxCustom.checked,
    false,
    "Custom's baseline checkbox should be unchecked, inheriting state from a modified Strict mode."
  );
  is(
    convenienceCheckboxCustom.checked,
    false,
    "Custom's convenience checkbox should be unchecked, inheriting state from a modified Strict mode."
  );
  await cleanUp();
});

add_task(async function test_checkbox_state_persists_after_reload() {
  await setup();
  await openPreferencesViaOpenPreferencesAPI("privacy", {
    leaveOpen: true,
  });
  let doc = gBrowser.contentDocument;
  doc.getElementById(ETP_STRICT_ID).click();
  await clickCheckboxWithConfirmDialog(
    doc,
    STRICT_BASELINE_CHECKBOX_ID,
    BASELINE_PREF,
    false,
    1
  );
  is(
    doc.getElementById(STRICT_BASELINE_CHECKBOX_ID).checked,
    false,
    "The Strict mode baseline checkbox should be unchecked before reload."
  );
  doc.defaultView.location.reload();
  await BrowserTestUtils.browserLoaded(gBrowser.selectedBrowser);
  doc = gBrowser.contentDocument;
  let baselineCheckboxAfter = doc.getElementById(STRICT_BASELINE_CHECKBOX_ID);
  is(
    baselineCheckboxAfter.checked,
    false,
    "The Strict mode baseline checkbox should remain unchecked after page reload."
  );
  await cleanUp();
});

add_task(async function test_switching_modes_resets_checkboxes() {
  await setup();
  await openPreferencesViaOpenPreferencesAPI("privacy", {
    leaveOpen: true,
  });
  let doc = gBrowser.contentDocument;
  let standardRadio = doc.getElementById(ETP_STANDARD_ID);
  standardRadio.click();
  doc.getElementById(ETP_STRICT_ID).click();
  await clickCheckboxWithConfirmDialog(
    doc,
    STRICT_BASELINE_CHECKBOX_ID,
    BASELINE_PREF,
    false,
    1
  );
  is(
    doc.getElementById(STRICT_BASELINE_CHECKBOX_ID).checked,
    false,
    "The Strict mode baseline checkbox should be in its modified, unchecked state."
  );
  standardRadio.click();
  doc.getElementById(ETP_STRICT_ID).click();
  let baselineCheckbox = doc.getElementById(STRICT_BASELINE_CHECKBOX_ID);
  let convenienceCheckbox = doc.getElementById(STRICT_CONVENIENCE_CHECKBOX_ID);
  is(
    baselineCheckbox.checked,
    true,
    "The baseline checkbox should reset to its default checked state after toggling ETP modes."
  );
  is(
    convenienceCheckbox.checked,
    false,
    "The convenience checkbox should reset to its default unchecked state after toggling ETP modes."
  );
  await cleanUp();
});

add_task(async function test_convenience_cannot_be_enabled_if_baseline_false() {
  await setup();
  await openPreferencesViaOpenPreferencesAPI("privacy", {
    leaveOpen: true,
  });
  let doc = gBrowser.contentDocument;
  doc.getElementById(ETP_STRICT_ID).click();
  let convenienceCheckbox = doc.getElementById(STRICT_CONVENIENCE_CHECKBOX_ID);

  is(
    convenienceCheckbox.parentDisabled,
    false,
    "The convenience checkbox should be enabled when the baseline checkbox is checked."
  );

  await clickCheckboxWithConfirmDialog(
    doc,
    STRICT_BASELINE_CHECKBOX_ID,
    BASELINE_PREF,
    false,
    1
  );

  is(
    convenienceCheckbox.parentDisabled,
    true,
    "The convenience checkbox should be disabled when the baseline checkbox is unchecked."
  );

  convenienceCheckbox.click();

  is(
    convenienceCheckbox.checked,
    false,
    "Clicking the disabled convenience checkbox should not change its state."
  );
  await cleanUp();
});

add_task(async function test_prefs_update_when_toggling_checkboxes_in_custom() {
  await setup();
  await openPreferencesViaOpenPreferencesAPI("privacy", {
    leaveOpen: true,
  });
  let doc = gBrowser.contentDocument;
  doc.getElementById(ETP_CUSTOM_ID).click();

  await clickCheckboxWithConfirmDialog(
    doc,
    CUSTOM_BASELINE_CHECKBOX_ID,
    BASELINE_PREF,
    false,
    1
  );

  Assert.ok(
    !Services.prefs.getBoolPref(BASELINE_PREF),
    "The baseline pref should be false after being unchecked in Custom mode."
  );
  Assert.ok(
    Services.prefs.getBoolPref(CONVENIENCE_PREF),
    "The convenience pref should be unchanged after baseline unchecked in Custom mode."
  );

  // Check both boxes and verify the preferences are updated.
  await clickCheckboxAndWaitForPrefChange(
    doc,
    CUSTOM_BASELINE_CHECKBOX_ID,
    BASELINE_PREF,
    true
  );
  Assert.ok(
    Services.prefs.getBoolPref(BASELINE_PREF),
    "The baseline pref should be true after being checked in Custom mode."
  );
  await cleanUp();
});

add_task(async function test_reload_button_shows_after_prefs_changed_strict() {
  await setup();
  await openPreferencesViaOpenPreferencesAPI("privacy", {
    leaveOpen: true,
  });
  let tab = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let doc = gBrowser.contentDocument;

  doc.getElementById(ETP_STRICT_ID).click();

  let strictReloadButton = doc.querySelector(
    "#contentBlockingOptionStrict .content-blocking-warning.reload-tabs .reload-tabs-button"
  );

  is_element_visible(
    strictReloadButton,
    "The strict reload button must be visible"
  );

  strictReloadButton.click();

  is_element_hidden(
    strictReloadButton,
    "The strict reload button must be hidden after clicking it"
  );

  await clickCheckboxWithConfirmDialog(
    doc,
    STRICT_BASELINE_CHECKBOX_ID,
    BASELINE_PREF,
    false,
    1
  );

  is_element_visible(
    strictReloadButton,
    "The strict reload button must be visible after baseline pref changes"
  );

  strictReloadButton.click();

  is_element_hidden(
    strictReloadButton,
    "The strict reload button must be hidden after clicking it"
  );

  BrowserTestUtils.removeTab(tab);
  await cleanUp();
});

add_task(async function test_reload_button_shows_after_prefs_changed_custom() {
  await setup();
  await openPreferencesViaOpenPreferencesAPI("privacy", {
    leaveOpen: true,
  });
  let tab = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let doc = gBrowser.contentDocument;

  doc.getElementById(ETP_CUSTOM_ID).click();

  let customReloadButton = doc.querySelector(
    "#contentBlockingOptionCustom .content-blocking-warning.reload-tabs .reload-tabs-button"
  );

  is_element_hidden(
    customReloadButton,
    "The custom reload button must be hidden when switching from strict"
  );

  await clickCheckboxWithConfirmDialog(
    doc,
    CUSTOM_BASELINE_CHECKBOX_ID,
    BASELINE_PREF,
    false,
    1
  );

  is_element_visible(
    customReloadButton,
    "The custom reload button must be visible after baseline checkbox changes"
  );

  customReloadButton.click();

  is_element_hidden(
    customReloadButton,
    "The custom reload button must be hidden after clicking it"
  );

  BrowserTestUtils.removeTab(tab);
  await cleanUp();
});

add_task(async function test_baseline_checkbox_dialog_cancel() {
  await setup();
  await openPreferencesViaOpenPreferencesAPI("privacy", {
    leaveOpen: true,
  });
  let doc = gBrowser.contentDocument;
  doc.getElementById(ETP_STRICT_ID).click();

  // Initially, baseline should be checked
  let baselineCheckbox = doc.getElementById(STRICT_BASELINE_CHECKBOX_ID);
  is(
    baselineCheckbox.checked,
    true,
    "The baseline checkbox should be checked initially."
  );

  await clickCheckboxWithConfirmDialog(
    doc,
    STRICT_BASELINE_CHECKBOX_ID,
    BASELINE_PREF,
    true,
    0
  );

  // Verify the checkbox is still checked and pref is still true
  is(
    baselineCheckbox.checked,
    true,
    "The baseline checkbox should remain checked after canceling dialog."
  );
  Assert.ok(
    Services.prefs.getBoolPref(BASELINE_PREF),
    "The baseline pref should remain true after canceling dialog."
  );

  await cleanUp();
});

add_task(async function test_baseline_checkbox_dialog_confirm() {
  await setup();
  await openPreferencesViaOpenPreferencesAPI("privacy", {
    leaveOpen: true,
  });
  let doc = gBrowser.contentDocument;
  doc.getElementById(ETP_STRICT_ID).click();

  let baselineCheckbox = doc.getElementById(STRICT_BASELINE_CHECKBOX_ID);
  is(
    baselineCheckbox.checked,
    true,
    "The baseline checkbox should be checked initially."
  );

  await clickCheckboxWithConfirmDialog(
    doc,
    STRICT_BASELINE_CHECKBOX_ID,
    BASELINE_PREF,
    false,
    1
  );

  is(
    baselineCheckbox.checked,
    false,
    "The baseline checkbox should be unchecked after confirming dialog."
  );
  Assert.ok(
    !Services.prefs.getBoolPref(BASELINE_PREF),
    "The baseline pref should be false after confirming dialog."
  );

  Assert.ok(
    !Services.prefs.getBoolPref(CONVENIENCE_PREF),
    "The convenience pref should be false when baseline is disabled."
  );

  await cleanUp();
});

add_task(async function test_custom_baseline_checkbox_dialog_cancel() {
  await setup();
  await openPreferencesViaOpenPreferencesAPI("privacy", {
    leaveOpen: true,
  });
  let doc = gBrowser.contentDocument;
  doc.getElementById(ETP_CUSTOM_ID).click();

  let baselineCheckbox = doc.getElementById(CUSTOM_BASELINE_CHECKBOX_ID);
  is(
    baselineCheckbox.checked,
    true,
    "The custom baseline checkbox should be checked initially."
  );

  await clickCheckboxWithConfirmDialog(
    doc,
    CUSTOM_BASELINE_CHECKBOX_ID,
    BASELINE_PREF,
    true,
    0
  );

  is(
    baselineCheckbox.checked,
    true,
    "The custom baseline checkbox should remain checked after canceling dialog."
  );
  Assert.ok(
    Services.prefs.getBoolPref(BASELINE_PREF),
    "The baseline pref should remain true after canceling dialog."
  );

  Assert.ok(
    Services.prefs.getBoolPref(CONVENIENCE_PREF),
    "The convenience pref should remain true when baseline is enabled."
  );

  await cleanUp();
});

add_task(async function test_custom_baseline_checkbox_dialog_confirm() {
  await setup();
  await openPreferencesViaOpenPreferencesAPI("privacy", {
    leaveOpen: true,
  });
  let doc = gBrowser.contentDocument;
  doc.getElementById(ETP_CUSTOM_ID).click();

  let baselineCheckbox = doc.getElementById(CUSTOM_BASELINE_CHECKBOX_ID);
  is(
    baselineCheckbox.checked,
    true,
    "The custom baseline checkbox should be checked initially."
  );

  await clickCheckboxWithConfirmDialog(
    doc,
    CUSTOM_BASELINE_CHECKBOX_ID,
    BASELINE_PREF,
    false,
    1
  );

  is(
    baselineCheckbox.checked,
    false,
    "The custom baseline checkbox should be unchecked after confirming dialog."
  );
  Assert.ok(
    !Services.prefs.getBoolPref(BASELINE_PREF),
    "The baseline pref should be false after confirming dialog."
  );

  let convenienceCheckbox = doc.getElementById(CUSTOM_CONVENIENCE_CHECKBOX_ID);
  is(
    convenienceCheckbox.checked,
    true,
    "The custom convenience checkbox should be unchanged when baseline is disabled."
  );
  Assert.ok(
    Services.prefs.getBoolPref(CONVENIENCE_PREF),
    "The convenience pref should be unchanged when baseline is disabled."
  );

  await cleanUp();
});

add_task(
  async function test_reload_does_not_show_after_baseline_checkbox_dialog_cancel() {
    await SpecialPowers.pushPrefEnv({
      set: [[CB_CATEGORY_PREF, "strict"]],
    });
    Assert.ok(
      Services.prefs.getBoolPref(BASELINE_PREF),
      "The baseline preference should be initially true."
    );
    Assert.ok(
      !Services.prefs.getBoolPref(CONVENIENCE_PREF),
      "The convenience preference should be initially false."
    );
    await openPreferencesViaOpenPreferencesAPI("privacy", {
      leaveOpen: true,
    });
    let doc = gBrowser.contentDocument;

    let reloadButton = doc.querySelector(
      "#contentBlockingOptionStrict .content-blocking-warning.reload-tabs .reload-tabs-button"
    );
    is_element_hidden(
      reloadButton,
      "The reload button should be hidden initially in Strict mode."
    );

    await clickCheckboxWithConfirmDialog(
      doc,
      STRICT_BASELINE_CHECKBOX_ID,
      BASELINE_PREF,
      true,
      0
    );

    Assert.ok(
      Services.prefs.getBoolPref(BASELINE_PREF),
      "The baseline pref should remain true after canceling dialog."
    );

    is_element_hidden(
      reloadButton,
      "The reload button should be hidden after canceling the checkbox dialog."
    );

    await cleanUp();
  }
);
