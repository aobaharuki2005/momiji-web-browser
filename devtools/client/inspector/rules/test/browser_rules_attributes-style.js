/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Test that attributes style (presentational hints) "rules" are displayed

const TEST_URI = `
  <style>
    .right {
      text-align: right;
    }
  </style>
  <canvas width=100 height=150 style="outline: 1px solid"></canvas>
  <h1 align="center">
    In <span>a galaxy </span><span class="right">far far</span> <p align="left">away</p>
  </h1>
  <h2 align="left" style="text-align: center">foo</h2>
  <table></table>
`;

add_task(async function () {
  await addTab("data:text/html;charset=utf-8," + encodeURIComponent(TEST_URI));
  const { inspector, view } = await openRuleView();

  // Check that the element style and element attribute style are displayed
  await selectNode("canvas", inspector);
  checkRuleViewContent(view, [
    {
      selector: "element",
      declarations: [{ name: "outline", value: "1px solid" }],
    },
    {
      selector: "element attributes style",
      declarations: [{ name: "aspect-ratio", value: "auto 100 / 150" }],
    },
  ]);

  // Check that the element attribute style are displayed
  await selectNode("h1", inspector);
  checkRuleViewContent(view, [
    {
      selector: "element",
      declarations: [],
    },
    {
      selector: "element attributes style",
      declarations: [{ name: "text-align", value: "-moz-center" }],
    },
  ]);

  // Check that the inherited element attribute style are displayed
  await selectNode("h1 > span", inspector);
  checkRuleViewContent(view, [
    {
      selector: "element",
      declarations: [],
    },
    {
      header: "Inherited from h1",
    },
    {
      selector: "element attributes style",
      declarations: [{ name: "text-align", value: "-moz-center" }],
    },
  ]);

  // Check that the .right rule is displayed, as well as inherited element attribute style
  // with overridden text-align declaration
  await selectNode("h1 > span.right", inspector);
  checkRuleViewContent(view, [
    {
      selector: "element",
      declarations: [],
    },
    {
      selector: ".right",
      declarations: [{ name: "text-align", value: "right" }],
    },
    {
      header: "Inherited from h1",
    },
    {
      selector: "element attributes style",
      declarations: [
        { name: "text-align", value: "-moz-center", overridden: true },
      ],
    },
  ]);

  // Check that element attribute style is displayed, as well as inherited element attribute
  // style with overridden text-align declaration
  await selectNode("h1 > p[align]", inspector);
  checkRuleViewContent(view, [
    {
      selector: "element",
      declarations: [],
    },
    {
      selector: "element attributes style",
      declarations: [{ name: "text-align", value: "-moz-left" }],
    },
    {
      header: "Inherited from h1",
    },
    {
      selector: "element attributes style",
      declarations: [
        { name: "text-align", value: "-moz-center", overridden: true },
      ],
    },
  ]);

  // Check that element style is displayed, as well as element attribute style with overridden
  // text-align declaration
  await selectNode("h2", inspector);
  checkRuleViewContent(view, [
    {
      selector: "element",
      declarations: [{ name: "text-align", value: "center" }],
    },
    {
      selector: "element attributes style",
      declarations: [
        { name: "text-align", value: "-moz-left", overridden: true },
      ],
    },
  ]);

  await selectNode("table", inspector);
  checkRuleViewContent(view, [
    {
      selector: "element",
      declarations: [],
    },
    {
      selector: "element attributes style",
      declarations: [{ name: "color", value: "-moz-inherit-from-body-quirk" }],
    },
  ]);
});

function checkRuleViewContent(view, expectedElements) {
  const rulesInView = Array.from(view.element.children);
  is(
    rulesInView.length,
    expectedElements.length,
    "We have the expected number of elements in the rules view"
  );

  for (let i = 0; i < expectedElements.length; i++) {
    const expectedElement = expectedElements[i];
    info(
      `Checking element #${i}: "${expectedElement.selector || expectedElement.header}"`
    );

    const elementInView = rulesInView[i];

    if (expectedElement.header) {
      is(
        elementInView.getAttribute("role"),
        "heading",
        `Element #${i} is a header`
      );
      is(
        elementInView.innerText,
        expectedElement.header,
        `Element #${i} has expected text`
      );
      continue;
    }

    const selector = elementInView.querySelector(
      ".ruleview-selectors-container"
    ).innerText;
    is(
      selector,
      expectedElement.selector,
      `Expected selector for element #${i}`
    );

    const declarations = elementInView.querySelectorAll(".ruleview-property");
    is(
      declarations.length,
      expectedElement.declarations.length,
      "Got the expected number of declarations"
    );
    for (let j = 0; j < declarations.length; j++) {
      const expectedDeclaration = expectedElement.declarations[j];
      const ruleViewPropertyElement = declarations[j];
      const [propName, propValue] = Array.from(
        ruleViewPropertyElement.querySelectorAll(
          ".ruleview-propertyname, .ruleview-propertyvalue"
        )
      );
      is(
        propName.innerText,
        expectedDeclaration?.name,
        "Got expected property name"
      );
      is(
        propValue.innerText,
        expectedDeclaration?.value,
        "Got expected property value"
      );
      is(
        ruleViewPropertyElement.classList.contains("ruleview-overridden"),
        !!expectedDeclaration?.overridden,
        `"${selector}" ${propName.innerText} is ${expectedDeclaration?.overridden ? "" : "not "} overridden`
      );
      is(
        ruleViewPropertyElement.querySelector(
          ".ruleview-warning:not([hidden])"
        ),
        null,
        "The declaration is valid"
      );
    }
  }
}
