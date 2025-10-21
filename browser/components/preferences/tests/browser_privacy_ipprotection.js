/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

// This file tests the Privacy pane's Firefox VPN UI.

"use strict";

const FEATURE_PREF = "browser.ipProtection.variant";
const MODE_PREF = "browser.ipProtection.exceptionsMode";

const SECTION_ID = "dataIPProtectionGroup";

async function setupVpnPrefs({ feature, mode = "all" }) {
  return SpecialPowers.pushPrefEnv({
    set: [
      [FEATURE_PREF, feature],
      [MODE_PREF, mode],
    ],
  });
}

// Test the section is hidden on page load if the variant pref is set to an ineligible experiment.
add_task(
  async function test_section_removed_when_set_to_ineligible_experiment_pref() {
    await setupVpnPrefs({ feature: "alpha" });

    await BrowserTestUtils.withNewTab(
      { gBrowser, url: "about:preferences#privacy" },
      async function (browser) {
        let section = browser.contentDocument.getElementById(SECTION_ID);
        is_element_hidden(section, "#dataIPProtectionGroup is hidden");
      }
    );

    await SpecialPowers.popPrefEnv();
  }
);

// Test the section is shown on page load if the variant pref is set to an eligible experiment
add_task(
  async function test_section_shown_when_set_to_eligible_experiment_pref() {
    await setupVpnPrefs({ feature: "beta" });

    await BrowserTestUtils.withNewTab(
      { gBrowser, url: "about:preferences#privacy" },
      async function (browser) {
        let section = browser.contentDocument.getElementById(SECTION_ID);
        is_element_visible(section, "#dataIPProtectionGroup is shown");
      }
    );

    await SpecialPowers.popPrefEnv();
  }
);

// Test the site exceptions controls load correctly with mode set to "all"
add_task(async function test_exceptions_load_with_all_mode() {
  await setupVpnPrefs({ feature: "beta" });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:preferences#privacy" },
    async function (browser) {
      let section = browser.contentDocument.getElementById(SECTION_ID);
      let settingGroup = section.querySelector(
        `setting-group[groupid="ipprotection"]`
      );
      is_element_visible(section, "#dataIPProtectionGroup is shown");
      is_element_visible(settingGroup, "ipprotection setting group is shown");

      let siteExceptionsRadioGroup = settingGroup?.querySelector(
        "#ipProtectionExceptionsMode"
      );
      is_element_visible(
        siteExceptionsRadioGroup,
        "Site exceptions radio group is shown"
      );

      let exceptionAllRadioButton = siteExceptionsRadioGroup?.querySelector(
        "#ipProtectionExceptionRadioAll"
      );
      let exceptionSelectRadioButton = siteExceptionsRadioGroup?.querySelector(
        "#ipProtectionExceptionRadioSelect"
      );
      Assert.ok(
        exceptionAllRadioButton?.checked,
        "The 'all' radio button should be checked"
      );
      Assert.ok(
        !exceptionSelectRadioButton?.checked,
        "The 'select' radio button should not be checked"
      );

      let exceptionAllListButton = siteExceptionsRadioGroup?.querySelector(
        "#ipProtectionExceptionAllListButton"
      );
      let exceptionSelectListButton = siteExceptionsRadioGroup?.querySelector(
        "#ipProtectionExceptionSelectListButton"
      );
      is_element_visible(
        exceptionAllListButton,
        "Button for list of exclusions is shown"
      );
      is_element_hidden(
        exceptionSelectListButton,
        "Button for list of inclusions is hidden"
      );
    }
  );

  await SpecialPowers.popPrefEnv();
});

// Test the site exceptions controls load correctly with mode set to "select"
add_task(async function test_exceptions_with_select_mode() {
  await setupVpnPrefs({ feature: "beta", mode: "select" });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:preferences#privacy" },
    async function (browser) {
      let section = browser.contentDocument.getElementById(SECTION_ID);
      let settingGroup = section.querySelector(
        `setting-group[groupid="ipprotection"]`
      );
      is_element_visible(section, "#dataIPProtectionGroup is shown");
      is_element_visible(settingGroup, "ipprotection setting group is shown");

      let siteExceptionsRadioGroup = settingGroup?.querySelector(
        "#ipProtectionExceptionsMode"
      );
      is_element_visible(
        siteExceptionsRadioGroup,
        "Site exceptions radio group is shown"
      );

      let exceptionAllRadioButton = siteExceptionsRadioGroup?.querySelector(
        "#ipProtectionExceptionRadioAll"
      );
      let exceptionSelectRadioButton = siteExceptionsRadioGroup?.querySelector(
        "#ipProtectionExceptionRadioSelect"
      );
      Assert.ok(
        !exceptionAllRadioButton?.checked,
        "The 'all' radio button should not be checked"
      );
      Assert.ok(
        exceptionSelectRadioButton?.checked,
        "The 'select' radio button should be checked"
      );

      let exceptionAllListButton = siteExceptionsRadioGroup?.querySelector(
        "#ipProtectionExceptionAllListButton"
      );
      let exceptionSelectListButton = siteExceptionsRadioGroup?.querySelector(
        "#ipProtectionExceptionSelectListButton"
      );
      is_element_hidden(
        exceptionAllListButton,
        "Button for list of exclusions is hidden"
      );
      is_element_visible(
        exceptionSelectListButton,
        "Button for list of inclusions is shown"
      );
    }
  );

  await SpecialPowers.popPrefEnv();
  await SpecialPowers.popPrefEnv();
});

// Test the site exceptions controls and pref update correctly after selecting another mode option.
add_task(async function test_exceptions_change_mode_and_buttons() {
  await setupVpnPrefs({ feature: "beta" });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:preferences#privacy" },
    async function (browser) {
      let section = browser.contentDocument.getElementById(SECTION_ID);
      let settingGroup = section.querySelector(
        `setting-group[groupid="ipprotection"]`
      );
      is_element_visible(section, "#dataIPProtectionGroup is shown");
      is_element_visible(settingGroup, "ipprotection setting group is shown");

      let siteExceptionsRadioGroup = settingGroup?.querySelector(
        "#ipProtectionExceptionsMode"
      );
      is_element_visible(
        siteExceptionsRadioGroup,
        "Site exceptions radio group is shown"
      );

      let exceptionAllRadioButton = siteExceptionsRadioGroup?.querySelector(
        "#ipProtectionExceptionRadioAll"
      );
      let exceptionSelectRadioButton = siteExceptionsRadioGroup?.querySelector(
        "#ipProtectionExceptionRadioSelect"
      );

      // Change mode by clicking "select" button
      exceptionSelectRadioButton.click();

      Assert.ok(
        !exceptionAllRadioButton?.checked,
        "The 'all' radio button should not be checked"
      );
      Assert.ok(
        exceptionSelectRadioButton?.checked,
        "The 'select' radio button should be checked"
      );

      let mode = Services.prefs.getStringPref(MODE_PREF);
      Assert.equal(
        mode,
        "select",
        `Mode should now be "select" instead of "all"`
      );

      Services.prefs.clearUserPref(MODE_PREF);
    }
  );

  await SpecialPowers.popPrefEnv();
  await SpecialPowers.popPrefEnv();
});
