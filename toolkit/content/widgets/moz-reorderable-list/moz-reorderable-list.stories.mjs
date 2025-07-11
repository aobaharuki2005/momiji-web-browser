/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { LitElement, html, ifDefined } from "../vendor/lit.all.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "./moz-reorderable-list.mjs";

const DEFAULT = "Default";
const SHADOW_DOM = "Shadow DOM";

export default {
  title: "UI Widgets/Reorderable List",
  component: "moz-reorderable-list",
  argTypes: {
    demoType: {
      options: [DEFAULT, SHADOW_DOM],
      control: { type: "select" },
    },
  },
  parameters: {
    status: "in-development",
    actions: {
      handles: ["reorder"],
    },
  },
};

class ShadowDemo extends LitElement {
  static shadowRootOptions = {
    ...LitElement.shadowRootOptions,
    delegatesFocus: true,
  };

  static properties = {
    item: { type: String },
  };

  render() {
    return html`<style>
        #shadowed {
          border: var(--border-width) solid var(--border-color);
          border-radius: var(--border-radius-small);
          background-color: var(--background-color-box);
          display: flex;
          align-items: center;
          padding: var(--space-small);
        }
      </style>
      <button id="shadowed">${this.item}</button>`;
  }
}
customElements.define("shadow-demo", ShadowDemo);

class ReorderableDemo extends LitElement {
  static properties = {
    items: { type: Array, state: true },
    type: { type: String },
  };

  // Choosing not to use Shadow DOM here for demo purposes.
  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.items = ["Item 1", "Item 2", "Item 3", "Item 4"];
  }

  async reorderItems(draggedElement, targetElement, before = false) {
    const draggedIndex = this.items.indexOf(draggedElement.textContent.trim());
    const targetIndex = this.items.indexOf(targetElement.textContent.trim());

    let nextItems = [...this.items];
    const [draggedItem] = nextItems.splice(draggedIndex, 1);

    let adjustedTargetIndex = targetIndex;
    if (draggedIndex < targetIndex) {
      adjustedTargetIndex--;
    }

    if (!before) {
      adjustedTargetIndex = adjustedTargetIndex + 1;
    }
    nextItems.splice(adjustedTargetIndex, 0, draggedItem);

    this.items = nextItems;
    await this.updateComplete;
    let movedItem = this.querySelectorAll("li")[adjustedTargetIndex];
    let focusableEl =
      movedItem.shadowRoot?.querySelector(this.selectors.itemSelector) ??
      movedItem.firstElementChild;
    focusableEl?.focus();
  }

  handleReorder(e) {
    const { draggedElement, targetElement, position } = e.detail;
    this.reorderItems(draggedElement, targetElement, position === -1);
  }

  handleKeydown(e) {
    e.stopPropagation();
    const result = this.children[1].evaluateKeyDownEvent(e);
    if (!result) {
      return;
    }
    this.handleReorder({ detail: result });
  }

  addItem() {
    this.items = [...this.items, `Item ${this.items.length + 1}`];
  }

  get selectors() {
    switch (this.type) {
      case DEFAULT:
        return { itemSelector: "li" };
      case SHADOW_DOM:
        return { itemSelector: "#shadowed" };
      default:
        return {};
    }
  }

  contentTemplate(item) {
    if (this.type == DEFAULT) {
      return html`<button>${item}</button>`;
    }
    return html`<shadow-demo item=${item}></shadow-demo>`;
  }

  render() {
    let { itemSelector } = this.selectors;
    return html`
      <style>
        ul {
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--space-small);
        }
        li {
          list-style: none;
        }
      </style>
      <moz-reorderable-list
        itemselector=${ifDefined(itemSelector)}
        @reorder=${this.handleReorder}
        @keydown=${this.handleKeydown}
      >
        <ul>
          ${this.items.map(
            item => html` <li>${this.contentTemplate(item)}</li> `
          )}
        </ul>
      </moz-reorderable-list>
      <button @click=${this.addItem}>Add another item</button>
    `;
  }
}
customElements.define("reorderable-demo", ReorderableDemo);

const Template = ({ demoType }) => html`
  <reorderable-demo type=${demoType}></reorderable-demo>
`;

export const Default = Template.bind({});
Default.args = {
  demoType: DEFAULT,
};

export const ShadowDOM = Template.bind({});
ShadowDOM.args = {
  demoType: SHADOW_DOM,
};
