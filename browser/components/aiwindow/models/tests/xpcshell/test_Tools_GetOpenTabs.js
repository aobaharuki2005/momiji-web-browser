/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { getOpenTabs } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs"
);

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

function createFakeTab(url, title, lastAccessed) {
  return {
    linkedBrowser: {
      currentURI: {
        spec: url,
      },
    },
    label: title,
    lastAccessed,
  };
}

function createFakeWindow(tabs, closed = false) {
  return {
    closed,
    gBrowser: {
      tabs,
    },
  };
}

function setupPageDataServiceMock(sandbox, descriptionMap = {}) {
  const PageDataService = ChromeUtils.importESModule(
    "moz-src:///browser/components/pagedata/PageDataService.sys.mjs"
  ).PageDataService;

  sandbox.stub(PageDataService, "getCached").callsFake(url => {
    if (url in descriptionMap) {
      return { description: descriptionMap[url] };
    }
    return null;
  });

  sandbox.stub(PageDataService, "fetchPageData").callsFake(async url => {
    if (url in descriptionMap) {
      return { description: descriptionMap[url] };
    }
    return null;
  });
}

add_task(async function test_getOpenTabs_basic() {
  const BrowserWindowTracker = ChromeUtils.importESModule(
    "resource:///modules/BrowserWindowTracker.sys.mjs"
  ).BrowserWindowTracker;

  const sb = sinon.createSandbox();

  try {
    const fakeWindow = createFakeWindow([
      createFakeTab("https://example.com", "Example", 1000),
      createFakeTab("https://mozilla.org", "Mozilla", 2000),
      createFakeTab("https://firefox.com", "Firefox", 3000),
    ]);

    sb.stub(BrowserWindowTracker, "getTopWindow").returns(fakeWindow);
    setupPageDataServiceMock(sb, {
      "https://firefox.com": "Firefox browser homepage",
      "https://mozilla.org": "Mozilla organization site",
    });

    const tabs = await getOpenTabs();

    Assert.equal(tabs.length, 3, "Should return all 3 tabs");
    Assert.equal(tabs[0].url, "https://firefox.com", "Most recent tab first");
    Assert.equal(tabs[0].title, "Firefox", "Title should match");
    Assert.equal(
      tabs[0].description,
      "Firefox browser homepage",
      "Description should be fetched"
    );
    Assert.equal(tabs[1].url, "https://mozilla.org", "Second most recent tab");
    Assert.equal(
      tabs[1].description,
      "Mozilla organization site",
      "Description should be fetched"
    );
    Assert.equal(tabs[2].url, "https://example.com", "Least recent tab");
    Assert.equal(
      tabs[2].description,
      "",
      "Description should be empty when not available"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_getOpenTabs_filters_about_urls() {
  const BrowserWindowTracker = ChromeUtils.importESModule(
    "resource:///modules/BrowserWindowTracker.sys.mjs"
  ).BrowserWindowTracker;

  const sb = sinon.createSandbox();

  try {
    const fakeWindow = createFakeWindow([
      createFakeTab("https://example.com", "Example", 1000),
      createFakeTab("about:preferences", "Preferences", 2000),
      createFakeTab("about:config", "Config", 3000),
      createFakeTab("https://mozilla.org", "Mozilla", 4000),
      createFakeTab("about:blank", "Blank", 5000),
    ]);

    sb.stub(BrowserWindowTracker, "getTopWindow").returns(fakeWindow);
    setupPageDataServiceMock(sb);

    const tabs = await getOpenTabs();

    Assert.equal(
      tabs.length,
      2,
      "Should only return non-about: tabs (filtered 3)"
    );
    Assert.equal(
      tabs[0].url,
      "https://mozilla.org",
      "Should return mozilla.org"
    );
    Assert.equal(tabs[1].url, "https://example.com", "Should return example");
    Assert.ok(
      !tabs.some(t => t.url.startsWith("about:")),
      "No about: URLs in results"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_getOpenTabs_limits_to_n() {
  const BrowserWindowTracker = ChromeUtils.importESModule(
    "resource:///modules/BrowserWindowTracker.sys.mjs"
  ).BrowserWindowTracker;

  const sb = sinon.createSandbox();

  try {
    const tabs = [];
    for (let i = 0; i < 20; i++) {
      tabs.push(
        createFakeTab(`https://example${i}.com`, `Example ${i}`, i * 1000)
      );
    }
    const fakeWindow = createFakeWindow(tabs);

    sb.stub(BrowserWindowTracker, "getTopWindow").returns(fakeWindow);
    setupPageDataServiceMock(sb);

    const result = await getOpenTabs(10);

    Assert.equal(result.length, 10, "Should return at most 10 tabs");
    Assert.equal(
      result[0].url,
      "https://example19.com",
      "First tab should be most recent"
    );
    Assert.equal(
      result[9].url,
      "https://example10.com",
      "Last tab should be 10th most recent"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_getOpenTabs_default_limit() {
  const BrowserWindowTracker = ChromeUtils.importESModule(
    "resource:///modules/BrowserWindowTracker.sys.mjs"
  ).BrowserWindowTracker;

  const sb = sinon.createSandbox();

  try {
    const tabs = [];
    for (let i = 0; i < 20; i++) {
      tabs.push(
        createFakeTab(`https://example${i}.com`, `Example ${i}`, i * 1000)
      );
    }
    const fakeWindow = createFakeWindow(tabs);

    sb.stub(BrowserWindowTracker, "getTopWindow").returns(fakeWindow);
    setupPageDataServiceMock(sb);

    const result = await getOpenTabs();

    Assert.equal(result.length, 15, "Should default to 15 tabs");
  } finally {
    sb.restore();
  }
});

add_task(async function test_getOpenTabs_single_window_multiple_tabs() {
  const BrowserWindowTracker = ChromeUtils.importESModule(
    "resource:///modules/BrowserWindowTracker.sys.mjs"
  ).BrowserWindowTracker;

  const sb = sinon.createSandbox();

  try {
    const window1 = createFakeWindow([
      createFakeTab("https://tab1.com", "Tab1", 1000),
      createFakeTab("https://tab2.com", "Tab2", 2000),
      createFakeTab("https://tab3.com", "Tab3", 3000),
      createFakeTab("https://tab4.com", "Tab4", 4000),
    ]);

    sb.stub(BrowserWindowTracker, "getTopWindow").returns(window1);
    setupPageDataServiceMock(sb);

    const tabs = await getOpenTabs();

    Assert.equal(tabs.length, 4, "Should return all tabs from current window");
    Assert.equal(
      tabs[0].url,
      "https://tab4.com",
      "Most recent tab from current window"
    );
    Assert.equal(tabs[1].url, "https://tab3.com", "Second most recent");
    Assert.equal(tabs[2].url, "https://tab2.com", "Third most recent");
    Assert.equal(tabs[3].url, "https://tab1.com", "Least recent");
  } finally {
    sb.restore();
  }
});

add_task(async function test_getOpenTabs_closed_window() {
  const BrowserWindowTracker = ChromeUtils.importESModule(
    "resource:///modules/BrowserWindowTracker.sys.mjs"
  ).BrowserWindowTracker;

  const sb = sinon.createSandbox();

  try {
    const closedWindow = createFakeWindow(
      [createFakeTab("https://closed.com", "Closed", 2000)],
      true
    );

    sb.stub(BrowserWindowTracker, "getTopWindow").returns(closedWindow);
    setupPageDataServiceMock(sb);

    const tabs = await getOpenTabs();

    Assert.equal(tabs.length, 0, "Should return empty array for closed window");
  } finally {
    sb.restore();
  }
});

add_task(async function test_getOpenTabs_window_without_gBrowser() {
  const BrowserWindowTracker = ChromeUtils.importESModule(
    "resource:///modules/BrowserWindowTracker.sys.mjs"
  ).BrowserWindowTracker;

  const sb = sinon.createSandbox();

  try {
    const windowWithoutGBrowser = {
      closed: false,
      gBrowser: null,
    };

    sb.stub(BrowserWindowTracker, "getTopWindow").returns(
      windowWithoutGBrowser
    );
    setupPageDataServiceMock(sb);

    const tabs = await getOpenTabs();

    Assert.equal(
      tabs.length,
      0,
      "Should return empty array for window without gBrowser"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_getOpenTabs_empty_window() {
  const BrowserWindowTracker = ChromeUtils.importESModule(
    "resource:///modules/BrowserWindowTracker.sys.mjs"
  ).BrowserWindowTracker;

  const sb = sinon.createSandbox();

  try {
    const emptyWindow = createFakeWindow([]);

    sb.stub(BrowserWindowTracker, "getTopWindow").returns(emptyWindow);
    setupPageDataServiceMock(sb);

    const tabs = await getOpenTabs();

    Assert.equal(tabs.length, 0, "Should return empty array for no tabs");
  } finally {
    sb.restore();
  }
});

add_task(async function test_getOpenTabs_no_window() {
  const BrowserWindowTracker = ChromeUtils.importESModule(
    "resource:///modules/BrowserWindowTracker.sys.mjs"
  ).BrowserWindowTracker;

  const sb = sinon.createSandbox();

  try {
    sb.stub(BrowserWindowTracker, "getTopWindow").returns(null);
    setupPageDataServiceMock(sb);

    const tabs = await getOpenTabs();

    Assert.equal(tabs.length, 0, "Should return empty array when no window");
  } finally {
    sb.restore();
  }
});

add_task(async function test_getOpenTabs_return_structure() {
  const BrowserWindowTracker = ChromeUtils.importESModule(
    "resource:///modules/BrowserWindowTracker.sys.mjs"
  ).BrowserWindowTracker;

  const sb = sinon.createSandbox();

  try {
    const fakeWindow = createFakeWindow([
      createFakeTab("https://test.com", "Test Page", 1000),
    ]);

    sb.stub(BrowserWindowTracker, "getTopWindow").returns(fakeWindow);
    setupPageDataServiceMock(sb, {
      "https://test.com": "A test page description",
    });

    const tabs = await getOpenTabs();

    Assert.equal(tabs.length, 1, "Should return one tab");

    const tab = tabs[0];
    Assert.ok("url" in tab, "Tab should have url property");
    Assert.ok("title" in tab, "Tab should have title property");
    Assert.ok("description" in tab, "Tab should have description property");
    Assert.ok("lastAccessed" in tab, "Tab should have lastAccessed property");

    Assert.equal(typeof tab.url, "string", "url should be a string");
    Assert.equal(typeof tab.title, "string", "title should be a string");
    Assert.equal(
      typeof tab.description,
      "string",
      "description should be a string"
    );
    Assert.equal(
      typeof tab.lastAccessed,
      "number",
      "lastAccessed should be a number"
    );

    Assert.equal(tab.url, "https://test.com", "url value correct");
    Assert.equal(tab.title, "Test Page", "title value correct");
    Assert.equal(
      tab.description,
      "A test page description",
      "description should be fetched from PageDataService"
    );
    Assert.equal(tab.lastAccessed, 1000, "lastAccessed value correct");
  } finally {
    sb.restore();
  }
});
