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
        completed: [],
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
      action.data.lists["test-list"].tasks.some(
        task => task.value === "nathan's cool task"
      )
    );
  });

  it("should toggle task completion", () => {
    const checkbox = wrapper.find("input[type='checkbox']").at(0);
    checkbox.simulate("change", { target: { checked: true } });

    const [action] = dispatch.getCall(0).args;
    assert.equal(action.type, at.WIDGETS_LISTS_UPDATE);
    console.log(`CONSOLE: `, action.data.lists["test-list"]);
    assert.ok(action.data.lists["test-list"].completed[0].completed);
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
    const updatedTasks = action.data.lists["test-list"].tasks;
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

    const newHyperlinkedTask = action.data.lists["test-list"].tasks.find(
      t => t.value === testUrl
    );

    assert.ok(newHyperlinkedTask, "Task with URL should be added");
    assert.ok(newHyperlinkedTask.isUrl, "Task should be marked as a URL");
  });

  it("should dispatch list change when dropdown selection changes", () => {
    const select = wrapper.find("moz-select").getDOMNode();
    // need to create a new event since I couldnt figure out a way to
    // trigger the change event to the moz-select component
    const event = new Event("change", { bubbles: true });
    select.value = "test-list";
    select.dispatchEvent(event);

    assert.ok(dispatch.calledOnce);
    const [action] = dispatch.getCall(0).args;
    assert.equal(action.type, at.WIDGETS_LISTS_CHANGE_SELECTED);
    assert.equal(action.data, "test-list");
  });

  it("should delete list and select a fallback list", () => {
    // Grab panel-item for deleting a list
    const deleteList = wrapper.find("panel-item").at(2);
    deleteList.props().onClick();

    assert.ok(dispatch.calledTwice);
    assert.equal(dispatch.getCall(0).args[0].type, at.WIDGETS_LISTS_UPDATE);
    assert.equal(
      dispatch.getCall(1).args[0].type,
      at.WIDGETS_LISTS_CHANGE_SELECTED
    );
  });

  it("should update list name when edited and saved", () => {
    // Grab panel-item for editing a list
    const editList = wrapper.find("panel-item").at(0);
    editList.props().onClick();
    wrapper.update();

    const editableInput = wrapper.find("input.edit-list");
    editableInput.simulate("change", { target: { value: "Updated List" } });
    editableInput.simulate("keyDown", { key: "Enter" });

    assert.ok(dispatch.calledOnce);
    const [action] = dispatch.getCall(0).args;
    assert.equal(action.type, at.WIDGETS_LISTS_UPDATE);
    assert.equal(action.data.lists["test-list"].label, "Updated List");
  });

  it("should create a new list and dispatch update and select list actions", () => {
    const createListBtn = wrapper.find("panel-item").at(1); // assumes "Create a new list" is at index 1
    createListBtn.props().onClick();
    assert.ok(dispatch.calledTwice);
    assert.equal(dispatch.getCall(0).args[0].type, at.WIDGETS_LISTS_UPDATE);
    assert.equal(
      dispatch.getCall(1).args[0].type,
      at.WIDGETS_LISTS_CHANGE_SELECTED
    );
  });
});
