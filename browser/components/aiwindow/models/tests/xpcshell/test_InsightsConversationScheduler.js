/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

do_get_profile();
("use strict");

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);
const { InsightsConversationScheduler } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/InsightsConversationScheduler.sys.mjs"
);
const { InsightsManager } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/InsightsManager.sys.mjs"
);
const { PREF_GENERATE_INSIGHTS } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/InsightsConstants.sys.mjs"
);
const { ChatStore, ChatMessage, MESSAGE_ROLE } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ChatStore.sys.mjs"
);

// Clear insights pref after testing
add_setup(async function () {
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref(PREF_GENERATE_INSIGHTS);
  });
});

/**
 * Builds fake chat history data for testing
 *
 * @param {number} numMessagesToCreate  Number of user messages to create (default: 10)
 * @returns {Promise<ChatMessage[]>}    Array of ChatMessage instances
 */
async function buildFakeChatHistory(numMessagesToCreate = 10) {
  const fixedNow = 1_700_000_000_000;

  let messages = [];
  for (let i = 0; i < numMessagesToCreate; i++) {
    messages.push(
      new ChatMessage({
        createdDate: fixedNow - i * 10_000,
        ordinal: i + 1,
        role: MESSAGE_ROLE.USER,
        content: { type: "text", body: `Test message ${i + 1}` },
        pageUrl: `https://example.com/${i + 1}`,
        turnIndex: 0,
      })
    );
  }

  return messages;
}

/**
 * Tests the scheduler does not initialize when the insights preference is false
 */
add_task(async function test_schedule_not_init_when_pref_false() {
  Services.prefs.setBoolPref(PREF_GENERATE_INSIGHTS, false);

  let scheduler = InsightsConversationScheduler.maybeInit();
  Assert.equal(
    scheduler,
    null,
    "Scheduler should not be initialized when pref is false"
  );
});

/**
 * Tests the scheduler initializes but does not run when there aren't enough messages
 */
add_task(async function test_scheduler_doesnt_run_with_insufficient_messages() {
  Services.prefs.setBoolPref(PREF_GENERATE_INSIGHTS, true);

  // Need at least 10 messages for insights generation to trigger
  // 5 will cause the expected failure
  const messages = await buildFakeChatHistory(5);
  const sb = sinon.createSandbox();

  try {
    const findMessagesStub = sb
      .stub(ChatStore.prototype, "findMessagesByDate")
      .callsFake(async () => {
        return messages;
      });

    const lastTsStub = sb
      .stub(InsightsManager, "getLastConversationInsightTimestamp")
      .resolves(0);

    const generateStub = sb
      .stub(InsightsManager, "generateInsightsFromConversationHistory")
      .resolves();

    let scheduler = InsightsConversationScheduler.maybeInit();
    Assert.ok(scheduler, "Scheduler should be initialized when pref is true");

    await scheduler.runNowForTesting();
    Assert.ok(
      findMessagesStub.calledOnce,
      "Should check for recent messages once"
    );
    Assert.ok(
      lastTsStub.calledOnce,
      "Should check last insight timestamp once"
    );
    Assert.ok(
      !generateStub.calledOnce,
      "Insights generation should not be triggered with only 5 messages"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests the scheduler initializes and runs when there are enough messages
 */
add_task(async function test_scheduler_runs_with_small_history() {
  Services.prefs.setBoolPref(PREF_GENERATE_INSIGHTS, true);

  const messages = await buildFakeChatHistory();
  const sb = sinon.createSandbox();

  try {
    const findMessagesStub = sb
      .stub(ChatStore.prototype, "findMessagesByDate")
      .callsFake(async () => {
        return messages;
      });

    const lastTsStub = sb
      .stub(InsightsManager, "getLastConversationInsightTimestamp")
      .resolves(0);

    const generateStub = sb
      .stub(InsightsManager, "generateInsightsFromConversationHistory")
      .resolves();

    let scheduler = InsightsConversationScheduler.maybeInit();
    Assert.ok(scheduler, "Scheduler should be initialized when pref is true");

    await scheduler.runNowForTesting();
    Assert.ok(
      findMessagesStub.calledOnce,
      "Should check for recent messages once"
    );
    Assert.ok(
      lastTsStub.calledOnce,
      "Should check last insight timestamp once"
    );
    Assert.ok(
      generateStub.calledOnce,
      "Insights generation should be triggered once"
    );
  } finally {
    sb.restore();
  }
});
