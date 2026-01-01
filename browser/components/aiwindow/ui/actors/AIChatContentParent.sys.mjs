/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * JSWindowActor to pass data between AIChatContent singleton and content pages.
 */
export class AIChatContentParent extends JSWindowActorParent {
  async dispatchMessageToChatContent(response) {
    return this.sendQuery("AIChatContent:DispatchMessage", response);
  }
}
