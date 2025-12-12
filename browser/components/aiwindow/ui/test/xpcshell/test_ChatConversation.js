/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

do_get_profile();

const { ChatConversation, MESSAGE_ROLE } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ChatStore.sys.mjs"
);

const { UserRoleOpts, AssistantRoleOpts, ToolRoleOpts } =
  ChromeUtils.importESModule(
    "moz-src:///browser/components/aiwindow/ui/modules/ChatMessage.sys.mjs"
  );

add_task(function test_ChatConversation_constructor_defaults() {
  const conversation = new ChatConversation({});

  Assert.withSoftAssertions(function (soft) {
    soft.equal(conversation.id.length, 12);
    soft.ok(Array.isArray(conversation.messages));
    soft.ok(!isNaN(conversation.createdDate));
    soft.ok(!isNaN(conversation.updatedDate));
    soft.strictEqual(conversation.title, undefined);
    soft.strictEqual(conversation.description, undefined);
    soft.strictEqual(conversation.pageUrl, undefined);
    soft.strictEqual(conversation.pageMeta, undefined);
  });
});

add_task(function test_ChatConversation_addMessage() {
  const conversation = new ChatConversation({});

  const content = {
    type: "text",
    content: "hello world",
  };

  conversation.addMessage(
    MESSAGE_ROLE.USER,
    content,
    new URL("https://www.mozilla.com"),
    0
  );

  const message = conversation.messages[0];

  Assert.withSoftAssertions(function (soft) {
    soft.strictEqual(message.role, MESSAGE_ROLE.USER);
    soft.strictEqual(message.content, content);
    soft.strictEqual(message.pageUrl.href, "https://www.mozilla.com/");
    soft.strictEqual(message.turnIndex, 0);
  });
});

add_task(function test_invalidRole_ChatConversation_addMessage() {
  const conversation = new ChatConversation({});

  const content = {
    type: "text",
    content: "hello world",
  };

  conversation.addMessage(313, content, new URL("https://www.mozilla.com"), 0);

  Assert.equal(conversation.messages.length, 0);
});

add_task(function test_negativeTurnIndex_ChatConversation_addMessage() {
  const conversation = new ChatConversation({});

  const content = {
    type: "text",
    content: "hello world",
  };

  conversation.addMessage(
    MESSAGE_ROLE.USER,
    content,
    new URL("https://www.mozilla.com"),
    -1
  );
  const message = conversation.messages[0];

  Assert.equal(message.turnIndex, 0);
});

add_task(function test_parentMessageId_ChatConversation_addMessage() {
  const conversation = new ChatConversation({});

  const content = {
    type: "text",
    content: "hello world",
  };

  conversation.addMessage(
    MESSAGE_ROLE.USER,
    content,
    new URL("https://www.mozilla.com"),
    0
  );

  conversation.addMessage(
    MESSAGE_ROLE.ASSISTANT,
    content,
    new URL("https://www.mozilla.com"),
    0
  );

  const userMsg = conversation.messages[0];
  const assistantMsg = conversation.messages[1];

  Assert.equal(assistantMsg.parentMessageId, userMsg.id);
});

add_task(function test_ordinal_ChatConversation_addMessage() {
  const conversation = new ChatConversation({});

  const content = {
    type: "text",
    content: "hello world",
  };

  conversation.addMessage(
    MESSAGE_ROLE.USER,
    content,
    new URL("https://www.mozilla.com"),
    0
  );

  conversation.addMessage(
    MESSAGE_ROLE.ASSISTANT,
    content,
    new URL("https://www.mozilla.com"),
    0
  );

  const userMsg = conversation.messages[0];
  const assistantMsg = conversation.messages[1];

  Assert.withSoftAssertions(function (soft) {
    soft.equal(userMsg.ordinal, 1);
    soft.equal(assistantMsg.ordinal, 2);
  });
});

add_task(function test_ChatConversation_addUserMessage() {
  const conversation = new ChatConversation({});

  const content = "user to assistant msg";
  conversation.addUserMessage(content, "https://www.mozilla.com", 0);

  const message = conversation.messages[0];

  Assert.withSoftAssertions(function (soft) {
    soft.equal(message.role, MESSAGE_ROLE.USER);
    soft.equal(message.turnIndex, 0);
    soft.deepEqual(message.pageUrl, new URL("https://www.mozilla.com"));
    soft.deepEqual(message.content, {
      type: "text",
      body: "user to assistant msg",
    });
  });
});

add_task(function test_revisionRootMessageId_ChatConversation_addUserMessage() {
  const conversation = new ChatConversation({});

  const content = "user to assistant msg";
  conversation.addUserMessage(content, "https://www.firefox.com", 0);

  const message = conversation.messages[0];

  Assert.equal(message.revisionRootMessageId, message.id);
});

add_task(function test_opts_ChatConversation_addUserMessage() {
  const conversation = new ChatConversation({});

  const content = "user to assistant msg";
  conversation.addUserMessage(
    content,
    "https://www.firefox.com",
    0,
    new UserRoleOpts("321")
  );

  const message = conversation.messages[0];

  Assert.equal(message.revisionRootMessageId, "321");
});

add_task(function test_ChatConversation_addAssistantMessage() {
  const conversation = new ChatConversation({});

  const content = "response from assistant";
  conversation.addAssistantMessage("text", content, 0);

  const message = conversation.messages[0];

  Assert.withSoftAssertions(function (soft) {
    soft.equal(message.role, MESSAGE_ROLE.ASSISTANT);
    soft.equal(message.turnIndex, 0);
    soft.deepEqual(message.pageUrl, null);
    soft.deepEqual(message.content, {
      type: "text",
      body: "response from assistant",
    });
    soft.strictEqual(message.modelId, null, "modelId should default to false");
    soft.strictEqual(message.params, null, "params should default to null");
    soft.strictEqual(message.usage, null, "usage should default to null");
    soft.strictEqual(
      message.insightsEnabled,
      false,
      "insightsEnabled should default to false"
    );
    soft.strictEqual(
      message.insightsFlagSource,
      null,
      "insightsFlagSource should default to null"
    );
    soft.deepEqual(
      message.insightsApplied,
      [],
      "insightsApplied should default to emtpy array"
    );
    soft.deepEqual(
      message.webSearchQueries,
      [],
      "webSearchQueries should default to emtpy array"
    );
  });
});

add_task(function test_opts_ChatConversation_addAssistantMessage() {
  const conversation = new ChatConversation({});

  const content = "response from assistant";
  const assistantOpts = new AssistantRoleOpts(
    "the-model-id",
    { some: "params for model" },
    { usage: "data" },
    true,
    1,
    ["insight"],
    ["search"]
  );
  conversation.addAssistantMessage("text", content, 0, assistantOpts);

  const message = conversation.messages[0];

  Assert.withSoftAssertions(function (soft) {
    soft.equal(message.role, MESSAGE_ROLE.ASSISTANT);
    soft.equal(message.turnIndex, 0);
    soft.deepEqual(message.pageUrl, null);
    soft.deepEqual(message.content, {
      type: "text",
      body: "response from assistant",
    });
    soft.strictEqual(
      message.modelId,
      "the-model-id",
      "modelId should be 'the-model-id'"
    );
    soft.deepEqual(
      message.params,
      { some: "params for model" },
      'params should equal { some: "params for model"}'
    );
    soft.deepEqual(
      message.usage,
      { usage: "data" },
      'usage should equal {"usage": "data"}'
    );
    soft.strictEqual(
      message.insightsEnabled,
      true,
      "insightsEnabled should equal true"
    );
    soft.strictEqual(
      message.insightsFlagSource,
      1,
      "insightsFlagSource equal 1"
    );
    soft.deepEqual(
      message.insightsApplied,
      ["insight"],
      "insightsApplied should equal ['insight']"
    );
    soft.deepEqual(
      message.webSearchQueries,
      ["search"],
      "insightsApplied should equal ['search']"
    );
  });
});

add_task(function test_ChatConversation_addToolCallMessage() {
  const conversation = new ChatConversation({});

  const content = {
    random: "tool call specific keys",
  };
  conversation.addToolCallMessage(content, 0);

  const message = conversation.messages[0];

  Assert.withSoftAssertions(function (soft) {
    soft.equal(message.role, MESSAGE_ROLE.TOOL);
    soft.equal(message.turnIndex, 0);
    soft.deepEqual(message.pageUrl, null);
    soft.deepEqual(message.content, {
      random: "tool call specific keys",
    });
    soft.equal(message.modelId, null, "modelId should default to null");
  });
});

add_task(function test_opts_ChatConversation_addToolCallMessage() {
  const conversation = new ChatConversation({});

  const content = {
    random: "tool call specific keys",
  };
  conversation.addToolCallMessage(content, 0, new ToolRoleOpts("the-model-id"));

  const message = conversation.messages[0];

  Assert.withSoftAssertions(function (soft) {
    soft.equal(message.role, MESSAGE_ROLE.TOOL);
    soft.equal(message.turnIndex, 0);
    soft.deepEqual(message.pageUrl, null);
    soft.deepEqual(message.content, {
      random: "tool call specific keys",
    });
    soft.equal(
      message.modelId,
      "the-model-id",
      "modelId should equal the-model-id"
    );
  });
});

add_task(function test_ChatConversation_addSystemMessage() {
  const conversation = new ChatConversation({});

  const content = {
    random: "system call specific keys",
  };
  conversation.addSystemMessage("text", content, 0);

  const message = conversation.messages[0];

  Assert.withSoftAssertions(function (soft) {
    soft.equal(message.role, MESSAGE_ROLE.SYSTEM);
    soft.equal(message.turnIndex, 0);
    soft.deepEqual(message.pageUrl, null);
    soft.deepEqual(message.content, {
      type: "text",
      body: { random: "system call specific keys" },
    });
  });
});

add_task(function test_ChatConversation_getSitesList() {
  const conversation = new ChatConversation({});

  const content = "user to assistant msg";
  conversation.addUserMessage(content, "https://www.mozilla.com", 0);
  conversation.addUserMessage(content, "https://www.mozilla.com", 1);
  conversation.addUserMessage(content, "https://www.firefox.com", 2);
  conversation.addUserMessage(content, "https://www.cnn.com", 3);
  conversation.addUserMessage(content, "https://www.espn.com", 4);
  conversation.addUserMessage(content, "https://www.espn.com", 5);

  const sites = conversation.getSitesList();

  Assert.deepEqual(sites, [
    URL.parse("https://www.mozilla.com/"),
    URL.parse("https://www.firefox.com/"),
    URL.parse("https://www.cnn.com/"),
    URL.parse("https://www.espn.com/"),
  ]);
});

add_task(function test_ChatConversation_getMostRecentPageVisited() {
  const conversation = new ChatConversation({});

  const content = "user to assistant msg";
  conversation.addUserMessage(content, "https://www.mozilla.com", 0);
  conversation.addUserMessage(content, "https://www.mozilla.com", 1);
  conversation.addUserMessage(content, "https://www.firefox.com", 2);
  conversation.addUserMessage(content, "https://www.cnn.com", 3);
  conversation.addUserMessage(content, "https://www.espn.com", 4);
  conversation.addUserMessage(content, "https://www.espn.com", 5);

  const mostRecentPageVisited = conversation.getMostRecentPageVisited();

  Assert.equal(mostRecentPageVisited, "https://www.espn.com/");
});

add_task(function test_noBrowsing_ChatConversation_getMostRecentPageVisited() {
  const conversation = new ChatConversation({});

  const content = "user to assistant msg";
  conversation.addUserMessage(content, "about:aiwindow", 0);
  conversation.addUserMessage(content, "", 1);
  conversation.addUserMessage(content, null, 2);

  const mostRecentPageVisited = conversation.getMostRecentPageVisited();

  Assert.equal(mostRecentPageVisited, null);
});
