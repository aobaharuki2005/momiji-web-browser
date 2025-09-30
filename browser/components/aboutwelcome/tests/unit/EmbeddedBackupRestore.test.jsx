import React from "react";
import { mount } from "enzyme";
import { EmbeddedBackupRestore } from "content-src/components/EmbeddedBackupRestore";
import { GlobalOverrider } from "asrouter/tests/unit/utils";

describe("EmbeddedBackupRestore component", () => {
  let wrapper;
  let globals;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    globals = new GlobalOverrider();
    globals.set({ AWSendToParent: sandbox.stub() });
  });

  afterEach(() => {
    sandbox.restore();
    globals.restore();
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
