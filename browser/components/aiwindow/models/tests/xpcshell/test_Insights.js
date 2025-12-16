/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

do_get_profile();

const { ChatStore, ChatMessage, MESSAGE_ROLE } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ChatStore.sys.mjs"
);
const {
  getRecentHistory,
  generateProfileInputs,
  aggregateSessions,
  topkAggregates,
} = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/InsightsHistorySource.sys.mjs"
);
const { getRecentChats } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/InsightsChatSource.sys.mjs"
);
const { openAIEngine } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const { CATEGORIES, INTENTS } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/InsightsConstants.sys.mjs"
);

const {
  formatListForPrompt,
  getFormattedInsightAttributeList,
  renderRecentHistoryForPrompt,
  renderRecentConversationForPrompt,
  mapFilteredInsightsToInitialList,
  buildInitialInsightsGenerationPrompt,
  buildInsightsDeduplicationPrompt,
  buildInsightsSensitivityFilterPrompt,
  generateInitialInsightsList,
  deduplicateInsights,
  filterSensitiveInsights,
} = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Insights.sys.mjs"
);

/**
 * Constants for preference keys and test values
 */
const PREF_API_KEY = "browser.aiwindow.apiKey";
const PREF_ENDPOINT = "browser.aiwindow.endpoint";
const PREF_MODEL = "browser.aiwindow.model";

const API_KEY = "fake-key";
const ENDPOINT = "https://api.fake-endpoint.com/v1";
const MODEL = "fake-model";

const EXISTING_INSIGHTS = [
  "Loves outdoor activities",
  "Enjoys cooking recipes",
  "Like sci-fi media",
];
const NEW_INSIGHTS = [
  "Loves hiking and camping",
  "Reads science fiction novels",
  "Likes both dogs and cats",
  "Likes risky stock bets",
];

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

/**
 * Builds fake browsing history data for testing
 */
async function buildFakeBrowserHistory() {
  const now = Date.now();

  const seeded = [
    {
      url: "https://www.google.com/search?q=firefox+history",
      title: "Google Search: firefox history",
      visits: [{ date: new Date(now - 5 * 60 * 1000) }],
    },
    {
      url: "https://news.ycombinator.com/",
      title: "Hacker News",
      visits: [{ date: new Date(now - 15 * 60 * 1000) }],
    },
    {
      url: "https://mozilla.org/en-US/",
      title: "Internet for people, not profit — Mozilla",
      visits: [{ date: new Date(now - 25 * 60 * 1000) }],
    },
  ];
  await PlacesUtils.history.clear();
  await PlacesUtils.history.insertMany(seeded);
}

/**
 * Shortcut for full browser history aggregation pipeline
 */
async function getBrowserHistoryAggregates() {
  const profileRecords = await getRecentHistory();
  const profilePreparedInputs = await generateProfileInputs(profileRecords);
  const [domainAgg, titleAgg, searchAgg] = aggregateSessions(
    profilePreparedInputs
  );

  return await topkAggregates(domainAgg, titleAgg, searchAgg);
}

/**
 * Builds fake chat history data for testing
 */
async function buildFakeChatHistory() {
  const fixedNow = 1_700_000_000_000;

  return [
    new ChatMessage({
      createdDate: fixedNow - 1_000,
      ordinal: 1,
      role: MESSAGE_ROLE.USER,
      content: { type: "text", body: "I like dogs." },
      pageUrl: "https://example.com/1",
      turnIndex: 0,
    }),
    new ChatMessage({
      createdDate: fixedNow - 10_000,
      ordinal: 2,
      role: MESSAGE_ROLE.USER,
      content: { type: "text", body: "I also like cats." },
      pageUrl: "https://example.com/2",
      turnIndex: 0,
    }),
    new ChatMessage({
      createdDate: fixedNow - 100_000,
      ordinal: 3,
      role: MESSAGE_ROLE.USER,
      content: {
        type: "text",
        body: "Tell me a joke about my favorite animals.",
      },
      pageUrl: "https://example.com/3",
      turnIndex: 0,
    }),
  ];
}

/**
 * Tests building the prompt for initial insights generation
 */
add_task(async function test_buildInitialInsightsGenerationPrompt() {
  // Check that history is rendered correctly into CSV tables
  await buildFakeBrowserHistory();
  const [domainItems, titleItems, searchItems] =
    await getBrowserHistoryAggregates();
  const renderedBrowserHistory = await renderRecentHistoryForPrompt(
    domainItems,
    titleItems,
    searchItems
  );
  Assert.equal(
    renderedBrowserHistory,
    `# Domains
Domain,Importance Score
www.google.com,100
news.ycombinator.com,100
mozilla.org,100

# Titles
Title,Importance Score
Google Search: firefox history,100
Hacker News,100
Internet for people, not profit — Mozilla,100

# Searches
Search,Importance Score
Google Search: firefox history,1`.trim()
  );

  // Check that the full prompt is built correctly with injected categories, intents, and browsing history
  const sources = { history: [domainItems, titleItems, searchItems] };
  const initialInsightsPrompt =
    await buildInitialInsightsGenerationPrompt(sources);
  Assert.ok(
    initialInsightsPrompt.includes(
      "You are an expert at extracting insights from user browser data."
    ),
    "Initial insights generation prompt should pull from the correct base"
  );
  Assert.ok(
    initialInsightsPrompt.includes(
      getFormattedInsightAttributeList(CATEGORIES)
    ),
    "Prompt should include formatted categories list"
  );
  Assert.ok(
    initialInsightsPrompt.includes(getFormattedInsightAttributeList(INTENTS)),
    "Prompt should include formatted intents list"
  );
  Assert.ok(
    initialInsightsPrompt.includes(renderedBrowserHistory),
    "Prompt should include rendered browsing history"
  );
});

/**
 * Tests rendering history as CSV when only search data is present
 */
add_task(async function test_buildRecentHistoryCSV_only_search() {
  const now = Date.now();
  const seeded = [
    {
      url: "https://www.google.com/search?q=firefox+history",
      title: "Google Search: firefox history",
      visits: [{ date: new Date(now - 5 * 60 * 1000) }],
    },
  ];
  await PlacesUtils.history.clear();
  await PlacesUtils.history.insertMany(seeded);

  const [domainItems, titleItems, searchItems] =
    await getBrowserHistoryAggregates();
  const renderedBrowserHistory = await renderRecentHistoryForPrompt(
    domainItems,
    titleItems,
    searchItems
  );
  Assert.equal(
    renderedBrowserHistory,
    `# Domains
Domain,Importance Score
www.google.com,100

# Titles
Title,Importance Score
Google Search: firefox history,100

# Searches
Search,Importance Score
Google Search: firefox history,1`.trim()
  );
});

/**
 * Tests rendering history as CSV when only history data is present
 */
add_task(async function test_buildRecentHistoryCSV_only_browsing_history() {
  const now = Date.now();
  const seeded = [
    {
      url: "https://news.ycombinator.com/",
      title: "Hacker News",
      visits: [{ date: new Date(now - 15 * 60 * 1000) }],
    },
    {
      url: "https://mozilla.org/en-US/",
      title: "Internet for people, not profit — Mozilla",
      visits: [{ date: new Date(now - 25 * 60 * 1000) }],
    },
  ];
  await PlacesUtils.history.clear();
  await PlacesUtils.history.insertMany(seeded);

  const [domainItems, titleItems, searchItems] =
    await getBrowserHistoryAggregates();
  const renderedBrowserHistory = await renderRecentHistoryForPrompt(
    domainItems,
    titleItems,
    searchItems
  );
  Assert.equal(
    renderedBrowserHistory,
    `# Domains
Domain,Importance Score
news.ycombinator.com,100
mozilla.org,100

# Titles
Title,Importance Score
Hacker News,100
Internet for people, not profit — Mozilla,100`.trim()
  );
});

/**
 * Tests building the prompt for initial insights generation with only chat data
 */
add_task(async function test_buildInitialInsightsGenerationPrompt_only_chat() {
  const messages = await buildFakeChatHistory();
  const sb = sinon.createSandbox();
  const maxResults = 3;
  const halfLifeDays = 7;
  const startTime = 1_700_000_000_000 - 1_000_000;

  try {
    // Stub the method
    const stub = sb
      .stub(ChatStore.prototype, "findMessagesByDate")
      .callsFake(async () => {
        return messages;
      });

    const recentMessages = await getRecentChats(
      startTime,
      maxResults,
      halfLifeDays
    );

    // Assert stub was actually called
    Assert.equal(stub.callCount, 1, "findMessagesByDate should be called once");

    // Double check we get only the 3 expected messages back
    Assert.equal(recentMessages.length, 3, "Should return 3 chat messages");

    // Render the messages into CSV format and check correctness
    const renderedConversationHistory =
      await renderRecentConversationForPrompt(recentMessages);
    Assert.equal(
      renderedConversationHistory,
      `# Chat History
Message
I like dogs.
I also like cats.
Tell me a joke about my favorite animals.`.trim(),
      "Rendered conversation history should match expected CSV format"
    );

    // Build the actual prompt and check its contents
    const sources = { conversation: recentMessages };
    const initialInsightsPrompt =
      await buildInitialInsightsGenerationPrompt(sources);
    Assert.ok(
      initialInsightsPrompt.includes(
        "You are an expert at extracting insights from user browser data."
      ),
      "Initial insights generation prompt should pull from the correct base"
    );
    Assert.ok(
      initialInsightsPrompt.includes(renderedConversationHistory),
      "Prompt should include rendered conversation history"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests building the prompt for insights deduplication
 */
add_task(async function test_buildInsightsDeduplicationPrompt() {
  const insightsDeduplicationPrompt = await buildInsightsDeduplicationPrompt(
    EXISTING_INSIGHTS,
    NEW_INSIGHTS
  );
  Assert.ok(
    insightsDeduplicationPrompt.includes(
      "You are an expert at identifying duplicate statements."
    ),
    "Insights deduplication prompt should pull from the correct base"
  );
  Assert.ok(
    insightsDeduplicationPrompt.includes(
      formatListForPrompt(EXISTING_INSIGHTS)
    ),
    "Deduplication prompt should include existing insights list"
  );
  Assert.ok(
    insightsDeduplicationPrompt.includes(formatListForPrompt(NEW_INSIGHTS)),
    "Deduplication prompt should include new insights list"
  );
});

/**
 * Tests building the prompt for insights sensitivity filtering
 */
add_task(async function test_buildInsightsSensitivityFilterPrompt() {
  /** Insights sensitivity filter prompt */
  const insightsSensitivityFilterPrompt =
    await buildInsightsSensitivityFilterPrompt(NEW_INSIGHTS);
  Assert.ok(
    insightsSensitivityFilterPrompt.includes(
      "You are an expert at identifying sensitive statements and content."
    ),
    "Insights sensitivity filter prompt should pull from the correct base"
  );
  Assert.ok(
    insightsSensitivityFilterPrompt.includes(formatListForPrompt(NEW_INSIGHTS)),
    "Sensitivity filter prompt should include insights list"
  );
});

/**
 * Tests successful initial insights generation
 */
add_task(async function test_generateInitialInsightsList_happy_path() {
  const sb = sinon.createSandbox();
  try {
    /**
     * The fake engine returns canned LLM response.
     * The main `generateInitialInsightsList` function should modify this heavily, cutting it back to only the required fields.
     */
    const fakeEngine = {
      run() {
        return {
          finalOutput: `[
  {
    "why": "User has recently searched for Firefox history and visited mozilla.org.",
    "category": "Internet & Telecom",
    "intent": "Research / Learn",
    "insight_summary": "Searches for Firefox information",
    "score": 7,
    "evidence": [
      {
        "type": "search",
        "value": "Google Search: firefox history"
      },
      {
        "type": "domain",
        "value": "mozilla.org"
      }
    ]
  },
  {
    "why": "User buys dog food online regularly from multiple sources.",
    "category": "Pets & Animals",
    "intent": "Buy / Acquire",
    "insight_summary": "Purchases dog food online",
    "score": -1,
    "evidence": [
      {
        "type": "domain",
        "value": "example.com"
      }
    ]
  }
]`,
        };
      },
    };

    // Check that the stub was called
    const stub = sb.stub(openAIEngine, "_createEngine").returns(fakeEngine);
    const engine = await openAIEngine.build();
    Assert.ok(stub.calledOnce, "_createEngine should be called once");

    const [domainItems, titleItems, searchItems] =
      await getBrowserHistoryAggregates();
    const sources = { history: [domainItems, titleItems, searchItems] };
    const insightsList = await generateInitialInsightsList(engine, sources);

    // Check top level structure
    Assert.ok(
      Array.isArray(insightsList),
      "Should return an array of insights"
    );
    Assert.equal(insightsList.length, 2, "Array should contain 2 insights");

    // Check first insight structure and content
    const firstInsight = insightsList[0];
    Assert.equal(
      typeof firstInsight,
      "object",
      "First insight should be an object/map"
    );
    Assert.equal(
      Object.keys(firstInsight).length,
      4,
      "First insight should have 4 keys"
    );
    Assert.equal(
      firstInsight.category,
      "Internet & Telecom",
      "First insight should have expected category (Internet & Telecom)"
    );
    Assert.equal(
      firstInsight.intent,
      "Research / Learn",
      "First insight should have expected intent (Research / Learn)"
    );
    Assert.equal(
      firstInsight.insight_summary,
      "Searches for Firefox information",
      "First insight should have expected summary"
    );
    Assert.equal(
      firstInsight.score,
      5,
      "First insight should have expected score, clamping 7 to 5"
    );

    // Check that the second insight's score was clamped to the minimum
    const secondInsight = insightsList[1];
    Assert.equal(
      secondInsight.score,
      1,
      "Second insight should have expected score, clamping -1 to 1"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests failed initial insights generation - Empty output
 */
add_task(
  async function test_generateInitialInsightsList_sad_path_empty_output() {
    const sb = sinon.createSandbox();
    try {
      // LLM returns an empty insights list
      const fakeEngine = {
        run() {
          return {
            finalOutput: `[]`,
          };
        },
      };

      // Check that the stub was called
      const stub = sb.stub(openAIEngine, "_createEngine").returns(fakeEngine);
      const engine = await openAIEngine.build();
      Assert.ok(stub.calledOnce, "_createEngine should be called once");

      const [domainItems, titleItems, searchItems] =
        await getBrowserHistoryAggregates();
      const sources = { history: [domainItems, titleItems, searchItems] };
      const insightsList = await generateInitialInsightsList(engine, sources);

      Assert.equal(Array.isArray(insightsList), true, "Should return an array");
      Assert.equal(insightsList.length, 0, "Array should contain 0 insights");
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests failed initial insights generation - Output not array
 */
add_task(
  async function test_generateInitialInsightsList_sad_path_output_not_array() {
    const sb = sinon.createSandbox();
    try {
      // LLM doesn't return an array
      const fakeEngine = {
        run() {
          return {
            finalOutput: `testing`,
          };
        },
      };

      // Check that the stub was called
      const stub = sb.stub(openAIEngine, "_createEngine").returns(fakeEngine);
      const engine = await openAIEngine.build();
      Assert.ok(stub.calledOnce, "_createEngine should be called once");

      const [domainItems, titleItems, searchItems] =
        await getBrowserHistoryAggregates();
      const sources = { history: [domainItems, titleItems, searchItems] };
      const insightsList = await generateInitialInsightsList(engine, sources);

      Assert.equal(Array.isArray(insightsList), true, "Should return an array");
      Assert.equal(insightsList.length, 0, "Array should contain 0 insights");
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests failed initial insights generation - Output not array of maps
 */
add_task(
  async function test_generateInitialInsightsList_sad_path_output_not_array_of_maps() {
    const sb = sinon.createSandbox();
    try {
      // LLM doesn't return an array of maps
      const fakeEngine = {
        run() {
          return {
            finalOutput: `["testing1", "testing2", ["testing3"]]`,
          };
        },
      };

      // Check that the stub was called
      const stub = sb.stub(openAIEngine, "_createEngine").returns(fakeEngine);
      const engine = await openAIEngine.build();
      Assert.ok(stub.calledOnce, "_createEngine should be called once");

      const [domainItems, titleItems, searchItems] =
        await getBrowserHistoryAggregates();
      const sources = { history: [domainItems, titleItems, searchItems] };
      const insightsList = await generateInitialInsightsList(engine, sources);

      Assert.equal(Array.isArray(insightsList), true, "Should return an array");
      Assert.equal(insightsList.length, 0, "Array should contain 0 insights");
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests failed initial insights generation - Some correct insights
 */
add_task(
  async function test_generateInitialInsightsList_sad_path_some_correct_insights() {
    const sb = sinon.createSandbox();
    try {
      // LLM returns an insights list where 1 is fully correct and 1 is missing required keys (category in this case)
      const fakeEngine = {
        run() {
          return {
            finalOutput: `[
  {
    "why": "User has recently searched for Firefox history and visited mozilla.org.",
    "intent": "Research / Learn",
    "insight_summary": "Searches for Firefox information",
    "score": 7,
    "evidence": [
      {
        "type": "search",
        "value": "Google Search: firefox history"
      },
      {
        "type": "domain",
        "value": "mozilla.org"
      }
    ]
  },
  {
    "why": "User buys dog food online regularly from multiple sources.",
    "category": "Pets & Animals",
    "intent": "Buy / Acquire",
    "insight_summary": "Purchases dog food online",
    "score": -1,
    "evidence": [
      {
        "type": "domain",
        "value": "example.com"
      }
    ]
  }
]`,
          };
        },
      };

      // Check that the stub was called
      const stub = sb.stub(openAIEngine, "_createEngine").returns(fakeEngine);
      const engine = await openAIEngine.build();
      Assert.ok(stub.calledOnce, "_createEngine should be called once");

      const [domainItems, titleItems, searchItems] =
        await getBrowserHistoryAggregates();
      const sources = { history: [domainItems, titleItems, searchItems] };
      const insightsList = await generateInitialInsightsList(engine, sources);

      Assert.equal(
        Array.isArray(insightsList),
        true,
        "Should return an array of insights"
      );
      Assert.equal(insightsList.length, 1, "Array should contain 1 insight");
      Assert.equal(
        insightsList[0].insight_summary,
        "Purchases dog food online",
        "Insight summary should match the valid insight"
      );
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests successful insights deduplication
 */
add_task(async function test_deduplicateInsightsList_happy_path() {
  const sb = sinon.createSandbox();
  try {
    /**
     * The fake engine that returns a canned LLM response for deduplication.
     * The `deduplicateInsights` function should return an array containing only the `main_insight` values.
     */
    const fakeEngine = {
      run() {
        return {
          finalOutput: `{
            "unique_insights": [
              {
                "main_insight": "Loves outdoor activities",
                "duplicates": ["Loves hiking and camping"]
              },
              {
                "main_insight": "Enjoys cooking recipes",
                "duplicates": []
              },
              {
                "main_insight": "Like sci-fi media",
                "duplicates": ["Reads science fiction novels"]
              },
              {
                "main_insight": "Likes both dogs and cats",
                "duplicates": []
              },
              {
                "main_insight": "Likes risky stock bets",
                "duplicates": []
              }
            ]
          }`,
        };
      },
    };

    // Check that the stub was called
    const stub = sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);
    const engine = await openAIEngine.build();
    Assert.ok(stub.calledOnce, "_createEngine should be called once");

    const dedupedInsightsList = await deduplicateInsights(
      engine,
      EXISTING_INSIGHTS,
      NEW_INSIGHTS
    );

    // Check that the deduplicated list contains only unique insights (`main_insight` values)
    Assert.equal(
      dedupedInsightsList.length,
      5,
      "Deduplicated insights list should contain 5 unique insights"
    );
    Assert.ok(
      dedupedInsightsList.includes("Loves outdoor activities"),
      "Deduplicated insights should include 'Loves outdoor activities'"
    );
    Assert.ok(
      dedupedInsightsList.includes("Enjoys cooking recipes"),
      "Deduplicated insights should include 'Enjoys cooking recipes'"
    );
    Assert.ok(
      dedupedInsightsList.includes("Like sci-fi media"),
      "Deduplicated insights should include 'Like sci-fi media'"
    );
    Assert.ok(
      dedupedInsightsList.includes("Likes both dogs and cats"),
      "Deduplicated insights should include 'Likes both dogs and cats'"
    );
    Assert.ok(
      dedupedInsightsList.includes("Likes risky stock bets"),
      "Deduplicated insights should include 'Likes risky stock bets'"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests failed insights deduplication - Empty output
 */
add_task(async function test_deduplicateInsightsList_sad_path_empty_output() {
  const sb = sinon.createSandbox();
  try {
    // LLM returns the correct schema but with an empty unique_insights array
    const fakeEngine = {
      run() {
        return {
          finalOutput: `{
            "unique_insights": []
          }`,
        };
      },
    };

    // Check that the stub was called
    const stub = sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);
    const engine = await openAIEngine.build();
    Assert.ok(stub.calledOnce, "_createEngine should be called once");

    const dedupedInsightsList = await deduplicateInsights(
      engine,
      EXISTING_INSIGHTS,
      NEW_INSIGHTS
    );

    Assert.ok(Array.isArray(dedupedInsightsList), "Should return an array");
    Assert.equal(dedupedInsightsList.length, 0, "Should return an empty array");
  } finally {
    sb.restore();
  }
});

/**
 * Tests failed insights deduplication - Wrong top-level data type
 */
add_task(
  async function test_deduplicateInsightsList_sad_path_wrong_top_level_data_type() {
    const sb = sinon.createSandbox();
    try {
      // LLM returns an incorrect data type
      const fakeEngine = {
        run() {
          return {
            finalOutput: `testing`,
          };
        },
      };

      // Check that the stub was called
      const stub = sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);
      const engine = await openAIEngine.build();
      Assert.ok(stub.calledOnce, "_createEngine should be called once");

      const dedupedInsightsList = await deduplicateInsights(
        engine,
        EXISTING_INSIGHTS,
        NEW_INSIGHTS
      );

      Assert.ok(Array.isArray(dedupedInsightsList), "Should return an array");
      Assert.equal(
        dedupedInsightsList.length,
        0,
        "Should return an empty array"
      );
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests failed insights deduplication - Wrong inner data type
 */
add_task(
  async function test_deduplicateInsightsList_sad_path_wrong_inner_data_type() {
    const sb = sinon.createSandbox();
    try {
      // LLM returns a map with the right top-level key, but the inner structure is wrong
      const fakeEngine = {
        run() {
          return {
            finalOutput: `{
            "unique_insights": "testing"
          }`,
          };
        },
      };

      // Check that the stub was called
      const stub = sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);
      const engine = await openAIEngine.build();
      Assert.ok(stub.calledOnce, "_createEngine should be called once");

      const dedupedInsightsList = await deduplicateInsights(
        engine,
        EXISTING_INSIGHTS,
        NEW_INSIGHTS
      );

      Assert.ok(Array.isArray(dedupedInsightsList), "Should return an array");
      Assert.equal(
        dedupedInsightsList.length,
        0,
        "Should return an empty array"
      );
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests failed insights deduplication - Wrong inner array structure
 */
add_task(
  async function test_deduplicateInsightsList_sad_path_wrong_inner_array_structure() {
    const sb = sinon.createSandbox();
    try {
      // LLM returns a map of nested arrays, but the array structure is wrong
      const fakeEngine = {
        run() {
          return {
            finalOutput: `{
            "unique_insights": ["testing1", "testing2"]
          }`,
          };
        },
      };

      // Check that the stub was called
      const stub = sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);
      const engine = await openAIEngine.build();
      Assert.ok(stub.calledOnce, "_createEngine should be called once");

      const dedupedInsightsList = await deduplicateInsights(
        engine,
        EXISTING_INSIGHTS,
        NEW_INSIGHTS
      );

      Assert.ok(Array.isArray(dedupedInsightsList), "Should return an array");
      Assert.equal(
        dedupedInsightsList.length,
        0,
        "Should return an empty array"
      );
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests failed insights deduplication - Incorrect top-level schema key
 */
add_task(
  async function test_deduplicateInsightsList_sad_path_bad_top_level_key() {
    const sb = sinon.createSandbox();
    try {
      // LLm returns correct output except that the top-level key is wrong
      const fakeEngine = {
        run() {
          return {
            finalOutput: `{
            "correct_insights": [
              {
                "main_insight": "Loves outdoor activities",
                "duplicates": ["Loves hiking and camping"]
              },
              {
                "main_insight": "Enjoys cooking recipes",
                "duplicates": []
              },
              {
                "main_insight": "Like sci-fi media",
                "duplicates": ["Reads science fiction novels"]
              },
              {
                "main_insight": "Likes both dogs and cats",
                "duplicates": []
              },
              {
                "main_insight": "Likes risky stock bets",
                "duplicates": []
              }
            ]
          }`,
          };
        },
      };

      // Check that the stub was called
      const stub = sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);
      const engine = await openAIEngine.build();
      Assert.ok(stub.calledOnce, "_createEngine should be called once");

      const dedupedInsightsList = await deduplicateInsights(
        engine,
        EXISTING_INSIGHTS,
        NEW_INSIGHTS
      );

      Assert.ok(Array.isArray(dedupedInsightsList), "Should return an array");
      Assert.equal(
        dedupedInsightsList.length,
        0,
        "Should return an empty array"
      );
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests failed insights deduplication - Some correct inner schema
 */
add_task(
  async function test_deduplicateInsightsList_sad_path_bad_some_correct_inner_schema() {
    const sb = sinon.createSandbox();
    try {
      // LLm returns correct output except that 1 of the inner maps is wrong and 1 main_insight is the wrong data type
      const fakeEngine = {
        run() {
          return {
            finalOutput: `{
            "unique_insights": [
              {
                "primary_insight": "Loves outdoor activities",
                "duplicates": ["Loves hiking and camping"]
              },
              {
                "main_insight": "Enjoys cooking recipes",
                "duplicates": []
              },
              {
                "main_insight": 12345,
                "duplicates": []
              }
            ]
          }`,
          };
        },
      };

      // Check that the stub was called
      const stub = sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);
      const engine = await openAIEngine.build();
      Assert.ok(stub.calledOnce, "_createEngine should be called once");

      const dedupedInsightsList = await deduplicateInsights(
        engine,
        EXISTING_INSIGHTS,
        NEW_INSIGHTS
      );

      Assert.ok(Array.isArray(dedupedInsightsList), "Should return an array");
      Assert.equal(
        dedupedInsightsList.length,
        1,
        "Should return an array with one valid insight"
      );
      Assert.equal(
        dedupedInsightsList[0],
        "Enjoys cooking recipes",
        "Should return the single valid insight"
      );
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests successful insights sensitivity filtering
 */
add_task(async function test_filterSensitiveInsights_happy_path() {
  const sb = sinon.createSandbox();
  try {
    /**
     * The fake engine that returns a canned LLM response for deduplication.
     * The `filterSensitiveInsights` function should return the inner array from `non_sensitive_insights`.
     */
    const fakeEngine = {
      run() {
        return {
          finalOutput: `{
  "non_sensitive_insights": [
    "Loves hiking and camping",
    "Reads science fiction novels",
    "Likes both dogs and cats"
  ]
}`,
        };
      },
    };

    // Check that the stub was called
    const stub = sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);
    const engine = await openAIEngine.build();
    Assert.ok(stub.calledOnce, "_createEngine should be called once");

    const nonSensitiveInsightsList = await filterSensitiveInsights(
      engine,
      NEW_INSIGHTS
    );

    // Check that the non-sensitive insights list contains only non-sensitive insights
    Assert.equal(
      nonSensitiveInsightsList.length,
      3,
      "Non-sensitive insights list should contain 3 insights"
    );
    Assert.ok(
      nonSensitiveInsightsList.includes("Loves hiking and camping"),
      "Non-sensitive insights should include 'Loves hiking and camping'"
    );
    Assert.ok(
      nonSensitiveInsightsList.includes("Reads science fiction novels"),
      "Non-sensitive insights should include 'Reads science fiction novels'"
    );
    Assert.ok(
      nonSensitiveInsightsList.includes("Likes both dogs and cats"),
      "Non-sensitive insights should include 'Likes both dogs and cats'"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests failed insights sensitivity filtering - Empty output
 */
add_task(async function test_filterSensitiveInsights_sad_path_empty_output() {
  const sb = sinon.createSandbox();
  try {
    // LLM returns an empty non_sensitive_insights array
    const fakeEngine = {
      run() {
        return {
          finalOutput: `{
  "non_sensitive_insights": []
}`,
        };
      },
    };

    // Check that the stub was called
    const stub = sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);
    const engine = await openAIEngine.build();
    Assert.ok(stub.calledOnce, "_createEngine should be called once");

    const nonSensitiveInsightsList = await filterSensitiveInsights(
      engine,
      NEW_INSIGHTS
    );

    Assert.ok(
      Array.isArray(nonSensitiveInsightsList),
      "Should return an array"
    );
    Assert.equal(
      nonSensitiveInsightsList.length,
      0,
      "Should return an empty array"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests failed insights sensitivity filtering - Wrong data type
 */
add_task(
  async function test_filterSensitiveInsights_sad_path_wrong_data_type() {
    const sb = sinon.createSandbox();
    try {
      // LLM returns the wrong outer data type
      const fakeEngine = {
        run() {
          return {
            finalOutput: `testing`,
          };
        },
      };

      // Check that the stub was called
      const stub = sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);
      const engine = await openAIEngine.build();
      Assert.ok(stub.calledOnce, "_createEngine should be called once");

      const nonSensitiveInsightsList = await filterSensitiveInsights(
        engine,
        NEW_INSIGHTS
      );

      Assert.ok(
        Array.isArray(nonSensitiveInsightsList),
        "Should return an array"
      );
      Assert.equal(
        nonSensitiveInsightsList.length,
        0,
        "Should return an empty array"
      );
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests failed insights sensitivity filtering - Wrong inner data type
 */
add_task(
  async function test_filterSensitiveInsights_sad_path_wrong_inner_data_type() {
    const sb = sinon.createSandbox();
    try {
      // LLM returns a map with the non_sensitive_insights key, but its value's data type is wrong
      const fakeEngine = {
        run() {
          return {
            finalOutput: `{
  "non_sensitive_insights": "testing"
}`,
          };
        },
      };

      // Check that the stub was called
      const stub = sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);
      const engine = await openAIEngine.build();
      Assert.ok(stub.calledOnce, "_createEngine should be called once");

      const nonSensitiveInsightsList = await filterSensitiveInsights(
        engine,
        NEW_INSIGHTS
      );

      Assert.ok(
        Array.isArray(nonSensitiveInsightsList),
        "Should return an array"
      );
      Assert.equal(
        nonSensitiveInsightsList.length,
        0,
        "Should return an empty array"
      );
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests failed insights sensitivity filtering - Wrong outer schema
 */
add_task(
  async function test_filterSensitiveInsights_sad_path_wrong_outer_schema() {
    const sb = sinon.createSandbox();
    try {
      // LLM returns a map but with the wrong top-level key
      const fakeEngine = {
        run() {
          return {
            finalOutput: `{
  "these_are_non_sensitive_insights": [
    "testing1", "testing2", "testing3"
  ]
}`,
          };
        },
      };

      // Check that the stub was called
      const stub = sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);
      const engine = await openAIEngine.build();
      Assert.ok(stub.calledOnce, "_createEngine should be called once");

      const nonSensitiveInsightsList = await filterSensitiveInsights(
        engine,
        NEW_INSIGHTS
      );

      Assert.ok(
        Array.isArray(nonSensitiveInsightsList),
        "Should return an array"
      );
      Assert.equal(
        nonSensitiveInsightsList.length,
        0,
        "Should return an empty array"
      );
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests failed insights sensitivity filtering - Some correct inner schema
 */
add_task(
  async function test_filterSensitiveInsights_sad_path_some_correct_inner_schema() {
    const sb = sinon.createSandbox();
    try {
      // LLM returns a map with the non_sensitive_insights key, but the inner schema has a mix of correct and incorrect data types
      const fakeEngine = {
        run() {
          return {
            finalOutput: `{
  "non_sensitive_insights": [
    "correct",
    12345,
    {"bad": "schema"}
  ]
}`,
          };
        },
      };

      // Check that the stub was called
      const stub = sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);
      const engine = await openAIEngine.build();
      Assert.ok(stub.calledOnce, "_createEngine should be called once");

      const nonSensitiveInsightsList = await filterSensitiveInsights(
        engine,
        NEW_INSIGHTS
      );

      Assert.ok(
        Array.isArray(nonSensitiveInsightsList),
        "Should return an array"
      );
      Assert.equal(
        nonSensitiveInsightsList.length,
        1,
        "Should return an array with one valid insight"
      );
      Assert.equal(
        nonSensitiveInsightsList[0],
        "correct",
        "Should return the single valid insight"
      );
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests mapping filtered insights back to full insight objects
 */
add_task(async function test_mapFilteredInsightsToInitialList() {
  // Raw mock full insights object list
  const initialInsightsList = [
    // Imagined duplicate - should have been filtered out
    {
      category: "Pets & Animals",
      intent: "Buy / Acquire",
      insight_summary: "Buys dog food online",
      score: 4,
    },
    // Sensitive content (stocks) - should have been filtered out
    {
      category: "News",
      intent: "Research / Learn",
      insight_summary: "Likes to invest in risky stocks",
      score: 5,
    },
    {
      category: "Games",
      intent: "Entertain / Relax",
      insight_summary: "Enjoys strategy games",
      score: 3,
    },
  ];

  // Mock list of good insights to keep
  const filteredInsightsList = ["Enjoys strategy games"];

  const finalInsightsList = await mapFilteredInsightsToInitialList(
    initialInsightsList,
    filteredInsightsList
  );

  // Check that only the non-duplicate, non-sensitive insight remains
  Assert.equal(
    finalInsightsList.length,
    1,
    "Final insights should contain 1 insight"
  );
  Assert.equal(
    finalInsightsList[0].category,
    "Games",
    "Final insight should have the correct category"
  );
  Assert.equal(
    finalInsightsList[0].intent,
    "Entertain / Relax",
    "Final insight should have the correct intent"
  );
  Assert.equal(
    finalInsightsList[0].insight_summary,
    "Enjoys strategy games",
    "Final insight should match the filtered insight"
  );
  Assert.equal(
    finalInsightsList[0].score,
    3,
    "Final insight should have the correct score"
  );
});
