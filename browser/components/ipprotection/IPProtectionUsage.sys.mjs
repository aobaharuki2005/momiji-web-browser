/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  DeferredTask: "resource://gre/modules/DeferredTask.sys.mjs",
});

const BANDWIDTH_PREF = "browser.ipProtection.bandwidth";
const BYTES_TO_MB = 1000000;
// 200 ms for testing, 60 seconds for real scenarios
const BANDWIDTH_WRITE_TIMEOUT = Cu.isInAutomation ? 1000 : 60 * 1000;
const BYTES_TO_GB = 1000000000;

/**
 * Service Class to observe and record IP protection usage.
 *
 * When started it will observe all HTTP requests and record the
 * transfer sizes of requests and responses that are proxied through
 * the IP protection proxy.
 *
 * It should be started when the IP protection proxy is active.
 * It should be stopped when we know all proxy requests have been completed.
 *
 * It will record all Proxied Requests that match the isolation keys.
 * So after a connection is established, the isolation key should be added.
 */
export class IPProtectionUsage {
  constructor() {
    ChromeUtils.generateQI([Ci.nsIObserver]);
  }

  start() {
    if (this.#active) {
      return;
    }
    this.#bandwidthUsageSinceLastWrite = 0;
    this.#writeBandwidthUsageTask = null;
    Services.obs.addObserver(this, "http-on-stop-request");
    this.#active = true;
  }
  stop() {
    if (!this.#active) {
      return;
    }
    this.#active = false;
    this.#isolationKeys.clear();
    Services.obs.removeObserver(this, "http-on-stop-request");
    this.#writeBandwidthUsageTask?.finalize().then(() => {
      this.#writeBandwidthUsageTask = null;
    });
  }

  addIsolationKey(key) {
    if (typeof key !== "string" || !key) {
      throw new Error("Isolation key must be a non-empty string");
    }
    this.#isolationKeys.add(key);
  }

  observe(subject, topic) {
    if (topic != "http-on-stop-request") {
      return;
    }
    try {
      const chan = subject.QueryInterface(Ci.nsIHttpChannel);
      if (this.shouldCountChannel(chan)) {
        this.countChannel(chan);
      }
    } catch (err) {
      // If the channel is not an nsIHttpChannel
    }
  }
  /**
   * Checks if a channel should be counted.
   *
   * @param {nsIHttpChannel} channel
   * @returns {boolean} true if the channel should be counted.
   */
  shouldCountChannel(channel) {
    try {
      const proxiedChannel = channel.QueryInterface(Ci.nsIProxiedChannel);
      const proxyInfo = proxiedChannel.proxyInfo;
      if (!proxyInfo) {
        // No proxy info, nothing to do.
        return false;
      }
      const isolationKey = proxyInfo.connectionIsolationKey;
      return isolationKey && this.#isolationKeys.has(isolationKey);
    } catch (err) {
      // If the channel is not an nsIHttpChannel or nsIProxiedChannel, as it's irrelevant
      // for this class.
    }
    return false;
  }

  writeUsage() {
    // The pref is synced so we only add the bandwidth usage since
    // our last write
    const prefUsage = Services.prefs.getIntPref(BANDWIDTH_PREF, 0);
    const totalUsage =
      this.#bandwidthUsageSinceLastWrite / BYTES_TO_MB + prefUsage;

    // Bandwidth is stored in MB so we covert it when getting/setting
    // the pref
    Services.prefs.setIntPref(BANDWIDTH_PREF, totalUsage);
    this.#bandwidthUsageSinceLastWrite = 0;
  }

  forceWriteUsage() {
    this.#writeBandwidthUsageTask?.disarm();
    this.writeUsage();
    this.#writeBandwidthUsageTask?.arm();
  }

  /**
   * Checks a completed channel and records the transfer sizes to glean.
   *
   * @param {nsIHttpChannel} chan - A completed Channel to check.
   */
  countChannel(chan) {
    try {
      const cacheInfo = chan.QueryInterface(Ci.nsICacheInfoChannel);
      if (cacheInfo.isFromCache()) {
        return;
      }
    } catch (_) {
      /* not all channels support it */
    }

    if (chan.transferSize > 0) {
      Glean.ipprotection.usageRx.accumulate(chan.transferSize);
      this.#bandwidthUsageSinceLastWrite += chan.transferSize;
    }
    if (chan.requestSize > 0) {
      Glean.ipprotection.usageTx.accumulate(chan.requestSize);
      this.#bandwidthUsageSinceLastWrite += chan.requestSize;
    }

    if (!this.#writeBandwidthUsageTask) {
      this.#writeBandwidthUsageTask = new lazy.DeferredTask(() => {
        this.writeUsage();
      }, BANDWIDTH_WRITE_TIMEOUT);
    }

    if (this.#bandwidthUsageSinceLastWrite > BYTES_TO_GB) {
      this.forceWriteUsage();
    }

    this.#writeBandwidthUsageTask.arm();
  }

  #active = false;
  #isolationKeys = new Set();
  #bandwidthUsageSinceLastWrite = 0;
  #writeBandwidthUsageTask;
}

IPProtectionUsage.prototype.QueryInterface = ChromeUtils.generateQI([
  Ci.nsIObserver,
]);
