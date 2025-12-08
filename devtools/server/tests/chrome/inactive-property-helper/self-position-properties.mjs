/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// InactivePropertyHelper test cases:
// `justify-self`, `align-self` and `place-self`.
let tests = [];

for (const { propertyName, propertyValue } of [
  { propertyName: "justify-self", propertyValue: "start" },
  { propertyName: "align-self", propertyValue: "auto" },
  { propertyName: "place-self", propertyValue: "auto center" },
]) {
  tests = tests.concat(createTestsForProp(propertyName, propertyValue));
}

function createTestsForProp(propertyName, propertyValue) {
  return [
    {
      info: `${propertyName} is active on a grid item`,
      property: `${propertyName}`,
      createTestElement,
      rules: [
        `#container { display:grid; grid:auto/100px 100px; }`,
        `#container-item { ${propertyName}: ${propertyValue}; }`,
      ],
      ruleIndex: 1,
      isActive: true,
    },
    {
      info: `${propertyName} is active on a flex item`,
      property: `${propertyName}`,
      createTestElement,
      rules: [
        `#container { display:flex; }`,
        `#container-item { ${propertyName}: ${propertyValue}; }`,
      ],
      ruleIndex: 1,
      isActive: true,
    },
    {
      info: `${propertyName} is active on absolutely positioned item`,
      property: `${propertyName}`,
      tagName: `div`,
      rules: [`div { ${propertyName}: ${propertyValue}; position: absolute; }`],
      isActive: true,
    },
    {
      info: `${propertyName} is inactive on non-(grid|flex|abs) item`,
      property: `${propertyName}`,
      tagName: `div`,
      rules: [`div { ${propertyName}: ${propertyValue}; }`],
      isActive: false,
    },
  ];
}

function createTestElement(rootNode) {
  const container = document.createElement("div");
  container.id = "container";
  const element = document.createElement("div");
  element.id = "container-item";
  container.append(element);
  rootNode.append(container);

  return element;
}

export default tests;
