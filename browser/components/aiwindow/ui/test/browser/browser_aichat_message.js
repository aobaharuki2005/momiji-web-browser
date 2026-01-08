/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Basic rendering + markdown/sanitization test for <ai-chat-message>.
 *
 * Avoids Lit's updateComplete because MozLitElement variants may not expose it
 * or it may never resolve in this harness.
 */
add_task(async function test_ai_chat_message_rendering() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.aiwindow.enabled", true]],
  });

  await BrowserTestUtils.withNewTab("about:aichatcontent", async browser => {
    await SpecialPowers.spawn(browser, [], async () => {
      await content.customElements.whenDefined("ai-chat-message");

      const doc = content.document;

      const el = doc.createElement("ai-chat-message");
      doc.body.appendChild(el);

      Assert.ok(el, "ai-chat-message element should be created");

      function root() {
        return el.shadowRoot ?? el;
      }

      function setRoleAndMessage(role, message) {
        // Set both property + attribute to avoid any reflection differences.
        el.role = role;
        el.setAttribute("role", role);

        el.message = message;
        el.setAttribute("message", message);
      }

      async function waitFor(fn, msg) {
        for (let i = 0; i < 120; i++) {
          try {
            if (fn()) {
              return;
            }
          } catch (e) {
            // Keep looping; DOM may not be ready yet.
          }
          await new content.Promise(resolve =>
            content.requestAnimationFrame(resolve)
          );
        }
        Assert.ok(false, `Timed out: ${msg}`);
      }

      // --- User message ---
      setRoleAndMessage("user", "Test user message");

      await waitFor(() => {
        const div = root().querySelector(".message-user");
        return div && div.textContent.includes("Test user message");
      }, "User message should render with expected text");

      const userDiv = root().querySelector(".message-user");
      Assert.ok(userDiv, "User message div should exist");
      Assert.ok(
        userDiv.textContent.includes("Test user message"),
        `User message content should be present (got: "${userDiv.textContent}")`
      );

      // --- Assistant message ---
      setRoleAndMessage("assistant", "Test AI response");

      await waitFor(() => {
        const div = root().querySelector(".message-assistant");
        return div && div.textContent.includes("Test AI response");
      }, "Assistant message should render with expected text");

      let assistantDiv = root().querySelector(".message-assistant");
      Assert.ok(assistantDiv, "Assistant message div should exist");
      Assert.ok(
        assistantDiv.textContent.includes("Test AI response"),
        `Assistant message content should be present (got: "${assistantDiv.textContent}")`
      );

      // --- Markdown parsing (positive) ---
      setRoleAndMessage("assistant", "**Bold** and *italic* text");

      await waitFor(() => {
        const div = root().querySelector(".message-assistant");
        return div && div.querySelector("strong") && div.querySelector("em");
      }, "Markdown should produce <strong> and <em>");

      assistantDiv = root().querySelector(".message-assistant");
      Assert.ok(
        assistantDiv.querySelector("strong"),
        `Expected <strong> in: ${assistantDiv.innerHTML}`
      );
      Assert.ok(
        assistantDiv.querySelector("em"),
        `Expected <em> in: ${assistantDiv.innerHTML}`
      );

      // --- Negative: raw HTML should not become markup ---
      setRoleAndMessage("assistant", "<b>not bolded</b>");

      await waitFor(() => {
        const div = root().querySelector(".message-assistant");
        return (
          div &&
          !div.querySelector("b") &&
          div.textContent.includes("not bolded")
        );
      }, "Raw HTML should not become a <b> element, but text should remain");

      assistantDiv = root().querySelector(".message-assistant");
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
  });

  await SpecialPowers.popPrefEnv();
});
