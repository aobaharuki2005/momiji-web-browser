/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const CAT_PREF = "browser.contentblocking.category";
const BASELINE_PREF = "privacy.trackingprotection.allow_list.baseline.enabled";
const CONVENIENCE_PREF =
  "privacy.trackingprotection.allow_list.convenience.enabled";
const COOKIE_BEHAVIOR_PREF = "network.cookie.cookieBehavior";
const TP_PREF = "privacy.trackingprotection.enabled";
const TP_PBM_PREF = "privacy.trackingprotection.pbmode.enabled";
const CRYPTOMINING_PREF = "privacy.trackingprotection.cryptomining.enabled";
const FINGERPRINTING_PREF = "privacy.trackingprotection.fingerprinting.enabled";
const SUSPECT_FP_PREF = "privacy.fingerprintingProtection";
const SUSPECT_FP_PBM_PREF = "privacy.fingerprintingProtection.pbmode";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.settings-redesign.enabled", true]],
  });
});

function getControl(doc, id) {
  let control = doc.getElementById(id);
  ok(control, `Control ${id} exists`);
  return control;
}

function synthesizeClick(el) {
  let target = el.buttonEl ?? el.inputEl ?? el;
  target.scrollIntoView({ block: "center" });
  EventUtils.synthesizeMouseAtCenter(target, {}, target.ownerGlobal);
}

async function openEtpCustomizePage() {
  await openPreferencesViaOpenPreferencesAPI("etpCustomize", {
    leaveOpen: true,
  });
  let doc = gBrowser.contentDocument;
  await BrowserTestUtils.waitForCondition(
    () => doc.getElementById("etpAllowListBaselineEnabledCustom"),
    "Wait for the ETP customize controls to render"
  );
  return {
    win: gBrowser.contentWindow,
    doc,
  };
}

async function changeMozSelectValue(selectEl, value) {
  let control = selectEl.control;
  let changePromise = waitForSettingControlChange(control);
  selectEl.value = value;
  selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  await changePromise;
}

async function clickBaselineCheckboxWithConfirm(
  doc,
  controlId,
  prefName,
  expectedValue,
  buttonNumClick
) {
  let checkbox = getControl(doc, controlId);

  let promptPromise = PromptTestUtils.handleNextPrompt(
    gBrowser.selectedBrowser,
    { modalType: Services.prompt.MODAL_TYPE_CONTENT },
    { buttonNumClick }
  );

  let prefChangePromise = null;
  if (buttonNumClick === 1) {
    prefChangePromise = waitForAndAssertPrefState(
      prefName,
      expectedValue,
      `${prefName} updated`
    );
  }

  synthesizeClick(checkbox);

  await promptPromise;
  if (prefChangePromise) {
    await prefChangePromise;
  }

  is(
    checkbox.checked,
    expectedValue,
    `Checkbox ${controlId} should be ${expectedValue}`
  );

  return checkbox;
}

// Confirms reset buttons drive the category pref and enable/disable appropriately.
add_task(async function test_etp_reset_buttons_update_category() {
  await SpecialPowers.pushPrefEnv({
    set: [[CAT_PREF, "standard"]],
  });

  let { doc } = await openEtpCustomizePage();
  let standardButton = getControl(doc, "etpResetStandardButton");
  let strictButton = getControl(doc, "etpResetStrictButton");

  ok(standardButton.disabled, "Standard reset button disabled on standard");
  ok(!strictButton.disabled, "Strict reset button enabled");

  let prefChange = waitForAndAssertPrefState(
    CAT_PREF,
    "strict",
    "ETP category pref switched to strict"
  );
  synthesizeClick(strictButton);
  await prefChange;

  ok(strictButton.disabled, "Strict reset button disabled after use");
  ok(
    !standardButton.disabled,
    "Standard reset button enabled after switching to strict"
  );

  prefChange = waitForAndAssertPrefState(
    CAT_PREF,
    "standard",
    "ETP category pref switched back to standard"
  );
  synthesizeClick(standardButton);
  await prefChange;

  gBrowser.removeCurrentTab();
});

// Mirrors legacy allow list checkbox behavior and confirmation prompts in the custom pane.
add_task(async function test_custom_allow_list_controls_match_old_behavior() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [CAT_PREF, "custom"],
      [BASELINE_PREF, true],
      [CONVENIENCE_PREF, true],
    ],
  });

  let { doc } = await openEtpCustomizePage();
  let baselineCheckbox = getControl(doc, "etpAllowListBaselineEnabledCustom");
  let convenienceCheckbox = getControl(
    doc,
    "etpAllowListConvenienceEnabledCustom"
  );

  ok(baselineCheckbox.checked, "Custom baseline checkbox starts checked");

  await clickBaselineCheckboxWithConfirm(
    doc,
    "etpAllowListBaselineEnabledCustom",
    BASELINE_PREF,
    false,
    1
  );

  ok(
    !Services.prefs.getBoolPref(BASELINE_PREF),
    "Baseline pref disabled from custom controls"
  );
  ok(
    convenienceCheckbox.parentDisabled,
    "Custom convenience checkbox disabled when baseline unchecked"
  );

  let baselinePrefChange = waitForAndAssertPrefState(
    BASELINE_PREF,
    true,
    "Baseline pref restored"
  );
  synthesizeClick(baselineCheckbox);
  await baselinePrefChange;
  await BrowserTestUtils.waitForCondition(
    () => !convenienceCheckbox.parentDisabled,
    "Custom convenience checkbox enabled once baseline rechecked"
  );

  gBrowser.removeCurrentTab();
});

// Validates the cookie toggle/select wiring for custom mode.
add_task(async function test_custom_cookie_controls() {
  let defaults = Services.prefs.getDefaultBranch("");
  let defaultCookieBehavior = defaults.getIntPref(COOKIE_BEHAVIOR_PREF);

  await SpecialPowers.pushPrefEnv({
    set: [
      [CAT_PREF, "custom"],
      [COOKIE_BEHAVIOR_PREF, Ci.nsICookieService.BEHAVIOR_ACCEPT],
    ],
  });

  let { doc } = await openEtpCustomizePage();
  let cookieToggle = getControl(doc, "etpCustomCookiesEnabled");
  let cookieSelect = getControl(doc, "cookieBehavior");

  ok(
    !cookieToggle.pressed,
    "Cookie toggle starts disabled when behavior is accept"
  );

  let prefChange = waitForAndAssertPrefState(
    COOKIE_BEHAVIOR_PREF,
    defaultCookieBehavior,
    "Enabling cookie toggle restores default behavior"
  );
  synthesizeClick(cookieToggle.buttonEl);
  await prefChange;

  ok(cookieToggle.pressed, "Cookie toggle is pressed when enabled");

  info("Select a stricter cookie behavior through the dropdown");
  let newBehavior = Ci.nsICookieService.BEHAVIOR_REJECT_FOREIGN.toString();
  await changeMozSelectValue(cookieSelect, newBehavior);
  is(
    Services.prefs.getIntPref(COOKIE_BEHAVIOR_PREF),
    Ci.nsICookieService.BEHAVIOR_REJECT_FOREIGN,
    "Cookie behavior pref updated from moz-select"
  );

  prefChange = waitForAndAssertPrefState(
    COOKIE_BEHAVIOR_PREF,
    Ci.nsICookieService.BEHAVIOR_ACCEPT,
    "Disabling cookie toggle accepts all cookies"
  );
  synthesizeClick(cookieToggle.buttonEl);
  await prefChange;

  ok(!cookieToggle.pressed, "Cookie toggle reflects disabled state");

  gBrowser.removeCurrentTab();
});

// Checks tracking protection toggle and scope dropdown interactions.
add_task(async function test_custom_tracking_protection_controls() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [CAT_PREF, "custom"],
      [TP_PREF, false],
      [TP_PBM_PREF, true],
    ],
  });

  let { doc } = await openEtpCustomizePage();
  let tpToggle = getControl(doc, "etpCustomTrackingProtectionEnabled");
  let tpContext = getControl(doc, "etpCustomTrackingProtectionEnabledContext");

  ok(tpToggle.pressed, "Tracking protection toggle starts enabled");

  let prefChange = TestUtils.waitForPrefChange(
    TP_PBM_PREF,
    value => value === false
  );
  synthesizeClick(tpToggle.buttonEl);
  await prefChange;

  ok(!tpToggle.pressed, "Tracking protection toggle reflects disabled state");
  ok(
    !Services.prefs.getBoolPref(TP_PREF),
    "All-windows tracking protection pref remains false"
  );

  prefChange = TestUtils.waitForPrefChange(
    TP_PBM_PREF,
    value => value === true
  );
  synthesizeClick(tpToggle.buttonEl);
  await prefChange;
  ok(tpToggle.pressed, "Tracking protection toggle enabled again");
  ok(
    !Services.prefs.getBoolPref(TP_PREF),
    "All-windows tracking protection pref still false after re-enabling toggle"
  );

  info("Switch context to protect all windows");
  await changeMozSelectValue(tpContext, "all");
  ok(
    Services.prefs.getBoolPref(TP_PREF),
    "Tracking protection pref enabled for all windows"
  );
  ok(
    Services.prefs.getBoolPref(TP_PBM_PREF),
    "Tracking protection PBM pref stays enabled"
  );

  info("Switch back to private windows only");
  await changeMozSelectValue(tpContext, "pbmOnly");
  ok(
    !Services.prefs.getBoolPref(TP_PREF),
    "All windows pref disabled when choosing private only"
  );
  ok(
    Services.prefs.getBoolPref(TP_PBM_PREF),
    "Private windows pref stays enabled"
  );

  gBrowser.removeCurrentTab();
});

// Covers cryptomining/fingerprinting toggles and suspect protection context behavior.
add_task(async function test_custom_fingerprinting_controls() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [CAT_PREF, "custom"],
      [CRYPTOMINING_PREF, false],
      [FINGERPRINTING_PREF, false],
      [SUSPECT_FP_PREF, false],
      [SUSPECT_FP_PBM_PREF, false],
    ],
  });

  let { doc } = await openEtpCustomizePage();
  let cryptoToggle = getControl(doc, "etpCustomCryptominingProtectionEnabled");
  let knownFpToggle = getControl(
    doc,
    "etpCustomKnownFingerprintingProtectionEnabled"
  );
  let suspectFpToggle = getControl(
    doc,
    "etpCustomSuspectFingerprintingProtectionEnabled"
  );
  let suspectContext = getControl(
    doc,
    "etpCustomSuspectFingerprintingProtectionEnabledContext"
  );

  info("Enable cryptomining protection");
  let prefChange = waitForAndAssertPrefState(
    CRYPTOMINING_PREF,
    true,
    "Cryptomining pref enabled"
  );
  synthesizeClick(cryptoToggle.buttonEl);
  await prefChange;

  info("Enable known fingerprinting protection");
  prefChange = waitForAndAssertPrefState(
    FINGERPRINTING_PREF,
    true,
    "Fingerprinting pref enabled"
  );
  synthesizeClick(knownFpToggle.buttonEl);
  await prefChange;

  info("Enable suspect fingerprinting protection");
  prefChange = TestUtils.waitForPrefChange(
    SUSPECT_FP_PBM_PREF,
    value => value === true
  );
  synthesizeClick(suspectFpToggle.buttonEl);
  await prefChange;
  ok(
    !Services.prefs.getBoolPref(SUSPECT_FP_PREF),
    "All-windows suspect fingerprinting pref remains false after toggle"
  );

  info("Switch suspect protection context to all windows");
  await changeMozSelectValue(suspectContext, "all");
  ok(
    Services.prefs.getBoolPref(SUSPECT_FP_PREF),
    "All-windows suspect fingerprinting pref enabled"
  );
  ok(
    Services.prefs.getBoolPref(SUSPECT_FP_PBM_PREF),
    "PBM suspect fingerprinting pref remains enabled"
  );

  info("Disable suspect protection through the toggle");
  prefChange = TestUtils.waitForPrefChange(
    SUSPECT_FP_PBM_PREF,
    value => value === false
  );
  synthesizeClick(suspectFpToggle.buttonEl);
  await prefChange;
  ok(
    !Services.prefs.getBoolPref(SUSPECT_FP_PREF),
    "All-window suspect pref disabled after toggle off"
  );

  gBrowser.removeCurrentTab();
});
