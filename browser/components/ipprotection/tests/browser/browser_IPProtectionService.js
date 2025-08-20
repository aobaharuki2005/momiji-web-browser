/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { ASRouter } = ChromeUtils.importESModule(
  "resource:///modules/asrouter/ASRouter.sys.mjs"
);

// Don't add an experiment so we can test adding and removing it.
DEFAULT_EXPERIMENT = null;

/**
 * Tests getting eligibility from a Nimbus experiment and
 * creating and destroying the widget.
 */
add_task(async function test_IPProtectionService_updateEligibility() {
  let cleanupAlpha = await setupExperiment({ enabled: true, variant: "alpha" });
  Assert.ok(IPProtectionService.isEligible, "Should be in the experiment");
  let buttonOn = document.getElementById(IPProtectionWidget.WIDGET_ID);
  Assert.ok(
    BrowserTestUtils.isVisible(buttonOn),
    "IP Protection widget should be added to the navbar"
  );
  await cleanupAlpha();

  let cleanupControl = await setupExperiment({
    enabled: true,
    variant: "control",
  });
  Assert.ok(!IPProtectionService.isEligible, "Should not be in the experiment");
  let buttonOff = document.getElementById(IPProtectionWidget.WIDGET_ID);
  Assert.ok(
    !buttonOff,
    "IP Protection widget should not be added to the navbar"
  );
  await cleanupControl();
});

/**
 * Tests a user who was previously enrolled will be shown the widget.
 */
add_task(async function test_IPProtectionService_updateEnrollment() {
  setupService({
    isSignedIn: true,
    isEnrolled: true,
  });

  await SpecialPowers.pushPrefEnv({
    set: [["browser.ipProtection.enabled", true]],
  });

  // hasEnrolled / isEnrolled is async so wait for widget.
  await waitForWidgetAdded();

  let button = document.getElementById(IPProtectionWidget.WIDGET_ID);
  Assert.ok(
    BrowserTestUtils.isVisible(button),
    "IP Protection widget should be added to the navbar"
  );

  cleanupService();
  await SpecialPowers.popPrefEnv();
});

/**
 * Tests a user in the experiment can enroll with Guardian on sign-in.
 */
add_task(async function test_IPProtectionService_enroll() {
  setupService({
    isEnrolled: false,
    canEnroll: true,
  });

  let cleanupAlpha = await setupExperiment({ enabled: true, variant: "alpha" });

  await waitForWidgetAdded();

  setupService({
    isSignedIn: true,
  });

  await IPProtectionService.updateSignInStatus();

  Assert.ok(IPProtectionService.isEnrolled, "User should now be enrolled");

  cleanupService();
  await cleanupAlpha();
});

/**
 * Tests a user who has signed in is enrolled when enrolled in the experiment.
 * This state is only likely when testing the experiment.
 */
add_task(
  async function test_IPProtectionService_enroll_when_enrolled_in_experiment() {
    setupService({
      isEnrolled: false,
      isSignedIn: true,
      canEnroll: true,
    });

    let cleanupAlpha = await setupExperiment({
      enabled: true,
      variant: "alpha",
    });

    await waitForWidgetAdded();

    await IPProtectionService.updateSignInStatus();

    Assert.ok(IPProtectionService.isEnrolled, "User should now be enrolled");

    cleanupService();
    await cleanupAlpha();
  }
);

add_task(async function test_ipprotection_ready() {
  setupService({
    isSignedIn: true,
    isEnrolled: true,
  });

  const sandbox = sinon.createSandbox();
  const receivedTrigger = new Promise(resolve => {
    sandbox.stub(ASRouter, "sendTriggerMessage").callsFake(({ id }) => {
      if (id === "ipProtectionReady") {
        resolve(true);
      }
    });
  });

  await SpecialPowers.pushPrefEnv({
    set: [["browser.ipProtection.enabled", true]],
  });

  let ipProtectionReadyTrigger = await receivedTrigger;
  Assert.ok(ipProtectionReadyTrigger, "ipProtectionReady trigger sent");

  sandbox.restore();
  cleanupService();
});
