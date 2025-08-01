/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React, { useRef, useState, useEffect } from "react";
import { useSelector, batch } from "react-redux";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";

const taskType = {
  IN_PROGRESS: "tasks",
  COMPLETED: "completed",
};

function Lists({ dispatch }) {
  const listsData = useSelector(state => state.ListsWidget);
  const { selected, lists } = listsData;
  const [newTask, setNewTask] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [pendingNewList, setPendingNewList] = useState(null);
  const inputRef = useRef(null);
  const selectRef = useRef(null);

  useEffect(() => {
    const node = selectRef.current;
    if (!node) {
      return undefined;
    }
    function handleSelectChange(e) {
      dispatch(
        ac.AlsoToMain({
          type: at.WIDGETS_LISTS_CHANGE_SELECTED,
          data: e.target.value,
        })
      );
    }
    node.addEventListener("change", handleSelectChange);

    return () => {
      node.removeEventListener("change", handleSelectChange);
    };
  }, [dispatch, isEditing]);

  useEffect(() => {
    if (selected === pendingNewList) {
      setIsEditing(true);
      setPendingNewList(null);
    }
  }, [selected, pendingNewList]);

  function isValidUrl(string) {
    return URL.canParse(string);
  }

  function saveTask() {
    const trimmedTask = newTask.trimEnd();
    // only add new task if it has a length, to avoid creating empty tasks
    if (trimmedTask) {
      const taskObject = {
        value: trimmedTask,
        completed: false,
        created: Date.now(),
        id: crypto.randomUUID(),
        isUrl: isValidUrl(trimmedTask),
      };
      const updatedLists = {
        ...lists,
        [selected]: {
          ...lists[selected],
          tasks: [...lists[selected].tasks, taskObject],
        },
      };
      dispatch(
        ac.AlsoToMain({
          type: at.WIDGETS_LISTS_UPDATE,
          data: { lists: updatedLists },
        })
      );
      setNewTask("");
    }
  }

  function updateTask(updatedTask, type) {
    let localUpdatedTasks;
    const selectedList = lists[selected];
    const isCompletedType = type === taskType.COMPLETED;
    const isNowCompleted = updatedTask.completed;

    // If the task is in the completed array and is now unchecked
    const shouldMoveToTasks = isCompletedType && !updatedTask.completed;

    // If we're moving the task from tasks → completed (user checked it)
    const shouldMoveToCompleted = !isCompletedType && isNowCompleted;

    let newTasks = selectedList.tasks;
    let newCompleted = selectedList.completed;

    //  Move task from completed -> task
    if (shouldMoveToTasks) {
      newCompleted = selectedList.completed.filter(
        task => task.id !== updatedTask.id
      );
      newTasks = [...selectedList.tasks, updatedTask];
      // Move task to completed, but also create local version
    } else if (shouldMoveToCompleted) {
      newTasks = selectedList.tasks.filter(task => task.id !== updatedTask.id);
      newCompleted = [...selectedList.completed, updatedTask];

      // Keep a local version of tasks that still includes this item (to preserve UI in this tab)
      localUpdatedTasks = selectedList.tasks.map(existingTask =>
        existingTask.id === updatedTask.id ? updatedTask : existingTask
      );
    } else {
      const targetKey = isCompletedType ? "completed" : "tasks";
      const updatedArray = selectedList[targetKey].map(task =>
        task.id === updatedTask.id ? updatedTask : task
      );
      // In-place update: toggle checkbox (but stay in same array or edit name)
      if (targetKey === "tasks") {
        newTasks = updatedArray;
      } else {
        newCompleted = updatedArray;
      }
    }

    const updatedLists = {
      ...lists,
      [selected]: {
        ...selectedList,
        tasks: newTasks,
        completed: newCompleted,
      },
    };

    // local override: keep completed item out of the "completed" array
    const localLists = {
      ...lists,
      [selected]: {
        ...selectedList,
        tasks: localUpdatedTasks || newTasks,
        completed: newCompleted.filter(task => task.id !== updatedTask.id),
      },
    };

    // Dispatch the update to main - will sync across tabs
    // and apply local override to this tab only
    dispatch(
      ac.AlsoToMain({
        type: at.WIDGETS_LISTS_UPDATE,
        data: { lists: updatedLists, localLists },
      })
    );
  }

  function deleteTask(task, type) {
    const selectedTasks = lists[selected][type];
    const updatedTasks = selectedTasks.filter(({ id }) => id !== task.id);

    const updatedLists = {
      ...lists,
      [selected]: {
        ...lists[selected],
        [type]: updatedTasks,
      },
    };
    dispatch(
      ac.AlsoToMain({
        type: at.WIDGETS_LISTS_UPDATE,
        data: { lists: updatedLists },
      })
    );
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && document.activeElement === inputRef.current) {
      saveTask();
    } else if (
      e.key === "Escape" &&
      document.activeElement === inputRef.current
    ) {
      // Clear out the input when esc is pressed
      setNewTask("");
    }
  }

  function handleListNameSave(newLabel) {
    const selectedList = lists[selected];
    const trimmedLabel = newLabel.trimEnd();
    if (trimmedLabel && trimmedLabel !== selectedList?.label) {
      const updatedLists = {
        ...lists,
        [selected]: {
          ...lists[selected],
          label: trimmedLabel,
        },
      };
      dispatch(
        ac.AlsoToMain({
          type: at.WIDGETS_LISTS_UPDATE,
          data: { lists: updatedLists },
        })
      );
      setIsEditing(false);
    }
  }

  function handleCreateNewList() {
    const listUuid = crypto.randomUUID();
    const newLists = {
      ...lists,
      [listUuid]: {
        label: "New list",
        tasks: [],
        completed: [],
      },
    };

    batch(() => {
      dispatch(
        ac.AlsoToMain({
          type: at.WIDGETS_LISTS_UPDATE,
          data: { lists: newLists },
        })
      );
      dispatch(
        ac.AlsoToMain({
          type: at.WIDGETS_LISTS_CHANGE_SELECTED,
          data: listUuid,
        })
      );
    });
    setPendingNewList(listUuid);
  }

  function handleDeleteList() {
    let updatedLists = { ...lists };
    if (updatedLists[selected]) {
      delete updatedLists[selected];

      // if this list was the last one created, add a new list as default
      if (Object.keys(updatedLists)?.length === 0) {
        updatedLists = {
          [crypto.randomUUID()]: {
            label: "New list",
            tasks: [],
            completed: [],
          },
        };
      }
      const listKeys = Object.keys(updatedLists);
      const key = listKeys[listKeys.length - 1];
      batch(() => {
        dispatch(
          ac.AlsoToMain({
            type: at.WIDGETS_LISTS_UPDATE,
            data: { lists: updatedLists },
          })
        );
        dispatch(
          ac.AlsoToMain({
            type: at.WIDGETS_LISTS_CHANGE_SELECTED,
            data: key,
          })
        );
      });
    }
  }

  return lists ? (
    <article className="lists">
      <div className="select-wrapper">
        <EditableText
          value={lists[selected]?.label || ""}
          onSave={handleListNameSave}
          isEditing={isEditing}
          setIsEditing={setIsEditing}
          type="list"
          maxLength={30}
        >
          <moz-select ref={selectRef} value={selected}>
            {Object.entries(lists).map(([key, list]) => (
              <moz-option key={key} value={key} label={list.label} />
            ))}
          </moz-select>
        </EditableText>
        <moz-button
          className="lists-panel-button"
          iconSrc="chrome://global/skin/icons/more.svg"
          menuId="lists-panel"
          type="ghost"
        />
        <panel-list id="lists-panel">
          <panel-item onClick={() => setIsEditing(true)}>Edit name</panel-item>
          <panel-item onClick={() => handleCreateNewList()}>
            Create a new list
          </panel-item>
          <panel-item onClick={() => handleDeleteList()}>
            Delete this list
          </panel-item>
          <panel-item>Hide To Do list</panel-item>
          <panel-item>Learn more</panel-item>
          <panel-item>Copy to clipboard</panel-item>
        </panel-list>
      </div>
      <div className="add-task-container">
        <span className="icon icon-add" />
        <input
          ref={inputRef}
          onBlur={() => saveTask()}
          onChange={e => setNewTask(e.target.value)}
          value={newTask}
          placeholder="Add a task"
          className="add-task-input"
          onKeyDown={handleKeyDown}
          type="text"
          maxLength={100}
        />
      </div>
      <div className="task-list-wrapper">
        <moz-reorderable-list itemSelector="fieldset .task-item">
          <fieldset>
            {lists[selected]?.tasks.length >= 1 ? (
              lists[selected].tasks.map(task => (
                <ListItem
                  type={taskType.IN_PROGRESS}
                  task={task}
                  key={task.id}
                  updateTask={updateTask}
                  deleteTask={deleteTask}
                  isValidUrl={isValidUrl}
                />
              ))
            ) : (
              <p className="empty-list-text">The list is empty. For now 🦊</p>
            )}
            {lists[selected]?.completed.length >= 1 && (
              <details className="completed-task-wrapper">
                <summary>
                  <span className="completed-title">{`Completed (${lists[selected]?.completed.length})`}</span>
                </summary>
                {lists[selected]?.completed.map(completedTask => (
                  <ListItem
                    key={completedTask.id}
                    type={taskType.COMPLETED}
                    task={completedTask}
                    deleteTask={deleteTask}
                    updateTask={updateTask}
                  />
                ))}
              </details>
            )}
          </fieldset>
        </moz-reorderable-list>
      </div>
    </article>
  ) : null;
}

function ListItem({ task, updateTask, deleteTask, isValidUrl, type }) {
  const [isEditing, setIsEditing] = useState(false);

  const isCompleted = type === taskType.COMPLETED;

  function handleCheckboxChange(e) {
    const updatedTask = { ...task, completed: e.target.checked };
    updateTask(updatedTask, type);
  }

  function handleSave(newValue) {
    const trimmedTask = newValue.trimEnd();
    if (trimmedTask && trimmedTask !== task.value) {
      updateTask(
        { ...task, value: newValue, isUrl: isValidUrl(trimmedTask) },
        type
      );
      setIsEditing(false);
    }
  }

  function handleDelete() {
    deleteTask(task, type);
  }

  const taskLabel = task.isUrl ? (
    <a
      href={task.value}
      rel="noopener noreferrer"
      target="_blank"
      className="task-label"
      title={task.value}
    >
      {task.value}
    </a>
  ) : (
    <span
      className="task-label"
      title={task.value}
      onClick={() => setIsEditing(true)}
    >
      {task.value}
    </span>
  );

  return (
    <div className="task-item">
      <div className="checkbox-wrapper">
        <input
          type="checkbox"
          onChange={handleCheckboxChange}
          checked={task.completed}
        />
        {isCompleted ? (
          taskLabel
        ) : (
          <EditableText
            isEditing={isEditing}
            setIsEditing={setIsEditing}
            value={task.value}
            onSave={handleSave}
            type="task"
          >
            {taskLabel}
          </EditableText>
        )}
      </div>
      <moz-button
        iconSrc="chrome://global/skin/icons/more.svg"
        menuId={`panel-task-${task.id}`}
        type="ghost"
      />
      <panel-list id={`panel-task-${task.id}`}>
        {!isCompleted && (
          <>
            {task.isUrl && (
              <panel-item
                onClick={() => window.open(task.value, "_blank", "noopener")}
              >
                Open link
              </panel-item>
            )}
            <panel-item>Move up</panel-item>
            <panel-item>Move down</panel-item>
            <panel-item
              className="edit-item"
              onClick={() => setIsEditing(true)}
            >
              Edit
            </panel-item>
          </>
        )}
        <panel-item className="delete-item" onClick={handleDelete}>
          Delete item
        </panel-item>
      </panel-list>
    </div>
  );
}

function EditableText({
  value,
  isEditing,
  setIsEditing,
  onSave,
  children,
  type,
  maxLength = 100,
}) {
  const [tempValue, setTempValue] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
    } else {
      setTempValue(value);
    }
  }, [isEditing, value]);

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      onSave(tempValue.trim());
      setIsEditing(false);
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setTempValue(value);
    }
  }

  function handleOnBlur() {
    onSave(tempValue.trim());
    setIsEditing(false);
  }

  return isEditing ? (
    <input
      className={`edit-${type}`}
      ref={inputRef}
      type="text"
      value={tempValue}
      maxLength={maxLength}
      onChange={event => setTempValue(event.target.value)}
      onBlur={handleOnBlur}
      onKeyDown={handleKeyDown}
    />
  ) : (
    [children]
  );
}

export { Lists };
