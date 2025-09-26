/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef XPCOM_THREADS_TARGETSHUTDOWNTASKSET_H_
#define XPCOM_THREADS_TARGETSHUTDOWNTASKSET_H_

#include <random>
#include "nsITargetShutdownTask.h"
#include "nsTArray.h"

class nsIRunnable;

// TargetShutdownTaskSet manages a set of nsITargetShutdownTask.
// It keeps a strong reference on added tasks until they are either Remove(d)
// or Extract(ed).

class TargetShutdownTaskSet {
 public:
  using TasksArray = nsTArray<nsCOMPtr<nsITargetShutdownTask>>;

  TargetShutdownTaskSet() = default;
  TargetShutdownTaskSet(TargetShutdownTaskSet&& aOther) = default;
  TargetShutdownTaskSet(TargetShutdownTaskSet& aOther) = delete;

  // Add a task to the set and keep it owned. The caller can forget it if
  // it is not interested in being ever able to remove it.
  // Returns always NS_OK to not scan the array for Contains in release builds.
  // Note that we assert if a task is added twice or late (i.e. after Extract
  // was called).
  nsresult AddTask(nsITargetShutdownTask* aTask) {
    MOZ_ASSERT(aTask);
    MOZ_ASSERT(!mShutdownTasksTaken);
    MOZ_ASSERT(!mShutdownTasks.Contains(aTask));
    mShutdownTasks.AppendElement(aTask);
    return NS_OK;
  }

  // Remove a task from the set, based on its pointer value.
  // Returns NS_ERROR_UNEXPECTED if the task is not found.
  // Note that RemoveTask releases the set's owning reference on aTask in case
  // it was found.
  nsresult RemoveTask(nsITargetShutdownTask* aTask) {
    MOZ_ASSERT(aTask);
    // We search from the end as longer-living shutdown tasks will most
    // likely be at the beginning of our array. Note that in case Extract was
    // called already, we'll just not find it and return NS_ERROR_UNEXPECTED.
    TasksArray::index_type idx = mShutdownTasks.LastIndexOf(aTask);
    if (idx != TasksArray::NoIndex) {
      mShutdownTasks.RemoveElementAt(idx);
      return NS_OK;
    }
    return NS_ERROR_UNEXPECTED;
  }

  // Returns an array with owning pointers of all tasks. This must be called
  // only once. It's the caller's duty to decide how to run them.
  TasksArray Extract() {
    MOZ_ASSERT(!mShutdownTasksTaken);
    TasksArray ret = std::move(mShutdownTasks);
#ifdef DEBUG
    mShutdownTasksTaken = true;
#endif
    return ret;
  }

  bool IsEmpty() { return mShutdownTasks.IsEmpty(); }

  ~TargetShutdownTaskSet() { MOZ_ASSERT(mShutdownTasks.IsEmpty()); }

 private:
  TasksArray mShutdownTasks;
#ifdef DEBUG
  bool mShutdownTasksTaken{false};
#endif
};

#endif
