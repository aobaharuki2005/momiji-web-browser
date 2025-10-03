/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

let TEST_PROFILE_PATH;

add_setup(async () => {
  MockFilePicker.init(window.browsingContext);
  TEST_PROFILE_PATH = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "testBackup"
  );

  await SpecialPowers.pushPrefEnv({
    set: [["browser.backup.location", TEST_PROFILE_PATH]],
  });

  // It's possible for other tests to change the internal state of the BackupService
  // which can lead to complications with the auto detection behaviour. Let's just reset
  // these states before testing
  let bs = BackupService.get();
  bs.resetLastBackupInternalState();

  registerCleanupFunction(async () => {
    MockFilePicker.cleanup();
  });
});

/**
 * Tests that the a backup file can be restored from the settings page.
 */
add_task(async function test_restore_from_backup() {
  await BrowserTestUtils.withNewTab("about:preferences#sync", async browser => {
    let sandbox = sinon.createSandbox();
    let recoverFromBackupArchiveStub = sandbox
      .stub(BackupService.prototype, "recoverFromBackupArchive")
      .resolves();

    const mockBackupFilePath = await IOUtils.createUniqueFile(
      TEST_PROFILE_PATH,
      "backup.html"
    );

    const mockBackupFile = Cc["@mozilla.org/file/local;1"].createInstance(
      Ci.nsIFile
    );
    mockBackupFile.initWithPath(mockBackupFilePath);

    let filePickerShownPromise = new Promise(resolve => {
      MockFilePicker.showCallback = async () => {
        Assert.ok(true, "Filepicker shown");
        MockFilePicker.setFiles([mockBackupFile]);
        resolve();
      };
    });
    MockFilePicker.returnValue = MockFilePicker.returnOK;

    let settings = browser.contentDocument.querySelector("backup-settings");

    await settings.updateComplete;

    Assert.ok(
      settings.restoreFromBackupButtonEl,
      "Button to restore backups should be found"
    );

    settings.restoreFromBackupButtonEl.click();

    await settings.updateComplete;

    let restoreFromBackup = settings.restoreFromBackupEl;

    Assert.ok(restoreFromBackup, "restore-from-backup should be found");

    let infoPromise = BrowserTestUtils.waitForEvent(
      window,
      "BackupUI:GetBackupFileInfo"
    );

    restoreFromBackup.chooseButtonEl.click();

    await filePickerShownPromise;
    restoreFromBackup.backupServiceState = {
      ...restoreFromBackup.backupServiceState,
      backupFileToRestore: mockBackupFilePath,
    };
    await restoreFromBackup.updateComplete;

    // Dispatch the event that would normally be sent by BackupUIChild
    // after a file is selected
    restoreFromBackup.dispatchEvent(
      new CustomEvent("BackupUI:SelectNewFilepickerPath", {
        bubbles: true,
        composed: true,
        detail: {
          path: mockBackupFilePath,
          filename: mockBackupFile.leafName,
          iconURL: "",
        },
      })
    );

    await infoPromise;
    // Set mock file info
    restoreFromBackup.backupServiceState = {
      ...restoreFromBackup.backupServiceState,
      backupFileInfo: {
        date: new Date(),
        isEncrypted: true,
      },
    };
    await restoreFromBackup.updateComplete;

    // Set password for file
    restoreFromBackup.passwordInput.value = "h-*@Vfge3_hGxdpwqr@w";

    let restorePromise = BrowserTestUtils.waitForEvent(
      window,
      "BackupUI:RestoreFromBackupFile"
    );

    Assert.ok(
      restoreFromBackup.confirmButtonEl,
      "Confirm button should be found"
    );
    Assert.ok(
      !restoreFromBackup.confirmButtonEl.disabled,
      "Confirm button should not be disabled"
    );

    await restoreFromBackup.updateComplete;
    restoreFromBackup.confirmButtonEl.click();

    await restorePromise.then(e => {
      let mockEvent = {
        backupFile: mockBackupFile.path,
        backupPassword: "h-*@Vfge3_hGxdpwqr@w",
      };
      Assert.deepEqual(
        e.detail,
        mockEvent,
        "Event should contain the file and password"
      );
    });

    Assert.ok(
      recoverFromBackupArchiveStub.calledOnce,
      "BackupService was called to start a recovery from a backup archive."
    );

    sandbox.restore();
  });
});

/**
 * Tests that the dialog stays open while restoring from the settings page.
 */
add_task(async function test_restore_in_progress() {
  await BrowserTestUtils.withNewTab("about:preferences#sync", async browser => {
    let sandbox = sinon.createSandbox();
    let bs = BackupService.get();

    let { promise: recoverPromise, resolve: recoverResolve } =
      Promise.withResolvers();
    let recoverFromBackupArchiveStub = sandbox
      .stub(bs, "recoverFromBackupArchive")
      .returns(recoverPromise);

    let settings = browser.contentDocument.querySelector("backup-settings");

    await settings.updateComplete;

    Assert.ok(
      settings.restoreFromBackupButtonEl,
      "Button to restore backups should be found"
    );

    settings.restoreFromBackupButtonEl.click();

    await settings.updateComplete;

    let restoreFromBackup = settings.restoreFromBackupEl;

    Assert.ok(restoreFromBackup, "restore-from-backup should be found");

    Assert.equal(
      restoreFromBackup.filePicker.value,
      "",
      "File picker has no value assigned automatically"
    );

    // There is a backup file, but it is not a valid one
    // we don't automatically pick it
    Assert.ok(
      restoreFromBackup.confirmButtonEl.disabled,
      "Confirm button should be disabled."
    );

    const mockBackupFilePath = await IOUtils.createUniqueFile(
      PathUtils.tempDir,
      "backup.html"
    );

    restoreFromBackup.backupServiceState = {
      ...restoreFromBackup.backupServiceState,
      backupFileToRestore: mockBackupFilePath,
    };
    await restoreFromBackup.updateComplete;

    Assert.ok(
      !restoreFromBackup.confirmButtonEl.disabled,
      "Confirm button should not be disabled."
    );
    Assert.equal(
      restoreFromBackup.confirmButtonEl.getAttribute("data-l10n-id"),
      "restore-from-backup-confirm-button",
      "Confirm button should show confirm message."
    );

    let restorePromise = BrowserTestUtils.waitForEvent(
      window,
      "BackupUI:RestoreFromBackupFile"
    );

    restoreFromBackup.confirmButtonEl.click();
    restoreFromBackup.backupServiceState = {
      ...restoreFromBackup.backupServiceState,
      recoveryInProgress: true,
    };
    // Re-render since we've manually changed the component's state
    await restoreFromBackup.requestUpdate();

    await restorePromise;

    await settings.updateComplete;

    Assert.ok(
      settings.restoreFromBackupDialogEl.open,
      "Restore dialog should still be open."
    );

    Assert.ok(
      restoreFromBackup.confirmButtonEl.disabled,
      "Confirm button should be disabled."
    );

    Assert.equal(
      restoreFromBackup.confirmButtonEl.getAttribute("data-l10n-id"),
      "restore-from-backup-restoring-button",
      "Confirm button should show restoring message."
    );

    Assert.ok(
      recoverFromBackupArchiveStub.calledOnce,
      "BackupService was called to start a recovery from a backup archive."
    );

    // Now cause recovery to resolve.
    recoverResolve();
    // Wait a tick of the event loop to let the BackupUIParent respond to
    // the promise resolution, and to send its message to the BackupUIChild.
    await new Promise(resolve => SimpleTest.executeSoon(resolve));
    // Wait a second tick to let the BackupUIChild respond to the message
    // from BackupUIParent.
    await new Promise(resolve => SimpleTest.executeSoon(resolve));

    await settings.updateComplete;

    Assert.ok(
      !settings.restoreFromBackupDialogEl.open,
      "Restore dialog should now be closed."
    );

    sandbox.restore();
  });
});
