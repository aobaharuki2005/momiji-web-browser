/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import {
  BANDWIDTH_USAGE,
  LINKS,
} from "chrome://browser/content/ipprotection/ipprotection-constants.mjs";

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "CURRENT_BANDWIDTH_USAGE",
  "browser.ipProtection.bandwidth",
  0
);

/**
 * Element used for displaying VPN bandwidth usage.
 * By default, the element will display a progress bar and numeric text of the
 * available bandwidth. Adding the attribute `numeric` will only display the
 * numeric text of available bandwidth.
 */
export default class BandwidthUsageCustomElement extends MozLitElement {
  static properties = {
    numeric: { type: Boolean, reflect: true },
  };

  get bandwidthUsedGB() {
    return lazy.CURRENT_BANDWIDTH_USAGE / BANDWIDTH_USAGE.MB_TO_GB;
  }

  get bandwidthPercent() {
    const usageGB = lazy.CURRENT_BANDWIDTH_USAGE / BANDWIDTH_USAGE.MB_TO_GB;
    const percent = (100 * usageGB) / BANDWIDTH_USAGE.MAX_BANDWIDTH;
    if (percent > 90) {
      return 90;
    } else if (percent > 75) {
      return 75;
    }
    return percent.toFixed(0);
  }

  get bandwidthUsedMB() {
    return lazy.CURRENT_BANDWIDTH_USAGE;
  }

  get bandwidthUsageLeftGB() {
    return BANDWIDTH_USAGE.MAX_BANDWIDTH - this.bandwidthUsedGB;
  }

  get bandwidthUsageLeftMB() {
    return this.bandwidthUsageLeftGB * BANDWIDTH_USAGE.MB_TO_GB;
  }

  get bandwidthUsageLeft() {
    if (this.bandwidthUsedGB < 1) {
      // Bug 2006997 - Handle this scenario where less than 1 GB used.
      return Math.floor(this.bandwidthUsageLeftGB);
    } else if (this.bandwidthUsageLeftGB < 1) {
      // Show usage left in MB if less than 1GB left
      return this.bandwidthUsageLeftMB.toFixed(0);
    }

    return this.bandwidthUsageLeftGB.toFixed(0);
  }

  get bandwidthLeftDataL10nId() {
    if (this.bandwidthUsageLeftGB < 1) {
      return "ip-protection-bandwidth-left-mb";
    }
    return "ip-protection-bandwidth-left-gb";
  }

  get bandwidthLeftThisMonthDataL10nId() {
    if (this.bandwidthUsageLeftGB < 1) {
      return "ip-protection-bandwidth-left-this-month-mb";
    }
    return "ip-protection-bandwidth-left-this-month-gb";
  }

  constructor() {
    super();
    this.numeric = false;
  }

  progressBarTemplate() {
    if (this.numeric) {
      return null;
    }

    let descriptionText;
    if (this.bandwidthUsedGB < BANDWIDTH_USAGE.MAX_BANDWIDTH) {
      descriptionText = html`<span
        id="progress-description"
        data-l10n-id=${this.bandwidthLeftDataL10nId}
        data-l10n-args=${JSON.stringify({
          usageLeft: this.bandwidthUsageLeft,
          maxUsage: BANDWIDTH_USAGE.MAX_BANDWIDTH,
        })}
      ></span>`;
    } else {
      descriptionText = html`<span
        id="progress-description"
        data-l10n-id="ip-protection-bandwidth-hit-for-the-month"
        data-l10n-args=${JSON.stringify({
          maxUsage: BANDWIDTH_USAGE.MAX_BANDWIDTH,
        })}
      ></span>`;
    }

    return html`
      <div class="container">
        <h3
          id="bandwidth-header"
          data-l10n-id="ip-protection-bandwidth-header"
        ></h3>
        <div>
          <span
            id="usage-help-text"
            data-l10n-id="ip-protection-bandwidth-help-text"
            data-l10n-args=${JSON.stringify({
              maxUsage: BANDWIDTH_USAGE.MAX_BANDWIDTH,
            })}
          ></span>
          <a
            is="moz-support-link"
            part="support-link"
            support-page=${LINKS.SUPPORT_URL}
          ></a>
        </div>
        <progress
          id="progress-bar"
          max="150"
          value=${this.bandwidthUsedGB}
          percent=${this.bandwidthPercent}
        ></progress>
        ${descriptionText}
      </div>
    `;
  }

  numericTemplate() {
    if (!this.numeric) {
      return null;
    }

    if (this.bandwidthUsedGB < BANDWIDTH_USAGE.MAX_BANDWIDTH) {
      return html`<span
        id="progress-description"
        data-l10n-id=${this.bandwidthLeftThisMonthDataL10nId}
        data-l10n-args=${JSON.stringify({
          usageLeft: this.bandwidthUsageLeft,
          maxUsage: BANDWIDTH_USAGE.MAX_BANDWIDTH,
        })}
      ></span>`;
    }

    return html`<span
      id="progress-description"
      data-l10n-id="ip-protection-bandwidth-hit-for-the-month"
      data-l10n-args=${JSON.stringify({
        maxUsage: BANDWIDTH_USAGE.MAX_BANDWIDTH,
      })}
    ></span>`;
  }

  render() {
    let content = null;
    if (this.numeric) {
      content = this.numericTemplate();
    } else {
      content = this.progressBarTemplate();
    }

    return html`<link
        rel="stylesheet"
        href="chrome://browser/content/ipprotection/bandwidth-usage.css"
      />
      ${content}`;
  }
}
customElements.define("bandwidth-usage", BandwidthUsageCustomElement);
