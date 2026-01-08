/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { IPPAutoRestoreSingleton } = ChromeUtils.importESModule(
  "moz-src:///browser/components/ipprotection/IPPAutoStart.sys.mjs"
);

add_setup(async function () {
  await putServerInRemoteSettings();
  Services.prefs.setBoolPref("browser.ipProtection.autoRestoreEnabled", true);
  IPProtectionService.uninit();

  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("browser.ipProtection.userEnabled");
    Services.prefs.clearUserPref("browser.ipProtection.autoRestoreEnabled");
    IPProtectionService.init();
  });
});

/**
 * Tests that the VPN auto-starts when if the user had previously enabled it.
 */
add_task(async function test_IPPStart_AutoRestore_if_userEnabled() {
  // Simulate user having previously enabled the VPN
  Services.prefs.setBoolPref("browser.ipProtection.userEnabled", true);

  let sandbox = sinon.createSandbox();
  setupStubs(sandbox);

  const autoRestore = new IPPAutoRestoreSingleton(true);

  const waitForReady = waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    () => IPProtectionService.state === IPProtectionStates.READY
  );

  IPProtectionService.init();
  autoRestore.init();

  await waitForReady;

  Assert.ok(
    autoRestore.shouldRestore,
    "Will auto-start when userEnabled is true"
  );

  Assert.equal(
    IPPProxyManager.state,
    IPPProxyStates.ACTIVATING,
    "Proxy is activating"
  );

  autoRestore.uninit();
  IPProtectionService.uninit();
  sandbox.restore();
});

/**
 * Tests that the VPN does not auto-start if the user had previously disabled it.
 */
add_task(async function test_IPPAutoStart_restore_if_userDisabled() {
  // Simulate user having previously disabled the VPN
  Services.prefs.setBoolPref("browser.ipProtection.userEnabled", false);

  let sandbox = sinon.createSandbox();
  setupStubs(sandbox);

  const autoRestore = new IPPAutoRestoreSingleton(true);

  const waitForReady = waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    () => IPProtectionService.state === IPProtectionStates.READY
  );

  IPProtectionService.init();
  autoRestore.init();

  await waitForReady;

  Assert.ok(
    !autoRestore.shouldRestore,
    "Will not auto-start when userEnabled is false"
  );

  Assert.equal(
    IPPProxyManager.state,
    IPPProxyStates.READY,
    "Proxy is still ready"
  );

  await IPPProxyManager.stop(false);

  autoRestore.uninit();
  IPProtectionService.uninit();
  sandbox.restore();
});

/**
 * Tests that the VPN does not auto-start if the state is not READY.
 */
add_task(async function test_IPPAutoStart_restore_if_notReady() {
  // Simulate user having previously enabled the VPN
  Services.prefs.setBoolPref("browser.ipProtection.userEnabled", true);

  let sandbox = sinon.createSandbox();
  setupStubs(sandbox);

  const autoRestore = new IPPAutoRestoreSingleton(true);

  const waitForUnavailable = waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    () => IPProtectionService.state === IPProtectionStates.UNAVAILABLE
  );

  IPProtectionService.init();
  IPProtectionService.setState(IPProtectionStates.UNAVAILABLE);

  autoRestore.init();
  await waitForUnavailable;

  Assert.ok(
    autoRestore.shouldRestore,
    "Can auto-start when userEnabled is true"
  );

  Assert.equal(
    IPPProxyManager.state,
    IPPProxyStates.READY,
    "Proxy is still not ready"
  );

  autoRestore.uninit();
  IPProtectionService.uninit();
  sandbox.restore();
});
