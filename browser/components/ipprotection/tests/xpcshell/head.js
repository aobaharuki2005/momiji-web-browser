/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

function waitForEvent(target, eventName) {
  return new Promise(resolve => {
    let listener = event => {
      target.removeEventListener(eventName, listener);
      resolve(event);
    };
    target.addEventListener(eventName, listener);
  });
}
