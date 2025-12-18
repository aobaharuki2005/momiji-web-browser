/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

requestLongerTimeout(2);

add_task(async function test_download_languages_basic_flow() {
  const { cleanup, remoteClients, translationsSettingsTestUtils } =
    await setupAboutPreferences(LANGUAGE_PAIRS, {
      prefs: [["browser.settings-redesign.enabled", true]],
    });

  const document = gBrowser.selectedBrowser.contentDocument;

  info("Waiting for translationsManageButton");
  const manageButton = await waitForCondition(
    () => document.getElementById("translationsManageButton"),
    "Waiting for translationsManageButton"
  );

  manageButton.scrollIntoView({ behavior: "instant", block: "center" });

  info("Opening translations subpage");
  await translationsSettingsTestUtils.assertEvents(
    {
      expected: [[TranslationsSettingsTestUtils.Events.Initialized]],
    },
    async () => {
      click(manageButton, "Open translations subpage");
    }
  );

  const downloadSelect =
    translationsSettingsTestUtils.getDownloadedLanguagesSelect();
  const downloadButton = translationsSettingsTestUtils.getDownloadButton();

  ok(downloadSelect, "Download languages select should exist");
  ok(downloadButton, "Download languages button should exist");

  await translationsSettingsTestUtils.assertDownloadedLanguagesEmptyState({
    visible: true,
  });
  ok(
    downloadButton.disabled,
    "Download button disabled before selecting a language"
  );

  const frenchOption = downloadSelect.querySelector('moz-option[value="fr"]');
  ok(frenchOption, "French option should be available");
  ok(!frenchOption.disabled, "French option should start enabled");

  info("Select French to enable download button");
  await translationsSettingsTestUtils.assertEvents(
    {
      expected: [[TranslationsSettingsTestUtils.Events.DownloadButtonEnabled]],
    },
    async () => {
      await translationsSettingsTestUtils.selectDownloadLanguage("fr");
    }
  );
  ok(!downloadButton.disabled, "Download button enabled after selecting");

  const expectedModelDownloads = languageModelNames([
    { fromLang: "fr", toLang: "en" },
    { fromLang: "en", toLang: "fr" },
  ]);

  info("Download French language models");
  const downloadEvents = [
    translationsSettingsTestUtils.waitForEvent(
      TranslationsSettingsTestUtils.Events.DownloadButtonDisabled
    ),
    translationsSettingsTestUtils.waitForEvent(
      TranslationsSettingsTestUtils.Events.DownloadStarted,
      { expectedDetail: { langTag: "fr" } }
    ),
    translationsSettingsTestUtils.waitForEvent(
      TranslationsSettingsTestUtils.Events.DownloadedLanguagesRendered,
      { expectedDetail: { languages: ["fr"], count: 1, downloading: ["fr"] } }
    ),
    translationsSettingsTestUtils.waitForEvent(
      TranslationsSettingsTestUtils.Events
        .DownloadedLanguagesSelectOptionsUpdated
    ),
    translationsSettingsTestUtils.waitForEvent(
      TranslationsSettingsTestUtils.Events.DownloadCompleted,
      { expectedDetail: { langTag: "fr" } }
    ),
    translationsSettingsTestUtils.waitForEvent(
      TranslationsSettingsTestUtils.Events.DownloadedLanguagesRendered,
      { expectedDetail: { languages: ["fr"], count: 1, downloading: [] } }
    ),
    translationsSettingsTestUtils.waitForEvent(
      TranslationsSettingsTestUtils.Events
        .DownloadedLanguagesSelectOptionsUpdated
    ),
  ];

  await click(downloadButton, "Start French download");
  Assert.deepEqual(
    await remoteClients.translationModels.resolvePendingDownloads(
      expectedModelDownloads.length
    ),
    expectedModelDownloads,
    "French models were downloaded."
  );
  await Promise.all(downloadEvents);

  await translationsSettingsTestUtils.assertDownloadedLanguages({
    languages: ["fr"],
    downloading: [],
    count: 1,
  });
  ok(frenchOption.disabled, "French option disabled after download");

  info("Open delete confirmation then cancel");
  await translationsSettingsTestUtils.openDownloadDeleteConfirmation("fr");
  const warningButton =
    translationsSettingsTestUtils.getDownloadWarningButton("fr");
  ok(warningButton, "Warning icon should be shown during delete confirmation");
  ok(
    warningButton.getAttribute("iconsrc")?.includes("warning"),
    "Warning icon should use warning asset"
  );
  const cancelRender = translationsSettingsTestUtils.waitForEvent(
    TranslationsSettingsTestUtils.Events.DownloadedLanguagesRendered,
    { expectedDetail: { languages: ["fr"], count: 1, downloading: [] } }
  );
  await translationsSettingsTestUtils.cancelDownloadDelete("fr");
  await cancelRender;

  await translationsSettingsTestUtils.assertDownloadedLanguages({
    languages: ["fr"],
    downloading: [],
    count: 1,
  });
  const deleteIcon =
    translationsSettingsTestUtils.getDownloadRemoveButton("fr");
  ok(deleteIcon, "Delete icon should return after cancel");
  ok(
    deleteIcon.getAttribute("iconsrc")?.includes("delete"),
    "Delete icon should use delete asset"
  );

  info("Confirm deletion after second attempt");
  const deleted = translationsSettingsTestUtils.waitForEvent(
    TranslationsSettingsTestUtils.Events.DownloadDeleted,
    { expectedDetail: { langTag: "fr" } }
  );
  const renderAfterDelete = translationsSettingsTestUtils.waitForEvent(
    TranslationsSettingsTestUtils.Events.DownloadedLanguagesRendered,
    { expectedDetail: { languages: [], count: 0, downloading: [] } }
  );
  const optionsAfterDelete = translationsSettingsTestUtils.waitForEvent(
    TranslationsSettingsTestUtils.Events.DownloadedLanguagesSelectOptionsUpdated
  );

  await translationsSettingsTestUtils.openDownloadDeleteConfirmation("fr");
  await translationsSettingsTestUtils.confirmDownloadDelete("fr");
  await Promise.all([deleted, renderAfterDelete, optionsAfterDelete]);

  await translationsSettingsTestUtils.assertDownloadedLanguagesEmptyState({
    visible: true,
  });
  ok(!frenchOption.disabled, "French option re-enabled after removal");

  await cleanup();
});
