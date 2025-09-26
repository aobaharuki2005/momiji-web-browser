import React from "react";
import { mount } from "enzyme";
import { EmbeddedBackupRestore } from "content-src/components/EmbeddedBackupRestore";

describe("EmbeddedBackupRestore component", () => {
  let wrapper;

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount();
    }
  });

  it("should render the restore-from-backup element", () => {
    wrapper = mount(<EmbeddedBackupRestore />);

    const restoreFromBackupElement = wrapper.find("restore-from-backup");
    assert.ok(
      restoreFromBackupElement.exists(),
      "restore-from-backup element should be rendered"
    );

    assert.equal(
      restoreFromBackupElement.prop("aboutWelcomeEmbedded"),
      "true",
      "aboutWelcomeEmbedded should be set to 'true'"
    );

    assert.equal(
      restoreFromBackupElement.prop("labelFontWeight"),
      "600",
      "labelFontWeight should be set to '600'"
    );
  });
});
