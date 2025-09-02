/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// This is loaded into chrome windows with the subscript loader. Wrap in
// a block to prevent accidentally leaking globals onto `window`.
{
  class MozTabSplitViewWrapper extends MozXULElement {
    static markup = `
      <vbox class="tab-split-view-container" pack="center">
      </vbox>
      `;

    /** @type {MozXULElement} */
    #wrapperElement;

    constructor() {
      super();
    }

    connectedCallback() {
      // Set up TabSelect listener, as this gets
      // removed in disconnectedCallback
      this.ownerGlobal.addEventListener("TabSelect", this);

      if (this._initialized) {
        return;
      }

      this._initialized = true;

      this.textContent = "";
      this.appendChild(this.constructor.fragment);

      this.#wrapperElement = this.querySelector(".tab-split-view-container");

      // Mirroring MozTabbrowserTab
      this.#wrapperElement.container = gBrowser.tabContainer;
      this.wrapper = this.#wrapperElement;
    }

    disconnectedCallback() {
      this.ownerGlobal.removeEventListener("TabSelect", this);
    }

    get splitViewId() {
      return this.getAttribute("splitViewId");
    }

    set splitViewId(val) {
      this.setAttribute("splitViewId", val);
    }

    /**
     * @returns {MozTabbrowserTab[]}
     */
    get tabs() {
      return Array.from(this.#wrapperElement.children).filter(node =>
        node.matches("tab")
      );
    }

    /**
     * add tabs to the split view wrapper
     *
     * @param {MozTabbrowserTab[]} tabs
     */
    addTabs(tabs) {
      for (let [i, tab] of tabs.entries()) {
        if (tab.pinned) {
          return;
        }
        let tabToMove =
          this.ownerGlobal === tab.ownerGlobal
            ? tab
            : gBrowser.adoptTab(tab, {
                tabIndex: gBrowser.tabs.at(-1)._tPos + 1,
                selectTab: tab.selected,
              });
        gBrowser.moveTabToSplitView(tabToMove, this);
        tabToMove.setAttribute(
          i === 0 ? "split-view-first" : "split-view-second",
          "true"
        );
      }
    }

    /**
     * Remove all tabs from the split view wrapper and delete the split view.
     */
    unsplitTabs() {
      for (const tab of this.tabs) {
        tab.removeAttribute("split-view-first");
        tab.removeAttribute("split-view-second");
      }
      gBrowser.unsplitTabs(this);
    }

    close() {
      gBrowser.removeSplitView(this);
    }

    /**
     * @param {CustomEvent} event
     */
    on_TabSelect(event) {
      this.hasActiveTab = event.target.group === this;
    }
  }

  customElements.define("tab-split-view-wrapper", MozTabSplitViewWrapper);
}
