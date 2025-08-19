/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Test aria-describedby
 */
addAccessibleTask(
  `<div id="hint">This is a hint</div><button id="btn" aria-describedby="hint">Hello</button>`,
  async (browser, accDoc) => {
    let btn = getNativeInterface(accDoc, "btn");
    let customContent = btn.getAttributeValue("AXCustomContent");
    is(customContent[0].description, "This is a hint");
    ok(!btn.getAttributeValue("AXHelp"), "No AXHelp expected");
  },
  { chrome: true, topLevel: true }
);

/**
 * Test aria-description
 */
addAccessibleTask(
  `<button id="btn" aria-description="This is a hint too">Hello</button>`,
  async (browser, accDoc) => {
    let btn = getNativeInterface(accDoc, "btn");
    let customContent = btn.getAttributeValue("AXCustomContent");
    is(customContent[0].description, "This is a hint too");
    ok(!btn.getAttributeValue("AXHelp"), "No AXHelp expected");
  },
  { chrome: true, topLevel: true }
);

/**
 * Test link title
 */
addAccessibleTask(
  `<a href="#" id="lnk" title="This is a link title">Hello</button>`,
  async (browser, accDoc) => {
    let lnk = getNativeInterface(accDoc, "lnk");
    is(lnk.getAttributeValue("AXHelp"), "This is a link title");
    ok(!lnk.getAttributeValue("AXCustomContent"), "No custom content expected");
  },
  { chrome: true, topLevel: true }
);
