/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Tests that the rule view shows expanders for properties with computed lists.

var TEST_URI = `
  <style type="text/css">
    #testid {
      margin: 4px;
      top: 0px;
    }
  </style>
  <h1 id="testid">Styled Node</h1>
`;

add_task(async function () {
  await addTab("data:text/html;charset=utf-8," + encodeURIComponent(TEST_URI));
  const { inspector, view } = await openRuleView();
  await selectNode("#testid", inspector);
  await testExpandersShown(inspector, view);
});

function testExpandersShown(inspector, view) {
  const rule = getRuleViewRuleEditor(view, 1).rule;

  info("Check that the correct rules are visible");
  is(rule.selectorText, "#testid", "Second rule is #testid.");
  is(rule.textProps[0].name, "margin", "First property is margin.");
  is(rule.textProps[1].name, "top", "Second property is top.");

  info("Check that the expanders are shown correctly");
  ok(rule.textProps[0].editor.expander, "margin expander is displayed.");
  ok(!rule.textProps[1].editor.expander, "top expander is hidden.");
  ok(
    !rule.textProps[0].editor.expander.hasAttribute("open"),
    "margin computed list is closed."
  );
  ok(
    !rule.textProps[0].editor.computed,
    "margin computed list does not exist before opening."
  );
  ok(!rule.textProps[1].editor.computed, "top computed list is not rendered.");
}
