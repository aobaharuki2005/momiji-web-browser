/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useSelector, batch } from "react-redux";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import { useIntersectionObserver } from "../../../lib/utils";

const TASK_TYPE = {
  IN_PROGRESS: "tasks",
  COMPLETED: "completed",
};

const USER_ACTION_TYPES = {
  LIST_COPY: "list_copy",
  LIST_CREATE: "list_create",
  LIST_EDIT: "list_edit",
  LIST_DELETE: "list_delete",
  TASK_CREATE: "task_create",
  TASK_EDIT: "task_edit",
  TASK_DELETE: "task_delete",
  TASK_COMPLETE: "task_complete",
};

function Lists({ dispatch }) {
  const { selected, lists } = useSelector(state => state.ListsWidget);
  const [newTask, setNewTask] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [pendingNewList, setPendingNewList] = useState(null);

  const inputRef = useRef(null);
  const selectRef = useRef(null);
  const reorderListRef = useRef(null);

  // store selectedList with useMemo so it isnt re-calculated on every re-render
  const selectedList = useMemo(() => lists[selected], [lists, selected]);

  const isValidUrl = useCallback(str => URL.canParse(str), []);

  const handleIntersection = useCallback(() => {
    dispatch(
      ac.AlsoToMain({
        type: at.WIDGETS_LISTS_USER_IMPRESSION,
      })
    );
  }, [dispatch]);

  const listsRef = useIntersectionObserver(handleIntersection);

  const reorderLists = useCallback(
    (draggedElement, targetElement, before = false) => {
      const draggedIndex = selectedList.tasks.findIndex(
        ({ id }) => id === draggedElement.id
      );
      const targetIndex = selectedList.tasks.findIndex(
        ({ id }) => id === targetElement.id
      );

      // return early is index is not found
      if (
        draggedIndex === -1 ||
        targetIndex === -1 ||
        draggedIndex === targetIndex
      ) {
        return;
      }

      const reordered = [...selectedList.tasks];
      const [removed] = reordered.splice(draggedIndex, 1);
      const insertIndex = before ? targetIndex : targetIndex + 1;

      reordered.splice(
        insertIndex > draggedIndex ? insertIndex - 1 : insertIndex,
        0,
        removed
      );

      const updatedLists = {
        ...lists,
        [selected]: {
          ...selectedList,
          tasks: reordered,
        },
      };

      dispatch(
        ac.AlsoToMain({
          type: at.WIDGETS_LISTS_UPDATE,
          data: { lists: updatedLists },
        })
      );
    },
    [lists, selected, selectedList, dispatch]
  );

  const moveTask = useCallback(
    (task, direction) => {
      const index = selectedList.tasks.findIndex(({ id }) => id === task.id);

      // guardrail a falsey index
      if (index === -1) {
        return;
      }

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      const before = direction === "up";
      const targetTask = selectedList.tasks[targetIndex];

      if (targetTask) {
        reorderLists(task, targetTask, before);
      }
    },
    [selectedList, reorderLists]
  );

  useEffect(() => {
    const selectNode = selectRef.current;
    const reorderNode = reorderListRef.current;

    if (!selectNode || !reorderNode) {
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

    function handleReorder(e) {
      const { draggedElement, targetElement, position } = e.detail;
      reorderLists(draggedElement, targetElement, position === -1);
    }

    reorderNode.addEventListener("reorder", handleReorder);
    selectNode.addEventListener("change", handleSelectChange);

    return () => {
      selectNode.removeEventListener("change", handleSelectChange);
      reorderNode.removeEventListener("reorder", handleReorder);
    };
  }, [dispatch, isEditing, reorderLists]);

  // effect that enables editing new list name only after store has been hydrated
  useEffect(() => {
    if (selected === pendingNewList) {
      setIsEditing(true);
      setPendingNewList(null);
    }
  }, [selected, pendingNewList]);

  function saveTask() {
    const trimmedTask = newTask.trimEnd();
    // only add new task if it has a length, to avoid creating empty tasks
    if (trimmedTask) {
      const formattedTask = {
        value: trimmedTask,
        completed: false,
        created: Date.now(),
        id: crypto.randomUUID(),
        isUrl: isValidUrl(trimmedTask),
      };
      const updatedLists = {
        ...lists,
        [selected]: {
          ...selectedList,
          tasks: [formattedTask, ...lists[selected].tasks],
        },
      };
      batch(() => {
        dispatch(
          ac.AlsoToMain({
            type: at.WIDGETS_LISTS_UPDATE,
            data: { lists: updatedLists },
          })
        );
        dispatch(
          ac.OnlyToMain({
            type: at.WIDGETS_LISTS_USER_EVENT,
            data: { userAction: USER_ACTION_TYPES.TASK_CREATE },
          })
        );
      });
      setNewTask("");
    }
  }

  function updateTask(updatedTask, type) {
    const isCompletedType = type === TASK_TYPE.COMPLETED;
    const isNowCompleted = updatedTask.completed;

    let newTasks = selectedList.tasks;
    let newCompleted = selectedList.completed;
    let localUpdatedTasks;
    let userAction;

    // If the task is in the completed array and is now unchecked
    const shouldMoveToTasks = isCompletedType && !isNowCompleted;

    // If we're moving the task from tasks → completed (user checked it)
    const shouldMoveToCompleted = !isCompletedType && isNowCompleted;

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
      userAction = USER_ACTION_TYPES.TASK_COMPLETE;
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
      userAction = USER_ACTION_TYPES.TASK_EDIT;
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
        completed: newCompleted.filter(({ id }) => id !== updatedTask.id),
      },
    };

    // Dispatch the update to main - will sync across tabs
    // and apply local override to this tab only
    batch(() => {
      dispatch(
        ac.AlsoToMain({
          type: at.WIDGETS_LISTS_UPDATE,
          data: { lists: updatedLists, localLists },
        })
      );
      if (userAction) {
        dispatch(
          ac.AlsoToMain({
            type: at.WIDGETS_LISTS_USER_EVENT,
            data: { userAction },
          })
        );
      }
    });
  }

  function deleteTask(task, type) {
    const selectedTasks = lists[selected][type];
    const updatedTasks = selectedTasks.filter(({ id }) => id !== task.id);

    const updatedLists = {
      ...lists,
      [selected]: {
        ...selectedList,
        [type]: updatedTasks,
      },
    };
    batch(() => {
      dispatch(
        ac.AlsoToMain({
          type: at.WIDGETS_LISTS_UPDATE,
          data: { lists: updatedLists },
        })
      );
      dispatch(
        ac.OnlyToMain({
          type: at.WIDGETS_LISTS_USER_EVENT,
          data: { userAction: USER_ACTION_TYPES.TASK_DELETE },
        })
      );
    });
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
    const trimmedLabel = newLabel.trimEnd();
    if (trimmedLabel && trimmedLabel !== selectedList?.label) {
      const updatedLists = {
        ...lists,
        [selected]: {
          ...selectedList,
          label: trimmedLabel,
        },
      };
      batch(() => {
        dispatch(
          ac.AlsoToMain({
            type: at.WIDGETS_LISTS_UPDATE,
            data: { lists: updatedLists },
          })
        );
        dispatch(
          ac.OnlyToMain({
            type: at.WIDGETS_LISTS_USER_EVENT,
            data: { userAction: USER_ACTION_TYPES.LIST_EDIT },
          })
        );
      });
      setIsEditing(false);
    }
  }

  function handleCreateNewList() {
    const id = crypto.randomUUID();
    const newLists = {
      ...lists,
      [id]: {
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
          data: id,
        })
      );
      dispatch(
        ac.OnlyToMain({
          type: at.WIDGETS_LISTS_USER_EVENT,
          data: { userAction: USER_ACTION_TYPES.LIST_CREATE },
        })
      );
    });
    setPendingNewList(id);
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
        dispatch(
          ac.OnlyToMain({
            type: at.WIDGETS_LISTS_USER_EVENT,
            data: { userAction: USER_ACTION_TYPES.LIST_DELETE },
          })
        );
      });
    }
  }

  function handleHideLists() {
    dispatch(
      ac.OnlyToMain({
        type: at.SET_PREF,
        data: {
          name: "widgets.lists.enabled",
          value: false,
        },
      })
    );
  }

  function handleCopyListToClipboard() {
    const currentList = lists[selected];

    if (!currentList) {
      return;
    }

    const { label, tasks = [], completed = [] } = currentList;

    const uncompleted = tasks.filter(task => !task.completed);
    const currentCompleted = tasks.filter(task => task.completed);

    // In order in include all items, we need to iterate through both current and completed tasks list and mark format all completed tasks accordingly.
    const formatted = [
      `List: ${label}`,
      `---`,
      ...uncompleted.map(task => `- [ ] ${task.value}`),
      ...currentCompleted.map(task => `- [x] ${task.value}`),
      ...completed.map(task => `- [x] ${task.value}`),
    ].join("\n");

    try {
      navigator.clipboard.writeText(formatted);
    } catch (err) {
      console.error("Copy failed", err);
    }

    dispatch(
      ac.OnlyToMain({
        type: at.WIDGETS_LISTS_USER_EVENT,
        data: { userAction: USER_ACTION_TYPES.LIST_COPY },
      })
    );
  }

  function handleLearnMore() {
    dispatch(
      ac.OnlyToMain({
        type: at.OPEN_LINK,
        data: {
          url: "https://support.mozilla.org/kb/firefox-new-tab-widgets",
        },
      })
    );
  }

  if (!lists) {
    return null;
  }

  return (
    <article
      className="lists"
      ref={el => {
        listsRef.current = [el];
      }}
    >
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
          <panel-item
            data-l10n-id="newtab-widget-lists-menu-edit"
            onClick={() => setIsEditing(true)}
          ></panel-item>
          <panel-item
            data-l10n-id="newtab-widget-lists-menu-create"
            onClick={() => handleCreateNewList()}
          ></panel-item>
          <panel-item
            data-l10n-id="newtab-widget-lists-menu-delete"
            onClick={() => handleDeleteList()}
          ></panel-item>
          <hr />
          <panel-item
            data-l10n-id="newtab-widget-lists-menu-copy"
            onClick={() => handleCopyListToClipboard()}
          ></panel-item>
          <panel-item
            data-l10n-id="newtab-widget-lists-menu-hide"
            onClick={() => handleHideLists()}
          ></panel-item>
          <panel-item
            className="learn-more"
            data-l10n-id="newtab-widget-lists-menu-learn-more"
            onClick={handleLearnMore}
          ></panel-item>
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
        <moz-reorderable-list
          ref={reorderListRef}
          itemSelector="fieldset .task-type-tasks"
          dragSelector=".checkbox-wrapper"
        >
          <fieldset>
            {selectedList?.tasks.length >= 1 ? (
              selectedList.tasks.map((task, index) => (
                <ListItem
                  type={TASK_TYPE.IN_PROGRESS}
                  task={task}
                  key={task.id}
                  updateTask={updateTask}
                  deleteTask={deleteTask}
                  moveTask={moveTask}
                  isValidUrl={isValidUrl}
                  isFirst={index === 0}
                  isLast={index === selectedList.tasks.length - 1}
                />
              ))
            ) : (
              <p
                className="empty-list-text"
                data-l10n-id="newtab-widget-lists-empty-cta"
              ></p>
            )}
            {selectedList?.completed.length >= 1 && (
              <details className="completed-task-wrapper">
                <summary>
                  <span
                    data-l10n-id="newtab-widget-lists-completed-list"
                    data-l10n-args={JSON.stringify({
                      number: lists[selected]?.completed.length,
                    })}
                    className="completed-title"
                  ></span>
                </summary>
                {selectedList?.completed.map(completedTask => (
                  <ListItem
                    key={completedTask.id}
                    type={TASK_TYPE.COMPLETED}
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
  );
}

function ListItem({
  task,
  updateTask,
  deleteTask,
  moveTask,
  isValidUrl,
  type,
  isFirst = false,
  isLast = false,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const isCompleted = type === TASK_TYPE.COMPLETED;

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
    <div className={`task-item task-type-${type}`} id={task.id} key={task.id}>
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
                data-l10n-id="newtab-widget-lists-input-menu-open-link"
                onClick={() => window.open(task.value, "_blank", "noopener")}
              ></panel-item>
            )}
            <panel-item
              {...(isFirst ? { disabled: true } : {})}
              onClick={() => moveTask(task, "up")}
              data-l10n-id="newtab-widget-lists-input-menu-move-up"
            ></panel-item>
            <panel-item
              {...(isLast ? { disabled: true } : {})}
              onClick={() => moveTask(task, "down")}
              data-l10n-id="newtab-widget-lists-input-menu-move-down"
            ></panel-item>
            <panel-item
              data-l10n-id="newtab-widget-lists-input-menu-edit"
              className="edit-item"
              onClick={() => setIsEditing(true)}
            ></panel-item>
          </>
        )}
        <panel-item
          data-l10n-id="newtab-widget-lists-input-menu-delete"
          className="delete-item"
          onClick={handleDelete}
        ></panel-item>
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
