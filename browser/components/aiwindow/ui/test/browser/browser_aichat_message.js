/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Basic rendering + markdown/sanitization test for <ai-chat-message>.
 *
 * Notes:
 * - Uses a content-side readiness gate (readyState polling) instead of
 *   BrowserTestUtils.browserLoaded to avoid missing the load event.
 * - Avoids Lit's updateComplete because MozLitElement variants may not expose it
 *   or it may never resolve in this harness.
 */
add_task(async function test_ai_chat_message_rendering() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.aiwindow.enabled", true]],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:aichatcontent"
  );
  const browser = tab.linkedBrowser;

  try {
    // Wait for content to be fully loaded
    await SpecialPowers.spawn(browser, [], async () => {
      if (content.document.readyState !== "complete") {
        await ContentTaskUtils.waitForEvent(content, "load");
      }
    });

    await SpecialPowers.spawn(browser, [], async () => {
      const doc = content.document;

      function sleep(ms) {
        return new content.Promise(resolve => content.setTimeout(resolve, ms));
      }

      async function withTimeout(promise, ms, label) {
        return content.Promise.race([
          promise,
          new content.Promise((_, reject) =>
            content.setTimeout(
              () => reject(new Error(`Timeout (${ms}ms): ${label}`)),
              ms
            )
          ),
        ]);
      }

      async function waitFor(fn, msg, maxTicks = 200) {
        for (let i = 0; i < maxTicks; i++) {
          try {
            if (fn()) {
              return;
            }
          } catch (_) {
            // Keep looping; DOM may not be ready yet.
          }
          await sleep(0);
        }
        throw new Error(`Timed out waiting: ${msg}`);
      }

      function root(el) {
        return el.shadowRoot ?? el;
      }

      function setRoleAndMessage(el, role, message) {
        // Set both property + attribute to avoid any reflection differences.
        el.role = role;
        el.setAttribute("role", role);

        el.message = message;
        el.setAttribute("message", message);
      }

      // Ensure the custom element is registered. If the module failed to load,
      // this will fail fast instead of hanging until harness teardown.
      await withTimeout(
        content.customElements.whenDefined("ai-chat-message"),
        5000,
        "customElements.whenDefined('ai-chat-message')"
      );

      const el = doc.createElement("ai-chat-message");
      doc.body.appendChild(el);

      Assert.ok(el, "ai-chat-message element should be created");

      // --- User message ---
      setRoleAndMessage(el, "user", "Test user message");

      await waitFor(() => {
        const div = root(el).querySelector(".message-user");
        return div && div.textContent.includes("Test user message");
      }, "User message should render with expected text");

      const userDiv = root(el).querySelector(".message-user");
      Assert.ok(userDiv, "User message div should exist");
      Assert.ok(
        userDiv.textContent.includes("Test user message"),
        `User message content should be present (got: "${userDiv.textContent}")`
      );

      // --- Assistant message ---
      setRoleAndMessage(el, "assistant", "Test AI response");

      await waitFor(() => {
        const div = root(el).querySelector(".message-assistant");
        return div && div.textContent.includes("Test AI response");
      }, "Assistant message should render with expected text");

      let assistantDiv = root(el).querySelector(".message-assistant");
      Assert.ok(assistantDiv, "Assistant message div should exist");
      Assert.ok(
        assistantDiv.textContent.includes("Test AI response"),
        `Assistant message content should be present (got: "${assistantDiv.textContent}")`
      );

      // --- Markdown parsing (positive) ---
      // Verifies that markdown like "**Bold** and *italic*" becomes markup
      // (<strong> and <em> elements) rather than literal asterisks.
      setRoleAndMessage(el, "assistant", "**Bold** and *italic* text");

      await waitFor(() => {
        const div = root(el).querySelector(".message-assistant");
        return div && div.querySelector("strong") && div.querySelector("em");
      }, "Markdown should produce <strong> and <em>");

      assistantDiv = root(el).querySelector(".message-assistant");
      Assert.ok(
        assistantDiv.querySelector("strong"),
        `Expected <strong> in: ${assistantDiv.innerHTML}`
      );
      Assert.ok(
        assistantDiv.querySelector("em"),
        `Expected <em> in: ${assistantDiv.innerHTML}`
      );

      // --- Negative: raw HTML should not become markup ---
      // Verifies sanitization / safe rendering: raw HTML should not be
      // interpreted as elements, but should remain visible as text.
      setRoleAndMessage(el, "assistant", "<b>not bolded</b>");

      await waitFor(() => {
        const div = root(el).querySelector(".message-assistant");
        return (
          div &&
          !div.querySelector("b") &&
          div.textContent.includes("not bolded")
        );
      }, "Raw HTML should not become a <b> element, but text should remain");

      assistantDiv = root(el).querySelector(".message-assistant");
      Assert.ok(
        !assistantDiv.querySelector("b"),
        `Should not contain real <b>: ${assistantDiv.innerHTML}`
      );
      Assert.ok(
        assistantDiv.textContent.includes("not bolded"),
        `Raw HTML content should still be visible as text (got: "${assistantDiv.textContent}")`
      );

      el.remove();
    });
  } finally {
    BrowserTestUtils.removeTab(tab);
    await SpecialPowers.popPrefEnv();
  }
});
