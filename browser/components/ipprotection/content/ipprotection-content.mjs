/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { html, classMap } from "chrome://global/content/vendor/lit.all.mjs";
import { LINKS } from "chrome://browser/content/ipprotection/ipprotection-constants.mjs";

// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/ipprotection/ipprotection-header.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/ipprotection/ipprotection-signedout.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-toggle.mjs";

const DEFAULT_TIME_CONNECTED = "00:00:00";

export default class IPProtectionContentElement extends MozLitElement {
  static queries = {
    headerEl: "ipprotection-header",
    signedOutEl: "ipprotection-signedout",
    statusCardEl: "#status-card",
    animationEl: "#status-card-animation",
    connectionToggleEl: "#connection-toggle",
    locationEl: "#location-wrapper",
    upgradeEl: "#upgrade-vpn-content",
    activeSubscriptionEl: "#active-subscription-vpn-content",
    supportLinkEl: "#vpn-support-link",
    downloadButtonEl: "#download-vpn-button",
  };

  static properties = {
    state: { type: Object },
    showAnimation: { type: Boolean, state: true },
  };

  constructor() {
    super();

    this.state = {};

    this.keyListener = this.#keyListener.bind(this);
    this.showAnimation = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.dispatchEvent(new CustomEvent("IPProtection:Init", { bubbles: true }));

    this.addEventListener("keydown", this.keyListener, { capture: true });
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this.removeEventListener("keydown", this.keyListener, { capture: true });
  }

  handleClickSupportLink(event) {
    const win = event.target.ownerGlobal;

    if (event.target === this.supportLinkEl) {
      win.openWebLinkIn(LINKS.PRODUCT_URL, "tab");
      this.dispatchEvent(
        new CustomEvent("IPProtection:Close", { bubbles: true })
      );
    }
  }

  handleToggleConnect(event) {
    let isEnabled = event.target.pressed;

    if (isEnabled) {
      this.dispatchEvent(
        new CustomEvent("IPProtection:UserEnable", { bubbles: true })
      );
    } else {
      this.dispatchEvent(
        new CustomEvent("IPProtection:UserDisable", { bubbles: true })
      );
    }
  }

  handleUpgrade(event) {
    const win = event.target.ownerGlobal;
    win.openWebLinkIn(LINKS.PRODUCT_URL + "#pricing", "tab");
    // Close the panel
    this.dispatchEvent(
      new CustomEvent("IPProtection:Close", { bubbles: true })
    );
  }

  handleDownload(event) {
    const win = event.target.ownerGlobal;
    win.openWebLinkIn(LINKS.DOWNLOAD_URL, "tab");
    // Close the panel
    this.dispatchEvent(
      new CustomEvent("IPProtection:Close", { bubbles: true })
    );
  }

  focus() {
    if (!this.state.isSignedIn) {
      this.signedOutEl?.focus();
    } else {
      this.connectionToggleEl?.focus();
    }
  }

  #keyListener(event) {
    let keyCode = event.code;
    switch (keyCode) {
      case "ArrowUp":
      // Intentional fall-through
      case "ArrowDown": {
        event.stopPropagation();
        event.preventDefault();

        let direction =
          keyCode == "ArrowDown"
            ? Services.focus.MOVEFOCUS_FORWARD
            : Services.focus.MOVEFOCUS_BACKWARD;
        Services.focus.moveFocus(
          window,
          null,
          direction,
          Services.focus.FLAG_BYKEY
        );
        break;
      }
    }
  }

  updated(changedProperties) {
    super.updated(changedProperties);

    /**
     * Don't show animations until all elements are connected and layout is fully drawn.
     * This will allow us to best position our animation component with the globe icon
     * based on the most up to date status card dimensions.
     */
    if (this.state.isProtectionEnabled) {
      this.showAnimation = true;
    } else {
      this.showAnimation = false;
    }
  }

  descriptionTemplate() {
    // TODO: add icon (Bug 1976769), this is just a placeholder element
    return html`
      <img id="location-icon" src="chrome://global/skin/icons/folder.svg" />
      <span id="location-name">${this.state.location}</span>
    `;
  }

  statusCardTemplate() {
    let protectionEnabled = this.state.isProtectionEnabled;
    const statusCardL10nId = protectionEnabled
      ? "ipprotection-connection-status-on"
      : "ipprotection-connection-status-off";
    const toggleL10nId = protectionEnabled
      ? "ipprotection-toggle-active"
      : "ipprotection-toggle-inactive";
    const statusIcon = protectionEnabled
      ? "chrome://browser/content/ipprotection/assets/ipprotection-connection-on.svg"
      : "chrome://browser/content/ipprotection/assets/ipprotection-connection-off.svg";

    // TODO: update timer and its starting value according to the protectionEnabledSince property (Bug 1972460)
    const timeConnected = DEFAULT_TIME_CONNECTED;

    return html`<moz-box-group class="vpn-status-group">
      ${this.showAnimation
        ? html` <div id="status-card-animation">
            <div id="animation-rings"></div>
          </div>`
        : null}
      <moz-box-item
        id="status-card"
        class=${classMap({
          "is-enabled": this.state.isProtectionEnabled,
        })}
        layout="large-icon"
        iconsrc=${statusIcon}
        data-l10n-id=${statusCardL10nId}
        data-l10n-args=${JSON.stringify({ time: timeConnected })}
      >
        <moz-toggle
          id="connection-toggle"
          data-l10n-id=${toggleL10nId}
          @click=${this.handleToggleConnect}
          ?pressed=${this.state.isProtectionEnabled}
          slot="actions"
        ></moz-toggle>
      </moz-box-item>
      <moz-box-item
        id="location-wrapper"
        class=${classMap({
          "is-enabled": this.state.isProtectionEnabled,
        })}
        iconsrc="chrome://global/skin/icons/info.svg"
        data-l10n-id="ipprotection-location-title"
        .description=${this.descriptionTemplate()}
      >
      </moz-box-item>
    </moz-box-group>`;
  }

  beforeUpgradeTemplate() {
    return html`
      <div id="upgrade-vpn-content" class="vpn-bottom-content">
        <h2
          id="upgrade-vpn-title"
          data-l10n-id="upgrade-vpn-title"
          class="vpn-subtitle"
        ></h2>
        <p
          id="upgrade-vpn-paragraph"
          data-l10n-id="upgrade-vpn-paragraph"
          @click=${this.handleClickSupportLink}
        >
          <a
            id="vpn-support-link"
            href=${LINKS.PRODUCT_URL}
            data-l10n-name="learn-more-vpn"
          ></a>
        </p>
        <moz-button
          id="upgrade-vpn-button"
          class="vpn-button"
          @click=${this.handleUpgrade}
          type="secondary"
          data-l10n-id="upgrade-vpn-button"
        ></moz-button>
      </div>
    `;
  }

  afterUpgradeTemplate() {
    return html`<div
      id="active-subscription-vpn-content"
      class="vpn-bottom-content"
    >
      <h2
        id="active-subscription-vpn-title"
        class="vpn-subtitle"
        data-l10n-id="active-subscription-vpn-title"
      ></h2>
      <p
        id="active-subscription-vpn-message"
        data-l10n-id="active-subscription-vpn-message"
      ></p>
      <moz-button
        id="download-vpn-button"
        class="vpn-button"
        @click=${this.handleDownload}
        data-l10n-id="get-vpn-button"
        type="primary"
      ></moz-button>
    </div>`;
  }

  mainContentTemplate() {
    // TODO: Update support-page with new SUMO link for Mozilla VPN - Bug 1975474
    if (!this.state.isSignedIn) {
      return html` <ipprotection-signedout></ipprotection-signedout> `;
    }
    return html`
      ${this.statusCardTemplate()}
      ${this.state.hasUpgraded
        ? this.afterUpgradeTemplate()
        : this.beforeUpgradeTemplate()}
    `;
  }

  render() {
    // TODO: Conditionally render post-upgrade subview within #ipprotection-content-wrapper - Bug 1973813
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/ipprotection/ipprotection-content.css"
      />
      <ipprotection-header titleId="ipprotection-title"></ipprotection-header>
      <hr />
      <div id="ipprotection-content-wrapper">${this.mainContentTemplate()}</div>
    `;
  }
}

customElements.define("ipprotection-content", IPProtectionContentElement);
