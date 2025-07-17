import { Lists } from "content-src/components/Widgets/Lists/Lists";
import React from "react";
import { mount } from "enzyme";

describe("<Lists>", () => {
  let wrapper;

  beforeEach(() => {
    wrapper = mount(<Lists />);
  });

  it("should render", () => {
    assert.ok(wrapper.exists());
    assert.ok(wrapper.find(".lists").exists());
  });
});
