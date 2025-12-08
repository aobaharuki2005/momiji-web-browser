/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** @import { OpenedConnection } from "resource://gre/modules/Sqlite.sys.mjs" */

import { Sqlite } from "resource://gre/modules/Sqlite.sys.mjs";

/**
 * @param {string} url
 *   The canonical URL of a tab note to look up
 */
const GET_NOTE_BY_URL = `
SELECT
  id,
  canonical_url,
  created,
  note_text
FROM tabnotes
WHERE
  canonical_url = :url
`;

/**
 * @param {string} url
 *   The canonical URL to associate the new tab note
 * @param {string} note
 *   The sanitized text for a tab note
 */
const CREATE_NOTE = `
INSERT INTO tabnotes
  (canonical_url, created, note_text)
VALUES
  (:url, unixepoch("now"), :note)
RETURNING
  id, canonical_url, created, note_text

`;

/**
 * @param {string} url
 *   The canonical URL for the existing tab note
 * @param {string} note
 *   The sanitized text for a tab note
 */
const UPDATE_NOTE = `
UPDATE
  tabnotes
SET
  note_text = :note
WHERE
  canonical_url = :url
RETURNING
  id, canonical_url, created, note_text
`;

/**
 * @param {string} url
 *   The canonical URL of a tab note to delete
 */
const DELETE_NOTE = `
DELETE FROM
  tabnotes
WHERE
  canonical_url = :url
`;

/**
 * Get the number of rows affected by the last INSERT/UPDATE/DELETE statement.
 *
 * @see https://sqlite.org/lang_corefunc.html#changes
 */
const RETURN_CHANGED = `
SELECT changes();
`;

/**
 * Provides the CRUD interface for tab notes.
 */
export class TabNotesStorage {
  DATABASE_FILE_NAME = Object.freeze("tabnotes.sqlite");

  /** @type {OpenedConnection|undefined} */
  #connection;

  /**
   * @param {object} [options={}]
   * @param {string} [options.basePath=PathUtils.profileDir]
   *   Base file path to a folder where the database file should live.
   *   Defaults to the current profile's root directory.
   * @returns {Promise<void>}
   */
  init(options) {
    const basePath = options?.basePath ?? PathUtils.profileDir;
    return Sqlite.openConnection({
      path: PathUtils.join(basePath, this.DATABASE_FILE_NAME),
    }).then(async connection => {
      this.#connection = connection;
      await this.#connection.execute("PRAGMA journal_mode = WAL");
      await this.#connection.execute("PRAGMA wal_autocheckpoint = 16");

      let currentVersion = await this.#connection.getSchemaVersion();

      if (currentVersion == 1) {
        // tabnotes schema is up to date
        return;
      }

      if (currentVersion == 0) {
        // version 0: create `tabnotes` table
        await this.#connection.executeTransaction(async () => {
          await this.#connection.execute(`
          CREATE TABLE IF NOT EXISTS "tabnotes" (
            id            INTEGER PRIMARY KEY,
            canonical_url TEXT NOT NULL,
            created       INTEGER NOT NULL,
            note_text     TEXT NOT NULL
          );`);
          await this.#connection.setSchemaVersion(1);
        });
      }
    });
  }

  /**
   * @returns {Promise<void>}
   */
  deinit() {
    if (this.#connection) {
      return this.#connection.close().then(() => {
        this.#connection = null;
      });
    }
    return Promise.resolve();
  }

  /**
   * Retrieve a note for a URL, if it exists.
   *
   * @param {string} url
   *   The URL that the note is associated with
   * @returns {Promise<TabNoteRecord|undefined>}
   */
  async get(url) {
    const results = await this.#connection.executeCached(GET_NOTE_BY_URL, {
      url,
    });
    if (!results?.length) {
      return undefined;
    }
    const [result] = results;
    const record = this.#mapDbRowToRecord(result);
    return record;
  }

  /**
   * Set a note for a URL.
   *
   * @param {string} url
   *   The URL that the note should be associated with
   * @param {string} note
   *   The note itself
   * @returns {Promise<TabNoteRecord>}
   *   The actual note that was set after sanitization
   * @throws {RangeError}
   *   if `url` is not a valid URL or `note` is empty
   */
  async set(url, note) {
    if (!URL.canParse(url)) {
      throw new RangeError("Tab notes must be associated to a valid URL");
    }
    if (!note) {
      throw new RangeError("Tab note text must be provided");
    }

    let existingNote = await this.get(url);
    let sanitized = this.#sanitizeInput(note);

    if (existingNote && existingNote.text == sanitized) {
      return Promise.resolve(existingNote);
    }

    return this.#connection.executeTransaction(async () => {
      if (!existingNote) {
        const insertResult = await this.#connection.executeCached(CREATE_NOTE, {
          url,
          note: sanitized,
        });

        const insertedRecord = this.#mapDbRowToRecord(insertResult[0]);
        Services.obs.notifyObservers(null, "TabNote:Created", url);
        return insertedRecord;
      }

      const updateResult = await this.#connection.executeCached(UPDATE_NOTE, {
        url,
        note: sanitized,
      });

      const updatedRecord = this.#mapDbRowToRecord(updateResult[0]);
      Services.obs.notifyObservers(null, "TabNote:Edited", url);
      return updatedRecord;
    });
  }

  /**
   * Delete a note for a URL.
   *
   * @param {string} url
   *   The URL of the note
   * @returns {Promise<boolean>}
   *   True if there was a note and it was deleted; false otherwise
   */
  async delete(url) {
    return this.#connection.executeTransaction(async () => {
      await this.#connection.executeCached(DELETE_NOTE, { url });
      /** @type {mozIStorageRow[]} */
      const changes = await this.#connection.execute(RETURN_CHANGED);
      const wasDeleted = changes?.length && changes[0].getInt64(0) > 0;

      if (wasDeleted) {
        Services.obs.notifyObservers(null, "TabNote:Removed", url.toString());
      }

      return wasDeleted;
    });
  }

  /**
   * Check if a URL has a note.
   *
   * @param {string} url
   *   The URL of the note
   * @returns {Promise<boolean>}
   *   True if a note is associated with this URL; false otherwise
   */
  async has(url) {
    const record = await this.get(url);
    return record !== undefined;
  }

  /**
   * Clear all notes for all URLs.
   *
   * @returns {void}
   */
  reset() {
    this.#connection.execute(`
      DELETE FROM "tabnotes"`);
  }

  /**
   * Given user-supplied note text, returns sanitized note text.
   *
   * @param {string} value
   * @returns {string}
   */
  #sanitizeInput(value) {
    return value.slice(0, 1000);
  }

  /**
   * @param {mozIStorageRow} row
   *   Row returned with the following data shape:
   *   [id: number, canonical_url: string, created: number, note_text: string]
   * @returns {TabNoteRecord}
   */
  #mapDbRowToRecord(row) {
    return {
      id: row.getDouble(0),
      canonicalUrl: row.getString(1),
      created: Temporal.Instant.fromEpochMilliseconds(row.getDouble(2) * 1000),
      text: row.getString(3),
    };
  }
}

// Singleton object accessible from all windows
export const TabNotes = new TabNotesStorage();
