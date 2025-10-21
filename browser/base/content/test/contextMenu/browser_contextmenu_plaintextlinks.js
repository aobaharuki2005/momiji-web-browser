/* Any copyright is dedicated to the Public Domain.
  http://creativecommons.org/publicdomain/zero/1.0/ */

/* eslint-disable mozilla/no-arbitrary-setTimeout */

// Context menu links prepend `http`, so this is what
// is being tested for rather than an `https` prefix.
/* eslint-disable @microsoft/sdl/no-insecure-url */

function testExpected(expected, msg) {
  is(
    !document.getElementById("context-openlinkincurrent").hidden,
    expected,
    msg
  );
}

function testLinkExpected(expected, msg) {
  is(gContextMenu.linkURL, expected, msg);
}

add_task(async function () {
  const TEST_HTML_STRING = `
<div id="test-root">
  <div id="block1">
    <span id="prefix">http://www.</span><span id="hostTwice">example.com example.com</span>
    <span id="suffix"> - Test</span>
    <span id="anchor"><a href="http://www.example.com">http://www.example.com/example</a></span>
    <p id="nonLinks">mailto:test.com ftp.example.com</p>
    <p id="trailing">example.com   -</p>
  </div>
  <div id="block2">
    <p id="mainDomain">main.example.com</p>
  </div>
</div>
`;

  const TESTS = [
    // ---- URL selections that should show context menu link options ----
    {
      id: "http-url-across-spans",
      selection: {
        startNode: "prefix",
        startIndex: 0,
        endNode: "hostTwice",
        endIndex: "example.com".length,
      },
      expectLinks: true,
      expectedLink: "http://www.example.com/",
      message: "Link options should show for http://www.example.com",
    },
    {
      id: "url-across-spans-without-http",
      selection: {
        startNode: "prefix",
        startIndex: "http://".length,
        endNode: "hostTwice",
        endIndex: "example.com".length,
      },
      expectLinks: true,
      expectedLink: "http://www.example.com/",
      message: "Link options should show for www.example.com",
    },
    {
      id: "example-com-without-www",
      selection: {
        startNode: "hostTwice",
        startIndex: "example.com ".length,
        endNode: "hostTwice",
        endIndex: "example.com example.com".length,
      },
      expectLinks: true,
      expectedLink: "http://example.com/",
      message:
        "Link options should show for 'example.com' (without prepending 'www').",
    },
    {
      id: "ftp-example",
      selection: {
        startNode: "nonLinks",
        startIndex: "mailto:test.com ".length,
        endNode: "nonLinks",
        endIndex: "mailto:test.com ftp.example.com".length,
      },
      expectLinks: true,
      expectedLink: "http://ftp.example.com/",
      message: "ftp.example.com should be linkified with http://",
    },
    {
      id: "example-trailing-dash",
      selection: {
        startNode: "trailing",
        startIndex: 0,
        endNode: "trailing",
        endIndex: "example.com".length,
      },
      expectLinks: true,
      expectedLink: "http://example.com/",
      message: "Link options should show for \"'example.com'   -\"",
    },
    {
      id: "triple-click-main-domain",
      selection: {
        startNode: "mainDomain",
        startIndex: 0,
        endNode: "mainDomain",
        endIndex: "main.example.com".length,
      },
      expectLinks: true,
      expectedLink: "http://main.example.com/",
      message:
        "Link options should show for triple-click selection of main.example.com",
    },
    {
      id: "anchor-element",
      selection: {
        startNode: "anchor",
        startIndex: 0,
        endNode: "anchor",
        endIndex: "http://www.example.com/example".length,
      },
      expectLinks: false, // Is URL due to anchor element, not plaintext.
      expectedLink: "http://www.example.com/",
      message: "Context menu should use anchor href, not raw text",
    },
    {
      id: "open-suse",
      customHTML: "<div id='os'>open-suse.ru</div>",
      selection: {
        startNode: "os",
        startIndex: 0,
        endNode: "os",
        endIndex: "open-suse.ru".length,
      },
      expectLinks: true,
      expectedLink: "http://open-suse.ru/",
      message: "Link options should show for open-suse.ru",
    },

    // ---- Non-URL selections ----
    {
      id: "selection-not-at-word-boundary",
      selection: {
        startNode: "hostTwice",
        startIndex: 1,
        endNode: "hostTwice",
        endIndex: "www.example.com".length,
      },
      expectLinks: false,
      message: "Link options should not show for \"w'ww.example.com'\"",
    },
    {
      id: "selection-includes-non-url-text",
      selection: {
        startNode: "hostTwice",
        startIndex: "example.com ".length,
        endNode: "suffix",
        endIndex: " - Test".length,
      },
      expectLinks: false,
      message:
        "Link options should not show when crossing non-URL text ('example.com - Test')",
    },
    {
      id: "whitespace-in-selection",
      selection: {
        startNode: "hostTwice",
        startIndex: 12,
        endNode: "hostTwice",
        endIndex: 19,
      },
      expectLinks: false,
      message:
        "Link options should not show for selection with whitespace (' example.com')",
    },
    {
      id: "mailto-link",
      selection: {
        startNode: "nonLinks",
        startIndex: 0,
        endNode: "nonLinks",
        endIndex: "mailto:test.com".length,
      },
      expectLinks: false,
      message: "Link options should not show for mailto: links",
    },
    {
      id: "selection-includes-parentheses",
      customHTML: "<div id='osparens'>(open-suse.ru)</div>",
      selection: {
        startNode: "osparens",
        startIndex: 1,
        endNode: "osparens",
        endIndex: "(open-suse.ru)".length,
      },
      expectLinks: false,
      message: "Link options should not show for 'open-suse.ru)'",
    },
  ];

  await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "data:text/html,<html><body></body></html>"
  );

  await SimpleTest.promiseFocus(gBrowser.selectedBrowser);

  for (let test of TESTS) {
    info("Running test: " + test.id);

    let menuPosition = await SpecialPowers.spawn(
      gBrowser.selectedBrowser,
      [TEST_HTML_STRING, test.selection, test.customHTML],
      async function (html, testSelection, customHTML) {
        // Reset HTML to test template or custom HTML for specific tests
        if (customHTML) {
          content.document.body.innerHTML = customHTML;
        } else {
          content.document.body.innerHTML = "";
          let parser = new content.DOMParser();
          let doc = parser.parseFromString(html, "text/html");
          let node = content.document.importNode(doc.body.firstChild, true);
          content.document.body.appendChild(node);
        }

        // Build selection range from start/end nodes/indices
        let selection = content.getSelection();
        selection.removeAllRanges();
        let range = content.document.createRange();

        let startNode = content.document.getElementById(
          testSelection.startNode
        );

        while (startNode.nodeType != startNode.TEXT_NODE) {
          startNode = startNode.firstChild;
        }

        let endNode = content.document.getElementById(testSelection.endNode);

        while (endNode.nodeType != endNode.TEXT_NODE) {
          endNode = endNode.firstChild;
        }

        range.setStart(startNode, testSelection.startIndex);
        range.setEnd(endNode, testSelection.endIndex);
        selection.addRange(range);

        range.startContainer.parentElement.scrollIntoView();

        // Get the range of the selection and determine its coordinates. These
        // coordinates will be returned to the parent process and the context menu
        // will be opened at that location.
        let rangeRect = range.getBoundingClientRect();
        return [rangeRect.x + 3, rangeRect.y + 3];
      }
    );

    let contentAreaContextMenu = document.getElementById(
      "contentAreaContextMenu"
    );

    // Trigger a mouse event until we receive the popupshown event.
    let sawPopup = false;
    let popupShownPromise = BrowserTestUtils.waitForEvent(
      contentAreaContextMenu,
      "popupshown",
      false,
      () => {
        sawPopup = true;
        return true;
      }
    );
    while (!sawPopup) {
      await BrowserTestUtils.synthesizeMouseAtPoint(
        menuPosition[0],
        menuPosition[1],
        { type: "contextmenu", button: 2 },
        gBrowser.selectedBrowser
      );
      if (!sawPopup) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
    await popupShownPromise;

    // Run the tests.
    testExpected(test.expectLinks, test.message);
    if (test.expectedLink) {
      testLinkExpected(
        test.expectedLink,
        `Expected link URL for ${test.id} selection: ${test.expectedLink}`
      );
    }

    // On Linux non-e10s it's possible the menu was closed by a focus-out event
    // on the window. Work around this by calling hidePopup only if the menu
    // hasn't been closed yet. See bug 1352709 comment 36.
    if (contentAreaContextMenu.state === "closed") {
      continue;
    }

    let popupHiddenPromise = BrowserTestUtils.waitForEvent(
      contentAreaContextMenu,
      "popuphidden"
    );
    contentAreaContextMenu.hidePopup();
    await popupHiddenPromise;
  }

  gBrowser.removeCurrentTab();
});
