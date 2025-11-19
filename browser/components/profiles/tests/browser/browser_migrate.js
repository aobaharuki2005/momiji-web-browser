/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

add_setup(() => {
  registerCleanupFunction(() => {
    sinon.restore();
  });
});

add_task(async () => {
  Assert.ok(
    !SelectableProfileService.currentProfile,
    "Should not have a profile yet"
  );

  await BrowserTestUtils.withNewTab("about:profiles", async browser => {
    // Override the service that about:profiles uses with our mock service.
    browser.contentWindow.ProfileService = gProfileService;

    // This profile will appear to be in use because it is locked.
    let newProfile = new MockProfile(gProfileService);
    newProfile.name = "ProfileInUse";
    newProfile.lock();
    gProfileService.profiles.push(newProfile);

    // This profile is already in a group and so cannot be migrated.
    newProfile = new MockProfile(gProfileService);
    newProfile.name = "ProfileInGroup";
    newProfile.storeID = "sdkjsdhf";
    gProfileService.profiles.push(newProfile);

    // This profile can be migrated.
    newProfile = new MockProfile(gProfileService);
    newProfile.name = "ProfileToMigrate";
    newProfile.rootDir = newProfile.rootDir.clone();
    newProfile.rootDir.append("tomigrate");
    // test-verify runs this test multiple times so the directory may already exist.
    if (!newProfile.rootDir.exists()) {
      newProfile.rootDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o700);
    }
    newProfile.localDir = newProfile.rootDir;
    gProfileService.profiles.push(newProfile);
    gProfileService.defaultProfile = newProfile;

    browser.contentWindow.rebuildProfileList();
    await browser.contentWindow.document.l10n.translateRoots();

    let migrateButtons = browser.contentWindow.document.querySelectorAll(
      "button[data-l10n-id='profiles-migrate-button']"
    );
    Assert.equal(
      migrateButtons.length,
      1,
      "There should be one migrate button"
    );
    Assert.equal(
      migrateButtons[0].parentNode.firstChild.textContent,
      "Profile: ProfileToMigrate",
      "The migrate button should be for the correct profile"
    );

    let promptPromise = BrowserTestUtils.promiseAlertDialogOpen(
      "cancel",
      "chrome://mozapps/content/profile/profileMigrate.xhtml",
      { isSubDialog: true }
    );
    migrateButtons[0].click();
    await promptPromise;

    Assert.ok(
      gProfileService.profiles.includes(newProfile),
      "Profile not removed"
    );

    let { promise, resolve } = Promise.withResolvers();
    let execProcess = sinon.fake(resolve);
    sinon.replace(SelectableProfileService, "execProcess", execProcess);
    sinon.replace(
      SelectableProfileService,
      "sendCommandLine",
      sinon.fake.throws(Cr.NS_ERROR_NOT_AVAILABLE)
    );

    promptPromise = BrowserTestUtils.promiseAlertDialogOpen(
      "accept",
      "chrome://mozapps/content/profile/profileMigrate.xhtml",
      { isSubDialog: true }
    );
    migrateButtons[0].click();
    await promptPromise;
    let processArgs = await promise;
    await browser.contentWindow.document.l10n.translateRoots();

    sinon.restore();

    Assert.ok(
      !gProfileService.profiles.includes(newProfile),
      "Profile was removed from the original profile service"
    );
    Assert.ok(
      gProfileService.profiles.includes(gProfileService.defaultProfile),
      "Default profile updated"
    );

    migrateButtons = browser.contentWindow.document.querySelectorAll(
      "button[data-l10n-id='profiles-migrate']"
    );
    Assert.equal(migrateButtons.length, 0, "There should be no migrate button");

    let expectedArgs = [
      "--profile",
      newProfile.rootDir.path,
      "-new-tab",
      "about:editprofile",
    ];

    if (AppConstants.platform == "macosx") {
      expectedArgs.unshift("-foreground");
    }

    Assert.deepEqual(
      processArgs,
      expectedArgs,
      "Attempted to launch the migrated profile with the correct arguments"
    );

    let currentProfile = SelectableProfileService.currentProfile;
    Assert.ok(currentProfile, "There should be a current profile now");

    let profiles = await SelectableProfileService.getAllProfiles();
    Assert.equal(profiles.length, 2, "There should be two profiles");
    profiles = profiles.filter(p => p.id != currentProfile.id);
    Assert.equal(profiles.length, 1, "The current profile was in the list");

    Assert.equal(
      profiles[0].name,
      "ProfileToMigrate",
      "Profile has correct name"
    );

    Assert.equal(
      profiles[0].path,
      newProfile.rootDir.path,
      "Profile has correct path"
    );

    let prefsFile = PathUtils.join(profiles[0].path, "prefs.js");
    let prefs = (await IOUtils.readUTF8(prefsFile)).split(/\r?\n/);
    Assert.ok(
      prefs.includes(
        `user_pref("toolkit.profiles.storeID", "${SelectableProfileService.storeID}");`
      ),
      "Profile contain the assigned store ID"
    );
  });
});
