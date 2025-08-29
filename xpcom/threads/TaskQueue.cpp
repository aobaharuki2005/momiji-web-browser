/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/TaskQueue.h"

#include "mozilla/ProfilerRunnable.h"
#include "mozilla/FlowMarkers.h"
#include "nsIEventTarget.h"
#include "nsITargetShutdownTask.h"
#include "nsThreadUtils.h"
#include "nsQueryObject.h"

namespace mozilla {

// Handle for a TaskQueue being tracked by a TaskQueueTracker. When created,
// it is registered with the TaskQueueTracker, and when destroyed it is
// unregistered. Holds a threadsafe weak reference to the TaskQueue.
class TaskQueueTrackerEntry final
    : private LinkedListElement<TaskQueueTrackerEntry> {
 public:
  TaskQueueTrackerEntry(TaskQueueTracker* aTracker,
                        const RefPtr<TaskQueue>& aQueue)
      : mTracker(aTracker), mQueue(aQueue) {
    MutexAutoLock lock(mTracker->mMutex);
    mTracker->mEntries.insertFront(this);
  }
  ~TaskQueueTrackerEntry() {
    MutexAutoLock lock(mTracker->mMutex);
    removeFrom(mTracker->mEntries);
  }

  TaskQueueTrackerEntry(const TaskQueueTrackerEntry&) = delete;
  TaskQueueTrackerEntry(TaskQueueTrackerEntry&&) = delete;
  TaskQueueTrackerEntry& operator=(const TaskQueueTrackerEntry&) = delete;
  TaskQueueTrackerEntry& operator=(TaskQueueTrackerEntry&&) = delete;

  RefPtr<TaskQueue> GetQueue() const { return RefPtr<TaskQueue>(mQueue); }

 private:
  friend class LinkedList<TaskQueueTrackerEntry>;
  friend class LinkedListElement<TaskQueueTrackerEntry>;

  const RefPtr<TaskQueueTracker> mTracker;
  const ThreadSafeWeakPtr<TaskQueue> mQueue;
};

RefPtr<TaskQueue> TaskQueue::Create(already_AddRefed<nsIEventTarget> aTarget,
                                    const char* aName,
                                    bool aSupportsTailDispatch) {
  nsCOMPtr<nsIEventTarget> target(std::move(aTarget));
  RefPtr<TaskQueue> queue =
      new TaskQueue(do_AddRef(target), aName, aSupportsTailDispatch);

  // If |target| is a TaskQueueTracker, register this TaskQueue with it. It will
  // be unregistered when the TaskQueue is destroyed or shut down.
  if (RefPtr<TaskQueueTracker> tracker = do_QueryObject(target)) {
    MonitorAutoLock lock(queue->mQueueMonitor);
    queue->mTrackerEntry = MakeUnique<TaskQueueTrackerEntry>(tracker, queue);
  }

  return queue;
}

TaskQueue::TaskQueue(already_AddRefed<nsIEventTarget> aTarget,
                     const char* aName, bool aSupportsTailDispatch)
    : AbstractThread(aSupportsTailDispatch),
      mTarget(aTarget),
      mQueueMonitor("TaskQueue::Queue"),
      mTailDispatcher(nullptr),
      mIsRunning(false),
      mIsShutdown(false),
      mName(aName) {}

TaskQueue::~TaskQueue() {
  // We should never free the TaskQueue if it was destroyed abnormally, meaning
  // that all cleanup tasks should be complete if we do.
  MOZ_ASSERT(mShutdownTasks.IsEmpty());
}

NS_IMPL_ADDREF_INHERITED(TaskQueue, SupportsThreadSafeWeakPtr<TaskQueue>)
NS_IMPL_RELEASE_INHERITED(TaskQueue, SupportsThreadSafeWeakPtr<TaskQueue>)

NS_INTERFACE_MAP_BEGIN(TaskQueue)
  NS_INTERFACE_MAP_ENTRY(nsIDirectTaskDispatcher)
  NS_INTERFACE_MAP_ENTRY(nsISerialEventTarget)
  NS_INTERFACE_MAP_ENTRY(nsIEventTarget)
  NS_INTERFACE_MAP_ENTRY_CONCRETE(TaskQueue)
NS_INTERFACE_MAP_END

TaskDispatcher& TaskQueue::TailDispatcher() {
  MOZ_ASSERT(IsCurrentThreadIn());
  MOZ_ASSERT(mTailDispatcher);
  return *mTailDispatcher;
}

// Note aRunnable is passed by ref to support conditional ownership transfer.
// See Dispatch() in TaskQueue.h for more details.
nsresult TaskQueue::DispatchLocked(nsCOMPtr<nsIRunnable>& aRunnable,
                                   DispatchFlags aFlags,
                                   DispatchReason aReason) {
  mQueueMonitor.AssertCurrentThreadOwns();

  // Continue to allow dispatches after shutdown until the last message has been
  // processed, at which point no more messages will be accepted.
  if (mIsShutdown && !mIsRunning) {
    return NS_ERROR_UNEXPECTED;
  }

  AbstractThread* currentThread;
  if (aReason != TailDispatch && (currentThread = GetCurrent()) &&
      RequiresTailDispatch(currentThread) &&
      currentThread->IsTailDispatcherAvailable()) {
    return currentThread->TailDispatcher().AddTask(this, aRunnable.forget());
  }

  PROFILER_MARKER("TaskQueue::DispatchLocked", OTHER, {}, FlowMarker,
                  Flow::FromPointer(aRunnable.get()));
  LogRunnable::LogDispatch(aRunnable);
  mTasks.EmplaceBack(TaskStruct{std::move(aRunnable), aFlags});

  if (mIsRunning) {
    return NS_OK;
  }
  auto runner = MakeRefPtr<Runner>(this, mTarget, mObserver, std::move(mTasks));
  nsresult rv =
      mTarget->Dispatch(runner.forget(), aFlags | NS_DISPATCH_FALLIBLE);
  if (NS_FAILED(rv)) {
    NS_WARNING("Failed to dispatch runnable to run TaskQueue");
    return rv;
  }
  mIsRunning = true;

  return NS_OK;
}

nsresult TaskQueue::RegisterShutdownTask(nsITargetShutdownTask* aTask) {
  NS_ENSURE_ARG(aTask);

  MonitorAutoLock mon(mQueueMonitor);
  if (mIsShutdown) {
    return NS_ERROR_UNEXPECTED;
  }

  MOZ_ASSERT(!mShutdownTasks.Contains(aTask));
  mShutdownTasks.AppendElement(aTask);
  return NS_OK;
}

nsresult TaskQueue::UnregisterShutdownTask(nsITargetShutdownTask* aTask) {
  NS_ENSURE_ARG(aTask);

  MonitorAutoLock mon(mQueueMonitor);
  if (mIsShutdown) {
    return NS_ERROR_UNEXPECTED;
  }

  return mShutdownTasks.RemoveElement(aTask) ? NS_OK : NS_ERROR_UNEXPECTED;
}

void TaskQueue::AwaitIdle() {
  MonitorAutoLock mon(mQueueMonitor);
  AwaitIdleLocked();
}

void TaskQueue::AwaitIdleLocked() {
  // Make sure there are no tasks for this queue waiting in the caller's tail
  // dispatcher.
  MOZ_ASSERT_IF(AbstractThread::GetCurrent(),
                !AbstractThread::GetCurrent()->HasTailTasksFor(this));

  mQueueMonitor.AssertCurrentThreadOwns();
  MOZ_ASSERT(mIsRunning || mTasks.IsEmpty());
  while (mIsRunning) {
    mQueueMonitor.Wait();
  }
}

void TaskQueue::AwaitShutdownAndIdle() {
  MOZ_ASSERT(!IsCurrentThreadIn());
  // Make sure there are no tasks for this queue waiting in the caller's tail
  // dispatcher.
  MOZ_ASSERT_IF(AbstractThread::GetCurrent(),
                !AbstractThread::GetCurrent()->HasTailTasksFor(this));

  MonitorAutoLock mon(mQueueMonitor);
  while (!mIsShutdown) {
    mQueueMonitor.Wait();
  }
  AwaitIdleLocked();
}
RefPtr<ShutdownPromise> TaskQueue::BeginShutdown() {
  // Dispatch any tasks for this queue waiting in the caller's tail dispatcher,
  // since this is the last opportunity to do so.
  if (AbstractThread* currentThread = AbstractThread::GetCurrent()) {
    currentThread->TailDispatchTasksFor(this);
  }

  MonitorAutoLock mon(mQueueMonitor);
  // Dispatch any cleanup tasks to the queue before we put it into full
  // shutdown.
  for (auto& task : mShutdownTasks) {
    nsCOMPtr runnable{task->AsRunnable()};
    MOZ_ALWAYS_SUCCEEDS(
        DispatchLocked(runnable, NS_DISPATCH_NORMAL, TailDispatch));
  }
  mShutdownTasks.Clear();
  mIsShutdown = true;

  RefPtr<ShutdownPromise> p = mShutdownPromise.Ensure(__func__);
  MaybeResolveShutdown();
  mon.NotifyAll();
  return p;
}

void TaskQueue::MaybeResolveShutdown() {
  mQueueMonitor.AssertCurrentThreadOwns();
  if (mIsShutdown && !mIsRunning) {
    mShutdownPromise.ResolveIfExists(true, __func__);
    // Disconnect from our target as we won't try to dispatch any more events.
    mTrackerEntry = nullptr;
    mTarget = nullptr;
    mObserver = nullptr;
  }
}

bool TaskQueue::IsEmpty() {
  MonitorAutoLock mon(mQueueMonitor);
  // NOTE: If `mTasks` is empty, we may still have queued tasks which are owned
  // by the active runner. As we will always start running as soon as a task has
  // been added, we can skip checking `mTasks` and can just check `mIsRunning`.
  return !mIsRunning;
}

bool TaskQueue::IsCurrentThreadIn() const {
  bool in = mRunningThread == PR_GetCurrentThread();
  return in;
}

void TaskQueue::SetObserver(Observer* aObserver) {
  MonitorAutoLock mon(mQueueMonitor);
  MOZ_ASSERT_IF(aObserver, !mObserver);
  mObserver = std::move(aObserver);
}

nsresult TaskQueue::Runner::Run() {
  MOZ_ASSERT(mNextTask < mTasks.Length(), "No tasks to do?");

  // Process mTasks[mNextTask] with an AutoTaskGuard on the stack.
  {
    AutoTaskGuard g(mQueue, mObserver);

    TaskStruct& task = mTasks[mNextTask++];
    MOZ_ASSERT(task.event);

    LogRunnable::Run log(task.event);

    AUTO_PROFILE_FOLLOWING_RUNNABLE(task.event);
    task.event->Run();

    // Drop the reference to task.event before AutoTaskGuard is destroyed. The
    // event will hold a reference to the object it's calling, and we don't want
    // to keep it alive, it may be making assumptions what holds references to
    // it. This is especially the case if the object is waiting for us to
    // shutdown, so that it can shutdown (like in the MediaDecoderStateMachine's
    // SHUTDOWN case).
    task.event = nullptr;
  }

  // If mTasks is exhausted, check to see if new tasks have been dispatched.
  if (mNextTask >= mTasks.Length()) {
    MonitorAutoLock mon(mQueue->mQueueMonitor);
    MOZ_ASSERT(mQueue->mIsRunning);

    // If mQueue->mTasks is empty, we're done for now, and can stop running.
    if (mQueue->mTasks.IsEmpty()) {
      mQueue->mIsRunning = false;
      mQueue->MaybeResolveShutdown();
      mon.NotifyAll();
      return NS_OK;
    }

    // Otherwise, reload from mQueue and continue running.
    mTarget = mQueue->mTarget;
    mObserver = mQueue->mObserver;
    mTasks = std::move(mQueue->mTasks);
    mNextTask = 0;
  }

  // We still have tasks to execute. Dispatch this Runner to the target to
  // ensure it runs again. Note that we don't just run in a loop here. This
  // keeps the ratio of Runnables dispatched to the TaskQueue and the underlying
  // EventTarget as 1:1, hopefully avoiding flooding.
  MOZ_ASSERT(mNextTask < mTasks.Length());
  nsresult rv =
      mTarget->Dispatch(this, mTasks[mNextTask].flags | NS_DISPATCH_AT_END |
                                  NS_DISPATCH_FALLIBLE);
  if (NS_FAILED(rv)) {
    NS_WARNING("Underlying EventTarget for TaskQueue not accepting new tasks");

    // The Dispatch to mTarget failed. Unfortunately we cannot recover at this
    // point, so shut down the TaskQueue, as we can no longer accept new events.
    MonitorAutoLock mon(mQueue->mQueueMonitor);
    mQueue->mIsRunning = false;
    mQueue->mIsShutdown = true;
    mQueue->MaybeResolveShutdown();
    mon.NotifyAll();
  }

  return NS_OK;
}

//-----------------------------------------------------------------------------
// nsIDirectTaskDispatcher
//-----------------------------------------------------------------------------

NS_IMETHODIMP
TaskQueue::DispatchDirectTask(already_AddRefed<nsIRunnable> aEvent) {
  if (!IsCurrentThreadIn()) {
    return NS_ERROR_FAILURE;
  }
  mDirectTasks.AddTask(std::move(aEvent));
  return NS_OK;
}

NS_IMETHODIMP TaskQueue::DrainDirectTasks() {
  if (!IsCurrentThreadIn()) {
    return NS_ERROR_FAILURE;
  }
  mDirectTasks.DrainTasks();
  return NS_OK;
}

NS_IMETHODIMP TaskQueue::HaveDirectTasks(bool* aValue) {
  if (!IsCurrentThreadIn()) {
    return NS_ERROR_FAILURE;
  }

  *aValue = mDirectTasks.HaveTasks();
  return NS_OK;
}

nsTArray<RefPtr<TaskQueue>> TaskQueueTracker::GetAllTrackedTaskQueues() {
  MutexAutoLock lock(mMutex);
  nsTArray<RefPtr<TaskQueue>> queues;
  for (auto* entry : mEntries) {
    if (auto queue = entry->GetQueue()) {
      queues.AppendElement(queue);
    }
  }
  return queues;
}

TaskQueueTracker::~TaskQueueTracker() = default;

}  // namespace mozilla
