/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const execProcess = sinon.fake();

add_setup(async () => {
  await initSelectableProfileService();

  sinon.replace(getSelectableProfileService(), "execProcess", execProcess);
});

add_task(async function test_create_profile() {
  startProfileService();

  const SelectableProfileService = getSelectableProfileService();
  const ProfilesDatastoreService = getProfilesDatastoreService();

  await ProfilesDatastoreService.init();
  await SelectableProfileService.init();
  Assert.ok(SelectableProfileService.isEnabled, "Service should be enabled");

  let profiles = await SelectableProfileService.getAllProfiles();

  Assert.equal(profiles.length, 1, "Only one selectable profile exist");

  let copiedProfile =
    await SelectableProfileService.currentProfile.copyProfile();

  profiles = await SelectableProfileService.getAllProfiles();
  Assert.equal(profiles.length, 2, "Two selectable profiles exist");

  Assert.equal(
    copiedProfile.avatar,
    SelectableProfileService.currentProfile.avatar,
    "Copied profile has the same avatar"
  );

  Assert.equal(
    copiedProfile.theme.themeId,
    SelectableProfileService.currentProfile.theme.themeId,
    "Copied profile has the same theme"
  );
});
