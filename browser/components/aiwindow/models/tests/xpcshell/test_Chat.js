/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { Chat } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Chat.sys.mjs"
);
const { openAIEngine } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
);

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

// Prefs for aiwindow
const PREF_API_KEY = "browser.aiwindow.apiKey";
const PREF_ENDPOINT = "browser.aiwindow.endpoint";
const PREF_MODEL = "browser.aiwindow.model";

// Clean prefs after all tests
registerCleanupFunction(() => {
  for (let pref of [PREF_API_KEY, PREF_ENDPOINT, PREF_MODEL]) {
    if (Services.prefs.prefHasUserValue(pref)) {
      Services.prefs.clearUserPref(pref);
    }
  }
});

add_task(async function test_openAIEngine_build_uses_prefs() {
  Services.prefs.setStringPref(PREF_API_KEY, "test-key-123");
  Services.prefs.setStringPref(PREF_ENDPOINT, "https://example.test/v1");
  Services.prefs.setStringPref(PREF_MODEL, "gpt-fake");

  const sb = sinon.createSandbox();
  try {
    const fakeEngineInstance = {
      runWithGenerator() {
        throw new Error("not used");
      },
    };
    const stub = sb
      .stub(openAIEngine, "_createEngine")
      .resolves(fakeEngineInstance);

    const engine = await openAIEngine.build();

    Assert.ok(
      engine instanceof openAIEngine,
      "Should return openAIEngine instance"
    );
    Assert.strictEqual(
      engine.engineInstance,
      fakeEngineInstance,
      "Should store engine instance"
    );
    Assert.ok(stub.calledOnce, "_createEngine should be called once");

    const opts = stub.firstCall.args[0];
    Assert.equal(opts.apiKey, "test-key-123", "apiKey should come from pref");
    Assert.equal(
      opts.baseURL,
      "https://example.test/v1",
      "baseURL should come from pref"
    );
    Assert.equal(opts.modelId, "gpt-fake", "modelId should come from pref");
  } finally {
    sb.restore();
  }
});

add_task(async function test_Chat_fetchWithHistory_streams_and_forwards_args() {
  const sb = sinon.createSandbox();
  try {
    let capturedArgs = null;
    let capturedOptions = null;

    // Fake openAIEngine instance that directly has runWithGenerator method
    const fakeEngine = {
      runWithGenerator(options) {
        capturedArgs = options.args;
        capturedOptions = options;
        async function* gen() {
          yield { text: "Hello" };
          yield { text: " from" };
          yield { text: " fake engine!" };
          yield {}; // ignored by Chat
          // No toolCalls yielded, so loop will exit after first iteration
        }
        return gen();
      },
    };

    sb.stub(openAIEngine, "build").resolves(fakeEngine);
    // sb.stub(Chat, "_getFxAccountToken").resolves("mock_token");

    const messages = [
      { role: "system", content: "You are helpful" },
      { role: "user", content: "Hi there" },
    ];

    // Collect streamed output
    let acc = "";
    for await (const chunk of Chat.fetchWithHistory(messages)) {
      if (typeof chunk === "string") {
        acc += chunk;
      }
    }

    Assert.equal(
      acc,
      "Hello from fake engine!",
      "Should concatenate streamed chunks"
    );
    Assert.deepEqual(
      capturedArgs,
      messages,
      "Should forward messages as args to runWithGenerator()"
    );
    Assert.deepEqual(
      capturedOptions.streamOptions.enabled,
      true,
      "Should enable streaming in runWithGenerator()"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_Chat_fetchWithHistory_handles_tool_calls() {
  const sb = sinon.createSandbox();
  try {
    let callCount = 0;
    const fakeEngine = {
      runWithGenerator(_options) {
        callCount++;
        async function* gen() {
          if (callCount === 1) {
            // First call: yield text and tool call
            yield { text: "I'll help you with that. " };
            yield {
              toolCalls: [
                {
                  id: "call_123",
                  function: {
                    name: "test_tool",
                    arguments: JSON.stringify({ param: "value" }),
                  },
                },
              ],
            };
          } else {
            // Second call: after tool execution
            yield { text: "Tool executed successfully!" };
          }
        }
        return gen();
      },
    };

    // Mock tool function
    Chat.toolMap.test_tool = sb.stub().resolves("tool result");

    sb.stub(openAIEngine, "build").resolves(fakeEngine);
    // sb.stub(Chat, "_getFxAccountToken").resolves("mock_token");

    const messages = [{ role: "user", content: "Use the test tool" }];

    let textOutput = "";
    let toolCallLogs = [];
    for await (const chunk of Chat.fetchWithHistory(messages)) {
      if (typeof chunk === "string") {
        textOutput += chunk;
      } else if (chunk?.type === "tool_call_log") {
        toolCallLogs.push(chunk);
      }
    }

    Assert.equal(
      textOutput,
      "I'll help you with that. Tool executed successfully!",
      "Should yield text from both model calls"
    );
    Assert.equal(toolCallLogs.length, 1, "Should have one tool call log");
    Assert.ok(
      toolCallLogs[0].content.includes("test_tool"),
      "Tool call log should mention tool name"
    );
    Assert.ok(Chat.toolMap.test_tool.calledOnce, "Tool should be called once");
    Assert.deepEqual(
      Chat.toolMap.test_tool.firstCall.args[0],
      { param: "value" },
      "Tool should receive correct parameters"
    );
    Assert.equal(
      callCount,
      2,
      "Engine should be called twice (initial + after tool)"
    );
  } finally {
    sb.restore();
    delete Chat.toolMap.test_tool;
  }
});

add_task(
  async function test_Chat_fetchWithHistory_propagates_engine_build_error() {
    const sb = sinon.createSandbox();
    try {
      const err = new Error("engine build failed");
      sb.stub(openAIEngine, "build").rejects(err);
      // sb.stub(Chat, "_getFxAccountToken").resolves("mock_token");

      const messages = [{ role: "user", content: "Hi" }];

      const consume = async () => {
        for await (const _chunk of Chat.fetchWithHistory(messages)) {
          void _chunk;
        }
      };

      await Assert.rejects(
        consume(),
        e => e === err,
        "Should propagate the same error thrown by openAIEngine.build"
      );
    } finally {
      sb.restore();
    }
  }
);

add_task(
  async function test_Chat_fetchWithHistory_handles_invalid_tool_arguments() {
    const sb = sinon.createSandbox();
    try {
      let callCount = 0;
      const fakeEngine = {
        runWithGenerator(_options) {
          callCount++;
          async function* gen() {
            if (callCount === 1) {
              // First call: yield text and invalid tool call
              yield { text: "Using tool with bad args: " };
              yield {
                toolCalls: [
                  {
                    id: "call_456",
                    function: {
                      name: "test_tool",
                      arguments: "invalid json {",
                    },
                  },
                ],
              };
            } else {
              // Second call: no more tool calls, should exit loop
              yield { text: "Done." };
            }
          }
          return gen();
        },
      };

      Chat.toolMap.test_tool = sb.stub().resolves("should not be called");

      sb.stub(openAIEngine, "build").resolves(fakeEngine);
      // sb.stub(Chat, "_getFxAccountToken").resolves("mock_token");

      const messages = [{ role: "user", content: "Test bad JSON" }];

      let textOutput = "";
      for await (const chunk of Chat.fetchWithHistory(messages)) {
        if (typeof chunk === "string") {
          textOutput += chunk;
        }
      }

      Assert.equal(
        textOutput,
        "Using tool with bad args: Done.",
        "Should yield text from both calls"
      );
      Assert.ok(
        Chat.toolMap.test_tool.notCalled,
        "Tool should not be called with invalid JSON"
      );
    } finally {
      sb.restore();
      delete Chat.toolMap.test_tool;
    }
  }
);
