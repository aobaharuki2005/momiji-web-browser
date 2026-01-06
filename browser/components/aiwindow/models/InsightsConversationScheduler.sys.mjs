/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  setInterval: "resource://gre/modules/Timer.sys.mjs",
  clearInterval: "resource://gre/modules/Timer.sys.mjs",
  InsightsManager:
    "moz-src:///browser/components/aiwindow/models/InsightsManager.sys.mjs",
  getRecentChats:
    "moz-src:///browser/components/aiwindow/models/InsightsChatSource.sys.mjs",
  PREF_GENERATE_INSIGHTS:
    "moz-src:///browser/components/aiwindow/models/InsightsConstants.sys.mjs",
});
ChromeUtils.defineLazyGetter(lazy, "console", function () {
  return console.createInstance({
    prefix: "InsightsConversationScheduler",
    maxLogLevelPref: "browser.aiwindow.insightsLogLevel",
  });
});

// Generate insights if there have been at least 10 user messages since the last run
const INSIGHTS_SCHEDULER_MESSAGES_THRESHOLD = 10;

// Insights conversation schedule every 4 hours
const INSIGHTS_SCHEDULER_INTERVAL_MS = 4 * 60 * 60 * 1000;

/**
 * Schedules periodic generation of conversation-based insights.
 * Triggers insights generation when number of user messages exceeds the configured threshold ({@link INSIGHTS_SCHEDULER_MESSAGES_THRESHOLD})
 *
 * E.g. Usage: InsightsConversationScheduler.maybeInit()
 */
export class InsightsConversationScheduler {
  #intervalHandle = 0;
  #destroyed = false;
  #running = false;

  /** @type {InsightsConversationScheduler | null} */
  static #instance = null;

  static maybeInit() {
    if (!Services.prefs.getBoolPref(lazy.PREF_GENERATE_INSIGHTS, false)) {
      return null;
    }
    if (!this.#instance) {
      this.#instance = new InsightsConversationScheduler();
    }
    return this.#instance;
  }

  constructor() {
    this.#startInterval();
    lazy.console.debug("Initialized");
  }

  /**
   * Starts the interval that periodically evaluates history drift and
   * potentially triggers insight generation.
   *
   * @throws {Error} If an interval is already running.
   */
  #startInterval() {
    if (this.#intervalHandle) {
      throw new Error(
        "Attempting to start an interval when one already existed"
      );
    }
    this.#intervalHandle = lazy.setInterval(
      this.#onInterval,
      INSIGHTS_SCHEDULER_INTERVAL_MS
    );
  }

  /**
   * Stops the currently running interval, if any.
   */
  #stopInterval() {
    if (this.#intervalHandle) {
      lazy.clearInterval(this.#intervalHandle);
      this.#intervalHandle = 0;
    }
  }

  #onInterval = async () => {
    if (this.#destroyed) {
      lazy.console.warn("Interval fired after destroy; ignoring.");
      return;
    }

    if (this.#running) {
      lazy.console.debug(
        "Skipping run because a previous run is still in progress."
      );
      return;
    }

    this.#running = true;
    this.#stopInterval();

    try {
      // Detect whether conversation insights were generated before.
      const lastInsightTs =
        (await lazy.InsightsManager.getLastConversationInsightTimestamp()) ?? 0;

      // Get user chat messages
      const chatMessagesSinceLastInsight =
        await lazy.getRecentChats(lastInsightTs);

      // Not enough new messages
      if (
        chatMessagesSinceLastInsight.length <
        INSIGHTS_SCHEDULER_MESSAGES_THRESHOLD
      ) {
        return;
      }

      // Generate insights
      await lazy.InsightsManager.generateInsightsFromConversationHistory();
    } catch (error) {
      lazy.console.error("Failed to generate conversation insights", error);
    } finally {
      if (!this.#destroyed) {
        this.#startInterval();
      }
      this.#running = false;
    }
  };

  destroy() {
    this.#stopInterval();
    this.#destroyed = true;
    lazy.console.debug("Destroyed");
  }

  async runNowForTesting() {
    await this.#onInterval();
  }
}
