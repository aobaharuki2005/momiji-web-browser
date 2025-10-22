/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Test basic press action.
 */
addAccessibleTask(
  `
<button id="btn" onclick="this.textContent = 'Clicked'">Click me</button>
  `,
  async function testBasicPress() {
    const actions = await runPython(`
      global doc
      doc = getDocIa2()
      global btn
      btn = findIa2ByDomId(doc, "btn").QueryInterface(IAccessibleAction)
      return str([[btn.name(i), btn.localizedName(i), btn.description(i)] for i in range(btn.nActions())])
    `);
    is(actions, "[['press', 'Press', 'Press']]", "btn has correct actions");

    const nameChanged = waitForEvent(EVENT_NAME_CHANGE, "btn");
    await runPython(`
      btn.doAction(0)
    `);
    await nameChanged;
  }
);
