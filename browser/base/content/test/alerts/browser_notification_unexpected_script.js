/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

const TEST_URL =
  getRootDirectory(gTestPath).replace(
    "chrome://mochitests/content",
    "https://example.com"
  ) + "empty_file.html";

/*
 * Register cleanup function to reset prefs after other tasks have run.
 */

add_setup(async function () {
  // Per browser_enable_DRM_prompt.js , SpecialPowers.pushPrefEnv has
  // problems with buttons on the notification bar toggling the prefs.
  // So manually reset the prefs the UI we're testing toggles.

  // This preference is needed because tests run with
  // xpinstall.signatures.required=false to install a helper extension
  // This triggers the JSHacks exemption, which we need to disable
  // for our test to work.
  Services.prefs.setBoolPref(
    "security.parent_unrestricted_js_loads.skip_jshacks",
    true
  );
  // This preference is needed to prevent the Opt builds from crashing.
  // Currently we allow a single crash from an unexpected script load,
  // to try and understand the problem better via crash reports.
  // (It has not worked.)
  let originalCrashes = Services.prefs.getIntPref(
    "security.crash_tracking.js_load_1.maxCrashes",
    0
  );
  Services.prefs.setIntPref("security.crash_tracking.js_load_1.maxCrashes", 0);

  registerCleanupFunction(function () {
    Services.prefs.setBoolPref(
      "security.block_parent_unrestricted_js_loads.temporary",
      false
    );
    Services.prefs.setBoolPref(
      "security.allow_parent_unrestricted_js_loads",
      false
    );
    Services.prefs.setBoolPref(
      "security.parent_unrestricted_js_loads.skip_jshacks",
      false
    );
    Services.prefs.setIntPref(
      "security.crash_tracking.js_load_1.maxCrashes",
      originalCrashes
    );
  });
});

add_task(async function test_notitication_bar_shows() {
  let window = BrowserWindowTracker.getTopWindow();
  let notificationShownPromise = BrowserTestUtils.waitForGlobalNotificationBar(
    window,
    "unexpected-script-notification"
  );

  // Main body of test
  let sandbox = Cu.Sandbox(null);
  let sawAnError = false;
  try {
    // This will trigger the unexpected script load notification
    // as well as an error while trying to run the script.
    Cu.evalInSandbox(
      "let x = 1",
      sandbox,
      "1.8",
      "https://example.net/script.js",
      1
    );
  } catch (e) {
    sawAnError = true;
  }
  ok(sawAnError, "Should have seen an error from the evalInSandbox call");

  let notification = await notificationShownPromise;

  // Verify the notification bar showed.
  ok(notification, "Notification should be visible");
  is(
    notification.getAttribute("value"),
    "unexpected-script-notification",
    "Should be showing the right notification"
  );

  // Verify the buttons are there.
  let buttons = notification.buttonContainer.querySelectorAll(
    ".notification-button"
  );
  is(buttons.length, 2, "Should have two buttons.");
  let learnMoreLinks = notification.querySelectorAll(".notification-link");
  is(learnMoreLinks.length, 1, "Should have one learn more link.");

  // Open the dialog by clicking the Block Button
  let dialogShownPromise = new Promise(resolve => {
    BrowserTestUtils.waitForEvent(
      window.document.getElementById("window-modal-dialog"),
      "dialogopen",
      false,
      () => {
        return true;
      }
    ).then(event => {
      resolve(event.originalTarget);
    });
  });

  let buttonIndex = AppConstants.platform != "win" ? 1 : 0;
  buttons[buttonIndex].click();

  await dialogShownPromise;

  is(
    window?.gDialogBox?.dialog?._openedURL,
    "chrome://browser/content/security/unexpectedScriptLoad.xhtml",
    "Should have an open dialog"
  );

  // Verify the dialog says the right thing
  let firstParagraph =
    window.gDialogBox.dialog._frame.contentDocument.getElementById(
      "unexpected-script-load-detail-1"
    );
  isnot(firstParagraph, null, "Should have one detail paragraph.");
  is(
    firstParagraph.getAttribute("data-l10n-id"),
    "unexpected-script-load-detail-1-block",
    "Should have the right detail text."
  );

  // Verify the report checkbox is checked
  let reportCheckbox =
    window.gDialogBox.dialog._frame.contentDocument.getElementById(
      "reportCheckbox"
    );
  isnot(reportCheckbox, null, "Should have one report checkbox.");
  is(
    reportCheckbox.checked,
    true,
    "Report checkbox should be checked by default"
  );

  // Fill in the email field and check the checkbox
  let emailCheckbox =
    window.gDialogBox.dialog._frame.contentDocument.getElementById(
      "emailCheckbox"
    );
  isnot(emailCheckbox, null, "Should have one email checkbox.");
  is(
    emailCheckbox.checked,
    false,
    "Email checkbox should not be checked by default"
  );
  emailCheckbox.checked = true;

  let emailField =
    window.gDialogBox.dialog._frame.contentDocument.getElementById(
      "emailInput"
    );
  isnot(emailField, null, "Should have one email field.");
  emailField.value = "test@example.com";

  // Block the Script
  let blockButton =
    window.gDialogBox.dialog._frame.contentDocument.getElementById(
      "block-button"
    );
  isnot(blockButton, null, "Should have one block button.");

  let dialogClosePromise = new Promise(resolve => {
    BrowserTestUtils.waitForEvent(
      window.document.getElementById("window-modal-dialog"),
      "dialogclose",
      false,
      () => {
        return true;
      }
    ).then(event => {
      resolve(event.originalTarget);
    });
  });

  blockButton.click();
  await dialogClosePromise;

  let isBlocked = Services.prefs.getBoolPref(
    "security.block_parent_unrestricted_js_loads.temporary",
    false
  );
  is(isBlocked, true, "Should have set the pref");

  let isAllowed = Services.prefs.getBoolPref(
    "security.allow_parent_unrestricted_js_loads",
    false
  );
  is(isAllowed, false, "Should not have set the allow pref");

  // Check Telemetry
  ok(
    Glean.unexpectedScriptLoad.infobarShown.testGetValue().length,
    "Should have recorded an InfoBarOpened telemetry event"
  );
  ok(
    !Glean.unexpectedScriptLoad.infobarDismissed.testGetValue(),
    "Should have not recorded an infoBarDismissed telemetry event"
  );
  ok(
    !Glean.unexpectedScriptLoad.dialogDismissed.testGetValue(),
    "Should have not recorded a dialogDismissed telemetry event"
  );
  ok(
    Glean.unexpectedScriptLoad.scriptBlockedOpened.testGetValue().length,
    "Should have recorded a BlockedOpen telemetry event"
  );
  ok(
    !Glean.unexpectedScriptLoad.scriptAllowedOpened.testGetValue(),
    "Should have not recorded an allowOpen telemetry event"
  );
  ok(
    !Glean.unexpectedScriptLoad.moreInfoOpened.testGetValue(),
    "Should have not recorded an moreInfoOpened telemetry event"
  );
  ok(
    Glean.unexpectedScriptLoad.scriptBlocked.testGetValue().length,
    "Should have recorded a scriptBlocked telemetry event"
  );
  ok(
    !Glean.unexpectedScriptLoad.scriptAllowed.testGetValue(),
    "Should not have recorded a scriptAllowed telemetry event"
  );
  let script_reported_event =
    Glean.unexpectedScriptLoad.scriptReported.testGetValue();
  ok(
    script_reported_event.length,
    "Should have recorded a scriptReported telemetry event"
  );
  script_reported_event = script_reported_event[0];
  is(
    script_reported_event.extra.script_url,
    "https://example.net/script.js",
    "Should have recorded the script URL"
  );
  is(
    script_reported_event.extra.user_email,
    "test@example.com",
    "Should have recorded the email address"
  );

  // Cleanup
  Services.prefs.clearUserPref(
    "security.block_parent_unrestricted_js_loads.temporary"
  );
});
