/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

// This file tests the Privacy pane's Firefox VPN UI.

"use strict";

const FEATURE_PREF = "browser.ipProtection.variant";
const SITE_EXCEPTIONS_FEATURE_PREF =
  "browser.ipProtection.features.siteExceptions";
const AUTOSTART_FEATURE_ENABLED_PREF =
  "browser.ipProtection.features.autoStart";
const AUTOSTART_PREF = "browser.ipProtection.autoStartEnabled";
const AUTOSTART_PRIVATE_PREF = "browser.ipProtection.autoStartPrivateEnabled";

const SECTION_ID = "dataIPProtectionGroup";

async function setupVpnPrefs({
  feature,
  siteExceptions = false,
  autostartFeatureEnabled = false,
  autostart = false,
  autostartprivate = false,
}) {
  return SpecialPowers.pushPrefEnv({
    set: [
      [FEATURE_PREF, feature],
      [SITE_EXCEPTIONS_FEATURE_PREF, siteExceptions],
      [AUTOSTART_FEATURE_ENABLED_PREF, autostartFeatureEnabled],
      [AUTOSTART_PREF, autostart],
      [AUTOSTART_PRIVATE_PREF, autostartprivate],
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
  }
);

// Test the site exceptions controls load correctly.
add_task(async function test_exceptions_settings() {
  await setupVpnPrefs({ feature: "beta", siteExceptions: true });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:preferences#privacy" },
    async function (browser) {
      let section = browser.contentDocument.getElementById(SECTION_ID);
      let settingGroup = section.querySelector(
        `setting-group[groupid="ipprotection"]`
      );
      is_element_visible(section, "#dataIPProtectionGroup is shown");
      is_element_visible(settingGroup, "ipprotection setting group is shown");

      let siteExceptionsGroup = settingGroup?.querySelector(
        "#ipProtectionExceptions"
      );
      is_element_visible(siteExceptionsGroup, "Site exceptions group is shown");

      let exceptionAllListButton = siteExceptionsGroup?.querySelector(
        "#ipProtectionExceptionAllListButton"
      );
      is_element_visible(
        exceptionAllListButton,
        "Button for list of exclusions is shown"
      );
    }
  );
});

// Test that autostart checkboxes exist and map to the correct preferences
add_task(async function test_autostart_checkboxes() {
  await setupVpnPrefs({
    feature: "beta",
    autostartFeatureEnabled: true,
    autostart: true,
    autostartprivate: true,
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:preferences#privacy" },
    async function (browser) {
      let section = browser.contentDocument.getElementById(SECTION_ID);
      let settingGroup = section.querySelector(
        `setting-group[groupid="ipprotection"]`
      );
      is_element_visible(section, "#dataIPProtectionGroup is shown");
      is_element_visible(settingGroup, "ipprotection setting group is shown");

      let autoStartSettings = settingGroup?.querySelector(
        "#ipProtectionAutoStart"
      );
      is_element_visible(
        autoStartSettings,
        "autoStart settings group is shown"
      );

      let autoStartCheckbox = autoStartSettings?.querySelector(
        "#ipProtectionAutoStartCheckbox"
      );
      let autoStartPrivateCheckbox = autoStartSettings?.querySelector(
        "#ipProtectionAutoStartPrivateCheckbox"
      );

      Assert.ok(
        autoStartCheckbox.checked,
        "Autostart checkbox should be checked"
      );
      Assert.ok(
        autoStartPrivateCheckbox.checked,
        "Autostart in private browsing checkbox should be checked"
      );
    }
  );
});

// Test that additional links exist
add_task(async function test_additional_links() {
  await setupVpnPrefs({
    feature: "beta",
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:preferences#privacy" },
    async function (browser) {
      let section = browser.contentDocument.getElementById(SECTION_ID);
      let settingGroup = section.querySelector(
        `setting-group[groupid="ipprotection"]`
      );
      is_element_visible(section, "#dataIPProtectionGroup is shown");
      is_element_visible(settingGroup, "ipprotection setting group is shown");

      let additionalLinks = settingGroup?.querySelector(
        "#ipProtectionAdditionalLinks"
      );
      is_element_visible(additionalLinks, "Additional links section is shown");

      let ipProtectionSupportLink = additionalLinks?.querySelector(
        "#ipProtectionSupportLink"
      );
      let ipProtectionUpgradeLink = additionalLinks?.querySelector(
        "#ipProtectionUpgradeLink"
      );
      is_element_visible(ipProtectionSupportLink, "Support link is shown");
      is_element_visible(ipProtectionUpgradeLink, "Upgrade link is shown");
    }
  );
});
