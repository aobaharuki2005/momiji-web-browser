/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import "chrome://browser/content/aiwindow/components/ai-chat-content.mjs";

export default {
  title: "Domain-specific UI Widgets/AI Window/AI Chat Content",
  component: "ai-chat-content",
  argTypes: {
    conversationState: {
      control: { type: "object" },
    },
  },
};

const Template = ({ conversationState }) => html`
  <ai-chat-content .conversationState=${conversationState}></ai-chat-content>
`;

export const Empty = Template.bind({});
Empty.args = {
  conversationState: [],
};

export const SingleUserMessage = Template.bind({});
SingleUserMessage.args = {
  conversationState: [
    { role: "user", content: "What is the weather like today?" },
  ],
};

export const Conversation = Template.bind({});
Conversation.args = {
  conversationState: [
    { role: "user", content: "Test: What is the weather like today?" },
    {
      role: "assistant",
      content:
        "Test: I don't have access to real-time weather data, but I can help you with other tasks!",
    },
    { role: "user", content: "Test: Can you help me with coding?" },
    {
      role: "assistant",
      content:
        "Test: Yes, I can help you with coding! What programming language or problem are you working on?",
    },
  ],
};
