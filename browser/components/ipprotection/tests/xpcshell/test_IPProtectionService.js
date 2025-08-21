/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { AddonTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AddonTestUtils.sys.mjs"
);
const { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);
const { IPProtectionService } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPProtectionService.sys.mjs"
);
const { UIState } = ChromeUtils.importESModule(
  "resource://services-sync/UIState.sys.mjs"
);

do_get_profile();

AddonTestUtils.init(this);
AddonTestUtils.createAppInfo(
  "xpcshell@tests.mozilla.org",
  "XPCShell",
  "1",
  "1"
);

ExtensionTestUtils.init(this);

add_setup(async function () {
  IPProtectionService.uninit();

  registerCleanupFunction(async () => {
    IPProtectionService.init();
  });
});

/**
 * Tests that starting the service gets a started event.
 */
add_task(async function test_IPProtectionService_start() {
  IPProtectionService.init();

  let sandbox = sinon.createSandbox();
  sandbox.stub(IPProtectionService.guardian, "fetchProxyPass").returns({
    status: 200,
    error: undefined,
    pass: {
      isValid: () => true,
    },
  });

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
  IPProtectionService.isEnrolled = true;
  IPProtectionService.isEntitled = true;
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

  IPProtectionService.uninit();
  sandbox.restore();
});

/**
 * Tests that stopping the service gets stop events.
 */
add_task(async function test_IPProtectionService_stop() {
  IPProtectionService.init();

  // Simulate signing in to the account
  IPProtectionService.isActive = true;
  IPProtectionService.activatedAt = Cu.now();

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
 * Tests the add-on manager interaction
 */
add_task(async function test_IPProtectionService_addon() {
  Services.prefs.setBoolPref("xpinstall.signatures.required", false);
  Services.prefs.setBoolPref("extensions.install.requireBuiltInCerts", false);

  await AddonTestUtils.promiseStartupManager();

  Assert.ok(
    Services.prefs.getBoolPref("browser.ipProtection.enabled"),
    "IP-Protection is enabled"
  );

  IPProtectionService.addVPNAddonObserver();

  const extension = ExtensionTestUtils.loadExtension({
    useAddonManager: "permanent",
    manifest: {
      manifest_version: 2,
      name: "Test VPN",
      version: "1.0",
      applications: { gecko: { id: "vpn@mozilla.com" } },
    },
  });

  await extension.startup();

  Assert.ok(
    !Services.prefs.getBoolPref("browser.ipProtection.enabled"),
    "IP-Protection is disabled"
  );
  Services.prefs.setBoolPref("browser.ipProtection.enabled", true);
  Assert.ok(
    Services.prefs.getBoolPref("browser.ipProtection.enabled"),
    "IP-Protection is re-enabled"
  );

  await extension.unload();

  IPProtectionService.removeVPNAddonObserver();

  const extension2 = ExtensionTestUtils.loadExtension({
    useAddonManager: "permanent",
    manifest: {
      manifest_version: 2,
      name: "Test VPN",
      version: "2.0",
      applications: { gecko: { id: "vpn@mozilla.com" } },
    },
  });

  await extension2.startup();

  Assert.ok(
    Services.prefs.getBoolPref("browser.ipProtection.enabled"),
    "IP-Protection pref does not change without listener"
  );

  await extension2.unload();

  await AddonTestUtils.promiseShutdownManager();

  Services.prefs.clearUserPref("xpinstall.signatures.required");
  Services.prefs.clearUserPref("extensions.install.requireBuiltInCerts");
});

/**
 * Tests that a signed in status sends a SignedIn event.
 */
add_task(async function test_IPProtectionService_updateSignInStatus_signedIn() {
  IPProtectionService.init();

  let sandbox = sinon.createSandbox();
  sandbox.stub(UIState, "get").returns({
    status: UIState.STATUS_SIGNED_IN,
  });
  sandbox
    .stub(IPProtectionService.guardian, "isLinkedToGuardian")
    .returns(false);

  let signedInEventPromise = waitForEvent(
    IPProtectionService,
    "IPProtectionService:SignedIn"
  );

  IPProtectionService.updateSignInStatus();

  await signedInEventPromise;

  Assert.ok(IPProtectionService.isSignedIn, "Should be signed in after update");

  IPProtectionService.uninit();
  sandbox.restore();
});

/**
 * Tests that an other status sends a SignedOut event.
 */
add_task(
  async function test_IPProtectionService_updateSignInStatus_signedOut() {
    IPProtectionService.init();

    IPProtectionService.isSignedIn = true;

    let sandbox = sinon.createSandbox();
    sandbox.stub(UIState, "get").returns({
      status: UIState.STATUS_NOT_CONFIGURED,
    });
    sandbox
      .stub(IPProtectionService.guardian, "isLinkedToGuardian")
      .returns(true);

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

    IPProtectionService.uninit();
    sandbox.restore();
  }
);
