/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 *
 * Tests the AS RustLogins write-only mirror
 */
("use strict");

const { LoginManagerRustStorage } = ChromeUtils.importESModule(
  "resource://gre/modules/storage-rust.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

/**
 * Tests addLogin gets synced to Rust Storage
 */
add_task(async function test_mirror_addLogin() {
  await SpecialPowers.pushPrefEnv({
    set: [["signon.rustMirror.enabled", true]],
  });

  const loginInfo = LoginTestUtils.testData.formLogin({
    username: "username",
    password: "password",
  });
  await Services.logins.addLoginAsync(loginInfo);

  // note LoginManagerRustStorage is a singleton and already initialized when
  // Services.logins gets initialized.
  const rustStorage = new LoginManagerRustStorage();

  const storedLoginInfos = await Services.logins.getAllLogins();
  const rustStoredLoginInfos = await rustStorage.getAllLogins();
  LoginTestUtils.assertLoginListsEqual(storedLoginInfos, rustStoredLoginInfos);

  LoginTestUtils.clearData();
  rustStorage.removeAllLogins();
  await SpecialPowers.popPrefEnv();
});

/**
 * Tests modifyLogin gets synced to Rust Storage
 */
add_task(async function test_mirror_modifyLogin() {
  await SpecialPowers.pushPrefEnv({
    set: [["signon.rustMirror.enabled", true]],
  });

  const loginInfo = LoginTestUtils.testData.formLogin({
    username: "username",
    password: "password",
  });
  await Services.logins.addLoginAsync(loginInfo);

  const rustStorage = new LoginManagerRustStorage();

  const [storedLoginInfo] = await Services.logins.getAllLogins();

  const modifiedLoginInfo = LoginTestUtils.testData.formLogin({
    username: "username",
    password: "password",
    usernameField: "new_form_field_username",
    passwordField: "new_form_field_password",
  });
  Services.logins.modifyLogin(storedLoginInfo, modifiedLoginInfo);

  const [storedModifiedLoginInfo] = await Services.logins.getAllLogins();
  const [rustStoredModifiedLoginInfo] = await rustStorage.searchLoginsAsync({
    guid: storedLoginInfo.guid,
  });

  LoginTestUtils.assertLoginListsEqual(
    [storedModifiedLoginInfo],
    [rustStoredModifiedLoginInfo]
  );

  LoginTestUtils.clearData();
  rustStorage.removeAllLogins();
  await SpecialPowers.popPrefEnv();
});

/**
 * Tests removeLogin gets synced to Rust Storage
 */
add_task(async function test_mirror_removeLogin() {
  await SpecialPowers.pushPrefEnv({
    set: [["signon.rustMirror.enabled", true]],
  });

  const loginInfo = LoginTestUtils.testData.formLogin({
    username: "username",
    password: "password",
  });
  await Services.logins.addLoginAsync(loginInfo);

  const rustStorage = new LoginManagerRustStorage();

  const [storedLoginInfo] = await Services.logins.getAllLogins();

  Services.logins.removeLogin(storedLoginInfo);

  const allLogins = await rustStorage.getAllLogins();
  Assert.equal(allLogins.length, 0);

  LoginTestUtils.clearData();
  rustStorage.removeAllLogins();
  await SpecialPowers.popPrefEnv();
});

/**
 * Verifies that the migration is triggered by according pref change
 */
add_task(async function test_migration_is_triggered_by_pref_change() {
  // enable rust mirror, triggering migration
  await SpecialPowers.pushPrefEnv({
    set: [["signon.rustMirror.enabled", false]],
  });

  Assert.equal(
    Services.prefs.getBoolPref("signon.rustMirror.migrationNeeded", false),
    true,
    "migrationNeeded is set to true"
  );

  const prefChangePromise = TestUtils.waitForPrefChange(
    "signon.rustMirror.migrationNeeded"
  );

  // enable rust mirror, triggering migration
  await SpecialPowers.pushPrefEnv({
    set: [["signon.rustMirror.enabled", true]],
  });

  await prefChangePromise;
  Assert.equal(
    Services.prefs.getBoolPref("signon.rustMirror.migrationNeeded", false),
    false,
    "migrationNeeded is set to false"
  );

  await SpecialPowers.popPrefEnv();
  await SpecialPowers.popPrefEnv();
});

/**
 * Verifies that the migration is idempotent by ensuring that running
 * it multiple times does not create duplicate logins in the Rust store.
 */
add_task(async function test_migration_is_idempotent() {
  // ensure mirror is on
  await SpecialPowers.pushPrefEnv({
    set: [["signon.rustMirror.enabled", true]],
  });

  const login = LoginTestUtils.testData.formLogin({
    username: "test-user",
    password: "secure-password",
  });
  await Services.logins.addLoginAsync(login);

  const rustStorage = new LoginManagerRustStorage();

  let rustLogins = await rustStorage.getAllLogins();
  Assert.equal(
    rustLogins.length,
    1,
    "Rust store contains login after first migration"
  );

  // trigger again
  await SpecialPowers.pushPrefEnv({
    set: [["signon.rustMirror.enabled", false]],
  });
  // using the migrationNeeded pref change as an indicator that the migration did run
  const prefChangePromise = TestUtils.waitForPrefChange(
    "signon.rustMirror.migrationNeeded"
  );
  await SpecialPowers.pushPrefEnv({
    set: [["signon.rustMirror.enabled", true]],
  });
  await prefChangePromise;

  rustLogins = await rustStorage.getAllLogins();
  Assert.equal(rustLogins.length, 1, "No duplicate after second migration");

  LoginTestUtils.clearData();
  rustStorage.removeAllLogins();
  await SpecialPowers.popPrefEnv();
  await SpecialPowers.popPrefEnv();
  await SpecialPowers.popPrefEnv();
});

/**
 * Verify that the migration:
 *  - continues when some rows fail (partial failure),
 *  - still migrates valid logins,
 */

add_task(async function test_migration_partial_failure() {
  // ensure mirror is off
  await SpecialPowers.pushPrefEnv({
    set: [["signon.rustMirror.enabled", false]],
  });

  const rustStorage = new LoginManagerRustStorage();
  // Save the first (valid) login into Rust for real, then simulate results
  sinon.stub(rustStorage, "addLoginsAsync").callsFake(async (logins, _cont) => {
    await rustStorage.addWithMeta(logins[0]);
    return [
      { login: {}, error: null }, // row 0 success
      { login: null, error: { message: "row failed" } }, // row 1 failure
    ];
  });

  const login_ok = LoginTestUtils.testData.formLogin({
    username: "test-user-ok",
    password: "secure-password",
  });
  await Services.logins.addLoginAsync(login_ok);
  const login_bad = LoginTestUtils.testData.formLogin({
    username: "test-user-bad",
    password: "secure-password",
  });
  await Services.logins.addLoginAsync(login_bad);

  // trigger again
  await SpecialPowers.pushPrefEnv({
    set: [["signon.rustMirror.enabled", false]],
  });
  await SpecialPowers.pushPrefEnv({
    set: [["signon.rustMirror.enabled", true]],
  });

  // and wait a little, due to the lack of a migration-complete event.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 200));

  const rustLogins = await rustStorage.getAllLogins();
  Assert.equal(rustLogins.length, 1, "only valid login migrated");

  sinon.restore();
  LoginTestUtils.clearData();
  rustStorage.removeAllLogins();
  await SpecialPowers.popPrefEnv();
  await SpecialPowers.popPrefEnv();
  await SpecialPowers.popPrefEnv();
});

/**
 * Verify that when the bulk add operation rejects (hard failure),
 * the migration itself rejects.
 */
add_task(async function test_migration_rejects_when_bulk_add_rejects() {
  // turn mirror off
  await SpecialPowers.pushPrefEnv({
    set: [["signon.rustMirror.enabled", false]],
  });

  const rustStorage = new LoginManagerRustStorage();
  // force the bulk add to fail
  sinon.stub(rustStorage, "addLoginsAsync").rejects(new Error("bulk failed"));

  const login = LoginTestUtils.testData.formLogin({
    username: "test-user",
    password: "secure-password",
  });
  await Services.logins.addLoginAsync(login);

  // trigger again
  await SpecialPowers.pushPrefEnv({
    set: [["signon.rustMirror.enabled", false]],
  });
  await SpecialPowers.pushPrefEnv({
    set: [["signon.rustMirror.enabled", true]],
  });

  // and wait a little, due to the lack of a migration-complete event.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 200));

  const rustLogins = await rustStorage.getAllLogins();
  Assert.equal(rustLogins.length, 0, "zero logins migrated");

  const newPrefValue = Services.prefs.getBoolPref(
    "signon.rustMirror.migrationNeeded",
    false
  );

  Assert.equal(newPrefValue, true, "pref has not been reset");

  sinon.restore();
  LoginTestUtils.clearData();
  rustStorage.removeAllLogins();
  await SpecialPowers.popPrefEnv();
  await SpecialPowers.popPrefEnv();
  await SpecialPowers.popPrefEnv();
});

/**
 * Ensures that migrating a large number of logins (100) from the JSON store to
 * the Rust store completes within a reasonable time frame (under 1 second).
 **/
add_task(async function test_migration_time_under_threshold() {
  // ensure mirror is off
  await SpecialPowers.pushPrefEnv({
    set: [["signon.rustMirror.enabled", false]],
  });

  const numberOfLogins = 100;

  const logins = Array.from({ length: numberOfLogins }, (_, i) =>
    LoginTestUtils.testData.formLogin({
      origin: `https://www${i}.example.com`,
      username: `user${i}`,
    })
  );
  await Services.logins.addLogins(logins);
  await LoginTestUtils.reloadData();

  const rustStorage = new LoginManagerRustStorage();

  const start = Date.now();
  // using the migrationNeeded pref change as an indicator that the migration did run
  const prefChangePromise = TestUtils.waitForPrefChange(
    "signon.rustMirror.migrationNeeded"
  );
  await SpecialPowers.pushPrefEnv({
    set: [["signon.rustMirror.enabled", true]],
  });
  await prefChangePromise;

  const duration = Date.now() - start;
  Assert.less(duration, 2000, "Migration should complete under 2s");
  Assert.equal(rustStorage.countLogins("", "", ""), numberOfLogins);

  LoginTestUtils.clearData();
  rustStorage.removeAllLogins();
});
