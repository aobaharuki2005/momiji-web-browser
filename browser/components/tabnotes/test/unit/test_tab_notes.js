/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_setup(async () => {
  await TabNotes.init({ basePath: PathUtils.tempDir });
});

registerCleanupFunction(async () => {
  await TabNotes.reset();
  await TabNotes.deinit();
  IOUtils.remove(
    PathUtils.join(PathUtils.tempDir, TabNotes.DATABASE_FILE_NAME),
    {
      ignoreAbsent: true,
    }
  );
});

add_task(async function tabNotesBasicStorageTests() {
  let url = "https://example.com/abc";
  let value = "some note";
  let updatedValue = "some other note";

  let tabNoteCreated = observeTabNoteCreated(url);
  let firstSavedNote = await TabNotes.set(url, value);
  Assert.ok(firstSavedNote, "TabNotes.set returns the saved tab note");
  Assert.ok(await tabNoteCreated, "observers were notified of TabNote:Created");
  Assert.equal(
    firstSavedNote.canonicalUrl,
    url,
    "TabNotes.set stores the right URL"
  );
  Assert.equal(
    firstSavedNote.text,
    value,
    "TabNotes.set stores the right note text"
  );
  Assert.ok(firstSavedNote.created, "TabNotes.set stores a creation timestamp");

  Assert.equal(
    await TabNotes.has(url),
    true,
    "TabNotes.has indicates that URL has a note"
  );

  Assert.deepEqual(
    await TabNotes.get(url),
    firstSavedNote,
    "TabNotes.get returns previously set note"
  );

  let tabNoteEdited = observeTabNoteEdited(url);
  let editedSavedNote = await TabNotes.set(url, updatedValue);

  Assert.ok(editedSavedNote, "TabNotes.set returns the updated tab note");
  Assert.ok(await tabNoteEdited, "observers were notified of TabNote:Edited");
  Assert.equal(
    editedSavedNote.canonicalUrl,
    url,
    "TabNotes.set should keep the same URL when updating"
  );
  Assert.equal(
    editedSavedNote.text,
    updatedValue,
    "TabNotes.set saved the new note text"
  );
  Assert.equal(
    Temporal.Instant.compare(editedSavedNote.created, firstSavedNote.created),
    0,
    "TabNotes.set should not change the creation timestamp when updating an existing note"
  );

  let wasDeleted = await TabNotes.delete("URL that does not have a tab note");
  Assert.ok(
    !wasDeleted,
    "TabNotes.delete should return false if nothing was deleted"
  );

  let tabNoteRemoved = observeTabNoteRemoved(url);
  wasDeleted = await TabNotes.delete(url);
  Assert.ok(await tabNoteRemoved, "observers were notified of TabNote:Removed");
  Assert.ok(
    wasDeleted,
    "TabNotes.delete should return true if something was deleted"
  );

  Assert.equal(
    await TabNotes.has(url),
    false,
    "TabNotes.has indicates that the deleted URL no longer has a note"
  );

  Assert.equal(
    await TabNotes.get(url),
    undefined,
    "TabNotes.get returns undefined for URL that does not have a note"
  );

  await TabNotes.reset();
});

add_task(async function tabNotesSanitizationTests() {
  let url = "https://example.com/";
  let tooLongValue = "x".repeat(1500);
  let correctValue = "x".repeat(1000);

  await TabNotes.set(url, tooLongValue);
  let result = await TabNotes.get(url);

  Assert.equal(result.text, correctValue, "TabNotes.set truncates note length");

  await TabNotes.reset();
});

add_task(async function tabNotesErrors() {
  await Assert.rejects(
    TabNotes.set("not a valid URL", "valid note text"),
    /RangeError/,
    "invalid URLs should not be allowed in TabNotes.set"
  );

  await Assert.rejects(
    TabNotes.set("https://example.com", ""),
    /RangeError/,
    "empty note text should not be allowed in TabNotes.set"
  );
});
