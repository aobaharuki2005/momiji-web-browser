/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
const { TabNotes } = ChromeUtils.importESModule(
  "moz-src:///browser/components/tabnotes/TabNotes.sys.mjs"
);

/**
 * @param {string} url
 * @returns {Promise<[undefined, string]>}
 */
function observeTabNoteCreated(url) {
  return TestUtils.topicObserved("TabNote:Created", (_, data) => data == url);
}

/**
 * @param {string} url
 * @returns {Promise<[undefined, string]>}
 */
function observeTabNoteEdited(url) {
  return TestUtils.topicObserved("TabNote:Edited", (_, data) => data == url);
}

/**
 * @param {string} url
 * @returns {Promise<[undefined, string]>}
 */
function observeTabNoteRemoved(url) {
  return TestUtils.topicObserved("TabNote:Removed", (_, data) => data == url);
}
