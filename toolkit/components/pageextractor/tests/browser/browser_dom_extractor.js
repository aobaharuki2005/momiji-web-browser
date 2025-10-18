/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * @import { BrowserTestUtils } from "../../../../../testing/mochitest/BrowserTestUtils/BrowserTestUtils.sys.mjs"
 * @import { PageExtractorParent } from "../../PageExtractorParent.sys.mjs"
 */

add_task(async function test_dom_extractor_default_options() {
  const { actor, cleanup } = await html`
    <article>
      <h1>Hello World</h1>
      <p>This is a paragraph</p>
    </article>
  `;

  is(
    await actor.getText(),
    ["Hello World", "This is a paragraph"].join("\n"),
    "Text can be extracted from the page."
  );

  is(
    await actor.getReaderModeContent(true /* force */),
    "Hello World\nThis is a paragraph",
    "Reader mode can extract page content."
  );

  is(
    await actor.getReaderModeContent(),
    null,
    "Nothing is returned on non-reader mode content."
  );
  return cleanup();
});

add_task(async function test_dom_extractor_sufficient_length_option() {
  const { actor, cleanup } = await html`
    <article>
      <h1>Hello World</h1>
      <p>First paragraph.</p>
      <p>Second paragraph.</p>
    </article>
  `;

  const header = "Hello World";
  const headerAndP1 = ["Hello World", "First paragraph."].join("\n");
  const allText = ["Hello World", "First paragraph.", "Second paragraph."].join(
    "\n"
  );

  is(
    await actor.getText(),
    allText,
    "All text is returned with the default options."
  );

  const max = allText.length + 1;
  const expectations = [
    [length => length === 0, ""],
    [length => length > 0 && length <= 12, header],
    [length => length > 12 && length <= 29, headerAndP1],
    [length => length > 29 && length <= max, allText],
  ];

  for (let sufficientLength = 0; sufficientLength <= max; ++sufficientLength) {
    let expectedValue;

    for (const [predicate, value] of expectations) {
      if (predicate(sufficientLength)) {
        expectedValue = value;
      }
    }

    is(
      await actor.getText({ sufficientLength }),
      expectedValue,
      `The text, given sufficientLength of ${sufficientLength}, matches the expectation.`
    );
  }

  return cleanup();
});
