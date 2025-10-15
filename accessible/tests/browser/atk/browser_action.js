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
  async function () {
    const actions = await runPython(`
      global doc
      doc = getDoc()
      global btn
      btn = findByDomId(doc, "btn").queryAction()
      return str([[btn.getName(i), btn.getLocalizedName(i), btn.getDescription(i)] for i in range(btn.get_nActions())])
    `);
    is(actions, "[['press', '', 'Press']]", "btn has correct actions");

    const nameChanged = waitForEvent(EVENT_NAME_CHANGE, "btn");
    await runPython(`
      btn.doAction(0)
    `);
    await nameChanged;
  }
);
