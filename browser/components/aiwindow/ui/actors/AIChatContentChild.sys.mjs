/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {});

/**
 * Represents a child actor for getting page data from the browser.
 */
export class AIChatContentChild extends JSWindowActorChild {
  static #EVENT_MAPPINGS = {
    "AIChatContent:DispatchMessage": {
      event: "aiChatContentActor:message",
    },
  };

  async receiveMessage(message) {
    const mapping = AIChatContentChild.#EVENT_MAPPINGS[message.name];

    if (!mapping) {
      console.warn(
        `AIChatContentChild received unknown message: ${message.name}`
      );
      return undefined;
    }

    const payload = message.data;
    return this.#dispatchToChatContent(mapping.event, payload);
  }

  #dispatchToChatContent(eventName, payload) {
    try {
      const chatContent = this.document.querySelector("ai-chat-content");

      if (!chatContent) {
        console.error(`No ai-chat-content element found for ${eventName}`);
        return false;
      }

      const clonedPayload = Cu.cloneInto(payload, this.contentWindow);

      const event = new this.contentWindow.CustomEvent(eventName, {
        detail: clonedPayload,
        bubbles: true,
      });

      chatContent.dispatchEvent(event);
      return true;
    } catch (error) {
      console.error(`Error dispatching ${eventName} to chat content:`, error);
      return false;
    }
  }
}
