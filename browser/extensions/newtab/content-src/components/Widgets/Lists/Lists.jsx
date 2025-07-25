/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React, { useRef, useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";

function Lists({ dispatch }) {
  const listsData = useSelector(state => state.ListsWidget);
  const { selected, lists } = listsData;
  const [newTask, setNewTask] = useState("");
  const inputRef = useRef(null);

  function saveTask() {
    const trimmedTask = newTask.trimEnd();
    // only add new task if it has a length, to avoid creating empty tasks
    if (trimmedTask) {
      const taskObject = {
        value: trimmedTask,
        completed: false,
        created: Date.now(),
        id: crypto.randomUUID(),
      };
      const updatedLists = {
        ...lists,
        [selected]: {
          ...lists[selected],
          tasks: [...lists[selected].tasks, taskObject],
        },
      };
      dispatch(
        ac.AlsoToMain({ type: at.WIDGETS_LISTS_UPDATE, data: updatedLists })
      );
      setNewTask("");
    }
  }

  function updateTask(updatedTask) {
    const selectedTasks = lists[selected].tasks;
    // find selected task and update completed property
    const updatedTasks = selectedTasks.map(task =>
      task.id === updatedTask.id ? updatedTask : task
    );
    const updatedLists = {
      ...lists,
      [selected]: {
        ...lists[selected],
        tasks: updatedTasks,
      },
    };
    dispatch(
      ac.AlsoToMain({ type: at.WIDGETS_LISTS_UPDATE, data: updatedLists })
    );
  }

  function deleteTask(task) {
    const selectedTasks = lists[selected].tasks;
    const updatedTasks = selectedTasks.filter(({ id }) => id !== task.id);

    const updatedLists = {
      ...lists,
      [selected]: {
        ...lists[selected],
        tasks: updatedTasks,
      },
    };
    dispatch(
      ac.AlsoToMain({ type: at.WIDGETS_LISTS_UPDATE, data: updatedLists })
    );
  }

  // useEffect to manage a click outside of the input
  useEffect(() => {
    function handleOutsideClick(e) {
      if (inputRef.current && !inputRef.current.contains(e.target)) {
        saveTask();
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  });

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

  return lists ? (
    <article className="lists">
      <div className="select-wrapper">
        <moz-select value={selected}>
          {Object.entries(lists).map(([key, list]) => (
            <moz-option key={key} value={key} label={list.label} />
          ))}
        </moz-select>
        <moz-button
          className="lists-panel-button"
          iconSrc="chrome://global/skin/icons/more.svg"
          menuId="lists-panel"
          type="ghost"
        />
        <panel-list id="lists-panel">
          <panel-item>Edit name</panel-item>
          <panel-item>Create a new list</panel-item>
          <panel-item>Hide To Do list</panel-item>
          <panel-item>Learn more</panel-item>
          <panel-item>Copy to clipboard</panel-item>
        </panel-list>
      </div>
      <div className="add-task-container">
        <span className="icon icon-add" />
        <input
          ref={inputRef}
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
        {lists[selected]?.tasks.length >= 1 ? (
          <moz-reorderable-list itemSelector="fieldset .task-item">
            <fieldset>
              {lists[selected].tasks.map(task => (
                <ListItem
                  task={task}
                  key={task.id}
                  updateTask={updateTask}
                  deleteTask={deleteTask}
                />
              ))}
            </fieldset>
          </moz-reorderable-list>
        ) : (
          <p className="empty-list-text">The list is empty. For now 🦊</p>
        )}
      </div>
    </article>
  ) : null;
}

function ListItem({ task, updateTask, deleteTask }) {
  const [shouldAnimate, setShouldAnimate] = useState(false);

  function handleCheckboxChange(e) {
    const { checked } = e.target;
    const updatedTask = { ...task, completed: e.target.checked };
    updateTask(updatedTask);
    setShouldAnimate(checked);
  }
  return (
    <div className="task-item">
      <div className="checkbox-wrapper">
        <input
          type="checkbox"
          onChange={handleCheckboxChange}
          checked={task.completed}
        />
        <span
          className={`task-label ${task.completed && shouldAnimate ? "animate-strike" : ""}`}
          title={task.value}
        >
          {task.value}
        </span>
      </div>
      <moz-button
        iconSrc="chrome://global/skin/icons/more.svg"
        menuId={`panel-task-${task.id}`}
        type="ghost"
      />
      <panel-list id={`panel-task-${task.id}`}>
        <panel-item>Move up</panel-item>
        <panel-item>Move down</panel-item>
        <panel-item>Edit</panel-item>
        <panel-item className="delete-item" onClick={() => deleteTask(task)}>
          Delete item
        </panel-item>
      </panel-list>
    </div>
  );
}

export { Lists };
