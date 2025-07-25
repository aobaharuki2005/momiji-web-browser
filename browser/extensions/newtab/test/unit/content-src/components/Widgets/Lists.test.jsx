import React from "react";
import { combineReducers, createStore } from "redux";
import { Provider } from "react-redux";
import { mount } from "enzyme";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { actionTypes as at } from "common/Actions.mjs";
import { Lists } from "content-src/components/Widgets/Lists/Lists";

const mockState = {
  ...INITIAL_STATE,
  ListsWidget: {
    selected: "test-list",
    lists: {
      "test-list": {
        label: "test",
        tasks: [{ value: "task", completed: false, isUrl: false }],
      },
    },
  },
};

function WrapWithProvider({ children, state = INITIAL_STATE }) {
  let store = createStore(combineReducers(reducers), state);
  return <Provider store={store}>{children}</Provider>;
}

describe("<Lists>", () => {
  let wrapper;
  let sandbox;
  let dispatch;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    dispatch = sandbox.stub();

    wrapper = mount(
      <WrapWithProvider state={mockState}>
        <Lists dispatch={dispatch} />
      </WrapWithProvider>
    );
  });

  afterEach(() => {
    // If we defined what the activeElement should be, remove our override
    delete document.activeElement;
  });

  it("should render the component and selected list", () => {
    assert.ok(wrapper.exists());
    assert.ok(wrapper.find(".lists").exists());
    assert.equal(wrapper.find("moz-option").length, 1);
    assert.equal(wrapper.find(".task-item").length, 1);
  });

  it("should update task input and add a new task on Enter key", () => {
    const input = wrapper.find("input").at(0);
    input.simulate("change", { target: { value: "nathan's cool task" } });

    // Override what the current active element so that the dispatch will trigger
    Object.defineProperty(document, "activeElement", {
      value: input.getDOMNode(),
      configurable: true,
    });

    input.simulate("keyDown", { key: "Enter" });

    assert.ok(dispatch.called, "Expected dispatch to be called");

    const [action] = dispatch.getCall(0).args;
    assert.equal(action.type, at.WIDGETS_LISTS_UPDATE);
    assert.ok(
      action.data["test-list"].tasks.some(
        task => task.value === "nathan's cool task"
      )
    );
  });

  it("should toggle task completion", () => {
    const checkbox = wrapper.find("input[type='checkbox']").at(0);
    checkbox.simulate("change", { target: { checked: true } });

    const [action] = dispatch.getCall(0).args;
    assert.equal(action.type, at.WIDGETS_LISTS_UPDATE);
    assert.ok(action.data["test-list"].tasks[0].completed);
  });

  it("should not dispatch an action when input is empty and Enter is pressed", () => {
    const input = wrapper.find("input").at(0);
    input.simulate("change", { target: { value: "" } });
    // Override what the current active element so that the dispatch will trigger
    Object.defineProperty(document, "activeElement", {
      value: input.getDOMNode(),
      configurable: true,
    });
    input.simulate("keyDown", { key: "Enter" });

    assert.ok(dispatch.notCalled);
  });

  it("should remove task when deleteTask is run from task item panel menu", () => {
    // confirm that there is a task available to delete
    const initialTasks = mockState.ListsWidget.lists["test-list"].tasks;
    assert.equal(initialTasks.length, 1);

    const deleteButton = wrapper.find("panel-item.delete-item").at(0);
    deleteButton.props().onClick();

    assert.ok(dispatch.calledOnce);
    const [action] = dispatch.getCall(0).args;
    assert.equal(action.type, at.WIDGETS_LISTS_UPDATE);

    // Check that the task list is now empty
    const updatedTasks = action.data["test-list"].tasks;
    assert.equal(updatedTasks.length, 0, "Expected task to be removed");
  });

  it("should add a task with a valid URL and render it as a link", () => {
    const input = wrapper.find("input").at(0);
    const testUrl = "https://www.example.com";

    input.simulate("change", { target: { value: testUrl } });

    // Set activeElement for Enter key detection
    Object.defineProperty(document, "activeElement", {
      value: input.getDOMNode(),
      configurable: true,
    });

    input.simulate("keyDown", { key: "Enter" });

    assert.ok(dispatch.calledOnce, "Expected dispatch to be called");

    const [action] = dispatch.getCall(0).args;
    assert.equal(action.type, at.WIDGETS_LISTS_UPDATE);

    const newHyperlinkedTask = action.data["test-list"].tasks.find(
      t => t.value === testUrl
    );

    assert.ok(newHyperlinkedTask, "Task with URL should be added");
    assert.ok(newHyperlinkedTask.isUrl, "Task should be marked as a URL");
  });
});
