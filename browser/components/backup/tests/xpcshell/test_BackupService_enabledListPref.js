/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from ../../../../../toolkit/profile/test/xpcshell/head.js */

/* import-globals-from ../../../profiles/tests/unit/head.js */

const ENABLED_ON_PROFILES_PREF = "browser.backup.enabled_on.profiles";

add_setup(async function () {
  await initSelectableProfileService();

  registerCleanupFunction(() => {
    Services.prefs.clearUserPref(ENABLED_ON_PROFILES_PREF);
  });
});

add_task(async function test_addToEnabledListPref() {
  Services.prefs.clearUserPref(ENABLED_ON_PROFILES_PREF);

  BackupService.addToEnabledListPref("profile-1");
  let value = JSON.parse(
    Services.prefs.getStringPref(ENABLED_ON_PROFILES_PREF, "[]")
  );
  Assert.ok(value.includes("profile-1"), "profile-1 should be in the pref");

  BackupService.addToEnabledListPref("profile-2");
  value = JSON.parse(
    Services.prefs.getStringPref(ENABLED_ON_PROFILES_PREF, "[]")
  );
  Assert.ok(value.includes("profile-1"), "profile-1 should still be present");
  Assert.ok(value.includes("profile-2"), "profile-2 should also be present");

  Services.prefs.clearUserPref(ENABLED_ON_PROFILES_PREF);
});

add_task(async function test_removeFromEnabledListPref() {
  Services.prefs.clearUserPref(ENABLED_ON_PROFILES_PREF);

  BackupService.addToEnabledListPref("profile-1");
  BackupService.addToEnabledListPref("profile-2");

  BackupService.removeFromEnabledListPref("profile-1");
  let value = JSON.parse(
    Services.prefs.getStringPref(ENABLED_ON_PROFILES_PREF, "[]")
  );
  Assert.ok(!value.includes("profile-1"), "profile-1 should have been removed");
  Assert.ok(value.includes("profile-2"), "profile-2 should still be present");

  BackupService.removeFromEnabledListPref("profile-2");
  value = JSON.parse(
    Services.prefs.getStringPref(ENABLED_ON_PROFILES_PREF, "[]")
  );
  Assert.deepEqual(value, [], "Pref should be an empty array");

  Services.prefs.clearUserPref(ENABLED_ON_PROFILES_PREF);
});

add_task(async function test_no_op_without_selectable_profiles() {
  Services.prefs.clearUserPref(ENABLED_ON_PROFILES_PREF);

  const SelectableProfileService = getSelectableProfileService();

  let sandbox = sinon.createSandbox();
  sandbox.stub(SelectableProfileService, "currentProfile").get(() => null);

  BackupService.addToEnabledListPref("profile-1");
  let value = Services.prefs.getStringPref(ENABLED_ON_PROFILES_PREF, "[]");
  Assert.equal(value, "[]", "Pref should be unchanged when no current profile");

  Services.prefs.setStringPref(
    ENABLED_ON_PROFILES_PREF,
    JSON.stringify(["profile-1"])
  );
  BackupService.removeFromEnabledListPref("profile-1");
  value = JSON.parse(
    Services.prefs.getStringPref(ENABLED_ON_PROFILES_PREF, "[]")
  );
  Assert.ok(
    value.includes("profile-1"),
    "profile-1 should still be present after no-op remove"
  );

  sandbox.restore();
  Services.prefs.clearUserPref(ENABLED_ON_PROFILES_PREF);
});

add_task(async function test_addToEnabledListPref_migrates_object() {
  Services.prefs.setStringPref(
    ENABLED_ON_PROFILES_PREF,
    JSON.stringify({ "profile-1": true })
  );

  BackupService.addToEnabledListPref("profile-2");
  let value = JSON.parse(
    Services.prefs.getStringPref(ENABLED_ON_PROFILES_PREF, "[]")
  );
  Assert.ok(Array.isArray(value), "Pref should be an array after add");
  Assert.ok(value.includes("profile-1"), "profile-1 should be migrated");
  Assert.ok(value.includes("profile-2"), "profile-2 should be added");

  Services.prefs.clearUserPref(ENABLED_ON_PROFILES_PREF);
});

add_task(async function test_removeFromEnabledListPref_migrates_object() {
  Services.prefs.setStringPref(
    ENABLED_ON_PROFILES_PREF,
    JSON.stringify({ "profile-1": true, "profile-2": true })
  );

  await BackupService.removeFromEnabledListPref("profile-1");
  let value = JSON.parse(
    Services.prefs.getStringPref(ENABLED_ON_PROFILES_PREF, "[]")
  );
  Assert.ok(Array.isArray(value), "Pref should be an array after remove");
  Assert.ok(!value.includes("profile-1"), "profile-1 should be removed");
  Assert.ok(value.includes("profile-2"), "profile-2 should remain");

  Services.prefs.clearUserPref(ENABLED_ON_PROFILES_PREF);
});

add_task(async function test_enabledListPref_shared_across_profiles() {
  Services.prefs.clearUserPref(ENABLED_ON_PROFILES_PREF);

  const SelectableProfileService = getSelectableProfileService();
  let currentProfile = SelectableProfileService.currentProfile;

  BackupService.addToEnabledListPref(currentProfile.id);
  await updateNotified();

  let dbValue = await SelectableProfileService.getDBPref(
    ENABLED_ON_PROFILES_PREF
  );
  let dbParsed = JSON.parse(dbValue);
  Assert.ok(
    dbParsed.includes(currentProfile.id),
    "DB should contain the current profile ID"
  );

  await SelectableProfileService.uninit();

  let db = await openDatabase();
  let simulatedValue = JSON.parse(dbValue);
  simulatedValue.push("other-profile-id");
  await db.execute("UPDATE SharedPrefs SET value=:value WHERE name=:name;", {
    value: JSON.stringify(simulatedValue),
    name: ENABLED_ON_PROFILES_PREF,
  });
  await db.close();

  await SelectableProfileService.init();

  let localValue = JSON.parse(
    Services.prefs.getStringPref(ENABLED_ON_PROFILES_PREF, "[]")
  );
  Assert.ok(
    localValue.includes(currentProfile.id),
    "Local pref should still contain the original profile ID"
  );
  Assert.ok(
    localValue.includes("other-profile-id"),
    "Local pref should now also contain the simulated other profile ID"
  );

  Services.prefs.clearUserPref(ENABLED_ON_PROFILES_PREF);
});
