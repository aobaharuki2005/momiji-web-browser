/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  setInterval: "resource://gre/modules/Timer.sys.mjs",
  clearInterval: "resource://gre/modules/Timer.sys.mjs",
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  InsightsManager:
    "moz-src:///browser/components/aiwindow/models/InsightsManager.sys.mjs",
  InsightsDriftDetector:
    "moz-src:///browser/components/aiwindow/models/InsightsDriftDetector.sys.mjs",
  PREF_GENERATE_INSIGHTS:
    "moz-src:///browser/components/aiwindow/models/InsightsConstants.sys.mjs",
  DRIFT_EVAL_DELTA_COUNT:
    "moz-src:///browser/components/aiwindow/models/InsightsConstants.sys.mjs",
  DRIFT_TRIGGER_QUANTILE:
    "moz-src:///browser/components/aiwindow/models/InsightsConstants.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "console", function () {
  return console.createInstance({
    prefix: "InsightsHistoryScheduler",
    maxLogLevelPref: "browser.aiwindow.insightsLogLevel",
  });
});

// Special case - Minimum number of pages before the first time insights run.
const INITIAL_INSIGHTS_PAGES_THRESHOLD = 10;

// Only run if at least this many pages have been visited.
const INSIGHTS_SCHEDULER_PAGES_THRESHOLD = 25;

// Insights history schedule every 6 hours
const INSIGHTS_SCHEDULER_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Schedules periodic generation of browsing history based insights.
 *
 * This decides based on the #pagesVisited and periodically evaluates history drift metrics.
 * Triggers insights generation when drift exceeds a configured threshold.
 *
 * E.g. Usage: InsightsHistoryScheduler.maybeInit()
 */
export class InsightsHistoryScheduler {
  #pagesVisited = 0;
  #intervalHandle = 0;
  #destroyed = false;
  #running = false;

  /** @type {InsightsHistoryScheduler | null} */
  static #instance = null;

  /**
   * Initializes the scheduler if the relevant pref is enabled.
   *
   * This should be called from startup/feature initialization code.
   *
   * @returns {InsightsHistoryScheduler|null}
   *          The scheduler instance if initialized, otherwise null.
   */
  static maybeInit() {
    if (!Services.prefs.getBoolPref(lazy.PREF_GENERATE_INSIGHTS, false)) {
      return null;
    }
    if (!this.#instance) {
      this.#instance = new InsightsHistoryScheduler();
    }

    return this.#instance;
  }

  /**
   * Creates a new scheduler instance.
   *
   * The constructor:
   * - Starts the periodic interval timer.
   * - Subscribes to Places "page-visited" notifications.
   */
  constructor() {
    this.#startInterval();
    lazy.PlacesUtils.observers.addListener(
      ["page-visited"],
      this.#onPageVisited
    );
    lazy.console.debug("[InsightsHistoryScheduler] Initialized");
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

  /**
   * Places "page-visited" observer callback.
   *
   * Increments the internal counter of pages visited since the last
   * successful insight generation run.
   */
  #onPageVisited = () => {
    this.#pagesVisited++;
  };

  /**
   * Periodic interval handler.
   *
   * - Skips if the scheduler is destroyed or already running.
   * - Skips if the minimum pages-visited threshold is not met.
   * - Computes history drift metrics and decides whether to run insights.
   * - Invokes {@link lazy.InsightsManager.generateInsightsFromBrowsingHistory}
   *   when appropriate.
   *
   * @private
   * @returns {Promise<void>} Resolves once the interval run completes.
   */
  #onInterval = async () => {
    if (this.#destroyed) {
      lazy.console.warn(
        "[InsightsHistoryScheduler] Interval fired after destroy; ignoring."
      );
      return;
    }

    if (this.#running) {
      lazy.console.debug(
        "[InsightsHistoryScheduler] Skipping run because a previous run is still in progress."
      );
      return;
    }

    this.#running = true;
    this.#stopInterval();

    try {
      // Detect whether generated history insights were before.
      const lastInsightTs =
        (await lazy.InsightsManager.getLastHistoryInsightTimestamp()) ?? 0;
      const isFirstRun = lastInsightTs === 0;
      const minPagesThreshold = isFirstRun
        ? INITIAL_INSIGHTS_PAGES_THRESHOLD
        : INSIGHTS_SCHEDULER_PAGES_THRESHOLD;

      if (this.#pagesVisited < minPagesThreshold) {
        lazy.console.debug(
          `[InsightsHistoryScheduler] Not enough pages visited (${this.#pagesVisited}/${minPagesThreshold}); ` +
            `skipping analysis. isFirstRun=${isFirstRun}`
        );
        return;
      }

      if (!isFirstRun) {
        lazy.console.debug(
          "[InsightsHistoryScheduler] Computing history drift metrics before running insights..."
        );

        const { baselineMetrics, deltaMetrics, trigger } =
          await lazy.InsightsDriftDetector.computeHistoryDriftAndTrigger({
            triggerQuantile: lazy.DRIFT_TRIGGER_QUANTILE,
            evalDeltaCount: lazy.DRIFT_EVAL_DELTA_COUNT,
          });

        if (!baselineMetrics.length || !deltaMetrics.length) {
          lazy.console.debug(
            "[InsightsHistoryScheduler] Drift metrics incomplete (no baseline or delta); falling back to non-drift scheduling."
          );
        } else if (!trigger.triggered) {
          lazy.console.debug(
            "[InsightsHistoryScheduler] History drift below threshold; skipping insights run for this interval."
          );
          // Reset pages so we don’t repeatedly attempt with the same data.
          this.#pagesVisited = 0;
          return;
        } else {
          lazy.console.debug(
            `[InsightsHistoryScheduler] Drift triggered (jsThreshold=${trigger.jsThreshold.toFixed(4)}, ` +
              `surpriseThreshold=${trigger.surpriseThreshold.toFixed(4)}); sessions=${trigger.triggeredSessionIds.join(
                ","
              )}`
          );
        }
      }

      lazy.console.debug(
        `[InsightsHistoryScheduler] Generating insights from history with ${this.#pagesVisited} new pages`
      );
      await lazy.InsightsManager.generateInsightsFromBrowsingHistory();
      this.#pagesVisited = 0;

      lazy.console.debug(
        "[InsightsHistoryScheduler] History insights generation complete."
      );
    } catch (error) {
      lazy.console.error(
        "[InsightsHistoryScheduler] Failed to generate history insights",
        error
      );
    } finally {
      if (!this.#destroyed) {
        this.#startInterval();
      }
      this.#running = false;
    }
  };

  /**
   * Cleans up scheduler resources.
   *
   * Stops the interval, unsubscribes from Places notifications,
   * and marks the scheduler as destroyed so future interval ticks
   * are ignored.
   */
  destroy() {
    this.#stopInterval();
    lazy.PlacesUtils.observers.removeListener(
      ["page-visited"],
      this.#onPageVisited
    );
    this.#destroyed = true;
    lazy.console.debug("[InsightsHistoryScheduler] Destroyed");
  }

  /**
   * Testing helper: set pagesVisited count.
   * Not used in production code.
   *
   * @param {number} count
   */
  setPagesVisitedForTesting(count) {
    this.#pagesVisited = count;
  }

  /**
   * Testing helper: runs the interval handler once immediately.
   * Not used in production code.
   */
  async runNowForTesting() {
    await this.#onInterval();
  }
}
