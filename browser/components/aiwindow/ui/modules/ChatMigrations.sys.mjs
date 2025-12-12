/*
 This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Please refer to sql.mjs for details on creating new migrations.
 *
 * - List each change here and what it's for.
 *
 * @param {OpenedConnection} _conn - The SQLite connection to use for the migration
 * @param {number} _version - The version number of the current schema
 */
async function applyV2(_conn, _version) {
  //   if (version < 2) {
  //     // Drop the summary table, it is no longer needed
  //     await conn.execute(`DROP TABLE IF EXISTS summary;`);
  //
  //     try {
  //       await conn.execute("SELECT page_url FROM message LIMIT 1;");
  //     } catch (e) {
  //       // Add a page_url column to the message table to keep track
  //       // of the pages visitedjduring a conversation and when they
  //       // were visited
  //       await conn.execute(`
  //           ALTER TABLE message ADD COLUMN page_url TEXT;
  //         `);
  //     }
  //
  //     try {
  //       await conn.execute("SELECT turn_index FROM message LIMIT 1;");
  //     } catch (e) {
  //       // Add a turn_index column to group all types of messages into a
  //       // particular turn, ex: prompt -> response would be a single turn.
  //       await conn.execute(`
  //           ALTER TABLE message ADD COLUMN turn_index INTEGER;
  //         `);
  //     }
  //   }
}

/**
 * Array of migration functions to run in the order they should be run in.
 *
 * @returns {Array<Function>}
 */
export const migrations = [applyV2];
