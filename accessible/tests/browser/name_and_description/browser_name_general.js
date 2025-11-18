/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";
requestLongerTimeout(2);

/* import-globals-from ../../mochitest/name.js */
/* import-globals-from ../../mochitest/attributes.js */
loadScripts(
  { name: "name.js", dir: MOCHITESTS_DIR },
  { name: "attributes.js", dir: MOCHITESTS_DIR }
);
/**
 * Test caching of the document title.
 */
addAccessibleTask(
  ``,
  async function (browser, docAcc) {
    let nameChanged = waitForEvent(EVENT_NAME_CHANGE, docAcc);
    await invokeContentTask(browser, [], () => {
      content.document.title = "new title";
    });
    await nameChanged;
    testName(docAcc, "new title");
  },
  { chrome: true, topLevel: true, iframe: true, remoteIframe: true }
);

/**
 * Test that the name is updated when the content of a hidden aria-labelledby
 * subtree changes.
 */
addAccessibleTask(
  `
<button id="button" aria-labelledby="label"></button>
<div id="label" hidden>a</div>
  `,
  async function (browser, docAcc) {
    const button = findAccessibleChildByID(docAcc, "button");
    testName(button, "a");
    info("Changing label textContent");
    let nameChanged = waitForEvent(EVENT_NAME_CHANGE, button);
    await invokeContentTask(browser, [], () => {
      content.document.getElementById("label").textContent = "c";
    });
    await nameChanged;
    testName(button, "c");
    info("Change label text node's data");
    nameChanged = waitForEvent(EVENT_NAME_CHANGE, button);
    await invokeContentTask(browser, [], () => {
      content.document.getElementById("label").firstChild.data = "d";
    });
    await nameChanged;
    testName(button, "d");
    info("Prepending text node to label");
    nameChanged = waitForEvent(EVENT_NAME_CHANGE, button);
    await invokeContentTask(browser, [], () => {
      content.document
        .getElementById("label")
        .prepend(content.document.createTextNode("b"));
    });
    await nameChanged;
    testName(button, "bd");
  },
  { chrome: true, topLevel: true, iframe: true, remoteIframe: true }
);

/**
 * Test that the name does not include aria-actions targets of itself.
 */
addAccessibleTask(
  `<div role="tablist">
    <div role="tab" id="tab" aria-actions="close pin">Title
      <button id="close">Close</button>
      <button id="pin">Pin</button>
    </div>
  </div>`,
  async function testAriaActionInSubtree(browser, docAcc) {
    const tab = findAccessibleChildByID(docAcc, "tab");
    testName(tab, "Title");

    let nameChanged = waitForEvent(EVENT_NAME_CHANGE, tab);
    invokeSetAttribute(browser, "tab", "aria-actions", "pin");
    await nameChanged;
    testName(tab, "Title Close");

    nameChanged = waitForEvent(EVENT_NAME_CHANGE, tab);
    invokeSetAttribute(browser, "pin", "id", "broken-pin");
    await nameChanged;
    testName(tab, "Title Close Pin");

    nameChanged = waitForEvent(EVENT_NAME_CHANGE, tab);
    invokeSetAttribute(browser, "tab", "aria-actions", "close pin");
    await nameChanged;
    testName(tab, "Title Pin");

    nameChanged = waitForEvent(EVENT_NAME_CHANGE, tab);
    invokeSetAttribute(browser, "broken-pin", "id", "pin");
    await nameChanged;
    testName(tab, "Title");
  },
  { chrome: true, topLevel: true }
);

/**
 * Test abbr name change notification
 */
addAccessibleTask(
  `<abbr id="abbr" title="JavaScript Object Notation">JSON</abbr>
   <abbr id="labelled-abbr" aria-label="YML"
         title="Yet Another Markup Language">YAML</abbr>`,
  async function testAbbrName(browser, docAcc) {
    const abbr = findAccessibleChildByID(docAcc, "abbr");
    testName(abbr, "JavaScript Object Notation");

    let nameChanged = waitForEvent(EVENT_NAME_CHANGE, abbr);
    invokeSetAttribute(browser, "abbr", "title", "Jason's Other Nettle");
    await nameChanged;
    testName(abbr, "Jason's Other Nettle");

    nameChanged = waitForEvent(EVENT_NAME_CHANGE, abbr);
    invokeSetAttribute(browser, "abbr", "title");
    await nameChanged;
    testName(abbr, null);

    const labelledAbbr = findAccessibleChildByID(docAcc, "labelled-abbr");
    testName(labelledAbbr, "YML");

    let events = waitForEvents({
      expected: [[EVENT_DESCRIPTION_CHANGE, labelledAbbr]],
      unexpected: [[EVENT_NAME_CHANGE, labelledAbbr]],
    });
    invokeSetAttribute(
      browser,
      "labelled-abbr",
      "title",
      "Your Another Marker Lye"
    );
    await events;
    testName(labelledAbbr, "YML");
    is(labelledAbbr.description, "Your Another Marker Lye");

    events = waitForEvents([
      [EVENT_NAME_CHANGE, labelledAbbr],
      // Bug 1997464 - When losing ARIA name, we lose the description that is used
      // now for the name.
      // [EVENT_DESCRIPTION_CHANGE, labelledAbbr],
    ]);
    invokeSetAttribute(browser, "labelled-abbr", "aria-label");
    await events;
    testName(labelledAbbr, "Your Another Marker Lye");
  },
  { chrome: true, topLevel: true }
);

/**
 * Test consistent doc name for remote and local docs.
 */
addAccessibleTask(
  `<iframe id="iframe"></iframe>`,
  async function testDocName(browser, docAcc) {
    const iframe = findAccessibleChildByID(docAcc, "iframe");
    info("Setting iframe src");
    // This iframe won't finish loading. Thus, it will get the stale state and
    // won't fire a document load complete event. We use the reorder event on
    // the iframe to know when the document has been created.
    let reordered = waitForEvent(EVENT_REORDER, iframe);
    await invokeContentTask(browser, [], () => {
      content.document.getElementById("iframe").src =
        `data:text/html,<html><body>hey</body></html>`;
    });
    let iframeDoc = (await reordered).accessible.firstChild;
    is(iframeDoc.name, null, "Doc should have 'null' name");
    testAbsentAttrs(iframeDoc, { "explicit-name": "true" });

    reordered = waitForEvent(EVENT_REORDER, iframe);
    await invokeContentTask(browser, [], () => {
      content.document.getElementById("iframe").src =
        `data:text/html,<html><title>hello</title><body>hey</body></html>`;
    });
    iframeDoc = (await reordered).accessible.firstChild;
    is(iframeDoc.name, "hello", "Doc should have name");
    testAttrs(iframeDoc, { "explicit-name": "true" }, true);
  },
  { topLevel: true, chrome: true }
);
