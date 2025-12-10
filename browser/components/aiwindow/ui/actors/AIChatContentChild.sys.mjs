/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {});

/**
 * Represents a child actor for getting page data from the browser.
 */
export class AIChatContentChild extends JSWindowActorChild {
  async receiveMessage(message) {
    switch (message.name) {
      case "AIChatContent:DispatchAIResponse":
        return this.dispatchAIResponseToChatContent(message.data.response);
    }
    return undefined;
  }

  async dispatchAIResponseToChatContent(response) {
    try {
      const chatContent = this.document.querySelector("ai-chat-content");
      const event = new this.contentWindow.CustomEvent("ai-response", {
        detail: response,
        bubbles: true,
      });
      chatContent.dispatchEvent(event);
      return false;
    } catch (error) {
      console.error("Error dispatching AI response to chat content:", error);
      return false;
    }
  }
}
