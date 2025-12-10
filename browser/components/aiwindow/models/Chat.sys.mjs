/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* eslint-disable-next-line mozilla/reject-import-system-module-from-non-system */
import { getFxAccountsSingleton } from "resource://gre/modules/FxAccounts.sys.mjs";
import { openAIEngine } from "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs";
import {
  OAUTH_CLIENT_ID,
  SCOPE_PROFILE,
} from "resource://gre/modules/FxAccountsCommon.sys.mjs";

/**
 * Chat
 */
export const Chat = {
  toolMap: {}, // TODO can import toolMap

  async _getFxAccountToken() {
    try {
      const fxAccounts = getFxAccountsSingleton();
      const token = await fxAccounts.getOAuthToken({
        // Scope needs to be updated in accordance with https://bugzilla.mozilla.org/show_bug.cgi?id=2005290
        scope: SCOPE_PROFILE,
        client_id: OAUTH_CLIENT_ID,
      });
      return token;
    } catch (error) {
      console.warn("Error obtaining FxA token:", error);
      return null;
    }
  },

  /**
   * Stream assistant output with tool-call support.
   * Yields assistant text chunks as they arrive. If the model issues tool calls,
   * we execute them locally, append results to the conversation, and continue
   * streaming the model’s follow-up answer. Repeats until no more tool calls.
   *
   * @param {Array<{role:string, content?:string, tool_call_id?:string, tool_calls?:any}>} messages
   * @yields {string} Assistant text chunks
   */
  async *fetchWithHistory(messages) {
    const engineInstance = await openAIEngine.build();
    // Note FXA token fetching disabled for now - this is still in progress
    // We can flip this switch on when more realiable
    // const fxAccountToken = await this._getFxAccountToken();

    // We'll mutate a local copy of the thread as we loop
    let convo = Array.isArray(messages) ? [...messages] : [];

    // Helper to run the model once (streaming) on current convo
    const streamModelResponse = () =>
      engineInstance.runWithGenerator({
        streamOptions: { enabled: true },
        // fxAccountToken,
        tool_choice: "auto",
        // tools: Add your tools configuration here,
        args: convo,
      });

    // Keep calling until the model finishes without requesting tools
    while (true) {
      let pendingToolCalls = null;

      // 1) First pass: stream tokens; capture any toolCalls
      for await (const chunk of streamModelResponse()) {
        // Stream assistant text to the UI
        if (chunk?.text) {
          yield chunk.text;
        }

        // Capture tool calls (do not echo raw tool plumbing to the user)
        if (chunk?.toolCalls?.length) {
          pendingToolCalls = chunk.toolCalls;
        }
      }

      // 2) Watch for tool calls; if none, we are done
      if (!pendingToolCalls || pendingToolCalls.length === 0) {
        return;
      }

      // 3) Build the assistant tool_calls message exactly as expected by the API
      const assistantToolMsg = {
        role: "assistant",
        tool_calls: pendingToolCalls.map(toolCall => ({
          id: toolCall.id,
          type: "function",
          function: {
            name: toolCall.function.name,
            arguments: toolCall.function.arguments,
          },
        })),
      };

      // 4) Execute each tool locally and create a tool message with the result
      const toolResultMessages = [];
      for (const toolCall of pendingToolCalls) {
        const { id, function: functionSpec } = toolCall;
        const name = functionSpec?.name || "";
        let toolParams = {};

        try {
          toolParams = functionSpec?.arguments
            ? JSON.parse(functionSpec.arguments)
            : {};
        } catch {
          toolResultMessages.push({
            role: "tool",
            tool_call_id: id,
            content: JSON.stringify({ error: "Invalid JSON arguments" }),
          });
          continue;
        }

        let result;
        try {
          // Call the appropriate tool by name
          const toolFunc = this.toolMap[name];
          if (typeof toolFunc !== "function") {
            throw new Error(`No such tool: ${name}`);
          }

          result = await toolFunc(toolParams);

          // Create special tool call log message to show in the UI log panel
          const assistantToolCallLogMsg = {
            role: "assistant",
            content: `Tool Call: ${name} with parameters: ${JSON.stringify(
              toolParams
            )}`,
            type: "tool_call_log",
            result,
          };
          convo.push(assistantToolCallLogMsg);
          yield assistantToolCallLogMsg;
        } catch (e) {
          result = { error: `Tool execution failed: ${String(e)}` };
        }

        toolResultMessages.push({
          role: "tool",
          tool_call_id: id,
          content: typeof result === "string" ? result : JSON.stringify(result),
        });
      }

      convo = [...convo, assistantToolMsg, ...toolResultMessages];
    }
  },
};
