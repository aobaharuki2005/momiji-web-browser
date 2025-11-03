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
const BACKUP_ARCHIVE_ENABLED_PREF_NAME = "browser.backup.archive.enabled";
const BACKUP_RESTORE_ENABLED_PREF_NAME = "browser.backup.restore.enabled";
const SANITIZE_ON_SHUTDOWN_PREF_NAME = "privacy.sanitize.sanitizeOnShutdown";
const SELECTABLE_PROFILES_CREATED_PREF_NAME = "browser.profiles.created";

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

add_task(async function test_archive_enabled_pref() {
  await archiveTemplate({
    internalReason: "pref",
    async disable() {
      Services.prefs.setBoolPref(BACKUP_ARCHIVE_ENABLED_PREF_NAME, false);
    },
    async enable() {
      Services.prefs.setBoolPref(BACKUP_ARCHIVE_ENABLED_PREF_NAME, true);
    },
  });
});

add_task(async function test_archive_sanitize_on_shutdown() {
  await archiveTemplate({
    internalReason: "sanitizeOnShutdown",
    async disable() {
      Services.prefs.setBoolPref(SANITIZE_ON_SHUTDOWN_PREF_NAME, true);
    },
    async enable() {
      Services.prefs.setBoolPref(SANITIZE_ON_SHUTDOWN_PREF_NAME, false);
    },
  });
});

add_task(async function test_archive_selectable_profiles() {
  await archiveTemplate({
    internalReason: "selectable profiles",
    async disable() {
      Services.prefs.setBoolPref(SELECTABLE_PROFILES_CREATED_PREF_NAME, true);
    },
    async enable() {
      Services.prefs.setBoolPref(SELECTABLE_PROFILES_CREATED_PREF_NAME, false);
    },
  });
});

add_task(async function test_restore_killswitch_enrollment() {
  let cleanupExperiment;
  await restoreTemplate({
    internalReason: "nimbus",
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

add_task(async function test_restore_enabled_pref() {
  await restoreTemplate({
    internalReason: "pref",
    async disable() {
      Services.prefs.setBoolPref(BACKUP_RESTORE_ENABLED_PREF_NAME, false);
    },
    async enable() {
      Services.prefs.setBoolPref(BACKUP_RESTORE_ENABLED_PREF_NAME, true);
    },
  });
});

add_task(async function test_restore_sanitize_on_shutdown() {
  await restoreTemplate({
    internalReason: "sanitizeOnShutdown",
    async disable() {
      Services.prefs.setBoolPref(SANITIZE_ON_SHUTDOWN_PREF_NAME, true);
    },
    async enable() {
      Services.prefs.setBoolPref(SANITIZE_ON_SHUTDOWN_PREF_NAME, false);
    },
  });
});

add_task(async function test_restore_selectable_profiles() {
  await restoreTemplate({
    internalReason: "selectable profiles",
    async disable() {
      Services.prefs.setBoolPref(SELECTABLE_PROFILES_CREATED_PREF_NAME, true);
    },
    async enable() {
      Services.prefs.setBoolPref(SELECTABLE_PROFILES_CREATED_PREF_NAME, false);
    },
  });
});

async function archiveTemplate({ internalReason, disable, enable }) {
  const bs = BackupService.get();

  let calledCount = 0;
  let callback = () => calledCount++;
  Services.obs.addObserver(callback, "backup-service-status-updated");

  await disable();
  Assert.equal(calledCount, 1, "Observers were notified on disable");

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
  Assert.equal(calledCount, 2, "Observers were notified on re-enable");

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
  Services.obs.removeObserver(callback, "backup-service-status-updated");
}

async function restoreTemplate({ internalReason, disable, enable }) {
  const bs = BackupService.get();
  const backup = await bs.createBackup();

  Assert.ok(
    backup && backup.archivePath,
    "Archive should have been created on disk."
  );

  let calledCount = 0;
  let callback = () => calledCount++;
  Services.obs.addObserver(callback, "backup-service-status-updated");

  await disable();
  Assert.equal(calledCount, 1, "Observers were notified on disable");

  const recoveryDir = await IOUtils.createUniqueDirectory(
    PathUtils.profileDir,
    "recovered-profiles"
  );

  Assert.ok(
    !bs.restoreEnabledStatus.enabled,
    "The backup service should report that restoring is now disabled."
  );
  Assert.equal(
    bs.restoreEnabledStatus.internalReason,
    internalReason,
    "`archiveEnabledStatus` should report that it is disabled."
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
  Assert.equal(calledCount, 2, "Observers were notified on re-enable");

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

  Services.obs.removeObserver(callback, "backup-service-status-updated");
}
