/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file is used to temporarily disable newly added stylelint rules for existing files.
 * This allows us to enable new stylelint rules immediately for newly added files,
 * without having to fix errors in existing files.
 *
 * Newly added style files should NOT be added to this list,
 * and existing files should be removed from this list as they are fixed.
 */
module.exports = [
  // example usage below:
  // {
  //   name: "rollout-use-border-radius-tokens",
  //   rules: {
  //     "stylelint-plugin-mozilla/use-border-radius-tokens": null,
  //   },
  //   files: [
  //     "browser/base/content/sanitizeDialog.css",
  //   ],
  // },
];
