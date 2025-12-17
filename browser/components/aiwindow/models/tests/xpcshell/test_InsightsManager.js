/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

do_get_profile();
("use strict");

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);
const { InsightsManager } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/InsightsManager.sys.mjs"
);
const {
  CATEGORIES,
  INTENTS,
  HISTORY: SOURCE_HISTORY,
  CONVERSATION: SOURCE_CONVERSATION,
} = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/InsightsConstants.sys.mjs"
);
const { getFormattedInsightAttributeList } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Insights.sys.mjs"
);
const { InsightStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/services/InsightStore.sys.mjs"
);

/**
 * Constants for test insights
 */
const TEST_MESSAGE = "Remember I like coffee.";
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
 * Constants for preference keys and test values
 */
const PREF_API_KEY = "browser.aiwindow.apiKey";
const PREF_ENDPOINT = "browser.aiwindow.endpoint";
const PREF_MODEL = "browser.aiwindow.model";

const API_KEY = "fake-key";
const ENDPOINT = "https://api.fake-endpoint.com/v1";
const MODEL = "fake-model";

/**
 * Helper function to delete all insights before and after a test
 */
async function deleteAllInsights() {
  const insights = await InsightStore.getInsights({ includeSoftDeleted: true });
  for (const insight of insights) {
    await InsightStore.hardDeleteInsight(insight.id);
  }
}

/**
 * Helper function to bulk-add insights
 */
async function addInsights() {
  await deleteAllInsights();
  for (const insight of TEST_INSIGHTS) {
    await InsightStore.addInsight(insight);
  }
}

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
 * Tests getting aggregated browser history from InsightsHistorySource
 */
add_task(async function test_getAggregatedBrowserHistory() {
  // Setup fake history data
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

  // Check that all 3 outputs are arrays
  const [domainItems, titleItems, searchItems] =
    await InsightsManager.getAggregatedBrowserHistory();
  Assert.ok(Array.isArray(domainItems), "Domain items should be an array");
  Assert.ok(Array.isArray(titleItems), "Title items should be an array");
  Assert.ok(Array.isArray(searchItems), "Search items should be an array");

  // Check the length of each
  Assert.equal(domainItems.length, 3, "Should have 3 domain items");
  Assert.equal(titleItems.length, 3, "Should have 3 title items");
  Assert.equal(searchItems.length, 1, "Should have 1 search item");

  // Check the top entry in each aggregate
  Assert.deepEqual(
    domainItems[0],
    ["mozilla.org", 100],
    "Top domain should be `mozilla.org' with score 100"
  );
  Assert.deepEqual(
    titleItems[0],
    ["Internet for people, not profit — Mozilla", 100],
    "Top title should be 'Internet for people, not profit — Mozilla' with score 100"
  );
  Assert.equal(
    searchItems[0].q[0],
    "Google Search: firefox history",
    "Top search item query should be 'Google Search: firefox history'"
  );
  Assert.equal(searchItems[0].r, 1, "Top search item rank should be 1");
});

/**
 * Tests retrieving all stored insights
 */
add_task(async function test_getAllInsights() {
  await addInsights();

  const insights = await InsightsManager.getAllInsights();

  // Check that the right number of insights were retrieved
  Assert.equal(
    insights.length,
    TEST_INSIGHTS.length,
    "Should retrieve all stored insights."
  );

  // Check that the insights summaries are correct
  const testInsightsSummaries = TEST_INSIGHTS.map(
    insight => insight.insight_summary
  );
  const retrievedInsightsSummaries = insights.map(
    insight => insight.insight_summary
  );
  retrievedInsightsSummaries.forEach(insightSummary => {
    Assert.ok(
      testInsightsSummaries.includes(insightSummary),
      `Insight summary "${insightSummary}" should be in the test insights.`
    );
  });

  await deleteAllInsights();
});

/**
 * Tests soft deleting an insight by ID
 */
add_task(async function test_softDeleteInsightById() {
  await addInsights();

  // Pull insights that aren't already soft deleted
  const insightsBeforeSoftDelete = await InsightsManager.getAllInsights();

  // Pick an insight off the top to soft delete
  const insightBeforeSoftDelete = insightsBeforeSoftDelete[0];

  // Double check that the insight isn't already soft deleted
  Assert.equal(
    insightBeforeSoftDelete.is_deleted,
    false,
    "Insight should not be soft deleted initially."
  );

  // Soft delete the insight
  const insightAfterSoftDelete = await InsightsManager.softDeleteInsightById(
    insightBeforeSoftDelete.id
  );

  // Check that the insight is soft deleted
  Assert.equal(
    insightAfterSoftDelete.is_deleted,
    true,
    "Insight should be soft deleted after calling softDeleteInsightById."
  );

  // Retrieve all insights again, including soft deleted ones this time to make sure the deletion saved correctly
  const insightsAfterSoftDelete = await InsightsManager.getAllInsights({
    includeSoftDeleted: true,
  });
  const softDeletedInsights = insightsAfterSoftDelete.filter(
    insight => insight.is_deleted
  );
  Assert.equal(
    softDeletedInsights.length,
    1,
    "There should be one soft deleted insight."
  );

  await deleteAllInsights();
});

/**
 * Tests attempting to soft delete an insight that doesn't exist by ID
 */
add_task(async function test_softDeleteInsightById_not_found() {
  await addInsights();

  // Retrieve all insights, including soft deleted ones
  const insightsBeforeSoftDelete = await InsightsManager.getAllInsights({
    includeSoftDeleted: true,
  });

  // Check that no insights are soft deleted initially
  const softDeletedInsightsBefore = insightsBeforeSoftDelete.filter(
    insight => insight.is_deleted
  );
  Assert.equal(
    softDeletedInsightsBefore.length,
    0,
    "There should be no soft deleted insights initially."
  );

  // Attempt to soft delete a non-existent insight
  const insightAfterSoftDelete =
    await InsightsManager.softDeleteInsightById("non-existent-id");

  // Check that the result is null (no insights were soft deleted)
  Assert.equal(
    insightAfterSoftDelete,
    null,
    "softDeleteInsightById should return null for non-existent insight ID."
  );

  // Retrieve all insights again to confirm no insights were soft deleted
  const insightsAfterSoftDelete = await InsightsManager.getAllInsights({
    includeSoftDeleted: true,
  });
  const softDeletedInsightsAfter = insightsAfterSoftDelete.filter(
    insight => insight.is_deleted
  );
  Assert.equal(
    softDeletedInsightsAfter.length,
    0,
    "There should be no soft deleted insights after attempting to delete a non-existent insight."
  );

  await deleteAllInsights();
});

/**
 * Tests hard deleting an insight by ID
 */
add_task(async function test_hardDeleteInsightById() {
  await addInsights();

  // Retrieve all insights, including soft deleted ones
  const insightsBeforeHardDelete = await InsightsManager.getAllInsights({
    includeSoftDeleted: true,
  });

  // Pick an insight off the top to test hard deletion
  const insightBeforeHardDelete = insightsBeforeHardDelete[0];

  // Hard delete the insight
  const deletionResult = await InsightsManager.hardDeleteInsightById(
    insightBeforeHardDelete.id
  );

  // Check that the deletion was successful
  Assert.ok(
    deletionResult,
    "hardDeleteInsightById should return true on successful deletion."
  );

  // Retrieve all insights again to confirm the hard deletion was saved correctly
  const insightsAfterHardDelete = await InsightsManager.getAllInsights({
    includeSoftDeleted: true,
  });
  Assert.equal(
    insightsAfterHardDelete.length,
    insightsBeforeHardDelete.length - 1,
    "There should be one fewer insight after hard deletion."
  );

  await deleteAllInsights();
});

/**
 * Tests attempting to hard delete an insight that doesn't exist by ID
 */
add_task(async function test_hardDeleteInsightById_not_found() {
  await addInsights();

  // Retrieve all insights, including soft deleted ones
  const insightsBeforeHardDelete = await InsightsManager.getAllInsights({
    includeSoftDeleted: true,
  });

  // Hard delete the insight
  const deletionResult =
    await InsightsManager.hardDeleteInsightById("non-existent-id");

  // Check that the result is false (no insights were hard deleted)
  Assert.ok(
    !deletionResult,
    "hardDeleteInsightById should return false for non-existent insight ID."
  );

  // Retrieve all insights again to make sure no insights were hard deleted
  const insightsAfterHardDelete = await InsightsManager.getAllInsights({
    includeSoftDeleted: true,
  });
  Assert.equal(
    insightsAfterHardDelete.length,
    insightsBeforeHardDelete.length,
    "Insight count before and after failed hard deletion should be the same."
  );

  await deleteAllInsights();
});

/**
 * Tests building the message insight classification prompt
 */
add_task(async function test_buildMessageInsightClassificationPrompt() {
  const prompt =
    await InsightsManager.buildMessageInsightClassificationPrompt(TEST_MESSAGE);

  Assert.ok(
    prompt.includes(TEST_MESSAGE),
    "Prompt should include the original message."
  );
  Assert.ok(
    prompt.includes(getFormattedInsightAttributeList(CATEGORIES)),
    "Prompt should include formatted categories."
  );
  Assert.ok(
    prompt.includes(getFormattedInsightAttributeList(INTENTS)),
    "Prompt should include formatted intents."
  );
});

/**
 * Tests classifying a user message into insight categories and intents
 */
add_task(async function test_insightClassifyMessage_happy_path() {
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

    const stub = sb
      .stub(InsightsManager, "ensureOpenAIEngine")
      .returns(fakeEngine);
    const messageClassification =
      await InsightsManager.insightClassifyMessage(TEST_MESSAGE);
    // Check that the stub was called
    Assert.ok(stub.calledOnce, "ensureOpenAIEngine should be called once");

    // Check classification result was returned correctly
    Assert.equal(
      typeof messageClassification,
      "object",
      "Result should be an object."
    );
    Assert.equal(
      Object.keys(messageClassification).length,
      2,
      "Result should have two keys."
    );
    Assert.deepEqual(
      messageClassification.categories,
      ["Food & Drink"],
      "Categories should match the fake response."
    );
    Assert.deepEqual(
      messageClassification.intents,
      ["Plan / Organize"],
      "Intents should match the fake response."
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests failed message classification - LLM returns empty output
 */
add_task(async function test_insightClassifyMessage_sad_path_empty_output() {
  const sb = sinon.createSandbox();
  try {
    const fakeEngine = {
      run() {
        return {
          finalOutput: ``,
        };
      },
    };

    const stub = sb
      .stub(InsightsManager, "ensureOpenAIEngine")
      .returns(fakeEngine);
    const messageClassification =
      await InsightsManager.insightClassifyMessage(TEST_MESSAGE);
    // Check that the stub was called
    Assert.ok(stub.calledOnce, "ensureOpenAIEngine should be called once");

    // Check classification result was returned correctly despite empty output
    Assert.equal(
      typeof messageClassification,
      "object",
      "Result should be an object."
    );
    Assert.equal(
      Object.keys(messageClassification).length,
      2,
      "Result should have two keys."
    );
    Assert.equal(
      messageClassification.category,
      null,
      "Category should be null for empty output."
    );
    Assert.equal(
      messageClassification.intent,
      null,
      "Intent should be null for empty output."
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests failed message classification - LLM returns incorrect schema
 */
add_task(async function test_insightClassifyMessage_sad_path_bad_schema() {
  const sb = sinon.createSandbox();
  try {
    const fakeEngine = {
      run() {
        return {
          finalOutput: `{
            "wrong_key": "some value"
          }`,
        };
      },
    };

    const stub = sb
      .stub(InsightsManager, "ensureOpenAIEngine")
      .returns(fakeEngine);
    const messageClassification =
      await InsightsManager.insightClassifyMessage(TEST_MESSAGE);
    // Check that the stub was called
    Assert.ok(stub.calledOnce, "ensureOpenAIEngine should be called once");

    // Check classification result was returned correctly despite bad schema
    Assert.equal(
      typeof messageClassification,
      "object",
      "Result should be an object."
    );
    Assert.equal(
      Object.keys(messageClassification).length,
      2,
      "Result should have two keys."
    );
    Assert.equal(
      messageClassification.category,
      null,
      "Category should be null for bad schema output."
    );
    Assert.equal(
      messageClassification.intent,
      null,
      "Intent should be null for bad schema output."
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests retrieving relevant insights for a user message
 */
add_task(async function test_getRelevantInsights_happy_path() {
  // Add insights so that we pass the existing insights check in the `getRelevantInsights` method
  await addInsights();

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

    const stub = sb
      .stub(InsightsManager, "ensureOpenAIEngine")
      .returns(fakeEngine);
    const relevantInsights =
      await InsightsManager.getRelevantInsights(TEST_MESSAGE);
    // Check that the stub was called
    Assert.ok(stub.calledOnce, "ensureOpenAIEngine should be called once");

    // Check that the correct relevant insight was returned
    Assert.ok(Array.isArray(relevantInsights), "Result should be an array.");
    Assert.equal(
      relevantInsights.length,
      1,
      "Result should contain one relevant insight."
    );
    Assert.equal(
      relevantInsights[0].insight_summary,
      "Loves drinking coffee",
      "Relevant insight summary should match."
    );

    // Delete insights after test
    await deleteAllInsights();
  } finally {
    sb.restore();
  }
});

/**
 * Tests failed insights retrieval - no existing insights stored
 *
 * We don't mock an engine for this test case because getRelevantInsights should immediately return an empty array
 * because there aren't any existing insights -> No need to call the LLM.
 */
add_task(
  async function test_getRelevantInsights_sad_path_no_existing_insights() {
    const relevantInsights =
      await InsightsManager.getRelevantInsights(TEST_MESSAGE);

    // Check that result is an empty array
    Assert.ok(Array.isArray(relevantInsights), "Result should be an array.");
    Assert.equal(
      relevantInsights.length,
      0,
      "Result should be an empty array when there are no existing insights."
    );
  }
);

/**
 * Tests failed insights retrieval - null classification
 */
add_task(
  async function test_getRelevantInsights_sad_path_null_classification() {
    // Add insights so that we pass the existing insights check
    await addInsights();

    const sb = sinon.createSandbox();
    try {
      const fakeEngine = {
        run() {
          return {
            finalOutput: `{
            "categories": [],
            "intents": []
          }`,
          };
        },
      };

      const stub = sb
        .stub(InsightsManager, "ensureOpenAIEngine")
        .returns(fakeEngine);
      const relevantInsights =
        await InsightsManager.getRelevantInsights(TEST_MESSAGE);
      // Check that the stub was called
      Assert.ok(stub.calledOnce, "ensureOpenAIEngine should be called once");

      // Check that result is an empty array
      Assert.ok(Array.isArray(relevantInsights), "Result should be an array.");
      Assert.equal(
        relevantInsights.length,
        0,
        "Result should be an empty array when category is null."
      );

      // Delete insights after test
      await deleteAllInsights();
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests failed insights retrieval - no insight in message's category
 */
add_task(
  async function test_getRelevantInsights_sad_path_no_insights_in_message_category() {
    // Add insights so that we pass the existing insights check
    await addInsights();

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

      const stub = sb
        .stub(InsightsManager, "ensureOpenAIEngine")
        .returns(fakeEngine);
      const relevantInsights =
        await InsightsManager.getRelevantInsights(TEST_MESSAGE);
      // Check that the stub was called
      Assert.ok(stub.calledOnce, "ensureOpenAIEngine should be called once");

      // Check that result is an empty array
      Assert.ok(Array.isArray(relevantInsights), "Result should be an array.");
      Assert.equal(
        relevantInsights.length,
        0,
        "Result should be an empty array when no insights match the message category."
      );

      // Delete insights after test
      await deleteAllInsights();
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests saveInsights correctly persists history insights and updates last_history_insight_ts.
 */
add_task(async function test_saveInsights_history_updates_meta() {
  const sb = sinon.createSandbox();
  try {
    const now = Date.now();

    const generatedInsights = [
      {
        insight_summary: "foo",
        category: "A",
        intent: "X",
        score: 1,
        updated_at: now - 1000,
      },
      {
        insight_summary: "bar",
        category: "B",
        intent: "Y",
        score: 2,
        updated_at: now + 500,
      },
    ];

    const storedInsights = generatedInsights.map((generatedInsight, idx) => ({
      id: `id-${idx}`,
      ...generatedInsight,
    }));

    const addInsightStub = sb
      .stub(InsightStore, "addInsight")
      .callsFake(async partial => {
        // simple mapping: return first / second stored insight based on summary
        return storedInsights.find(
          s => s.insight_summary === partial.insight_summary
        );
      });

    const updateMetaStub = sb.stub(InsightStore, "updateMeta").resolves();

    const { persistedInsights, newTimestampMs } =
      await InsightsManager.saveInsights(
        generatedInsights,
        SOURCE_HISTORY,
        now
      );

    Assert.equal(
      addInsightStub.callCount,
      generatedInsights.length,
      "addInsight should be called once per generated insight"
    );
    Assert.deepEqual(
      persistedInsights.map(i => i.id),
      storedInsights.map(i => i.id),
      "Persisted insights should match stored insights"
    );

    Assert.ok(
      updateMetaStub.calledOnce,
      "updateMeta should be called once for history source"
    );
    const metaArg = updateMetaStub.firstCall.args[0];
    Assert.ok(
      "last_history_insight_ts" in metaArg,
      "updateMeta should update last_history_insight_ts for history source"
    );
    Assert.equal(
      metaArg.last_history_insight_ts,
      storedInsights[1].updated_at,
      "last_history_insight_ts should be set to max(updated_at) among persisted insights"
    );
    Assert.equal(
      newTimestampMs,
      storedInsights[1].updated_at,
      "Returned newTimestampMs should match the updated meta timestamp"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests saveInsights correctly persists conversation insights and updates last_chat_insight_ts.
 */
add_task(async function test_saveInsights_conversation_updates_meta() {
  const sb = sinon.createSandbox();
  try {
    const now = Date.now();

    const generatedInsights = [
      {
        insight_summary: "chat-insight",
        category: "Chat",
        intent: "Talk",
        score: 1,
        updated_at: now,
      },
    ];
    const storedInsight = { id: "chat-1", ...generatedInsights[0] };

    const addInsightStub = sb
      .stub(InsightStore, "addInsight")
      .resolves(storedInsight);
    const updateMetaStub = sb.stub(InsightStore, "updateMeta").resolves();

    const { persistedInsights, newTimestampMs } =
      await InsightsManager.saveInsights(
        generatedInsights,
        SOURCE_CONVERSATION,
        now
      );

    Assert.equal(
      addInsightStub.callCount,
      1,
      "addInsight should be called once for conversation insight"
    );
    Assert.equal(
      persistedInsights[0].id,
      storedInsight.id,
      "Persisted insight should match stored insight"
    );

    Assert.ok(
      updateMetaStub.calledOnce,
      "updateMeta should be called once for conversation source"
    );
    const metaArg = updateMetaStub.firstCall.args[0];
    Assert.ok(
      "last_chat_insight_ts" in metaArg,
      "updateMeta should update last_chat_insight_ts for conversation source"
    );
    Assert.equal(
      metaArg.last_chat_insight_ts,
      storedInsight.updated_at,
      "last_chat_insight_ts should be set to insight.updated_at"
    );
    Assert.equal(
      newTimestampMs,
      storedInsight.updated_at,
      "Returned newTimestampMs should match the updated meta timestamp"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests that getLastHistoryInsightTimestamp reads the same value written via InsightStore.updateMeta.
 */
add_task(async function test_getLastHistoryInsightTimestamp_reads_meta() {
  const ts = Date.now() - 12345;

  // Write meta directly
  await InsightStore.updateMeta({
    last_history_insight_ts: ts,
  });

  // Read via InsightsManager helper
  const readTs = await InsightsManager.getLastHistoryInsightTimestamp();

  Assert.equal(
    readTs,
    ts,
    "getLastHistoryInsightTimestamp should return last_history_insight_ts from InsightStore meta"
  );
});

/**
 * Tests that getLastConversationInsightTimestamp reads the same value written via InsightStore.updateMeta.
 */
add_task(async function test_getLastConversationInsightTimestamp_reads_meta() {
  const ts = Date.now() - 54321;

  // Write meta directly
  await InsightStore.updateMeta({
    last_chat_insight_ts: ts,
  });

  // Read via InsightsManager helper
  const readTs = await InsightsManager.getLastConversationInsightTimestamp();

  Assert.equal(
    readTs,
    ts,
    "getLastConversationInsightTimestamp should return last_chat_insight_ts from InsightStore meta"
  );
});

/**
 * Tests that history insight generation updates last_history_insight_ts and not last_conversation_insight_ts.
 */
add_task(
  async function test_historyTimestampUpdatedAfterHistoryInsightsGenerationPass() {
    const sb = sinon.createSandbox();

    const lastHistoryInsightsUpdateTs =
      await InsightsManager.getLastHistoryInsightTimestamp();
    const lastConversationInsightsUpdateTs =
      await InsightsManager.getLastConversationInsightTimestamp();

    try {
      const aggregateBrowserHistoryStub = sb
        .stub(InsightsManager, "getAggregatedBrowserHistory")
        .resolves([[], [], []]);
      const fakeEngine = sb
        .stub(InsightsManager, "ensureOpenAIEngine")
        .resolves({
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
        });

      await InsightsManager.generateInsightsFromBrowsingHistory();

      Assert.ok(
        aggregateBrowserHistoryStub.calledOnce,
        "getAggregatedBrowserHistory should be called once during insight generation"
      );
      Assert.ok(
        fakeEngine.calledOnce,
        "ensureOpenAIEngine should be called once during insight generation"
      );

      Assert.greater(
        await InsightsManager.getLastHistoryInsightTimestamp(),
        lastHistoryInsightsUpdateTs,
        "Last history insight timestamp should be updated after history generation pass"
      );
      Assert.equal(
        await InsightsManager.getLastConversationInsightTimestamp(),
        lastConversationInsightsUpdateTs,
        "Last conversation insight timestamp should remain unchanged after history generation pass"
      );
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests that conversation insight generation updates last_conversation_insight_ts and not last_history_insight_ts.
 */
add_task(
  async function test_conversationTimestampUpdatedAfterConversationInsightsGenerationPass() {
    const sb = sinon.createSandbox();

    const lastConversationInsightsUpdateTs =
      await InsightsManager.getLastConversationInsightTimestamp();
    const lastHistoryInsightsUpdateTs =
      await InsightsManager.getLastHistoryInsightTimestamp();

    try {
      const getRecentChatsStub = sb
        .stub(InsightsManager, "_getRecentChats")
        .resolves([]);

      const fakeEngine = sb
        .stub(InsightsManager, "ensureOpenAIEngine")
        .resolves({
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
        });

      await InsightsManager.generateInsightsFromConversationHistory();

      Assert.ok(
        getRecentChatsStub.calledOnce,
        "getRecentChats should be called once during insight generation"
      );
      Assert.ok(
        fakeEngine.calledOnce,
        "ensureOpenAIEngine should be called once during insight generation"
      );

      Assert.greater(
        await InsightsManager.getLastConversationInsightTimestamp(),
        lastConversationInsightsUpdateTs,
        "Last conversation insight timestamp should be updated after conversation generation pass"
      );
      Assert.equal(
        await InsightsManager.getLastHistoryInsightTimestamp(),
        lastHistoryInsightsUpdateTs,
        "Last history insight timestamp should remain unchanged after conversation generation pass"
      );
    } finally {
      sb.restore();
    }
  }
);
