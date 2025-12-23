/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

do_get_profile();

const {
  NewTabStarterGenerator,
  trimConversation,
  addInsightsToPrompt,
  cleanInferenceOutput,
  generateConversationStartersSidebar,
  generateFollowupPrompts,
  InsightsGetterForSuggestionPrompts,
} = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/ConversationSuggestions.sys.mjs"
);

const { openAIEngine } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
);
const { InsightsManager } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/InsightsManager.sys.mjs"
);
const { MESSAGE_ROLE } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ChatStore.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

/**
 * Constants for preference keys and test values
 */
const PREF_API_KEY = "browser.aiwindow.apiKey";
const PREF_ENDPOINT = "browser.aiwindow.endpoint";
const PREF_MODEL = "browser.aiwindow.model";

const API_KEY = "test-api-key";
const ENDPOINT = "https://api.test-endpoint.com/v1";
const MODEL = "test-model";

/**
 * Cleans up preferences after testing
 */
registerCleanupFunction(() => {
  for (let pref of [PREF_API_KEY, PREF_ENDPOINT, PREF_MODEL]) {
    if (Services.prefs.prefHasUserValue(pref)) {
      Services.prefs.clearUserPref(pref);
    }
  }
});

/**
 * Tests for trimConversation function
 */
add_task(async function test_trimConversation() {
  const cases = [
    {
      input: [
        // empty case
      ],
      expected: [],
    },
    {
      input: [
        // more than 15 messages
        ...Array.from({ length: 20 }, (_, i) => ({
          role: i % 2 === 0 ? MESSAGE_ROLE.USER : MESSAGE_ROLE.ASSISTANT,
          content: `Message ${i + 1}`,
        })),
      ],
      expected: [
        ...Array.from({ length: 15 }, (_, i) => ({
          role: (i + 5) % 2 === 0 ? "user" : "assistant",
          content: `Message ${i + 6}`,
        })),
      ],
    },
    {
      input: [
        // should remove tool call/responses
        { role: MESSAGE_ROLE.USER, content: "What's the weather like?" },
        {
          role: MESSAGE_ROLE.ASSISTANT,
          content: "",
          tool_call: { name: "get_weather", arguments: "{}" },
        },
        {
          role: MESSAGE_ROLE.TOOL,
          content: "Here are the latest news articles.",
        },
      ],
      expected: [{ role: "user", content: "What's the weather like?" }],
    },
    {
      input: [
        // should remove system message
        { role: MESSAGE_ROLE.SYSTEM, content: "System message" },
        { role: MESSAGE_ROLE.USER, content: "Hello" },
        { role: MESSAGE_ROLE.ASSISTANT, content: "Hi there!" },
      ],
      expected: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ],
    },
    {
      input: [
        // should remove messages with empty content
        { role: MESSAGE_ROLE.USER, content: "\n" },
        { role: MESSAGE_ROLE.ASSISTANT, content: "   " },
      ],
      expected: [],
    },
    {
      input: [
        // no valid messages
        { role: MESSAGE_ROLE.SYSTEM, content: "System message" },
        {
          role: MESSAGE_ROLE.ASSISTANT,
          content: "",
          tool_call: { name: "get_info", arguments: "{}" },
        },
      ],
      expected: [],
    },
    {
      input: [
        // should slice after filtering invalid messages
        ...Array(10)
          .fill(0)
          .flatMap((_, i) => [
            {
              role: MESSAGE_ROLE.USER,
              content: `User message ${i + 1}`,
            },
            { role: MESSAGE_ROLE.SYSTEM, content: "System message" },
          ]),
      ],
      expected: [
        ...Array.from({ length: 10 }, (_, i) => ({
          role: "user",
          content: `User message ${i + 1}`,
        })),
      ],
    },
  ];

  for (const { input, expected } of cases) {
    const result = trimConversation(input);
    Assert.deepEqual(
      result,
      expected,
      "trimConversation should return only user/assistant messages with content"
    );
  }
});

/**
 * Test for addInsightsToPrompt function when there are insights
 */
add_task(async function test_addInsightsToPrompt_have_insights() {
  const sb = sinon.createSandbox();
  try {
    const basePrompt = "Base prompt content.";
    const fakeInsights = ["Insight summary 1", "Insight summary 2"];
    const insightsStub = sb
      .stub(InsightsGetterForSuggestionPrompts, "getInsightSummariesForPrompt")
      .resolves(fakeInsights);
    const promptWithInsights = await addInsightsToPrompt(basePrompt);
    Assert.ok(
      insightsStub.calledOnce,
      "getInsightSummariesForPrompt should be called"
    );
    Assert.ok(
      promptWithInsights.includes("- Insight summary 1") &&
        promptWithInsights.includes("- Insight summary 2"),
      "Prompt should include insights"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Test for addInsightsToPrompt function when there are no insights
 */
add_task(async function test_addInsightsToPrompt_dont_have_insights() {
  const sb = sinon.createSandbox();
  try {
    const basePrompt = "Base prompt content.";
    const fakeInsights = [];
    const insightsStub = sb
      .stub(InsightsGetterForSuggestionPrompts, "getInsightSummariesForPrompt")
      .resolves(fakeInsights);
    const promptWithInsights = await addInsightsToPrompt(basePrompt);
    Assert.ok(
      insightsStub.calledOnce,
      "getInsightSummariesForPrompt should be called"
    );
    Assert.equal(
      promptWithInsights,
      basePrompt,
      "Prompt should be unchanged when no insights"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests for cleanInferenceOutput function
 */
add_task(function test_cleanInferenceOutput() {
  const sb = sinon.createSandbox();
  try {
    const cases = [
      {
        input: {
          finalOutput: `- Suggestion 1\n\n* Suggestion 2\n1. Suggestion 3.\n2)Suggestion 4\n[5] Suggestion 5\n6.\nLabel: Suggestion 6\nSuggestion 7.\nSuggestion 8?`,
        },
        expected: [
          "Suggestion 1",
          "Suggestion 2",
          "Suggestion 3",
          "Suggestion 4",
          "Suggestion 5",
          "Suggestion 6",
          "Suggestion 7",
          "Suggestion 8?",
        ],
      },
      {
        input: { finalOutput: `Suggestion X\nSuggestion Y\nSuggestion Z` },
        expected: ["Suggestion X", "Suggestion Y", "Suggestion Z"],
      },
      {
        input: { finalOutput: "" },
        expected: [],
      },
    ];

    for (const { input, expected } of cases) {
      const result = cleanInferenceOutput(input);
      Assert.deepEqual(
        result,
        expected,
        "cleanInferenceOutput should return expected output"
      );
    }
  } finally {
    sb.restore();
  }
});

/**
 * Tests for createNewTabPromptGenerator generating prompts based on tab count
 */
add_task(async function test_createNewTabPromptGenerator() {
  const sb = sinon.createSandbox();
  const writingPrompts = [
    "Write a first draft",
    "Improve writing",
    "Proofread a message",
  ];

  const planningPrompts = [
    "Simplify a topic",
    "Brainstorm ideas",
    "Help make a plan",
  ];
  try {
    const cases = [
      {
        input: { tabCount: -1 },
        expectedBrowsing: ["Find tabs in history"],
      },
      {
        input: { tabCount: 0 },
        expectedBrowsing: ["Find tabs in history"],
      },
      {
        input: { tabCount: 1 },
        expectedBrowsing: ["Find tabs in history", "Summarize tabs"],
      },
      {
        input: { tabCount: 2 },
        expectedBrowsing: [
          "Find tabs in history",
          "Summarize tabs",
          "Compare tabs",
        ],
      },
      {
        input: { tabCount: 3 },
        expectedBrowsing: [
          "Find tabs in history",
          "Summarize tabs",
          "Compare tabs",
        ],
      },
    ];
    const promptGenerator = NewTabStarterGenerator;
    for (const { input, expectedBrowsing } of cases) {
      const results = await promptGenerator.getPrompts(input.tabCount);
      Assert.equal(results.length, 3, "Should return 3 suggestions");
      for (const result of results) {
        Assert.equal(
          result.type,
          "chat",
          "Each result should have type 'chat'"
        );
      }
      Assert.ok(
        writingPrompts.includes(results[0].text),
        "Results should include a valid writing prompt"
      );
      Assert.ok(
        planningPrompts.includes(results[1].text),
        "Results should include a valid planning prompt"
      );
      Assert.ok(
        expectedBrowsing.includes(results[2].text),
        "Results should include a valid browsing prompt"
      );
    }
  } finally {
    sb.restore();
  }
});

/**
 * Tests for generateConversationStartersSidebar successfully generating suggestions
 */
add_task(async function test_generateConversationStartersSidebar_happy_path() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);
  Services.prefs.setStringPref(PREF_MODEL, MODEL);

  const sb = sinon.createSandbox();
  try {
    // Mock the openAIEngine and insights response
    const fakeEngine = {
      run: sb.stub().resolves({
        finalOutput: `1. Suggestion 1\n\n- Suggestion 2\nLabel: Suggestion 3.\nSuggestion 4\nSuggestion 5\nSuggestion 6`,
      }),
    };
    sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);

    const fakeInsights = ["Insight summary 1", "Insight summary 2"];
    const insightsStub = sb
      .stub(InsightsGetterForSuggestionPrompts, "getInsightSummariesForPrompt")
      .resolves(fakeInsights);

    const n = 3;
    const contextTabs = [
      { title: "Current Tab", url: "https://current.example.com" },
      { title: "Tab 2", url: "https://tab2.example.com" },
    ];

    const result = await generateConversationStartersSidebar(
      contextTabs,
      n,
      true
    );
    Assert.ok(fakeEngine.run.calledOnce, "Engine run should be called once");
    Assert.ok(
      insightsStub.calledOnce,
      "getInsightSummariesForPrompt should be called once"
    );

    // Verify the prompt content
    const callArgs = fakeEngine.run.firstCall.args[0];
    Assert.equal(
      callArgs.messages.length,
      2,
      "run should be called with 2 messages"
    );
    Assert.ok(
      callArgs.messages[1].content.includes(
        '{"title":"Current Tab","url":"https://current.example.com"}'
      ),
      "Prompt should include current tab info"
    );
    Assert.ok(
      callArgs.messages[1].content.includes(
        '{"title":"Tab 2","url":"https://tab2.example.com"}'
      ),
      "Prompt should include other tab info"
    );
    Assert.ok(
      callArgs.messages[1].content.includes(
        "\n- Insight summary 1\n- Insight summary 2"
      ),
      "Prompt should include insight summaries"
    );

    Assert.deepEqual(
      result,
      [
        { text: "Suggestion 1", type: "chat" },
        { text: "Suggestion 2", type: "chat" },
        { text: "Suggestion 3", type: "chat" },
      ],
      "Suggestions should match expected values"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests for generateConversationStartersSidebar without including insights
 */
add_task(
  async function test_generateConversationStartersSidebar_without_insights() {
    Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
    Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);
    Services.prefs.setStringPref(PREF_MODEL, MODEL);

    const sb = sinon.createSandbox();
    try {
      // Mock the openAIEngine and insights response
      const fakeEngine = {
        run: sb.stub().resolves({
          finalOutput: `1. Suggestion 1\n\n- Suggestion 2\nLabel: Suggestion 3.\nSuggestion 4\nSuggestion 5\nSuggestion 6`,
        }),
      };
      sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);

      const fakeInsights = ["Insight summary 1", "Insight summary 2"];
      const insightsStub = sb
        .stub(
          InsightsGetterForSuggestionPrompts,
          "getInsightSummariesForPrompt"
        )
        .resolves(fakeInsights);

      const n = 3;
      const contextTabs = [
        { title: "Current Tab", url: "https://current.example.com" },
        { title: "Tab 2", url: "https://tab2.example.com" },
      ];

      const result = await generateConversationStartersSidebar(
        contextTabs,
        n,
        false
      );
      Assert.ok(fakeEngine.run.calledOnce, "Engine run should be called once");
      Assert.ok(
        !insightsStub.calledOnce,
        "getInsightSummariesForPrompt shouldn't be called"
      );

      // Verify the prompt content
      const callArgs = fakeEngine.run.firstCall.args[0];
      Assert.equal(
        callArgs.messages.length,
        2,
        "run should be called with 2 messages"
      );
      Assert.ok(
        callArgs.messages[1].content.includes(
          '{"title":"Current Tab","url":"https://current.example.com"}'
        ),
        "Prompt should include current tab info"
      );
      Assert.ok(
        callArgs.messages[1].content.includes(
          '{"title":"Tab 2","url":"https://tab2.example.com"}'
        ),
        "Prompt should include other tab info"
      );
      Assert.ok(
        !callArgs.messages[1].content.includes(
          "\n- Insight summary 1\n- Insight summary 2"
        ),
        "Prompt should not include insight summaries"
      );

      Assert.deepEqual(
        result,
        [
          { text: "Suggestion 1", type: "chat" },
          { text: "Suggestion 2", type: "chat" },
          { text: "Suggestion 3", type: "chat" },
        ],
        "Suggestions should match expected values"
      );
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests for generateConversationStartersSidebar when no insights are returned
 */
add_task(
  async function test_generateConversationStartersSidebar_no_insights_returned() {
    Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
    Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);
    Services.prefs.setStringPref(PREF_MODEL, MODEL);

    const sb = sinon.createSandbox();
    try {
      // Mock the openAIEngine and insights response
      const fakeEngine = {
        run: sb.stub().resolves({
          finalOutput: `1. Suggestion 1\n\n- Suggestion 2\nLabel: Suggestion 3.\nSuggestion 4\nSuggestion 5\nSuggestion 6`,
        }),
      };
      sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);

      const fakeInsights = [];
      const insightsStub = sb
        .stub(
          InsightsGetterForSuggestionPrompts,
          "getInsightSummariesForPrompt"
        )
        .resolves(fakeInsights);

      const n = 3;
      const contextTabs = [
        { title: "Current Tab", url: "https://current.example.com" },
        { title: "Tab 2", url: "https://tab2.example.com" },
      ];

      const result = await generateConversationStartersSidebar(
        contextTabs,
        n,
        true
      );
      Assert.ok(fakeEngine.run.calledOnce, "Engine run should be called once");
      Assert.ok(
        insightsStub.calledOnce,
        "getInsightSummariesForPrompt should be called once"
      );

      // Verify the prompt content
      const callArgs = fakeEngine.run.firstCall.args[0];
      Assert.equal(
        callArgs.messages.length,
        2,
        "run should be called with 2 messages"
      );
      Assert.ok(
        callArgs.messages[1].content.includes(
          '{"title":"Current Tab","url":"https://current.example.com"}'
        ),
        "Prompt should include current tab info"
      );
      Assert.ok(
        callArgs.messages[1].content.includes(
          '{"title":"Tab 2","url":"https://tab2.example.com"}'
        ),
        "Prompt should include other tab info"
      );
      Assert.ok(
        !callArgs.messages[1].content.includes("\nUser Insights:\n"),
        "Prompt shouldn't include user insights block"
      );

      Assert.deepEqual(
        result,
        [
          { text: "Suggestion 1", type: "chat" },
          { text: "Suggestion 2", type: "chat" },
          { text: "Suggestion 3", type: "chat" },
        ],
        "Suggestions should match expected values"
      );
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests for generateConversationStartersSidebar when no tabs are provided
 */
add_task(async function test_generateConversationStartersSidebar_no_tabs() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);
  Services.prefs.setStringPref(PREF_MODEL, MODEL);

  const sb = sinon.createSandbox();
  try {
    // Mock the openAIEngine and insights response
    const fakeEngine = {
      run: sb.stub().resolves({
        finalOutput: `1. Suggestion 1\n\n- Suggestion 2\nLabel: Suggestion 3.\nSuggestion 4\nSuggestion 5\nSuggestion 6`,
      }),
    };
    sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);

    const fakeInsights = ["Insight summary 1", "Insight summary 2"];
    const insightsStub = sb
      .stub(InsightsGetterForSuggestionPrompts, "getInsightSummariesForPrompt")
      .resolves(fakeInsights);

    const n = 3;
    const contextTabs = [];

    const result = await generateConversationStartersSidebar(
      contextTabs,
      n,
      true
    );
    Assert.ok(fakeEngine.run.calledOnce, "Engine run should be called once");
    Assert.ok(
      insightsStub.calledOnce,
      "getInsightSummariesForPrompt should be called once"
    );

    // Verify the prompt content
    const callArgs = fakeEngine.run.firstCall.args[0];
    Assert.equal(
      callArgs.messages.length,
      2,
      "run should be called with 2 messages"
    );
    Assert.ok(
      callArgs.messages[1].content.includes("\nNo current tab\n"),
      "Prompt should indicate no current tab"
    );
    Assert.ok(
      callArgs.messages[1].content.includes("\nNo tabs available\n"),
      "Prompt should indicate no tabs available"
    );
    Assert.ok(
      callArgs.messages[1].content.includes(
        "\n- Insight summary 1\n- Insight summary 2"
      ),
      "Prompt should include insight summaries"
    );

    Assert.deepEqual(
      result,
      [
        { text: "Suggestion 1", type: "chat" },
        { text: "Suggestion 2", type: "chat" },
        { text: "Suggestion 3", type: "chat" },
      ],
      "Suggestions should match expected values"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests for generateConversationStartersSidebar with one tab provided
 */
add_task(async function test_generateConversationStartersSidebar_one_tab() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);
  Services.prefs.setStringPref(PREF_MODEL, MODEL);

  const sb = sinon.createSandbox();
  try {
    // Mock the openAIEngine and insights response
    const fakeEngine = {
      run: sb.stub().resolves({
        finalOutput: `1. Suggestion 1\n\n- Suggestion 2\nLabel: Suggestion 3.\nSuggestion 4\nSuggestion 5\nSuggestion 6`,
      }),
    };
    sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);

    const fakeInsights = ["Insight summary 1", "Insight summary 2"];
    const insightsStub = sb
      .stub(InsightsGetterForSuggestionPrompts, "getInsightSummariesForPrompt")
      .resolves(fakeInsights);

    const n = 3;
    const contextTabs = [
      { title: "Only Tab", url: "https://only.example.com" },
    ];

    const result = await generateConversationStartersSidebar(
      contextTabs,
      n,
      true
    );
    Assert.ok(fakeEngine.run.calledOnce, "Engine run should be called once");
    Assert.ok(
      insightsStub.calledOnce,
      "getInsightSummariesForPrompt should be called once"
    );

    // Verify the prompt content
    const callArgs = fakeEngine.run.firstCall.args[0];
    Assert.equal(
      callArgs.messages.length,
      2,
      "run should be called with 2 messages"
    );
    Assert.ok(
      callArgs.messages[1].content.includes(
        '\n{"title":"Only Tab","url":"https://only.example.com"}'
      ),
      "Prompt should include current tab info"
    );
    Assert.ok(
      callArgs.messages[1].content.includes("\nOnly current tab is open\n"),
      "Prompt should indicate only current tab is open"
    );
    Assert.ok(
      callArgs.messages[1].content.includes(
        "\n- Insight summary 1\n- Insight summary 2"
      ),
      "Prompt should include insight summaries"
    );

    Assert.deepEqual(
      result,
      [
        { text: "Suggestion 1", type: "chat" },
        { text: "Suggestion 2", type: "chat" },
        { text: "Suggestion 3", type: "chat" },
      ],
      "Suggestions should match expected values"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests that generateConversationStartersSidebar handles engine errors gracefully
 */
add_task(
  async function test_generateConversationStartersSidebar_engine_error() {
    Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
    Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);
    Services.prefs.setStringPref(PREF_MODEL, MODEL);

    const sb = sinon.createSandbox();
    try {
      // Mock the openAIEngine and insights response
      const fakeEngine = {
        run: sb.stub().rejects(new Error("Engine failure")),
      };
      sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);

      const fakeInsights = ["Insight summary 1", "Insight summary 2"];
      sb.stub(
        InsightsGetterForSuggestionPrompts,
        "getInsightSummariesForPrompt"
      ).resolves(fakeInsights);

      const n = 3;
      const contextTabs = [
        { title: "Only Tab", url: "https://only.example.com" },
      ];

      const result = await generateConversationStartersSidebar(
        contextTabs,
        n,
        true
      );
      Assert.deepEqual(result, [], "Should return empty array on engine error");
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests for generateFollowupPrompts successfully generating suggestions
 */
add_task(async function test_generateFollowupPrompts_happy_path() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);
  Services.prefs.setStringPref(PREF_MODEL, MODEL);

  const sb = sinon.createSandbox();
  try {
    // Mock the openAIEngine and insights response
    const fakeEngine = {
      run: sb.stub().resolves({
        finalOutput: `1. Suggestion 1\n\n- Suggestion 2.\nSuggestion 3.\nSuggestion 4\nSuggestion 5\nSuggestion 6`,
      }),
    };
    sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);

    const fakeInsights = ["Insight summary 1", "Insight summary 2"];
    const insightsStub = sb
      .stub(InsightsGetterForSuggestionPrompts, "getInsightSummariesForPrompt")
      .resolves(fakeInsights);

    const n = 2;
    const conversationHistory = [
      { role: MESSAGE_ROLE.USER, content: "Hello" },
      { role: MESSAGE_ROLE.ASSISTANT, content: "Hi there!" },
    ];
    const currentTab = {
      title: "Current Tab",
      url: "https://current.example.com",
    };

    // Using insights
    const result = await generateFollowupPrompts(
      conversationHistory,
      currentTab,
      n,
      true
    );
    Assert.ok(fakeEngine.run.calledOnce, "Engine run should be called once");
    Assert.ok(
      insightsStub.calledOnce,
      "getInsightSummariesForPrompt should be called once"
    );

    const callArgs = fakeEngine.run.firstCall.args[0];
    Assert.equal(
      callArgs.messages.length,
      2,
      "run should be called with 2 messages"
    );
    Assert.ok(
      callArgs.messages[1].content.includes(
        '{"title":"Current Tab","url":"https://current.example.com"}'
      ),
      "Prompt should include current tab info"
    );
    Assert.ok(
      callArgs.messages[1].content.includes(
        '[{"role":"user","content":"Hello"},{"role":"assistant","content":"Hi there!"}]'
      ),
      "Prompt should include conversation history"
    );
    Assert.ok(
      callArgs.messages[1].content.includes(
        "\n- Insight summary 1\n- Insight summary 2"
      ),
      "Prompt should include insight summaries"
    );

    Assert.deepEqual(
      result,
      [
        { text: "Suggestion 1", type: "chat" },
        { text: "Suggestion 2", type: "chat" },
      ],
      "Suggestions should match"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests for generateFollowupPrompts without including insights
 */
add_task(async function test_generateFollowupPrompts_no_insights() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);
  Services.prefs.setStringPref(PREF_MODEL, MODEL);

  const sb = sinon.createSandbox();
  try {
    // Mock the openAIEngine and insights response
    const fakeEngine = {
      run: sb.stub().resolves({
        finalOutput: `1. Suggestion 1\n\n- Suggestion 2.\nSuggestion 3.\nSuggestion 4\nSuggestion 5\nSuggestion 6`,
      }),
    };
    sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);

    const fakeInsights = ["Insight summary 1", "Insight summary 2"];
    const insightsStub = sb
      .stub(InsightsGetterForSuggestionPrompts, "getInsightSummariesForPrompt")
      .resolves(fakeInsights);

    const n = 2;
    const conversationHistory = [
      { role: MESSAGE_ROLE.USER, content: "Hello" },
      { role: MESSAGE_ROLE.ASSISTANT, content: "Hi there!" },
    ];
    const currentTab = {
      title: "Current Tab",
      url: "https://current.example.com",
    };

    const result = await generateFollowupPrompts(
      conversationHistory,
      currentTab,
      n,
      false
    );
    Assert.ok(fakeEngine.run.calledOnce, "Engine run should be called once");
    Assert.ok(
      !insightsStub.calledOnce,
      "getInsightSummariesForPrompt shouldn't be called"
    );

    const callArgs = fakeEngine.run.firstCall.args[0];
    Assert.equal(
      callArgs.messages.length,
      2,
      "run should be called with 2 messages"
    );
    Assert.ok(
      callArgs.messages[1].content.includes(
        '{"title":"Current Tab","url":"https://current.example.com"}'
      ),
      "Prompt should include current tab info"
    );
    Assert.ok(
      callArgs.messages[1].content.includes(
        '[{"role":"user","content":"Hello"},{"role":"assistant","content":"Hi there!"}]'
      ),
      "Prompt should include conversation history"
    );
    Assert.ok(
      !callArgs.messages[1].content.includes(
        "\n- Insight summary 1\n- Insight summary 2"
      ),
      "Prompt shouldn't include insight summaries"
    );

    Assert.deepEqual(
      result,
      [
        { text: "Suggestion 1", type: "chat" },
        { text: "Suggestion 2", type: "chat" },
      ],
      "Suggestions should match"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests for generateFollowupPrompts when no insights are returned
 */
add_task(async function test_generateFollowupPrompts_no_insights_returned() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);
  Services.prefs.setStringPref(PREF_MODEL, MODEL);

  const sb = sinon.createSandbox();
  try {
    // Mock the openAIEngine and insights response
    const fakeEngine = {
      run: sb.stub().resolves({
        finalOutput: `1. Suggestion 1\n\n- Suggestion 2.\nSuggestion 3.\nSuggestion 4\nSuggestion 5\nSuggestion 6`,
      }),
    };
    sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);

    const fakeInsights = [];
    const insightsStub = sb
      .stub(InsightsGetterForSuggestionPrompts, "getInsightSummariesForPrompt")
      .resolves(fakeInsights);

    const n = 2;
    const conversationHistory = [
      { role: MESSAGE_ROLE.USER, content: "Hello" },
      { role: MESSAGE_ROLE.ASSISTANT, content: "Hi there!" },
    ];
    const currentTab = {
      title: "Current Tab",
      url: "https://current.example.com",
    };

    // Using insights
    const result = await generateFollowupPrompts(
      conversationHistory,
      currentTab,
      n,
      true
    );
    Assert.ok(fakeEngine.run.calledOnce, "Engine run should be called once");
    Assert.ok(
      insightsStub.calledOnce,
      "getInsightSummariesForPrompt should be called once"
    );

    const callArgs = fakeEngine.run.firstCall.args[0];
    Assert.equal(
      callArgs.messages.length,
      2,
      "run should be called with 2 messages"
    );
    Assert.ok(
      callArgs.messages[1].content.includes(
        '{"title":"Current Tab","url":"https://current.example.com"}'
      ),
      "Prompt should include current tab info"
    );
    Assert.ok(
      callArgs.messages[1].content.includes(
        '[{"role":"user","content":"Hello"},{"role":"assistant","content":"Hi there!"}]'
      ),
      "Prompt should include conversation history"
    );
    Assert.ok(
      !callArgs.messages[1].content.includes("\nUser Insights:\n"),
      "Prompt shouldn't include user insights block"
    );

    Assert.deepEqual(
      result,
      [
        { text: "Suggestion 1", type: "chat" },
        { text: "Suggestion 2", type: "chat" },
      ],
      "Suggestions should match"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests for generateFollowupPrompts without a current tab
 */
add_task(async function test_generateFollowupPrompts_no_current_tab() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);
  Services.prefs.setStringPref(PREF_MODEL, MODEL);

  const sb = sinon.createSandbox();
  try {
    // Mock the openAIEngine and insights response
    const fakeEngine = {
      run: sb.stub().resolves({
        finalOutput: `1. Suggestion 1\n\n- Suggestion 2.\nSuggestion 3.\nSuggestion 4\nSuggestion 5\nSuggestion 6`,
      }),
    };
    sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);

    const fakeInsights = [];
    const insightsStub = sb
      .stub(InsightsGetterForSuggestionPrompts, "getInsightSummariesForPrompt")
      .resolves(fakeInsights);

    const n = 2;
    const conversationHistory = [
      { role: MESSAGE_ROLE.USER, content: "Hello" },
      { role: MESSAGE_ROLE.ASSISTANT, content: "Hi there!" },
    ];
    const currentTab = {};

    const result = await generateFollowupPrompts(
      conversationHistory,
      currentTab,
      n,
      false
    );
    Assert.ok(fakeEngine.run.calledOnce, "Engine run should be called once");
    Assert.ok(
      !insightsStub.calledOnce,
      "getInsightSummariesForPrompt shouldn't be called"
    );

    const callArgs = fakeEngine.run.firstCall.args[0];
    Assert.equal(
      callArgs.messages.length,
      2,
      "run should be called with 2 messages"
    );
    Assert.ok(
      callArgs.messages[1].content.includes("\nNo tab\n"),
      "Prompt shouldn't include any tab info"
    );
    Assert.ok(
      callArgs.messages[1].content.includes(
        '[{"role":"user","content":"Hello"},{"role":"assistant","content":"Hi there!"}]'
      ),
      "Prompt should include conversation history"
    );
    Assert.ok(
      !callArgs.messages[1].content.includes("\nUser Insights:\n"),
      "Prompt shouldn't include user insights block"
    );

    Assert.deepEqual(
      result,
      [
        { text: "Suggestion 1", type: "chat" },
        { text: "Suggestion 2", type: "chat" },
      ],
      "Suggestions should match"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests that generateFollowupPrompts handles engine errors gracefully
 */
add_task(async function test_generateFollowupPrompts_engine_error() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);
  Services.prefs.setStringPref(PREF_MODEL, MODEL);

  const sb = sinon.createSandbox();
  try {
    // Mock the openAIEngine and insights response
    const fakeEngine = {
      run: sb.stub().rejects(new Error("Engine failure")),
    };
    sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);

    const fakeInsights = [];
    sb.stub(
      InsightsGetterForSuggestionPrompts,
      "getInsightSummariesForPrompt"
    ).resolves(fakeInsights);

    const n = 2;
    const conversationHistory = [
      { role: MESSAGE_ROLE.USER, content: "Hello" },
      { role: MESSAGE_ROLE.ASSISTANT, content: "Hi there!" },
    ];
    const currentTab = {};

    const result = await generateFollowupPrompts(
      conversationHistory,
      currentTab,
      n,
      false
    );
    Assert.deepEqual(result, [], "Should return empty array on engine error");
  } finally {
    sb.restore();
  }
});

/**
 * Tests for getInsightSummariesForPrompt happy path
 */
add_task(async function test_getInsightSummariesForPrompt_happy_path() {
  const sb = sinon.createSandbox();
  try {
    // Mock the InsightStore to return fixed insights
    const fakeInsights = [
      {
        insight_summary: "Insight summary 1",
      },
      {
        insight_summary: "Insight summary 2",
      },
      {
        insight_summary: "Insight summary 3",
      },
    ];

    sb.stub(InsightsManager, "getAllInsights").resolves(fakeInsights);

    const maxInsights = 2;
    const summaries =
      await InsightsGetterForSuggestionPrompts.getInsightSummariesForPrompt(
        maxInsights
      );

    Assert.deepEqual(
      summaries,
      ["Insight summary 1", "Insight summary 2"],
      "Insight summaries should match expected values"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests for getInsightSummariesForPrompt when no insights are returned
 */
add_task(async function test_getInsightSummariesForPrompt_no_insights() {
  const sb = sinon.createSandbox();
  try {
    // Mock the InsightStore to return fixed insights
    const fakeInsights = [];

    sb.stub(InsightsManager, "getAllInsights").resolves(fakeInsights);

    const maxInsights = 2;
    const summaries =
      await InsightsGetterForSuggestionPrompts.getInsightSummariesForPrompt(
        maxInsights
      );

    Assert.equal(
      summaries.length,
      0,
      `getInsightSummariesForPrompt(${maxInsights}) should return 0 summaries`
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests for getInsightSummariesForPrompt with fewer insights than maxInsights
 */
add_task(async function test_getInsightSummariesForPrompt_too_few_insights() {
  const sb = sinon.createSandbox();
  try {
    // Mock the InsightStore to return fixed insights
    const fakeInsights = [
      {
        insight_summary: "Insight summary 1",
      },
    ];

    sb.stub(InsightsManager, "getAllInsights").resolves(fakeInsights);

    const maxInsights = 2;
    const summaries =
      await InsightsGetterForSuggestionPrompts.getInsightSummariesForPrompt(
        maxInsights
      );

    Assert.deepEqual(
      summaries,
      ["Insight summary 1"],
      "Insight summaries should match expected values"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests for getInsightSummariesForPrompt handling duplicate summaries
 */
add_task(async function test_getInsightSummariesForPrompt_duplicates() {
  const sb = sinon.createSandbox();
  try {
    // Mock the InsightStore to return fixed insights
    const fakeInsights = [
      {
        insight_summary: "Duplicate summary",
      },
      {
        insight_summary: "duplicate summary",
      },
      {
        insight_summary: "Unique summary",
      },
    ];

    sb.stub(InsightsManager, "getAllInsights").resolves(fakeInsights);

    const maxInsights = 2;
    const summaries =
      await InsightsGetterForSuggestionPrompts.getInsightSummariesForPrompt(
        maxInsights
      );

    Assert.deepEqual(
      summaries,
      ["Duplicate summary", "Unique summary"],
      "Insight summaries should match expected values"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests for getInsightSummariesForPrompt handling empty and whitespace-only summaries
 */
add_task(
  async function test_getInsightSummariesForPrompt_empty_and_whitespace() {
    const sb = sinon.createSandbox();
    try {
      // Mock the InsightStore to return fixed insights
      const fakeInsights = [
        {
          insight_summary: "   \n",
        },
        {
          insight_summary: "",
        },
        {
          insight_summary: "Valid summary",
        },
      ];

      sb.stub(InsightsManager, "getAllInsights").resolves(fakeInsights);

      const maxInsights = 2;
      const summaries =
        await InsightsGetterForSuggestionPrompts.getInsightSummariesForPrompt(
          maxInsights
        );

      Assert.deepEqual(
        summaries,
        ["Valid summary"],
        "Insight summaries should match expected values"
      );
    } finally {
      sb.restore();
    }
  }
);
