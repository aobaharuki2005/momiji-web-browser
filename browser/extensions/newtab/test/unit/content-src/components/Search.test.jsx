import { GlobalOverrider } from "test/unit/utils";
import { mount, shallow } from "enzyme";
import React from "react";
import { _Search as Search } from "content-src/components/Search/Search";
import { Logo } from "content-src/components/Logo/Logo";

const DEFAULT_PROPS = {
  dispatch() {},
  Prefs: { values: { featureConfig: {} } },
};

describe("<Search>", () => {
  let globals;
  let sandbox;
  beforeEach(() => {
    globals = new GlobalOverrider();
    sandbox = globals.sandbox;

    global.ContentSearchUIController.prototype = { search: sandbox.spy() };
  });
  afterEach(() => {
    globals.restore();
  });

  it("should render a Search element", () => {
    const wrapper = shallow(<Search {...DEFAULT_PROPS} />);
    assert.ok(wrapper.exists());
  });
  it("should not use a <form> element", () => {
    const wrapper = mount(<Search {...DEFAULT_PROPS} />);

    assert.equal(wrapper.find("form").length, 0);
  });
  it("should show our logo when the prop exists.", () => {
    const showLogoProps = Object.assign({}, DEFAULT_PROPS, { showLogo: true });
    const wrapper = shallow(<Search {...showLogoProps} />);
    const logo_component = wrapper.find(Logo);
    assert.ok(logo_component.exists());
  });
  it("should not show our logo when the prop does not exist.", () => {
    const hideLogoProps = Object.assign({}, DEFAULT_PROPS, { showLogo: false });
    const wrapper = shallow(<Search {...hideLogoProps} />);
    const logo_component = wrapper.find(Logo);
    assert.ok(!logo_component.exists());
  });

  describe("Search Hand-off", () => {
    it("should render a Search hand-off element", () => {
      const wrapper = shallow(<Search {...DEFAULT_PROPS} />);
      assert.ok(wrapper.exists());
      assert.equal(wrapper.find(".search-handoff-button").length, 1);
    });
    it("should hand-off search when button is clicked", () => {
      const dispatch = sinon.spy();
      const wrapper = shallow(
        <Search {...DEFAULT_PROPS} dispatch={dispatch} />
      );
      wrapper
        .find(".search-handoff-button")
        .simulate("click", { preventDefault: () => {} });
      assert.calledThrice(dispatch);
      assert.calledWith(dispatch, {
        data: { text: undefined },
        meta: {
          from: "ActivityStream:Content",
          skipLocal: true,
          to: "ActivityStream:Main",
        },
        type: "HANDOFF_SEARCH_TO_AWESOMEBAR",
      });
      assert.calledWith(dispatch, { type: "FAKE_FOCUS_SEARCH" });
      const [action] = dispatch.thirdCall.args;
      assert.isUserEventAction(action);
      assert.propertyVal(action.data, "event", "SEARCH_HANDOFF");
    });
    it("should hand-off search on paste", () => {
      const dispatch = sinon.spy();
      const wrapper = mount(<Search {...DEFAULT_PROPS} dispatch={dispatch} />);
      wrapper.instance()._searchHandoffButton = { contains: () => true };
      wrapper.instance().onSearchHandoffPaste({
        clipboardData: {
          getData: () => "some copied text",
        },
        preventDefault: () => {},
      });
      assert.equal(dispatch.callCount, 4);
      assert.calledWith(dispatch, {
        data: { text: "some copied text" },
        meta: {
          from: "ActivityStream:Content",
          skipLocal: true,
          to: "ActivityStream:Main",
        },
        type: "HANDOFF_SEARCH_TO_AWESOMEBAR",
      });
      assert.calledWith(dispatch, { type: "DISABLE_SEARCH" });
      const [action] = dispatch.thirdCall.args;
      assert.isUserEventAction(action);
      assert.propertyVal(action.data, "event", "SEARCH_HANDOFF");
    });
    it("should properly handle drop events", () => {
      const dispatch = sinon.spy();
      const wrapper = mount(<Search {...DEFAULT_PROPS} dispatch={dispatch} />);
      const preventDefault = sinon.spy();
      wrapper.find(".fake-editable").simulate("drop", {
        dataTransfer: { getData: () => "dropped text" },
        preventDefault,
      });
      assert.equal(dispatch.callCount, 4);
      assert.calledWith(dispatch, {
        data: { text: "dropped text" },
        meta: {
          from: "ActivityStream:Content",
          skipLocal: true,
          to: "ActivityStream:Main",
        },
        type: "HANDOFF_SEARCH_TO_AWESOMEBAR",
      });
      assert.calledWith(dispatch, { type: "DISABLE_SEARCH" });
      const [action] = dispatch.thirdCall.args;
      assert.isUserEventAction(action);
      assert.propertyVal(action.data, "event", "SEARCH_HANDOFF");
    });
  });
});
