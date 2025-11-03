/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { ExperimentAPI } = ChromeUtils.importESModule(
  "resource://nimbus/ExperimentAPI.sys.mjs"
);
const { NimbusTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/NimbusTestUtils.sys.mjs"
);

const BACKUP_DIR_PREF_NAME = "browser.backup.location";

add_setup(async () => {
  setupProfile();

  NimbusTestUtils.init(this);

  const { cleanup: nimbusCleanup } = await NimbusTestUtils.setupTest();

  await ExperimentAPI.ready();

  let backupDir = await IOUtils.createUniqueDirectory(
    PathUtils.profileDir,
    "backup"
  );

  // Use temporary directory for backups.
  Services.prefs.setStringPref(BACKUP_DIR_PREF_NAME, backupDir);

  registerCleanupFunction(async () => {
    const nimbusCleanupPromise = nimbusCleanup();
    const backupDirCleanupPromise = IOUtils.remove(backupDir, {
      recursive: true,
    });

    await Promise.all([nimbusCleanupPromise, backupDirCleanupPromise]);

    Services.prefs.clearUserPref(BACKUP_DIR_PREF_NAME);
  });

  BackupService.init();
});

add_task(async function test_archive_killswitch_enrollment() {
  let cleanupExperiment;
  await archiveTemplate({
    internalReason: "nimbus",
    async disable() {
      cleanupExperiment = await NimbusTestUtils.enrollWithFeatureConfig({
        featureId: "backupService",
        value: { archiveKillswitch: true },
      });
    },
    async enable() {
      await cleanupExperiment();
    },
  });
});

add_task(async function test_restore_killswitch_enrollment() {
  let cleanupExperiment;
  await restoreTemplate({
    async disable() {
      cleanupExperiment = await NimbusTestUtils.enrollWithFeatureConfig({
        featureId: "backupService",
        value: { restoreKillswitch: true },
      });
    },
    async enable() {
      await cleanupExperiment();
    },
  });
});

async function archiveTemplate({ internalReason, disable, enable }) {
  const bs = BackupService.get();

  await disable();

  Assert.ok(
    !bs.archiveEnabledStatus.enabled,
    "The backup service should report that archiving is now disabled."
  );

  Assert.equal(
    bs.archiveEnabledStatus.internalReason,
    internalReason,
    "`archiveEnabledStatus` should report that it is disabled."
  );

  Services.fog.testResetFOG();
  let backup = await bs.createBackup();
  Assert.ok(
    !backup,
    "Creating a backup should fail when archiving is disabled."
  );
  let telemetry = Glean.browserBackup.backupDisabledReason.testGetValue();
  Assert.equal(
    telemetry,
    internalReason,
    `Telemetry identifies the backup is disabled by ${internalReason}.`
  );

  await enable();

  Assert.ok(
    bs.archiveEnabledStatus.enabled,
    "The backup service should report that archiving is enabled once the archive killswitch experiment ends."
  );

  backup = await bs.createBackup();
  ok(
    backup,
    "Creating a backup should succeed once the archive killswitch experiment ends."
  );
  ok(
    await IOUtils.exists(backup.archivePath),
    "Archive file should exist on disk."
  );

  telemetry = Glean.browserBackup.backupDisabledReason.testGetValue();
  Assert.equal(
    telemetry,
    "reenabled",
    "Telemetry identifies the backup was re-enabled."
  );

  await IOUtils.remove(backup.archivePath);
}

async function restoreTemplate({ disable, enable }) {
  const bs = BackupService.get();
  const backup = await bs.createBackup();

  Assert.ok(
    backup && backup.archivePath,
    "Archive should have been created on disk."
  );

  await disable();

  const recoveryDir = await IOUtils.createUniqueDirectory(
    PathUtils.profileDir,
    "recovered-profiles"
  );

  Assert.ok(
    !bs.restoreEnabledStatus.enabled,
    "The backup service should report that restoring is now disabled."
  );

  await Assert.rejects(
    bs.recoverFromBackupArchive(
      backup.archivePath,
      null,
      false,
      PathUtils.profileDir,
      recoveryDir
    ),
    /.*disabled.*/,
    "Recovery should throw when the restore is disabled."
  );

  await enable();

  Assert.ok(
    bs.restoreEnabledStatus.enabled,
    "The backup service should now report that restoring is enabled."
  );

  let recoveredProfile = await bs.recoverFromBackupArchive(
    backup.archivePath,
    null,
    false,
    PathUtils.profileDir,
    recoveryDir
  );
  Assert.ok(
    recoveredProfile,
    "Recovery should succeed once restore is re-enabled."
  );
  Assert.ok(
    await IOUtils.exists(recoveredProfile.rootDir.path),
    "Recovered profile directory should exist on disk."
  );
}
