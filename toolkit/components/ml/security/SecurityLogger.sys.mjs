/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = XPCOMUtils.declareLazy({
  EFFECT_DENY: "chrome://global/content/ml/security/DecisionTypes.sys.mjs",
  console: () =>
    console.createInstance({
      maxLogLevelPref: "browser.ml.logLevel",
      prefix: "SecurityLogger",
    }),
});

/**
 * Security audit logger (stub - console only).
 *
 * TODO (Bug 2003214): Phase 2 POC - Part 2: Implement Security Logger
 */

/**
 * Logs a security decision event.
 *
 * @param {object} event - The security event to log
 * @param {string} event.phase - Security phase (tool.execution, etc.)
 * @param {object} event.action - Action that was checked
 * @param {object} event.context - Request context
 * @param {object} event.decision - Policy decision (allow/deny)
 * @param {number} event.durationMs - Evaluation duration in milliseconds
 * @param {Error} [event.error] - Optional error if evaluation failed
 */
export function logSecurityEvent(event) {
  const { phase, decision, durationMs, error } = event;

  if (error) {
    lazy.console.error(
      `[${phase}] Security evaluation error:`,
      error.message || error
    );
  } else if (decision.effect === lazy.EFFECT_DENY) {
    lazy.console.warn(
      `[${phase}] DENY: ${decision.code} - ${decision.reason} (${durationMs}ms)`
    );
  } else {
    lazy.console.debug(`[${phase}] ALLOW (${durationMs}ms)`);
  }
}
