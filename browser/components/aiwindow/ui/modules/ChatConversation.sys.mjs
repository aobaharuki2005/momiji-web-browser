/*
 This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { makeGuid } from "./ChatUtils.sys.mjs";
import { CONVERSATION_STATUS, MESSAGE_ROLE } from "./ChatConstants.sys.mjs";
import {
  AssistantRoleOpts,
  ChatMessage,
  ToolRoleOpts,
  UserRoleOpts,
} from "./ChatMessage.sys.mjs";

/**
 * A conversation containing messages.
 */
export class ChatConversation {
  id;
  title;
  description;
  pageUrl;
  pageMeta;
  createdDate;
  updatedDate;
  status;
  #messages;
  activeBranchTipMessageId;

  /**
   * @param {object} params
   * @param {string} [params.id]
   * @param {string} params.title
   * @param {string} params.description
   * @param {URL} params.pageUrl
   * @param {object} params.pageMeta
   * @param {number} [params.createdDate]
   * @param {number} [params.updatedDate]
   * @param {CONVERSATION_STATUS} [params.status]
   * @param {Array<ChatMessage>} [params.messages]
   */
  constructor(params) {
    const {
      id = makeGuid(),
      title,
      description,
      pageUrl,
      pageMeta,
      createdDate = Date.now(),
      updatedDate = Date.now(),
      messages = [],
    } = params;

    this.id = id;
    this.title = title;
    this.description = description;
    this.pageUrl = pageUrl;
    this.pageMeta = pageMeta;
    this.createdDate = createdDate;
    this.updatedDate = updatedDate;
    this.#messages = messages;

    // NOTE: Destructuring params.status causes a linter error
    this.status = params.status || CONVERSATION_STATUS.ACTIVE;
  }

  /**
   * Adds a message to the conversation
   *
   * @param {ConversationRole} role - The type of conversation message
   * @param {object} content - The conversation message contents
   * @param {URL} pageUrl - The current page url when message was submitted
   * @param {number} turnIndex - The current conversation turn/cycle
   * @param {AssistantRoleOpts|ToolRoleOpts|UserRoleOpts} opts - Additional opts for the message
   */
  addMessage(role, content, pageUrl, turnIndex, opts = {}) {
    if (role < 0 || role > MESSAGE_ROLE.TOOL) {
      return;
    }

    if (turnIndex < 0) {
      turnIndex = 0;
    }

    let parentMessageId = null;
    if (this?.messages?.length) {
      const lastMessageIndex = this.messages.length - 1;
      parentMessageId = this.messages[lastMessageIndex].id;
    }

    const convId = this.id;
    const currentMessages = this?.messages || [];
    const ordinal = currentMessages.length ? currentMessages.length + 1 : 1;

    const message_data = {
      parentMessageId,
      content,
      ordinal,
      pageUrl,
      turnIndex,
      role,
      convId,
      ...opts,
    };

    const newMessage = new ChatMessage(message_data);

    this.messages.push(newMessage);
  }

  /**
   * Add a user message to the conversation
   *
   * @todo Bug 2005424
   * Limit/filter out data uris from message data
   *
   * @param {string} contentBody - The user message content
   * @param {string?} [pageUrl=""] - The current page url when message was submitted
   * @param {number?} [turnIndex=0] - The conversation turn/cycle
   * @param {UserRoleOpts} [userOpts=new UserRoleOpts()] - User message options
   */
  addUserMessage(
    contentBody,
    pageUrl = "",
    turnIndex = 0,
    userOpts = new UserRoleOpts()
  ) {
    const content = {
      type: "text",
      body: contentBody,
    };

    let url = URL.parse(pageUrl);

    this.addMessage(MESSAGE_ROLE.USER, content, url, turnIndex, userOpts);
  }

  /**
   * Add an assistant message to the conversation
   *
   * @param {string} type - The assistant message type: text|function
   * @param {string} contentBody - The assistant message content
   * @param {number} turnIndex - The current conversation turn/cycle
   * @param {AssistantRoleOpts} [assistantOpts=new AssistantRoleOpts()] - ChatMessage options specific to assistant messages
   */
  addAssistantMessage(
    type,
    contentBody,
    turnIndex,
    assistantOpts = new AssistantRoleOpts()
  ) {
    const content = {
      type: "text",
      body: contentBody,
    };

    this.addMessage(
      MESSAGE_ROLE.ASSISTANT,
      content,
      "",
      turnIndex,
      assistantOpts
    );
  }

  /**
   * Add a tool call message to the conversation
   *
   * @param {object} content - The tool call object to be saved as JSON
   * @param {number} turnIndex - The current conversation turn/cycle
   * @param {ToolRoleOpts} [toolOpts=new ToolRoleOpts()] - Message opts for a tool role message
   */
  addToolCallMessage(content, turnIndex, toolOpts = new ToolRoleOpts()) {
    this.addMessage(MESSAGE_ROLE.TOOL, content, "", turnIndex, toolOpts);
  }

  /**
   * Add a system message to the conversation
   *
   * @param {string} type - The assistant message type: text|injected_insights|injected_real_time_info
   * @param {string} contentBody - The system message object to be saved as JSON
   * @param {number} turnIndex - The current conversation turn/cycle
   */
  addSystemMessage(type, contentBody, turnIndex) {
    const content = { type, body: contentBody };

    this.addMessage(MESSAGE_ROLE.SYSTEM, content, "", turnIndex);
  }

  /**
   * Retrieves the list of visited sites during a conversation in visited order.
   * Primarily used to retrieve external URLs that the user had a conversation
   * around to display in Chat History view.
   *
   * @param {boolean} [includeInternal=false] - Whether to include internal Firefox URLs
   *
   * @returns {Array<URL>} - Ordered list of visited page URLs for this conversation
   */
  getSitesList(includeInternal = false) {
    const seen = new Set();
    const deduped = [];

    this.messages.forEach(message => {
      if (!message.pageUrl) {
        return;
      }

      if (!includeInternal && !message.pageUrl.protocol.startsWith("http")) {
        return;
      }

      if (!seen.has(message.pageUrl.href)) {
        seen.add(message.pageUrl.href);
        deduped.push(message.pageUrl);
      }
    });

    return deduped;
  }

  /**
   * Returns the most recently visited external sites during this conversation, or null
   * if no external sites have been visited.
   *
   * @returns {URL|null}
   */
  getMostRecentPageVisited() {
    const sites = this.getSitesList();

    return sites.length ? sites.pop() : null;
  }

  #updateActiveBranchTipMessageId() {
    this.activeBranchTipMessageId = this.messages
      .filter(m => m.isActiveBranch)
      .sort((a, b) => b.ordinal - a.ordinal)
      .shift()?.id;
  }

  set messages(value) {
    this.#messages = value;
    this.#updateActiveBranchTipMessageId();
  }

  get messages() {
    return this.#messages;
  }
}
