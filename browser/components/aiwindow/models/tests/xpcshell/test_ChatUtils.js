/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

do_get_profile();

const {
  constructRealTimeInfoInjectionMessage,
  getLocalIsoTime,
  getCurrentTabMetadata,
  constructRelevantInsightsContextMessage,
  parseContentWithTokens,
  detectTokens,
} = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/ChatUtils.sys.mjs"
);
const { InsightsManager } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/InsightsManager.sys.mjs"
);
const { InsightStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/services/InsightStore.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

/**
 * Constants for test insights
 */
const TEST_INSIGHTS = [
  {
    insight_summary: "Loves drinking coffee",
    category: "Food & Drink",
    intent: "Plan / Organize",
    score: 3,
  },
  {
    insight_summary: "Buys dog food online",
    category: "Pets & Animals",
    intent: "Buy / Acquire",
    score: 4,
  },
];

/**
 * Helper function bulk-add insights
 */
async function clearAndAddInsights() {
  const insights = await InsightStore.getInsights();
  for (const insight of insights) {
    await InsightStore.hardDeleteInsight(insight.id);
  }
  for (const insight of TEST_INSIGHTS) {
    await InsightStore.addInsight(insight);
  }
}

/**
 * Constants for preference keys and test values
 */
const PREF_API_KEY = "browser.aiwindow.apiKey";
const PREF_ENDPOINT = "browser.aiwindow.endpoint";
const PREF_MODEL = "browser.aiwindow.model";

const API_KEY = "fake-key";
const ENDPOINT = "https://api.fake-endpoint.com/v1";
const MODEL = "fake-model";

add_setup(async function () {
  // Setup prefs used across multiple tests
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);
  Services.prefs.setStringPref(PREF_MODEL, MODEL);

  // Clear prefs after testing
  registerCleanupFunction(() => {
    for (let pref of [PREF_API_KEY, PREF_ENDPOINT, PREF_MODEL]) {
      if (Services.prefs.prefHasUserValue(pref)) {
        Services.prefs.clearUserPref(pref);
      }
    }
  });
});

add_task(function test_getLocalIsoTime_returns_offset_timestamp() {
  const sb = sinon.createSandbox();
  const clock = sb.useFakeTimers({ now: Date.UTC(2025, 11, 27, 14, 0, 0) });
  try {
    const iso = getLocalIsoTime();
    Assert.ok(
      typeof iso === "string" && !!iso.length,
      "Should return a non-empty string"
    );
    Assert.ok(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(iso),
      "Should include date, time (up to seconds), without timezone offset"
    );
  } finally {
    clock.restore();
    sb.restore();
  }
});

add_task(async function test_getCurrentTabMetadata_fetch_fallback() {
  const sb = sinon.createSandbox();
  const tracker = { getTopWindow: sb.stub() };
  const pageData = {
    getCached: sb.stub(),
    fetchPageData: sb.stub(),
  };
  const fakeBrowser = {
    currentURI: { spec: "https://example.com/article" },
    contentTitle: "",
    documentTitle: "Example Article",
  };

  tracker.getTopWindow.returns({
    gBrowser: { selectedBrowser: fakeBrowser },
  });
  pageData.getCached.returns(null);
  const fetchStub = pageData.fetchPageData.resolves({
    description: "Fetched description",
  });

  try {
    const result = await getCurrentTabMetadata({
      BrowserWindowTracker: tracker,
      PageDataService: pageData,
    });
    Assert.deepEqual(result, {
      url: "https://example.com/article",
      title: "Example Article",
      description: "Fetched description",
    });
    Assert.ok(fetchStub.calledOnce, "Should fetch description when not cached");
  } finally {
    sb.restore();
  }
});

add_task(
  async function test_constructRealTimeInfoInjectionMessage_with_tab_info() {
    const sb = sinon.createSandbox();
    const tracker = { getTopWindow: sb.stub() };
    const pageData = {
      getCached: sb.stub(),
      fetchPageData: sb.stub(),
    };
    const locale = Services.locale.appLocaleAsBCP47;
    const fakeBrowser = {
      currentURI: { spec: "https://mozilla.org" },
      contentTitle: "Mozilla",
      documentTitle: "Mozilla",
    };

    tracker.getTopWindow.returns({
      gBrowser: { selectedBrowser: fakeBrowser },
    });
    pageData.getCached.returns({
      description: "Internet for people",
    });
    const fetchStub = pageData.fetchPageData;
    const clock = sb.useFakeTimers({ now: Date.UTC(2025, 11, 27, 14, 0, 0) });

    try {
      const message = await constructRealTimeInfoInjectionMessage({
        BrowserWindowTracker: tracker,
        PageDataService: pageData,
      });
      Assert.equal(message.role, "system", "Should return system role");
      Assert.ok(
        message.content.includes(`Locale: ${locale}`),
        "Should include locale"
      );
      Assert.ok(
        message.content.includes("Current active browser tab details:"),
        "Should include tab details heading"
      );
      Assert.ok(
        message.content.includes("- URL: https://mozilla.org"),
        "Should include tab URL"
      );
      Assert.ok(
        message.content.includes("- Title: Mozilla"),
        "Should include tab title"
      );
      Assert.ok(
        message.content.includes("- Description: Internet for people"),
        "Should include tab description"
      );
      Assert.ok(
        fetchStub.notCalled,
        "Should not fetch when cached data exists"
      );
    } finally {
      clock.restore();
      sb.restore();
    }
  }
);

add_task(
  async function test_constructRealTimeInfoInjectionMessage_without_tab_info() {
    const sb = sinon.createSandbox();
    const tracker = { getTopWindow: sb.stub() };
    const pageData = {
      getCached: sb.stub(),
      fetchPageData: sb.stub(),
    };
    const locale = Services.locale.appLocaleAsBCP47;

    tracker.getTopWindow.returns(null);
    const clock = sb.useFakeTimers({ now: Date.UTC(2025, 11, 27, 14, 0, 0) });

    try {
      const message = await constructRealTimeInfoInjectionMessage({
        BrowserWindowTracker: tracker,
        PageDataService: pageData,
      });
      Assert.ok(
        message.content.includes("No active browser tab."),
        "Should mention missing tab info"
      );
      Assert.ok(
        !message.content.includes("- URL:"),
        "Should not include empty tab fields"
      );
      Assert.ok(
        message.content.includes(`Locale: ${locale}`),
        "Should include system locale"
      );
    } finally {
      clock.restore();
      sb.restore();
    }
  }
);

add_task(async function test_constructRelevantInsightsContextMessage() {
  await clearAndAddInsights();

  const sb = sinon.createSandbox();
  try {
    const fakeEngine = {
      run() {
        return {
          finalOutput: `{
            "categories": ["Food & Drink"],
            "intents": ["Plan / Organize"]
          }`,
        };
      },
    };

    // Stub the `ensureOpenAIEngine` method in InsightsManager
    const stub = sb
      .stub(InsightsManager, "ensureOpenAIEngine")
      .returns(fakeEngine);

    const relevantInsightsContextMessage =
      await constructRelevantInsightsContextMessage("I love drinking coffee");
    Assert.ok(stub.calledOnce, "ensureOpenAIEngine should be called once");

    // Check relevantInsightsContextMessage's top level structure
    Assert.strictEqual(
      typeof relevantInsightsContextMessage,
      "object",
      "Should return an object"
    );
    Assert.equal(
      Object.keys(relevantInsightsContextMessage).length,
      2,
      "Should have 2 keys"
    );

    // Check specific fields
    Assert.equal(
      relevantInsightsContextMessage.role,
      "system",
      "Should have role 'system'"
    );
    Assert.ok(
      typeof relevantInsightsContextMessage.content === "string" &&
        relevantInsightsContextMessage.content.length,
      "Content should be a non-empty string"
    );

    const content = relevantInsightsContextMessage.content;
    Assert.ok(
      content.includes(
        "Use them to personalized your response using the following guidelines:"
      ),
      "Relevant insights context prompt should pull from the correct base"
    );
    Assert.ok(
      content.includes("- Loves drinking coffee"),
      "Content should include relevant insight"
    );
    Assert.ok(
      !content.includes("- Buys dog food online"),
      "Content should not include non-relevant insight"
    );
  } finally {
    sb.restore();
  }
});

add_task(
  async function test_constructRelevantInsightsContextMessage_no_relevant_insights() {
    await clearAndAddInsights();

    const sb = sinon.createSandbox();
    try {
      const fakeEngine = {
        run() {
          return {
            finalOutput: `{
            "categories": ["Health & Fitness"],
            "intents": ["Plan / Organize"]
          }`,
          };
        },
      };

      // Stub the `ensureOpenAIEngine` method in InsightsManager
      const stub = sb
        .stub(InsightsManager, "ensureOpenAIEngine")
        .returns(fakeEngine);

      const relevantInsightsContextMessage =
        await constructRelevantInsightsContextMessage("I love drinking coffee");
      Assert.ok(stub.calledOnce, "ensureOpenAIEngine should be called once");

      // No relevant insights, so returned value should be null
      Assert.equal(
        relevantInsightsContextMessage,
        null,
        "Should return null when there are no relevant insights"
      );
    } finally {
      sb.restore();
    }
  }
);

add_task(async function test_parseContentWithTokens_no_tokens() {
  const content = "This is a regular message with no special tokens.";
  const result = await parseContentWithTokens(content);

  Assert.equal(
    result.cleanContent,
    content,
    "Clean content should match original when no tokens present"
  );
  Assert.equal(result.searchQueries.length, 0, "Should have no search queries");
  Assert.equal(result.usedInsights.length, 0, "Should have no used insights");
});

add_task(async function test_parseContentWithTokens_single_search_token() {
  const content =
    "You can find great coffee in the downtown area.§search: best coffee shops near me§";
  const result = await parseContentWithTokens(content);

  Assert.equal(
    result.cleanContent,
    "You can find great coffee in the downtown area.",
    "Should remove search token from content"
  );
  Assert.equal(result.searchQueries.length, 1, "Should have one search query");
  Assert.equal(
    result.searchQueries[0],
    "best coffee shops near me",
    "Should extract correct search query"
  );
  Assert.equal(result.usedInsights.length, 0, "Should have no used insights");
});

add_task(async function test_parseContentWithTokens_single_insight_token() {
  const content =
    "I recommend trying herbal tea blends.§existing_insight: likes tea§";
  const result = await parseContentWithTokens(content);

  Assert.equal(
    result.cleanContent,
    "I recommend trying herbal tea blends.",
    "Should remove insight token from content"
  );
  Assert.equal(result.searchQueries.length, 0, "Should have no search queries");
  Assert.equal(result.usedInsights.length, 1, "Should have one used insight");
  Assert.equal(
    result.usedInsights[0],
    "likes tea",
    "Should extract correct insight"
  );
});

add_task(async function test_parseContentWithTokens_multiple_mixed_tokens() {
  const content =
    "I recommend checking out organic coffee options.§existing_insight: prefers organic§ They have great flavor profiles.§search: organic coffee beans reviews§§search: best organic cafes nearby§";
  const result = await parseContentWithTokens(content);

  Assert.equal(
    result.cleanContent,
    "I recommend checking out organic coffee options. They have great flavor profiles.",
    "Should remove all tokens from content"
  );
  Assert.equal(
    result.searchQueries.length,
    2,
    "Should have two search queries"
  );
  Assert.deepEqual(
    result.searchQueries,
    ["organic coffee beans reviews", "best organic cafes nearby"],
    "Should extract search queries in correct order"
  );
  Assert.equal(result.usedInsights.length, 1, "Should have one used insight");
  Assert.equal(
    result.usedInsights[0],
    "prefers organic",
    "Should extract correct insight"
  );
});

add_task(async function test_parseContentWithTokens_tokens_with_whitespace() {
  const content =
    "You can find more details online.§search:   coffee brewing methods   §";
  const result = await parseContentWithTokens(content);

  Assert.equal(
    result.cleanContent,
    "You can find more details online.",
    "Should remove token with whitespace"
  );
  Assert.equal(result.searchQueries.length, 1, "Should have one search query");
  Assert.equal(
    result.searchQueries[0],
    "coffee brewing methods",
    "Should trim whitespace from extracted query"
  );
});

add_task(async function test_parseContentWithTokens_adjacent_tokens() {
  const content =
    "Here are some great Italian dining options.§existing_insight: prefers italian food§§search: local italian restaurants§";
  const result = await parseContentWithTokens(content);

  Assert.equal(
    result.cleanContent,
    "Here are some great Italian dining options.",
    "Should remove adjacent tokens"
  );
  Assert.equal(result.searchQueries.length, 1, "Should have one search query");
  Assert.equal(
    result.searchQueries[0],
    "local italian restaurants",
    "Should extract search query"
  );
  Assert.equal(result.usedInsights.length, 1, "Should have one insight");
  Assert.equal(
    result.usedInsights[0],
    "prefers italian food",
    "Should extract insight"
  );
});

add_task(function test_detectTokens_basic_pattern() {
  const content =
    "There are many great options available.§search: coffee shops near downtown§§search: best rated restaurants§";
  const searchRegex = /§search:\s*([^§]+)§/gi;
  const result = detectTokens(content, searchRegex, "query");

  Assert.equal(result.length, 2, "Should find two matches");
  Assert.equal(
    result[0].query,
    "coffee shops near downtown",
    "First match should extract correct query"
  );
  Assert.equal(
    result[0].fullMatch,
    "§search: coffee shops near downtown§",
    "First match should include full match"
  );
  Assert.equal(
    result[0].startIndex,
    39,
    "First match should have correct start index"
  );
  Assert.equal(
    result[1].query,
    "best rated restaurants",
    "Second match should extract correct query"
  );
});

add_task(function test_detectTokens_custom_key() {
  const content =
    "I recommend trying the Thai curry.§insight: prefers spicy food§";
  const insightRegex = /§insight:\s*([^§]+)§/gi;
  const result = detectTokens(content, insightRegex, "customKey");

  Assert.equal(result.length, 1, "Should find one match");
  Assert.equal(
    result[0].customKey,
    "prefers spicy food",
    "Should use custom key for extracted value"
  );
  Assert.ok(
    result[0].hasOwnProperty("customKey"),
    "Result should have the custom key property"
  );
  Assert.ok(
    !result[0].hasOwnProperty("query"),
    "Result should not have default 'query' property"
  );
});
