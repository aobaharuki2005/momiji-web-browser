/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import MozButton from "chrome://global/content/elements/moz-button.mjs";

class DialogButton extends MozButton {
  static properties = {
    dialog: { type: String },
    features: { type: String },
  };

  constructor() {
    super();
    this.ariaHasPopup = "dialog";
  }

  firstUpdated() {
    super.firstUpdated();
    this.addEventListener("click", this.onClick.bind(this));
  }

  onClick() {
    let dialog = this.getAttribute("dialog");
    let features = this.getAttribute("features");
    let args = features ? { features } : undefined;
    window.gSubDialog.open(dialog, args);
  }
}
customElements.define("dialog-button", DialogButton);
