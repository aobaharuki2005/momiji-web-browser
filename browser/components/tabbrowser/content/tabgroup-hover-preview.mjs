/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

export default class TabGroupHoverPreviewPanel {
  /** @type {Window} */
  #win;

  /** @type {MozTabbrowserTabGroup} */
  #group;

  /** @type {MozXULElement[]} */
  #openPopups;

  constructor(panel) {
    this.panel = panel;
    this.#win = panel.ownerGlobal;
    this.#group = null;

    this.#setExternalPopupListeners();

    this.panel.addEventListener("command", this);

    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "_prefDisableAutohide",
      "ui.popup.disable_autohide",
      false
    );
  }

  activate(tabGroupLabel) {
    this.#group = tabGroupLabel.group;

    if (!this.#shouldActivate()) {
      return;
    }

    this.panel.addEventListener("mouseout", this);

    const fragment = this.#win.document.createDocumentFragment();
    for (let tab of this.#group.tabs) {
      let menuitem = this.#win.document.createXULElement("menuitem");
      menuitem.setAttribute("label", tab.label);
      menuitem.setAttribute(
        "image",
        "page-icon:" + tab.linkedBrowser.currentURI.spec
      );
      menuitem.setAttribute("tooltiptext", tab.label);
      menuitem.classList.add("menuitem-iconic", "menuitem-with-favicon");
      menuitem.tab = tab;
      fragment.appendChild(menuitem);
    }
    this.panel.replaceChildren(fragment);

    this.panel.openPopup(this.#group.labelElement, this.#popupOptions);
  }

  deactivate(tabGroupLabel = null) {
    if (this._prefDisableAutohide) {
      return;
    }
    if (tabGroupLabel?.matches(":hover") || this.panel.matches(":hover")) {
      return;
    }

    this.panel.removeEventListener("mouseout", this);
    this.panel.hidePopup();
  }

  /**
   * Listen for any panels or menupopups that open or close anywhere else in the DOM tree
   * and maintain a list of the ones that are currently open.
   * This is used to disable tab previews until such time as the other panels are closed.
   */
  #setExternalPopupListeners() {
    // Since the panel is lazy loaded, there is a possibility that panels could
    // already be open on init. Therefore we need to initialize #openPopups with existing panels
    // the first time.

    const initialPopups = this.#win.document.querySelectorAll(
      "panel[panelopen=true], panel[animating=true], menupopup[open=true]"
    );
    this.#openPopups = new Set(initialPopups);

    const handleExternalPopupEvent = (eventName, setMethod) => {
      this.#win.addEventListener(eventName, ev => {
        if (
          ev.target !== this.panel &&
          (ev.target.nodeName == "panel" || ev.target.nodeName == "menupopup")
        ) {
          this.#openPopups[setMethod](ev.target);
        }
      });
    };
    handleExternalPopupEvent("popupshowing", "add");
    handleExternalPopupEvent("popuphiding", "delete");
  }

  #shouldActivate() {
    return (
      // The group is collapsed.
      this.#group.collapsed &&
      // All other popups are closed.
      !this.#openPopups.size &&
      // TODO (bug 1899556): for now disable in background windows, as there are
      // issues with windows ordering on Linux (bug 1897475), plus intermittent
      // persistence of previews after session restore (bug 1888148).
      this.#win == Services.focus.activeWindow
    );
  }

  get #popupOptions() {
    if (!this.#verticalMode) {
      return {
        position: "bottomleft topleft",
        x: 0,
        y: -2,
      };
    }
    if (!this.#win.SidebarController._positionStart) {
      return {
        position: "topleft topright",
        x: 0,
        y: 3,
      };
    }
    return {
      position: "topright topleft",
      x: 0,
      y: 3,
    };
  }

  get #verticalMode() {
    return this.#win.gBrowser.tabContainer.verticalMode;
  }

  handleEvent(event) {
    if (event.type == "command") {
      this.#win.gBrowser.selectedTab = event.target.tab;
    }

    if (event.type == "mouseout" && event.target == this.panel) {
      this.deactivate(this.#group.labelElement);
    }
  }
}
