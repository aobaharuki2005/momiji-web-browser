/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

/**
 * Minimal multiline editor placeholder for SmartBarInput.
 */
class SmartbarEditor extends MozLitElement {
  createRenderRoot() {
    return this;
  }

  get value() {
    return this.textContent ?? "";
  }

  set value(val) {
    this.textContent = val ?? "";
  }

  initializeFromInput(inputElement) {
    if (!inputElement) {
      return null;
    }

    // Copy existing input attributes.
    for (const inputAttribute of inputElement.attributes) {
      this.setAttribute(inputAttribute.name, inputAttribute.value);
    }

    this.setAttribute("contenteditable", "true");
    this.setAttribute("aria-multiline", "true");
    this.removeAttribute("type");
    this.removeAttribute("value");
    this.className = inputElement.className;
    this.textContent = inputElement.value ?? "";

    inputElement.replaceWith(this);
    return { input: this, editor: createEditorAdapter(this) };
  }
}

function createEditor(inputElement) {
  if (!inputElement) {
    return null;
  }
  if (inputElement.localName == "moz-smartbar-editor") {
    return {
      input: inputElement,
      editor: createEditorAdapter(inputElement),
    };
  }
  const host = inputElement.ownerDocument.createElement("moz-smartbar-editor");
  return host.initializeFromInput(inputElement);
}

// Adapter for Smartbar editor element.
function createEditorAdapter(editorElement) {
  return {
    get composing() {
      return false;
    },
    selection: {
      get rangeCount() {
        const selection = editorElement.ownerGlobal.getSelection();
        return selection?.rangeCount ?? 0;
      },
      toStringWithFormat() {
        const selection = editorElement.ownerGlobal.getSelection();
        if (
          !selection ||
          !selection.rangeCount ||
          !editorElement.contains(selection.anchorNode)
        ) {
          return "";
        }
        return selection.toString();
      },
    },
  };
}

customElements.define("moz-smartbar-editor", SmartbarEditor);

export { createEditor, createEditorAdapter };
