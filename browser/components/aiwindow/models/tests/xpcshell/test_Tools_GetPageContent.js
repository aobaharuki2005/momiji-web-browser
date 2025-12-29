/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { GetPageContent } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs"
);

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

function createFakeBrowser(url, hasBrowsingContext = true) {
  const parsedUrl = new URL(url);
  const browser = {
    currentURI: {
      spec: url,
      hostPort: parsedUrl.host,
    },
  };

  if (hasBrowsingContext) {
    browser.browsingContext = {
      currentWindowContext: {
        getActor: sinon.stub().resolves({
          getText: sinon.stub().resolves("Sample page content"),
          getReaderModeContent: sinon.stub().resolves(""),
        }),
      },
    };
  } else {
    browser.browsingContext = null;
  }

  return browser;
}

function createFakeTab(url, title, hasBrowsingContext = true) {
  return {
    linkedBrowser: createFakeBrowser(url, hasBrowsingContext),
    label: title,
  };
}

function createFakeWindow(tabs) {
  return {
    closed: false,
    gBrowser: {
      tabs,
    },
  };
}

function setupBrowserWindowTracker(sandbox, window) {
  const BrowserWindowTracker = ChromeUtils.importESModule(
    "resource:///modules/BrowserWindowTracker.sys.mjs"
  ).BrowserWindowTracker;

  sandbox.stub(BrowserWindowTracker, "getTopWindow").returns(window);
}

add_task(async function test_getPageContent_exact_url_match() {
  const sb = sinon.createSandbox();

  try {
    const targetUrl = "https://example.com/page";
    const tabs = [
      createFakeTab("https://other.com", "Other"),
      createFakeTab(targetUrl, "Example Page"),
    ];

    setupBrowserWindowTracker(sb, createFakeWindow(tabs));

    const result = await GetPageContent.getPageContent(
      { url: targetUrl },
      new Set([targetUrl])
    );

    Assert.ok(result.includes("Example Page"), "Should include page title");
    Assert.ok(
      result.includes("Sample page content"),
      "Should include page content"
    );
    Assert.ok(
      result.includes(targetUrl),
      "Should include URL in result message"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_getPageContent_normalized_url_match() {
  const sb = sinon.createSandbox();

  try {
    const tabs = [
      createFakeTab("https://example.com/page/", "Example Page"),
      createFakeTab("https://other.com", "Other"),
    ];

    setupBrowserWindowTracker(sb, createFakeWindow(tabs));

    const result = await GetPageContent.getPageContent(
      { url: "https://example.com/page" },
      new Set(["https://example.com/page"])
    );

    Assert.ok(
      result.includes("Example Page"),
      "Should match URL after normalizing trailing slashes"
    );
    Assert.ok(
      result.includes("Sample page content"),
      "Should include page content"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_getPageContent_hostname_match() {
  const sb = sinon.createSandbox();

  try {
    const tabs = [
      createFakeTab("https://example.com/page", "Example Page"),
      createFakeTab("https://other.com", "Other"),
    ];

    setupBrowserWindowTracker(sb, createFakeWindow(tabs));

    const result = await GetPageContent.getPageContent(
      { url: "http://example.com/different" },
      new Set(["http://example.com/different"])
    );

    Assert.ok(
      result.includes("Example Page"),
      "Should match by hostname when exact match fails"
    );
    Assert.ok(
      result.includes("Sample page content"),
      "Should include page content"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_getPageContent_tab_not_found_with_allowed_url() {
  const sb = sinon.createSandbox();

  try {
    const targetUrl = "https://external.com/article";
    const tabs = [
      createFakeTab("https://example.com", "Example"),
      createFakeTab("https://other.com", "Other"),
    ];

    setupBrowserWindowTracker(sb, createFakeWindow(tabs));

    const allowedUrls = new Set([targetUrl]);
    const result = await GetPageContent.getPageContent(
      { url: targetUrl },
      allowedUrls
    );

    // Headless extraction doesn't work in xpcshell environment
    // In real usage, this would attempt headless extraction for allowed URLs
    Assert.ok(
      result.includes("Cannot find URL"),
      "Should return error when tab not found (headless doesn't work in xpcshell)"
    );
    Assert.ok(result.includes(targetUrl), "Should include target URL in error");
  } finally {
    sb.restore();
  }
});

add_task(
  async function test_getPageContent_tab_not_found_without_allowed_url() {
    const sb = sinon.createSandbox();

    try {
      const targetUrl = "https://notfound.com/page";
      const tabs = [
        createFakeTab("https://example.com", "Example"),
        createFakeTab("https://other.com", "Other"),
        createFakeTab("https://third.com", "Third"),
        createFakeTab("https://fourth.com", "Fourth"),
      ];

      setupBrowserWindowTracker(sb, createFakeWindow(tabs));

      const allowedUrls = new Set(["https://different.com"]);

      // When URL is not in allowedUrls, it attempts headless extraction
      // This doesn't work in xpcshell, so we expect an error
      let errorThrown = false;
      try {
        await GetPageContent.getPageContent({ url: targetUrl }, allowedUrls);
      } catch (error) {
        errorThrown = true;
        Assert.ok(
          error.message.includes("addProgressListener"),
          "Should fail with headless browser error in xpcshell"
        );
      }

      Assert.ok(
        errorThrown,
        "Should throw error when attempting headless extraction in xpcshell"
      );
    } finally {
      sb.restore();
    }
  }
);

add_task(async function test_getPageContent_no_browsing_context() {
  const sb = sinon.createSandbox();

  try {
    const targetUrl = "https://example.com/loading";
    const tabs = [createFakeTab(targetUrl, "Loading Page", false)];

    setupBrowserWindowTracker(sb, createFakeWindow(tabs));

    const result = await GetPageContent.getPageContent(
      { url: targetUrl },
      new Set([targetUrl])
    );

    Assert.ok(
      result.includes("Cannot access content"),
      "Should return error for unavailable browsing context"
    );
    Assert.ok(
      result.includes("Loading Page"),
      "Should include tab label in error"
    );
    Assert.ok(
      result.includes(targetUrl),
      "Should include URL in error message"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_getPageContent_successful_extraction() {
  const sb = sinon.createSandbox();

  try {
    const targetUrl = "https://example.com/article";
    const pageContent = "This is a well-written article with lots of content.";

    const mockExtractor = {
      getText: sinon.stub().resolves(pageContent),
      getReaderModeContent: sinon.stub().resolves(""),
    };

    const tab = createFakeTab(targetUrl, "Article");
    tab.linkedBrowser.browsingContext.currentWindowContext.getActor = sinon
      .stub()
      .resolves(mockExtractor);

    setupBrowserWindowTracker(sb, createFakeWindow([tab]));

    const result = await GetPageContent.getPageContent(
      { url: targetUrl },
      new Set([targetUrl])
    );

    Assert.ok(result.includes("Content (full page)"), "Should indicate mode");
    Assert.ok(result.includes("Article"), "Should include tab title");
    Assert.ok(result.includes(targetUrl), "Should include URL");
    Assert.ok(result.includes(pageContent), "Should include extracted content");
  } finally {
    sb.restore();
  }
});

add_task(async function test_getPageContent_content_truncation() {
  const sb = sinon.createSandbox();

  try {
    const targetUrl = "https://example.com/long";
    const longContent = "A".repeat(15000);

    const mockExtractor = {
      getText: sinon.stub().resolves(longContent),
      getReaderModeContent: sinon.stub().resolves(""),
    };

    const tab = createFakeTab(targetUrl, "Long Page");
    tab.linkedBrowser.browsingContext.currentWindowContext.getActor = sinon
      .stub()
      .resolves(mockExtractor);

    setupBrowserWindowTracker(sb, createFakeWindow([tab]));

    const result = await GetPageContent.getPageContent(
      { url: targetUrl },
      new Set([targetUrl])
    );

    const contentMatch = result.match(/Content \(full page\) from.*:\s*(.*)/s);
    Assert.ok(contentMatch, "Should match content pattern");

    const extractedContent = contentMatch[1].trim();
    Assert.lessOrEqual(
      extractedContent.length,
      10003,
      "Content should be truncated to ~10000 chars (with ...)"
    );
    Assert.ok(
      extractedContent.endsWith("..."),
      "Truncated content should end with ..."
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_getPageContent_truncation_at_sentence_boundary() {
  const sb = sinon.createSandbox();

  try {
    const targetUrl = "https://example.com/sentences";
    const sentence = "This is a sentence. ";
    const longContent = sentence.repeat(600);

    const mockExtractor = {
      getText: sinon.stub().resolves(longContent),
      getReaderModeContent: sinon.stub().resolves(""),
    };

    const tab = createFakeTab(targetUrl, "Sentences");
    tab.linkedBrowser.browsingContext.currentWindowContext.getActor = sinon
      .stub()
      .resolves(mockExtractor);

    setupBrowserWindowTracker(sb, createFakeWindow([tab]));

    const result = await GetPageContent.getPageContent(
      { url: targetUrl },
      new Set([targetUrl])
    );

    const contentMatch = result.match(/Content \(full page\) from.*:\s*(.*)/s);
    Assert.ok(contentMatch, "Should match content pattern");

    const extractedContent = contentMatch[1].trim();
    Assert.lessOrEqual(
      extractedContent.length,
      10001,
      "Should truncate near 10000 chars"
    );
    Assert.ok(
      extractedContent.endsWith("."),
      "Should end at sentence boundary (period)"
    );
    Assert.ok(
      !extractedContent.endsWith("..."),
      "Should not have ... when truncated at sentence"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_getPageContent_empty_content() {
  const sb = sinon.createSandbox();

  try {
    const targetUrl = "https://example.com/empty";

    const mockExtractor = {
      getText: sinon.stub().resolves("   \n  \n   "),
      getReaderModeContent: sinon.stub().resolves(""),
    };

    const tab = createFakeTab(targetUrl, "Empty Page");
    tab.linkedBrowser.browsingContext.currentWindowContext.getActor = sinon
      .stub()
      .resolves(mockExtractor);

    setupBrowserWindowTracker(sb, createFakeWindow([tab]));

    const result = await GetPageContent.getPageContent(
      { url: targetUrl },
      new Set([targetUrl])
    );

    // Whitespace content is normalized but still returns success
    Assert.ok(
      result.includes("Content (full page)"),
      "Should use full page mode after reader fallback"
    );
    Assert.ok(result.includes("Empty Page"), "Should include tab label");
    // The content is essentially empty after normalization, but still returned
    Assert.ok(
      result.match(/:\s*$/),
      "Content should be mostly empty after normalization"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_getPageContent_extraction_error() {
  const sb = sinon.createSandbox();

  try {
    const targetUrl = "https://example.com/error";

    const mockExtractor = {
      getText: sinon.stub().rejects(new Error("Extraction failed")),
      getReaderModeContent: sinon.stub().resolves(""),
    };

    const tab = createFakeTab(targetUrl, "Error Page");
    tab.linkedBrowser.browsingContext.currentWindowContext.getActor = sinon
      .stub()
      .resolves(mockExtractor);

    setupBrowserWindowTracker(sb, createFakeWindow([tab]));

    const result = await GetPageContent.getPageContent(
      { url: targetUrl },
      new Set([targetUrl])
    );

    Assert.ok(
      result.includes("returned no content"),
      "Should handle extraction error gracefully"
    );
    Assert.ok(result.includes("Error Page"), "Should include tab label");
  } finally {
    sb.restore();
  }
});

add_task(async function test_getPageContent_viewport_mode() {
  const sb = sinon.createSandbox();

  try {
    const targetUrl = "https://example.com/viewport";

    const mockExtractor = {
      getText: sinon.stub().resolves("Full page content"),
      getReaderModeContent: sinon.stub().resolves(""),
    };

    const tab = createFakeTab(targetUrl, "Viewport Test");
    tab.linkedBrowser.browsingContext.currentWindowContext.getActor = sinon
      .stub()
      .resolves(mockExtractor);

    setupBrowserWindowTracker(sb, createFakeWindow([tab]));

    const result = await GetPageContent.getPageContent(
      { url: targetUrl },
      new Set([targetUrl])
    );

    Assert.ok(
      result.includes("Content (full page)"),
      "Should use full mode by default"
    );
    Assert.ok(result.includes("Full page content"), "Should include content");
  } finally {
    sb.restore();
  }
});

add_task(async function test_getPageContent_reader_mode_string() {
  const sb = sinon.createSandbox();

  try {
    const targetUrl = "https://example.com/reader";
    const readerContent = "Clean reader mode text";

    const mockExtractor = {
      getText: sinon.stub().resolves("Full content"),
      getReaderModeContent: sinon.stub().resolves(readerContent),
    };

    const tab = createFakeTab(targetUrl, "Reader Test");
    tab.linkedBrowser.browsingContext.currentWindowContext.getActor = sinon
      .stub()
      .resolves(mockExtractor);

    setupBrowserWindowTracker(sb, createFakeWindow([tab]));

    const result = await GetPageContent.getPageContent(
      { url: targetUrl },
      new Set([targetUrl])
    );

    Assert.ok(
      result.includes("Content (reader mode)"),
      "Should use reader mode by default"
    );
    Assert.ok(
      result.includes(readerContent),
      "Should include reader mode content"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_getPageContent_no_window() {
  const sb = sinon.createSandbox();

  try {
    const targetUrl = "https://example.com";
    setupBrowserWindowTracker(sb, null);

    // Add URL to allowed list so it checks for window instead of trying headless
    const result = await GetPageContent.getPageContent(
      { url: targetUrl },
      new Set([targetUrl])
    );

    Assert.ok(
      result.includes("Error retrieving content"),
      "Should handle null window gracefully"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_getPageContent_closed_window() {
  const sb = sinon.createSandbox();

  try {
    const targetUrl = "https://example.com";
    const closedWindow = {
      closed: true,
      gBrowser: { tabs: [] },
    };

    setupBrowserWindowTracker(sb, closedWindow);

    // Add URL to allowed list so it checks for window instead of trying headless
    const result = await GetPageContent.getPageContent(
      { url: targetUrl },
      new Set([targetUrl])
    );

    Assert.ok(
      result.includes("Error retrieving content") ||
        result.includes("Cannot find URL"),
      "Should handle closed window with error"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_getPageContent_window_without_gBrowser() {
  const sb = sinon.createSandbox();

  try {
    const targetUrl = "https://example.com";
    const windowWithoutGBrowser = {
      closed: false,
      gBrowser: null,
    };

    setupBrowserWindowTracker(sb, windowWithoutGBrowser);

    // Add URL to allowed list so it checks for window instead of trying headless
    const result = await GetPageContent.getPageContent(
      { url: targetUrl },
      new Set([targetUrl])
    );

    Assert.ok(
      result.includes("Error retrieving content"),
      "Should handle window without gBrowser"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_getPageContent_whitespace_normalization() {
  const sb = sinon.createSandbox();

  try {
    const targetUrl = "https://example.com/whitespace";
    const messyContent =
      "Text   with    lots\n\n\nof     whitespace\n\n\n\nhere";

    const mockExtractor = {
      getText: sinon.stub().resolves(messyContent),
      getReaderModeContent: sinon.stub().resolves(""),
    };

    const tab = createFakeTab(targetUrl, "Whitespace Test");
    tab.linkedBrowser.browsingContext.currentWindowContext.getActor = sinon
      .stub()
      .resolves(mockExtractor);

    setupBrowserWindowTracker(sb, createFakeWindow([tab]));

    const result = await GetPageContent.getPageContent(
      { url: targetUrl },
      new Set([targetUrl])
    );

    Assert.ok(
      result.includes("Text with lots of whitespace here"),
      "Should normalize whitespace"
    );
    Assert.ok(
      !result.includes("   "),
      "Should not have multiple consecutive spaces"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_getPageContent_invalid_url_format() {
  const sb = sinon.createSandbox();

  try {
    const targetUrl = "not-a-valid-url";
    const tabs = [createFakeTab("https://example.com", "Example")];

    setupBrowserWindowTracker(sb, createFakeWindow(tabs));

    // Add URL to allowed list so it searches tabs instead of trying headless
    const result = await GetPageContent.getPageContent(
      { url: targetUrl },
      new Set([targetUrl])
    );

    Assert.ok(
      result.includes("Cannot find URL"),
      "Should handle invalid URL format"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_getPageContent_extraction_returns_string() {
  const sb = sinon.createSandbox();

  try {
    const targetUrl = "https://example.com/string";
    const directString = "Direct string content";

    const mockExtractor = {
      getText: sinon.stub().resolves(directString),
      getReaderModeContent: sinon.stub().resolves(""),
    };

    const tab = createFakeTab(targetUrl, "String Test");
    tab.linkedBrowser.browsingContext.currentWindowContext.getActor = sinon
      .stub()
      .resolves(mockExtractor);

    setupBrowserWindowTracker(sb, createFakeWindow([tab]));

    const result = await GetPageContent.getPageContent(
      { url: targetUrl },
      new Set([targetUrl])
    );

    Assert.ok(
      result.includes(directString),
      "Should handle extraction returning string directly"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_getPageContent_extraction_returns_object() {
  const sb = sinon.createSandbox();

  try {
    const targetUrl = "https://example.com/object";
    // The API now expects strings, not objects
    // If getText returns a non-string object, it should be treated as no content
    const objectContent = { text: "Object text content" };

    const mockExtractor = {
      getText: sinon.stub().resolves(objectContent),
      getReaderModeContent: sinon.stub().resolves(""),
    };

    const tab = createFakeTab(targetUrl, "Object Test");
    tab.linkedBrowser.browsingContext.currentWindowContext.getActor = sinon
      .stub()
      .resolves(mockExtractor);

    setupBrowserWindowTracker(sb, createFakeWindow([tab]));

    const result = await GetPageContent.getPageContent(
      { url: targetUrl },
      new Set([targetUrl])
    );

    // API expects strings now, objects are treated as no content
    Assert.ok(
      result.includes("returned no content"),
      "Should treat object return value as no content"
    );
  } finally {
    sb.restore();
  }
});

add_task(
  async function test_getPageContent_extraction_returns_non_string_text() {
    const sb = sinon.createSandbox();

    try {
      const targetUrl = "https://example.com/nonstring";

      const mockExtractor = {
        getText: sinon.stub().resolves(12345),
        getReaderModeContent: sinon.stub().resolves(""),
      };

      const tab = createFakeTab(targetUrl, "Non-string Test");
      tab.linkedBrowser.browsingContext.currentWindowContext.getActor = sinon
        .stub()
        .resolves(mockExtractor);

      setupBrowserWindowTracker(sb, createFakeWindow([tab]));

      const result = await GetPageContent.getPageContent(
        { url: targetUrl },
        new Set([targetUrl])
      );

      Assert.ok(
        result.includes("returned no content"),
        "Should handle non-string text property as empty"
      );
    } finally {
      sb.restore();
    }
  }
);

add_task(async function test_getPageContent_allowed_urls_set() {
  const sb = sinon.createSandbox();

  try {
    const targetUrl = "https://allowed.com/page";
    const tabs = [createFakeTab("https://other.com", "Other")];

    setupBrowserWindowTracker(sb, createFakeWindow(tabs));

    const allowedUrls = new Set([
      "https://allowed.com/page",
      "https://another-allowed.com",
    ]);

    const result = await GetPageContent.getPageContent(
      { url: targetUrl },
      allowedUrls
    );

    // Headless extraction doesn't work in xpcshell environment
    Assert.ok(
      result.includes("Cannot find URL"),
      "Should return error when tab not found (headless doesn't work in xpcshell)"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_getPageContent_available_tabs_list() {
  const sb = sinon.createSandbox();

  try {
    const targetUrl = "https://notfound.com";
    const tabs = [
      createFakeTab("https://first.com", "First Tab"),
      createFakeTab("https://second.com", "Second Tab"),
      createFakeTab("https://third.com", "Third Tab"),
      createFakeTab("https://fourth.com", "Fourth Tab"),
    ];

    setupBrowserWindowTracker(sb, createFakeWindow(tabs));

    // Add the URL to allowed list so it searches tabs instead of trying headless
    const result = await GetPageContent.getPageContent(
      { url: targetUrl },
      new Set([targetUrl])
    );

    // URL is in allowed list but not open, so should get error
    Assert.ok(
      result.includes("Cannot find URL"),
      "Should return error when tab not found"
    );
    Assert.ok(
      result.includes(targetUrl),
      "Should include requested URL in error"
    );
  } finally {
    sb.restore();
  }
});
