/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { html, classMap } from "chrome://global/content/vendor/lit.all.mjs";
import {
  connectionTimer,
  defaultTimeValue,
} from "chrome://browser/content/ipprotection/ipprotection-timer.mjs";

// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/ipprotection/ipprotection-header.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/ipprotection/ipprotection-flag.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-toggle.mjs";

/**
 * Custom element that implements a status card for IP protection.
 */
export default class IPProtectionStatusCard extends MozLitElement {
  static queries = {
    statusGroupEl: "#status-card",
    animationEl: "#status-card-animation",
    connectionToggleEl: "#connection-toggle",
    locationEl: "#location-wrapper",
  };

  static shadowRootOptions = {
    ...MozLitElement.shadowRootOptions,
    delegatesFocus: true,
  };

  static properties = {
    protectionEnabled: { type: Boolean },
    canShowTime: { type: Boolean },
    enabledSince: { type: Object },
    location: { type: Object },
    _showAnimation: { type: Boolean, state: true },
    // Track toggle state separately so that we can tell when the toggle
    // is enabled because of existing protection state or because of user action.
    _toggleEnabled: { type: Boolean, state: true },
  };

  constructor() {
    super();

    this.keyListener = this.#keyListener.bind(this);
    this._showAnimation = false;
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

  handleToggleConnect(event) {
    let isEnabled = event.target.pressed;

    if (isEnabled) {
      this.dispatchEvent(
        new CustomEvent("ipprotection-status-card:user-toggled-on", {
          bubbles: true,
          composed: true,
        })
      );
    } else {
      this.dispatchEvent(
        new CustomEvent("ipprotection-status-card:user-toggled-off", {
          bubbles: true,
          composed: true,
        })
      );
    }

    this._toggleEnabled = isEnabled;
  }

  focus() {
    this.connectionToggleEl?.focus();
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

    // If the toggle state isn't set, do so now and let it
    // match the protection state.
    if (!changedProperties.has("_toggleEnabled")) {
      this._toggleEnabled = this.protectionEnabled;
    }

    if (!this.protectionEnabled && this._toggleEnabled) {
      // After pressing the toggle, if somehow protection was turned off
      // (eg. error thrown), unset the toggle.
      this._toggleEnabled = false;
    }

    /**
     * Don't show animations until all elements are connected and layout is fully drawn.
     * This will allow us to best position our animation component with the globe icon
     * based on the most up to date status card dimensions.
     */
    if (this.protectionEnabled) {
      this._showAnimation = true;
    } else {
      this._showAnimation = false;
    }
  }

  descriptionTemplate() {
    return this.location
      ? html`
          <ipprotection-flag .location=${this.location}></ipprotection-flag>
        `
      : null;
  }

  animationRingsTemplate() {
    return html` <div id="status-card-animation">
      <div id="animation-rings"></div>
    </div>`;
  }

  alphaCardTemplate() {
    const statusCardL10nId = this.protectionEnabled
      ? "ipprotection-connection-status-on"
      : "ipprotection-connection-status-off";
    const toggleL10nId = this.protectionEnabled
      ? "ipprotection-toggle-active"
      : "ipprotection-toggle-inactive";
    const statusIcon = this.protectionEnabled
      ? "chrome://browser/content/ipprotection/assets/ipprotection-connection-on.svg"
      : "chrome://browser/content/ipprotection/assets/ipprotection-connection-off.svg";

    let time = this.canShowTime
      ? connectionTimer(this.enabledSince)
      : defaultTimeValue;

    return html` <moz-box-group class="vpn-status-group">
      ${this._showAnimation ? this.animationRingsTemplate() : null}
      <moz-box-item
        id="status-card"
        class=${classMap({
          "is-enabled": this.protectionEnabled,
        })}
        layout="large-icon"
        iconsrc=${statusIcon}
        data-l10n-id=${statusCardL10nId}
        data-l10n-args=${time}
      >
        <moz-toggle
          id="connection-toggle"
          data-l10n-id=${toggleL10nId}
          @click=${this.handleToggleConnect}
          ?pressed=${this._toggleEnabled}
          slot="actions"
        ></moz-toggle>
      </moz-box-item>
      <moz-box-item
        id="location-wrapper"
        class=${classMap({
          "is-enabled": this.protectionEnabled,
        })}
        iconsrc="chrome://global/skin/icons/info.svg"
        data-l10n-id="ipprotection-location-title"
        .description=${this.descriptionTemplate()}
      >
      </moz-box-item>
    </moz-box-group>`;
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/ipprotection/ipprotection-status-card.css"
      />
      ${this.alphaCardTemplate()}
    `;
  }
}

customElements.define("ipprotection-status-card", IPProtectionStatusCard);
