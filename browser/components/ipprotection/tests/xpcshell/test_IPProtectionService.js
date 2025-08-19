/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { IPProtectionService } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPProtectionService.sys.mjs"
);
const { UIState } = ChromeUtils.importESModule(
  "resource://services-sync/UIState.sys.mjs"
);

/**
 * Tests that starting the service gets a started event.
 */
add_task(async function test_IPProtectionService_start() {
  Assert.ok(
    !IPProtectionService.isActive,
    "IP Protection service should not be active initially"
  );

  let startedEventPromise = waitForEvent(
    IPProtectionService,
    "IPProtectionService:Started"
  );

  // Simulate signing in to the account
  IPProtectionService.isSignedIn = true;
  IPProtectionService.start();

  let startedEvent = await startedEventPromise;

  Assert.ok(
    IPProtectionService.isActive,
    "IP Protection service should be active after starting"
  );
  Assert.ok(
    IPProtectionService.activatedAt,
    "IP Protection service should have an activation timestamp"
  );

  Assert.equal(
    startedEvent.detail?.activatedAt,
    IPProtectionService.activatedAt,
    "Event should contain the activation timestamp"
  );
});

/**
 * Tests that stopping the service gets start and stop events.
 */
add_task(async function test_IPProtectionService_stop() {
  let startedEventPromise = waitForEvent(
    IPProtectionService,
    "IPProtectionService:Started"
  );

  // Simulate signing in to the account
  IPProtectionService.isSignedIn = true;
  IPProtectionService.start();

  await startedEventPromise;
  Assert.ok(
    IPProtectionService.isActive,
    "IP Protection service should be active after starting"
  );
  Assert.ok(
    IPProtectionService.activatedAt,
    "IP Protection service should have an activation timestamp"
  );

  let stoppedEventPromise = waitForEvent(
    IPProtectionService,
    "IPProtectionService:Stopped"
  );
  IPProtectionService.stop();

  await stoppedEventPromise;
  Assert.ok(
    !IPProtectionService.isActive,
    "IP Protection service should not be active after stopping"
  );
  Assert.ok(
    !IPProtectionService.activatedAt,
    "IP Protection service should not have an activation timestamp after stopping"
  );

  IPProtectionService.uninit();
});

/**
 * Tests that a signed in status sends a SignedIn event.
 */
add_task(async function test_IPProtectionService_updateSignInStatus_signedIn() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(UIState, "get").returns({
    status: UIState.STATUS_SIGNED_IN,
  });

  let signedInEventPromise = waitForEvent(
    IPProtectionService,
    "IPProtectionService:SignedIn"
  );

  IPProtectionService.updateSignInStatus();

  await signedInEventPromise;

  Assert.ok(IPProtectionService.isSignedIn, "Should be signed in after update");

  sandbox.restore();
});

/**
 * Tests that an other status sends a SignedOut event.
 */
add_task(
  async function test_IPProtectionService_updateSignInStatus_signedOut() {
    let sandbox = sinon.createSandbox();
    sandbox.stub(UIState, "get").returns({
      status: UIState.STATUS_NOT_CONFIGURED,
    });

    let signedOutEventPromise = waitForEvent(
      IPProtectionService,
      "IPProtectionService:SignedOut"
    );

    IPProtectionService.updateSignInStatus();

    await signedOutEventPromise;

    Assert.ok(
      !IPProtectionService.isSignedIn,
      "Should not be signed in after update"
    );

    sandbox.restore();
  }
);
