/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_URL = `data:text/html,<!DOCTYPE html><meta charset=utf8>${encodeURIComponent(`
  <style>
    ::view-transition-group(root) {
       /* large number so the view-transition pseudo elements are available during the whole test */
       animation-duration: 3600s;
    }
    header {
      view-transition-name: main-header;
    }

    header h1 {
      view-transition-name: main-header-text;
    }
  </style>
  <header>
    <h1>::view-transition</h1>
  </header>
`)}`;

add_task(async function () {
  const { inspector } = await openInspectorForURL(TEST_URL);

  await selectNode("html", inspector);

  const onMarkupMutation = inspector.once("markupmutation");
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
    const document = content.document;
    content.testTransition = document.startViewTransition(() => {
      document.querySelector("h1").replaceChildren("updated");
    });
    await content.testTransition.ready;
    await content.testTransition.updateCallbackDone;
  });
  await onMarkupMutation;

  const htmlNodeFront = await getNodeFront("html", inspector);
  const htmlContainer = await getContainerForNodeFront(
    htmlNodeFront,
    inspector
  );

  const viewTransitionMarkupNodeEl = htmlContainer.children.childNodes[2];
  is(
    viewTransitionMarkupNodeEl.textContent,
    "::view-transition",
    "::view-transition node is displayed"
  );

  const viewTransitionContainer = viewTransitionMarkupNodeEl.container;
  is(
    viewTransitionContainer.type,
    "readonlycontainer",
    "The ::view-transition container is read-only"
  );

  info("Expand the whole ::view-transition subtree");
  await toggleContainerByClick(inspector, viewTransitionContainer, {
    altKey: true,
  });

  const tree = `
    html
      head!ignore-children
      body!ignore-children
      ::view-transition
        ::view-transition-group(root)
          ::view-transition-image-pair(root)
            ::view-transition-old(root)
            ::view-transition-new(root)
        ::view-transition-group(main-header)
          ::view-transition-image-pair(main-header)
            ::view-transition-old(main-header)
            ::view-transition-new(main-header)
        ::view-transition-group(main-header-text)
          ::view-transition-image-pair(main-header-text)
            ::view-transition-old(main-header-text)
            ::view-transition-new(main-header-text)
      `.trim();
  await assertMarkupViewAsTree(tree, "html", inspector);

  // Cancel transition
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
    content.testTransition.skipTransition();
    delete content.testTransition;
  });
});
