/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Unit tests for SecurityOrchestrator (JSON Policy System)
 *
 * Focus: Critical security boundaries and core functionality
 * - Preference switch behavior (security on/off)
 * - Policy execution (allow/deny with real policies)
 * - Envelope validation (security boundary)
 * - Error handling (fail-closed)
 */

const { SecurityOrchestrator } = ChromeUtils.importESModule(
  "chrome://global/content/ml/security/SecurityOrchestrator.sys.mjs"
);

const PREF_SECURITY_ENABLED = "browser.ml.security.enabled";

/** @type {SecurityOrchestrator|null} */
let orchestrator = null;

function setup() {
  Services.prefs.clearUserPref(PREF_SECURITY_ENABLED);
}

function teardown() {
  Services.prefs.clearUserPref(PREF_SECURITY_ENABLED);
  orchestrator = null;
}

/**
 * Test: initialization creates a session with ledger.
 *
 * Reason:
 * SecurityOrchestrator.create() must initialize a functional session
 * with an empty ledger ready for URL seeding. This is the entry point
 * for all security layer operations.
 */
add_task(async function test_initialization_creates_session() {
  setup();

  orchestrator = await SecurityOrchestrator.create("test-session");
  const ledger = orchestrator.getSessionLedger();

  Assert.ok(ledger, "Should return session ledger");
  Assert.equal(ledger.tabCount(), 0, "Should start with no tabs");
  Assert.ok(
    orchestrator.getSessionLedger(),
    "Should be able to get session ledger"
  );

  teardown();
});

/**
 * Test: preference switch disabled allows everything.
 *
 * Reason:
 * When browser.ml.security.enabled=false, all policy enforcement is
 * bypassed. This provides a debugging escape hatch and allows the
 * feature to be disabled without code changes.
 */
add_task(async function test_pref_switch_disabled_allows_everything() {
  setup();
  Services.prefs.setBoolPref(PREF_SECURITY_ENABLED, false);

  orchestrator = await SecurityOrchestrator.create("test-session");
  const ledger = orchestrator.getSessionLedger();
  ledger.forTab("tab-1"); // Empty ledger

  const decision = await orchestrator.evaluate({
    phase: "tool.execution",
    action: {
      type: "tool.call",
      tool: "get_page_content",
      urls: ["https://evil.com"], // Unseen URL
      tabId: "tab-1",
    },
    context: {
      currentTabId: "tab-1",
      mentionedTabIds: [],
      requestId: "test-123",
    },
  });

  Assert.equal(
    decision.effect,
    "allow",
    "Pref switch OFF: should allow everything (pass-through)"
  );

  teardown();
});

/**
 * Test: preference switch enabled enforces policies.
 *
 * Reason:
 * When browser.ml.security.enabled=true (the default), policies must
 * be enforced. Unseen URLs should be denied. This is the expected
 * production behavior.
 */
add_task(async function test_pref_switch_enabled_enforces_policies() {
  setup();
  Services.prefs.setBoolPref(PREF_SECURITY_ENABLED, true);

  orchestrator = await SecurityOrchestrator.create("test-session");
  const ledger = orchestrator.getSessionLedger();
  ledger.forTab("tab-1");

  const decision = await orchestrator.evaluate({
    phase: "tool.execution",
    action: {
      type: "tool.call",
      tool: "get_page_content",
      urls: ["https://evil.com"],
      tabId: "tab-1",
    },
    context: {
      currentTabId: "tab-1",
      mentionedTabIds: [],
      requestId: "test-123",
    },
  });

  Assert.equal(decision.effect, "deny", "Pref switch ON: should enforce");
  Assert.equal(decision.code, "UNSEEN_LINK", "Should deny unseen links");

  teardown();
});

/**
 * Test: preference switch responds to runtime changes.
 *
 * Reason:
 * The preference is checked on each evaluate() call, not cached at
 * initialization. This allows toggling security on/off without
 * restarting the browser or recreating the orchestrator.
 */
add_task(async function test_pref_switch_runtime_change() {
  setup();

  Services.prefs.setBoolPref(PREF_SECURITY_ENABLED, true);
  orchestrator = await SecurityOrchestrator.create("test-session");
  const ledger = orchestrator.getSessionLedger();
  ledger.forTab("tab-1");

  const envelope = {
    phase: "tool.execution",
    action: {
      type: "tool.call",
      tool: "get_page_content",
      urls: ["https://evil.com"],
      tabId: "tab-1",
    },
    context: {
      currentTabId: "tab-1",
      mentionedTabIds: [],
      requestId: "req-1",
    },
  };

  // Should deny when enabled
  let decision = await orchestrator.evaluate(envelope);
  Assert.equal(decision.effect, "deny", "Should deny when enabled");

  // Disable at runtime
  Services.prefs.setBoolPref(PREF_SECURITY_ENABLED, false);

  // Should allow immediately
  decision = await orchestrator.evaluate(envelope);
  Assert.equal(
    decision.effect,
    "allow",
    "Should allow immediately after runtime disable"
  );

  teardown();
});

/**
 * Test: invalid envelope fails closed.
 *
 * Reason:
 * Malformed envelopes (missing phase, action, or context) must be
 * denied rather than allowed. Fail-closed behavior ensures that
 * broken or malicious requests don't bypass security checks.
 */
add_task(async function test_invalid_envelope_fails_closed() {
  setup();
  Services.prefs.setBoolPref(PREF_SECURITY_ENABLED, true);
  orchestrator = await SecurityOrchestrator.create("test-session");

  const invalidEnvelopes = [
    null,
    { action: { type: "test" }, context: {} }, // missing phase
    { phase: "test", context: {} }, // missing action
    { phase: "test", action: { type: "test" } }, // missing context
  ];

  for (const envelope of invalidEnvelopes) {
    const decision = await orchestrator.evaluate(envelope);
    Assert.equal(
      decision.effect,
      "deny",
      "Invalid envelope should fail closed (deny)"
    );
    Assert.equal(decision.code, "INVALID_REQUEST", "Should have correct code");
  }

  teardown();
});

/**
 * Test: policy allows seeded URL.
 *
 * Reason:
 * URLs added to the ledger represent user-visible, trusted content.
 * Tool calls requesting these URLs should be allowed. This is the
 * core functionality enabling legitimate AI-assisted browsing.
 */
add_task(async function test_policy_allows_seeded_url() {
  setup();
  Services.prefs.setBoolPref(PREF_SECURITY_ENABLED, true);
  orchestrator = await SecurityOrchestrator.create("test-session");

  const ledger = orchestrator.getSessionLedger();
  ledger.forTab("tab-1").add("https://example.com");

  const decision = await orchestrator.evaluate({
    phase: "tool.execution",
    action: {
      type: "tool.call",
      tool: "get_page_content",
      urls: ["https://example.com"], // In ledger
      tabId: "tab-1",
    },
    context: {
      currentTabId: "tab-1",
      mentionedTabIds: [],
      requestId: "test-123",
    },
  });

  Assert.equal(decision.effect, "allow", "Should allow seeded URL");

  teardown();
});

/**
 * Test: policy denies unseen URL.
 *
 * Reason:
 * URLs not in the ledger are untrusted and potentially injected by
 * malicious page content. They must be denied to prevent prompt
 * injection attacks from directing tools to attacker-controlled URLs.
 */
add_task(async function test_policy_denies_unseen_url() {
  setup();
  Services.prefs.setBoolPref(PREF_SECURITY_ENABLED, true);
  orchestrator = await SecurityOrchestrator.create("test-session");

  const ledger = orchestrator.getSessionLedger();
  ledger.forTab("tab-1"); // Empty ledger

  const decision = await orchestrator.evaluate({
    phase: "tool.execution",
    action: {
      type: "tool.call",
      tool: "get_page_content",
      urls: ["https://evil.com"], // Not in ledger
      tabId: "tab-1",
    },
    context: {
      currentTabId: "tab-1",
      mentionedTabIds: [],
      requestId: "test-123",
    },
  });

  Assert.equal(decision.effect, "deny", "Should deny unseen URL");
  Assert.equal(decision.code, "UNSEEN_LINK", "Should have UNSEEN_LINK code");
  Assert.ok(decision.reason, "Should have reason");
  Assert.equal(
    decision.policyId,
    "block-unseen-links",
    "Should identify policy"
  );

  teardown();
});

/**
 * Test: policy denies if any URL is unseen.
 *
 * Reason:
 * All-or-nothing security: a request with multiple URLs must have
 * all URLs in the ledger. If any URL is unseen, the entire request
 * is denied. Partial trust is not acceptable.
 */
add_task(async function test_policy_denies_if_any_url_unseen() {
  setup();
  Services.prefs.setBoolPref(PREF_SECURITY_ENABLED, true);
  orchestrator = await SecurityOrchestrator.create("test-session");

  const ledger = orchestrator.getSessionLedger();
  ledger.forTab("tab-1").add("https://example.com");

  const decision = await orchestrator.evaluate({
    phase: "tool.execution",
    action: {
      type: "tool.call",
      tool: "get_page_content",
      urls: [
        "https://example.com", // OK
        "https://evil.com", // NOT OK
      ],
      tabId: "tab-1",
    },
    context: {
      currentTabId: "tab-1",
      mentionedTabIds: [],
      requestId: "test-123",
    },
  });

  Assert.equal(
    decision.effect,
    "deny",
    "Should deny if ANY URL unseen (all-or-nothing)"
  );

  teardown();
});

/**
 * Test: malformed URL fails closed.
 *
 * Reason:
 * URLs that cannot be parsed or normalized cannot be validated
 * against the ledger. They must be treated as unseen and denied
 * rather than allowed by default.
 */
add_task(async function test_malformed_url_fails_closed() {
  setup();
  Services.prefs.setBoolPref(PREF_SECURITY_ENABLED, true);
  orchestrator = await SecurityOrchestrator.create("test-session");

  const ledger = orchestrator.getSessionLedger();
  ledger.forTab("tab-1");

  const decision = await orchestrator.evaluate({
    phase: "tool.execution",
    action: {
      type: "tool.call",
      tool: "get_page_content",
      urls: ["not-a-valid-url"],
      tabId: "tab-1",
    },
    context: {
      currentTabId: "tab-1",
      mentionedTabIds: [],
      requestId: "test-123",
    },
  });

  Assert.equal(
    decision.effect,
    "deny",
    "Malformed URL should fail closed (deny)"
  );
  // Malformed URLs are treated as unseen (not in ledger) rather than
  // caught as specifically malformed
  Assert.equal(decision.code, "UNSEEN_LINK", "Should have UNSEEN_LINK code");

  teardown();
});
