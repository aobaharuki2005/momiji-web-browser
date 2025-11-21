/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Testing editing pseudo element selector in the rule view.
const TEST_URI = `
  <style>
    h1::before {
      content: "-";
      color: lime;
    }
  </style>
  <h1 class=foo>pseudo</h1>`;

add_task(async function test_inline_sheet() {
  await addTab(
    `data:text/html,<meta charset=utf8>${encodeURIComponent(TEST_URI)}`
  );
  const { inspector, view } = await openRuleView();

  info("Check that we can edit the selectors in the pseudo elements section");
  await selectNode("h1", inspector);

  info("Expand pseudo elements section");
  const pseudoElementToggle = view.styleDocument.querySelector(
    `[aria-controls="pseudo-elements-container"]`
  );
  // sanity check
  is(
    pseudoElementToggle.ariaExpanded,
    "false",
    "pseudo element section is collapsed at first"
  );
  pseudoElementToggle.click();
  is(
    pseudoElementToggle.ariaExpanded,
    "true",
    "pseudo element section is now expanded"
  );

  info(`Modify "h1::before" into ".foo::before"`);
  let ruleEditor = getRuleViewRuleEditor(view, 1, 0);
  let editor = await focusEditableField(view, ruleEditor.selectorText);
  let onRuleViewChanged = view.once("ruleview-changed");
  editor.input.value = ".foo::before";
  EventUtils.synthesizeKey("KEY_Enter");
  await onRuleViewChanged;

  // Get the new rule editor reference
  ruleEditor = getRuleViewRuleEditor(view, 1, 0);
  is(ruleEditor.selectorText.textContent, ".foo::before");
  is(
    ruleEditor.element.getAttribute("unmatched"),
    "false",
    "pseudo element rule still matches"
  );

  info(`Modify ".foo::before" into ".foo::after"`);
  ruleEditor = getRuleViewRuleEditor(view, 1, 0);
  editor = await focusEditableField(view, ruleEditor.selectorText);
  onRuleViewChanged = view.once("ruleview-changed");
  editor.input.value = ".foo::after";
  EventUtils.synthesizeKey("KEY_Enter");
  await onRuleViewChanged;

  // Get the new rule editor reference
  ruleEditor = getRuleViewRuleEditor(view, 1, 0);
  is(ruleEditor.selectorText.textContent, ".foo::after");
  is(
    ruleEditor.element.getAttribute("unmatched"),
    "false",
    "pseudo element rule still matches"
  );

  info(`Modify ".foo::after" into unmatching "h2::after"`);
  ruleEditor = getRuleViewRuleEditor(view, 1, 0);
  editor = await focusEditableField(view, ruleEditor.selectorText);
  onRuleViewChanged = view.once("ruleview-changed");
  editor.input.value = "h2::after";
  EventUtils.synthesizeKey("KEY_Enter");
  await onRuleViewChanged;

  // Get the new rule editor reference
  ruleEditor = getRuleViewRuleEditor(view, 1, 0);
  is(ruleEditor.selectorText.textContent, "h2::after");
  is(
    ruleEditor.element.getAttribute("unmatched"),
    "true",
    "pseudo element rule does not match h1 anymore"
  );

  info(`Modify "h2::after" back into matching "h1::after"`);
  ruleEditor = getRuleViewRuleEditor(view, 1, 0);
  editor = await focusEditableField(view, ruleEditor.selectorText);
  onRuleViewChanged = view.once("ruleview-changed");
  editor.input.value = "h1::after";
  EventUtils.synthesizeKey("KEY_Enter");
  await onRuleViewChanged;

  // Get the new rule editor reference
  ruleEditor = getRuleViewRuleEditor(view, 1, 0);
  is(ruleEditor.selectorText.textContent, "h1::after");
  is(
    ruleEditor.element.getAttribute("unmatched"),
    "false",
    "pseudo element rule does match back the h1 node"
  );
});
