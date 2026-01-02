/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Controller for the Smartbar editor.
 *
 * The controller abstracts the underlying editor implementation allowing
 * the Smartbar to also work with a standard HTML input.
 *
 * @property {Element} input - The input element or object.
 * @property {object} editor - The editor object.
 * @property {object} adapter - The adapter providing input and editor references.
 * @property {boolean} readOnly - Whether the input is read-only.
 * @property {string} placeholder - The placeholder text.
 * @property {string} value - The current value of the input.
 * @property {number} selectionStart - The start offset of the selection.
 * @property {number} selectionEnd - The end offset of the selection.
 * @property {boolean} composing - Whether the editor is in composition mode.
 * @property {number} selectionRangeCount - The number of selection ranges.
 */
class SmartbarInputController {
  constructor(adapter) {
    this.adapter = adapter;
    this.input = adapter?.input ?? null;
    this.editor = adapter?.editor ?? null;
  }

  focus() {
    this.input?.focus();
  }
}

export { SmartbarInputController };
