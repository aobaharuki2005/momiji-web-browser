/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * AI Window Service
 */

export const AIWindow = {
  _initialized: false,
  _windowStates: new Map(),

  /**
   * Handles startup tasks
   */

  init(win) {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    this._windowStates.set(win, {});
  },

  /**
   * Is AI Window enabled
   *
   * @returns {boolean} whether AI Window is enabled
   */

  isAIWindowEnabled() {
    // TODO - Placeholder for actual implementation
    return true;
  },
};
