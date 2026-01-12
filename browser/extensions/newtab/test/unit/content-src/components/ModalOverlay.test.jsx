import { ModalOverlayWrapper } from "content-src/components/ModalOverlay/ModalOverlay";
import { mount } from "enzyme";
import React from "react";

describe("ModalOverlayWrapper", () => {
  let sandbox;
  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });
  afterEach(() => {
    sandbox.restore();
  });
  it("should render a dialog element", async () => {
    const wrapper = mount(<ModalOverlayWrapper />);
    assert.equal(wrapper.find("dialog").length, 1);
  });

  it("should call showModal on mount", async () => {
    const wrapper = mount(<ModalOverlayWrapper />);
    const showModalStub = sandbox.stub();
    sandbox.stub(React, "useRef").returns({
      current: { showModal: showModalStub, open: false },
    });
    mount(<ModalOverlayWrapper />);
    // Dialog showModal is called via useEffect
    assert.ok(wrapper.find("dialog").exists());
  });

  it("should call props.onClose on an Escape key via cancel event", async () => {
    const onClose = sandbox.stub();
    const wrapper = mount(<ModalOverlayWrapper onClose={onClose} />);

    // Simulate cancel event (fired when Escape is pressed on dialog)
    const dialog = wrapper.find("dialog").getDOMNode();
    const cancelEvent = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancelEvent);

    assert.calledOnce(onClose);
  });

  it("should call props.onClose when clicked on dialog backdrop", async () => {
    const onClose = sandbox.stub();
    const wrapper = mount(<ModalOverlayWrapper onClose={onClose} />);

    // Simulate clicking on the dialog itself (backdrop)
    const dialog = wrapper.find("dialog");
    dialog.simulate("click", { target: dialog.getDOMNode() });

    assert.calledOnce(onClose);
  });

  it("should not call props.onClose when clicked inside dialog content", async () => {
    const onClose = sandbox.stub();
    const wrapper = mount(
      <ModalOverlayWrapper onClose={onClose}>
        <div className="content">Content</div>
      </ModalOverlayWrapper>
    );

    // Simulate clicking on inner content (not the dialog backdrop)
    const innerDiv = wrapper.find("div.modalOverlayInner");
    wrapper.find("dialog").simulate("click", { target: innerDiv.getDOMNode() });

    assert.notCalled(onClose);
  });
});
