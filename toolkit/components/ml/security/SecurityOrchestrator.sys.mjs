/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = XPCOMUtils.declareLazy({
  SessionLedger: "chrome://global/content/ml/security/SecurityUtils.sys.mjs",
  logSecurityEvent:
    "chrome://global/content/ml/security/SecurityLogger.sys.mjs",
  EFFECT_ALLOW: "chrome://global/content/ml/security/DecisionTypes.sys.mjs",
  createAllowDecision:
    "chrome://global/content/ml/security/DecisionTypes.sys.mjs",
  createDenyDecision:
    "chrome://global/content/ml/security/DecisionTypes.sys.mjs",
  validatePolicy: "chrome://global/content/ml/security/PolicyEvaluator.sys.mjs",
  evaluatePhasePolicies:
    "chrome://global/content/ml/security/PolicyEvaluator.sys.mjs",
  console: () =>
    console.createInstance({
      maxLogLevelPref: "browser.ml.logLevel",
      prefix: "SecurityOrchestrator",
    }),
});

/**
 * Dev/emergency kill-switch for security enforcement.
 * When false, all security checks are bypassed and allow is returned.
 * Should remain true in production. Consider restricting to debug builds in follow-up.
 */
const PREF_SECURITY_ENABLED = "browser.ml.security.enabled";

/**
 * Checks if Smart Window security enforcement is enabled.
 *
 * @returns {boolean} True if security is enabled, false otherwise
 */
function isSecurityEnabled() {
  return Services.prefs.getBoolPref(PREF_SECURITY_ENABLED, true);
}

/**
 * Central security orchestrator for Firefox AI features.
 * Each AI Window instance creates its own SecurityOrchestrator via create().
 *
 * ## Evaluation Flow
 *
 * 1. Caller invokes evaluate() with an envelope containing:
 *    - phase: Security checkpoint (e.g., "tool.execution")
 *    - action: What's being attempted (tool name, URLs, etc.)
 *    - context: Request metadata (tabId, requestId, etc.)
 *
 * 2. Orchestrator checks preference flag (browser.ml.security.enabled)
 *    - If disabled: logs bypass and returns allow
 *
 * 3. Orchestrator looks up policies registered for the phase
 *    - If none: returns allow with note
 *
 * 4. Orchestrator builds context with session ledger (trusted URLs)
 *    - Merges ledgers from current tab and any @mentioned tabs
 *
 * 5. PolicyEvaluator evaluates policies using "first deny wins":
 *    - Each policy's match criteria checked against action
 *    - If match, conditions evaluated via ConditionEvaluator
 *    - First denial terminates evaluation
 *
 * 6. Decision logged via SecurityLogger and returned to caller
 *
 * ## Key Components
 *
 * - SessionLedger: Tracks trusted URLs per tab (seeded from page metadata)
 * - PolicyEvaluator: Evaluates JSON policies against actions
 * - ConditionEvaluator: Evaluates individual policy conditions
 * - SecurityLogger: Audit logging for all decisions
 */
export class SecurityOrchestrator {
  /**
   * Registry of security policies by phase.
   *
   * @type {Map<string, Array<object>>}
   */
  #policies = new Map();

  /**
   * Session ledger for URL tracking across tabs in this window.
   *
   * @type {lazy.SessionLedger}
   */
  #sessionLedger;

  /**
   * Session identifier for this window.
   *
   * @type {string}
   */
  #sessionId;

  /**
   * Used by create() to instantiate SecurityOrchestrator instance.
   *
   * @param {string} sessionId - Unique identifier for this session
   */
  constructor(sessionId) {
    this.#sessionId = sessionId;
    this.#sessionLedger = new lazy.SessionLedger(sessionId);
  }

  /**
   * Creates and initializes a new SecurityOrchestrator instance.
   *
   * @param {string} sessionId - Unique identifier for this session
   * @returns {Promise<SecurityOrchestrator>} Initialized orchestrator instance
   */
  static async create(sessionId) {
    const instance = new SecurityOrchestrator(sessionId);
    await instance.#loadPolicies();

    lazy.console.warn(
      `[Security] Orchestrator initialized for session ${sessionId} with ${Array.from(
        instance.#policies.values()
      ).reduce((sum, policies) => sum + policies.length, 0)} policies`
    );

    return instance;
  }

  /**
   * Loads and validates policies from JSON files.
   *
   * @private
   */
  async #loadPolicies() {
    const policyFiles = ["tool-execution-policies.json"];

    for (const file of policyFiles) {
      const response = await fetch(
        `chrome://global/content/ml/security/policies/${file}`
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch policy file ${file}: ${response.status}`
        );
      }

      const data = await response.json();

      // Validate policy file structure
      if (!data.policies || !Array.isArray(data.policies)) {
        throw new Error(
          `Invalid policy file structure in ${file}: missing 'policies' array`
        );
      }

      // Validate each policy
      for (const policy of data.policies) {
        const validation = lazy.validatePolicy(policy);
        if (!validation.valid) {
          throw new Error(
            `Invalid policy '${policy.id}' in ${file}: ${validation.errors.join(", ")}`
          );
        }

        // Group by phase
        if (!this.#policies.has(policy.phase)) {
          this.#policies.set(policy.phase, []);
        }
        this.#policies.get(policy.phase).push(policy);
      }

      lazy.console.debug(
        `[Security] Loaded ${data.policies.length} policies from ${file}`
      );
    }

    lazy.console.debug(
      `[Security] Policy loading complete: ${this.#policies.size} phases`
    );
  }

  /**
   * Gets the session ledger for this orchestrator.
   *
   * @returns {lazy.SessionLedger} The session ledger
   */
  getSessionLedger() {
    return this.#sessionLedger;
  }

  /**
   * Main entry point for all security checks.
   *
   * The envelope wraps a security check request, containing all information
   * needed to evaluate policies: which phase is being checked, what action
   * is being attempted, and the context in which it's occurring.
   *
   * @example
   * // AI Window dispatching a tool call:
   * const decision = await orchestrator.evaluate({
   *   phase: "tool.execution",
   *   action: {
   *     type: "tool.call",
   *     tool: "get_page_content",
   *     urls: ["https://example.com"],
   *     tabId: "tab-1"
   *   },
   *   context: {
   *     currentTabId: "tab-1",
   *     mentionedTabIds: ["tab-2"],
   *     requestId: "req-123"
   *   }
   * });
   * // Returns: { effect: "allow" } or { effect: "deny", code: "UNSEEN_LINK", ... }
   *
   * @param {object} envelope - Security check request
   * @param {string} envelope.phase - Security phase ("tool.execution", etc.)
   * @param {object} envelope.action - Action being checked (type, tool, urls, etc.)
   * @param {object} envelope.context - Request context (tabId, requestId, etc.)
   * @returns {Promise<object>} Decision object with effect (allow/deny), code, reason
   */
  async evaluate(envelope) {
    const startTime = ChromeUtils.now();

    try {
      if (!envelope || typeof envelope !== "object") {
        return lazy.createDenyDecision(
          "INVALID_REQUEST",
          "Security envelope is null or invalid"
        );
      }

      const { phase, action, context } = envelope;
      if (!phase || !action || !context) {
        return lazy.createDenyDecision(
          "INVALID_REQUEST",
          "Security envelope missing required fields (phase, action, or context)"
        );
      }

      if (!isSecurityEnabled()) {
        lazy.logSecurityEvent({
          phase,
          action,
          context,
          decision: {
            effect: lazy.EFFECT_ALLOW,
            reason: "Security disabled via preference flag",
          },
          durationMs: ChromeUtils.now() - startTime,
          prefSwitchBypass: true,
        });
        return { effect: lazy.EFFECT_ALLOW };
      }

      const policies = this.#policies.get(phase);
      if (!policies || policies.length === 0) {
        lazy.console.warn(
          `[Security] No policies registered for phase: ${phase}`
        );
        return lazy.createAllowDecision({ note: "No policies for phase" });
      }

      const fullContext = {
        ...context,
        sessionLedger: this.#sessionLedger,
        sessionId: this.#sessionId,
        timestamp: ChromeUtils.now(),
      };

      const { currentTabId, mentionedTabIds = [] } = context;
      const tabsToCheck = [currentTabId, ...mentionedTabIds];
      const linkLedger = this.#sessionLedger.merge(tabsToCheck);
      fullContext.linkLedger = linkLedger;

      const decision = lazy.evaluatePhasePolicies(
        policies,
        action,
        fullContext
      );

      lazy.logSecurityEvent({
        phase,
        action,
        context: fullContext,
        decision,
        durationMs: ChromeUtils.now() - startTime,
      });

      return decision;
    } catch (error) {
      const errorDecision = lazy.createDenyDecision(
        "EVALUATION_ERROR",
        "Security evaluation failed with unexpected error",
        { error: error.message || String(error) }
      );

      lazy.logSecurityEvent({
        phase: envelope.phase || "unknown",
        action: envelope.action || {},
        context: envelope.context || {},
        decision: errorDecision,
        durationMs: ChromeUtils.now() - startTime,
        error,
      });

      return errorDecision;
    }
  }

  /**
   * Removes all policies for a phase.
   *
   * @param {string} phase - Phase identifier to remove
   * @returns {boolean} True if policies were removed, false if not found
   */
  removePolicy(phase) {
    return this.#policies.delete(phase);
  }

  /**
   * Gets statistics about the orchestrator state.
   *
   * @returns {object} Stats object with registered policies, session info, etc.
   */
  getStats() {
    const totalPolicies = Array.from(this.#policies.values()).reduce(
      (sum, policies) => sum + policies.length,
      0
    );

    const policyBreakdown = {};
    for (const [phase, policies] of this.#policies.entries()) {
      policyBreakdown[phase] = {
        count: policies.length,
        policies: policies.map(p => ({
          id: p.id,
          enabled: p.enabled !== false,
        })),
      };
    }

    return {
      sessionId: this.#sessionId,
      initialized: this.#sessionLedger !== null,
      registeredPhases: Array.from(this.#policies.keys()),
      totalPolicies,
      policyBreakdown,
      sessionLedgerStats: this.#sessionLedger
        ? {
            tabCount: this.#sessionLedger.tabCount(),
            totalUrls: Array.from(this.#sessionLedger.tabs.values()).reduce(
              (sum, ledger) => sum + ledger.size(),
              0
            ),
          }
        : null,
    };
  }
}
