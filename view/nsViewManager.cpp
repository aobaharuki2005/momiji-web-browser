/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsViewManager.h"

#include "mozilla/MouseEvents.h"
#include "mozilla/PresShell.h"
#include "mozilla/PresShellInlines.h"
#include "mozilla/Preferences.h"
#include "mozilla/ProfilerLabels.h"
#include "mozilla/StartupTimeline.h"
#include "mozilla/dom/Document.h"
#include "nsGfxCIID.h"
#include "nsView.h"
#include "nsCOMPtr.h"
#include "nsRegion.h"
#include "nsCOMArray.h"
#include "nsXULPopupManager.h"
#include "nsPresContext.h"
#include "nsRefreshDriver.h"
#include "nsContentUtils.h"  // for nsAutoScriptBlocker
#include "nsLayoutUtils.h"
#include "gfxPlatform.h"
#include "WindowRenderer.h"

/**
   XXX TODO XXX

   DeCOMify newly private methods
   Optimize view storage
*/

/**
   A note about platform assumptions:

   We assume that a widget is z-ordered on top of its parent.

   We do NOT assume anything about the relative z-ordering of sibling widgets.
   Even though we ask for a specific z-order, we don't assume that widget
   z-ordering actually works.
*/

using namespace mozilla;
using namespace mozilla::layers;

#define NSCOORD_NONE INT32_MIN

#undef DEBUG_MOUSE_LOCATION

uint32_t nsViewManager::gLastUserEventTime = 0;

nsViewManager::nsViewManager()
    : mPresShell(nullptr),
      mDelayedResize(NSCOORD_NONE, NSCOORD_NONE),
      mRootView(nullptr),
      mPainting(false),
      mHasPendingWidgetGeometryChanges(false) {}

nsViewManager::~nsViewManager() {
  if (mRootView) {
    // Destroy any remaining views
    mRootView->Destroy();
    mRootView = nullptr;
  }

  MOZ_RELEASE_ASSERT(!mPresShell,
                     "Releasing nsViewManager without having called Destroy on "
                     "the PresShell!");
}
nsView* nsViewManager::CreateView(const nsSize& aSize) {
  auto* v = new nsView(this);
  v->SetSize(aSize);
  return v;
}

void nsViewManager::SetRootView(nsView* aView) {
  MOZ_ASSERT(!aView || aView->GetViewManager() == this,
             "Unexpected viewmanager on root view");

  // Do NOT destroy the current root view. It's the caller's responsibility
  // to destroy it
  mRootView = aView;
}

nsSize nsViewManager::GetWindowDimensions() const {
  if (!mRootView) {
    return {};
  }
  if (mDelayedResize != nsSize(NSCOORD_NONE, NSCOORD_NONE)) {
    return mDelayedResize;
  }
  return mRootView->GetSize();
}

void nsViewManager::DoSetWindowDimensions(const nsSize& aSize) {
  if (mRootView->GetSize() == aSize) {
    return;
  }
  // Don't resize the widget. It is already being set elsewhere.
  mRootView->SetSize(aSize);
  if (RefPtr<PresShell> presShell = mPresShell) {
    presShell->ResizeReflow(aSize);
  }
}

bool nsViewManager::ShouldDelayResize() const {
  MOZ_ASSERT(mRootView);
  if (!mPresShell || !mPresShell->IsVisible()) {
    return true;
  }
  if (nsRefreshDriver* rd = mPresShell->GetRefreshDriver()) {
    if (rd->IsResizeSuppressed()) {
      return true;
    }
  }
  return false;
}

void nsViewManager::SetWindowDimensions(const nsSize& aSize,
                                        bool aDelayResize) {
  if (!mRootView) {
    return;
  }
  if (!ShouldDelayResize() && !aDelayResize) {
    if (mDelayedResize != nsSize(NSCOORD_NONE, NSCOORD_NONE) &&
        mDelayedResize != aSize) {
      // We have a delayed resize; that now obsolete size may already have
      // been flushed to the PresContext so we need to update the PresContext
      // with the new size because if the new size is exactly the same as the
      // root view's current size then DoSetWindowDimensions will not
      // request a resize reflow (which would correct it). See bug 617076.
      mDelayedResize = aSize;
      FlushDelayedResize();
    }
    mDelayedResize.SizeTo(NSCOORD_NONE, NSCOORD_NONE);
    DoSetWindowDimensions(aSize);
  } else {
    mDelayedResize = aSize;
    if (mPresShell) {
      mPresShell->SetNeedStyleFlush();
      mPresShell->SetNeedLayoutFlush();
    }
  }
}

void nsViewManager::FlushDelayedResize() {
  if (mDelayedResize != nsSize(NSCOORD_NONE, NSCOORD_NONE)) {
    DoSetWindowDimensions(mDelayedResize);
    mDelayedResize.SizeTo(NSCOORD_NONE, NSCOORD_NONE);
  }
}

nsViewManager* nsViewManager::RootViewManager() const {
  const auto* cur = this;
  while (auto* parent = cur->GetParentViewManager()) {
    cur = parent;
  }
  return const_cast<nsViewManager*>(cur);
}

nsViewManager* nsViewManager::GetParentViewManager() const {
  if (!mPresShell) {
    return nullptr;
  }
  auto* pc = mPresShell->GetPresContext();
  if (auto* parent = pc->GetParentPresContext()) {
    return parent->PresShell()->GetViewManager();
  }
  return nullptr;
}

/**
   aRegion is given in device coordinates!!
   aContext may be null, in which case layers should be used for
   rendering.
*/
void nsViewManager::Refresh(nsView* aView,
                            const LayoutDeviceIntRegion& aRegion) {
  NS_ASSERTION(aView->GetViewManager() == this, "wrong view manager");

  if (mPresShell && mPresShell->IsNeverPainting()) {
    return;
  }

  if (aRegion.IsEmpty()) {
    return;
  }

  nsIWidget* widget = aView->GetWidget();
  if (!widget) {
    return;
  }

  MOZ_ASSERT(!IsPainting(), "recursive painting not permitted");
  if (NS_WARN_IF(IsPainting())) {
    return;
  }

  {
    nsAutoScriptBlocker scriptBlocker;
    SetPainting(true);

    if (RefPtr<PresShell> presShell = mPresShell) {
#ifdef MOZ_DUMP_PAINTING
      if (nsLayoutUtils::InvalidationDebuggingIsEnabled()) {
        printf_stderr("--COMPOSITE-- %p\n", presShell.get());
      }
#endif
      RefPtr<WindowRenderer> renderer = widget->GetWindowRenderer();
      if (!renderer->NeedsWidgetInvalidation()) {
        renderer->FlushRendering(wr::RenderReasons::WIDGET);
      } else {
        presShell->SyncPaintFallback(presShell->GetRootFrame(), renderer);
      }
#ifdef MOZ_DUMP_PAINTING
      if (nsLayoutUtils::InvalidationDebuggingIsEnabled()) {
        printf_stderr("--ENDCOMPOSITE--\n");
      }
#endif
      mozilla::StartupTimeline::RecordOnce(
          mozilla::StartupTimeline::FIRST_PAINT);
    }

    SetPainting(false);
  }
}

void nsViewManager::ProcessPendingUpdatesForView(nsView* aView,
                                                 bool aFlushDirtyRegion) {
  NS_ASSERTION(IsRootVM(), "Updates will be missed");
  if (!aView) {
    return;
  }

  RefPtr<PresShell> rootPresShell = mPresShell;
  AutoTArray<nsCOMPtr<nsIWidget>, 1> widgets;
  aView->GetViewManager()->ProcessPendingUpdatesRecurse(aView, widgets);
  for (nsIWidget* widget : widgets) {
    MOZ_ASSERT(widget->IsTopLevelWidget());
    if (RefPtr ps = widget->GetPresShell()) {
      ps->SyncWindowProperties();
    }
  }
  if (rootPresShell->GetViewManager() != this) {
    return;  // presentation might have been torn down
  }
  if (aFlushDirtyRegion) {
    nsAutoScriptBlocker scriptBlocker;
    SetPainting(true);
    for (nsIWidget* widget : widgets) {
      if (RefPtr ps = widget->GetPresShell()) {
        RefPtr vm = ps->GetViewManager();
        vm->ProcessPendingUpdatesPaint(MOZ_KnownLive(widget));
      }
    }
    SetPainting(false);
  }
}

void nsViewManager::ProcessPendingUpdatesRecurse(
    nsView* aView, AutoTArray<nsCOMPtr<nsIWidget>, 1>& aWidgets) {
  if (mPresShell && mPresShell->IsNeverPainting()) {
    return;
  }

  if (nsIWidget* widget = aView->GetWidget()) {
    aWidgets.AppendElement(widget);
  }
}

void nsViewManager::ProcessPendingUpdatesPaint(nsIWidget* aWidget) {
  if (!aWidget->NeedsPaint()) {
    return;
  }
  // If an ancestor widget was hidden and then shown, we could
  // have a delayed resize to handle.
  if (mDelayedResize != nsSize(NSCOORD_NONE, NSCOORD_NONE) && mPresShell &&
      mPresShell->IsVisible()) {
    FlushDelayedResize();
  }

  if (!mRootView || !mPresShell) {
    NS_ERROR("FlushDelayedResize destroyed the view?");
    return;
  }

  nsIWidgetListener* previousListener =
      aWidget->GetPreviouslyAttachedWidgetListener();

  if (previousListener && previousListener != mRootView &&
      mRootView->IsPrimaryFramePaintSuppressed()) {
    return;
  }

  RefPtr ps = mPresShell;
#ifdef MOZ_DUMP_PAINTING
  if (nsLayoutUtils::InvalidationDebuggingIsEnabled()) {
    printf_stderr("---- PAINT START ----PresShell(%p), nsIWidget(%p)\n",
                  ps.get(), aWidget);
  }
#endif

  ps->PaintAndRequestComposite(ps->GetRootFrame(), aWidget->GetWindowRenderer(),
                               PaintFlags::None);
  mRootView->SetForcedRepaint(false);

#ifdef MOZ_DUMP_PAINTING
  if (nsLayoutUtils::InvalidationDebuggingIsEnabled()) {
    printf_stderr("---- PAINT END ----\n");
  }
#endif
}

void nsViewManager::PostPendingUpdate() {
  nsViewManager* rootVM = RootViewManager();
  rootVM->mHasPendingWidgetGeometryChanges = true;
  if (rootVM->mPresShell) {
    rootVM->mPresShell->SetNeedLayoutFlush();
    rootVM->mPresShell->SchedulePaint();
  }
}

void nsViewManager::WillPaintWindow(nsIWidget* aWidget) {
  if (!aWidget) {
    return;
  }
  WindowRenderer* renderer = aWidget->GetWindowRenderer();
  if (mRootView &&
      (mRootView->ForcedRepaint() || !renderer->NeedsWidgetInvalidation())) {
    ProcessPendingUpdates();
    // Re-get the view pointer here since the ProcessPendingUpdates might have
    // destroyed it during CallWillPaintOnObservers.
    if (mRootView) {
      mRootView->SetForcedRepaint(false);
    }
  }
}

void nsViewManager::DidPaintWindow() {
  if (RefPtr<PresShell> presShell = mPresShell) {
    presShell->DidPaintWindow();
  }
}

void nsViewManager::MaybeUpdateLastUserEventTime(WidgetGUIEvent* aEvent) {
  WidgetMouseEvent* mouseEvent = aEvent->AsMouseEvent();
  if ((mouseEvent &&
       // Ignore mouse events that we synthesize.
       mouseEvent->mReason == WidgetMouseEvent::eReal &&
       // Ignore mouse exit and enter (we'll get moves if the user
       // is really moving the mouse) since we get them when we
       // create and destroy widgets.
       mouseEvent->mMessage != eMouseExitFromWidget &&
       mouseEvent->mMessage != eMouseEnterIntoWidget) ||
      aEvent->HasKeyEventMessage() || aEvent->HasIMEEventMessage()) {
    gLastUserEventTime = PR_IntervalToMicroseconds(PR_IntervalNow());
  }
}

void nsViewManager::ResizeView(nsView* aView, const nsSize& aSize) {
  NS_ASSERTION(aView->GetViewManager() == this, "wrong view manager");
  aView->SetSize(aSize);

  // Note that if layout resizes the view and the view has a custom clip
  // region set, then we expect layout to update the clip region too. Thus
  // in the case where mClipRect has been optimized away to just be a null
  // pointer, and this resize is implicitly changing the clip rect, it's OK
  // because layout will change it back again if necessary.
}

void nsViewManager::IsPainting(bool& aIsPainting) {
  aIsPainting = IsPainting();
}

void nsViewManager::ProcessPendingUpdates() {
  if (!IsRootVM()) {
    RefPtr<nsViewManager> rootViewManager = RootViewManager();
    rootViewManager->ProcessPendingUpdates();
    return;
  }

  // Flush things like reflows by calling WillPaint on observer presShells.
  if (mPresShell) {
    RefPtr<nsViewManager> strongThis(this);
    CallWillPaintOnObservers();

    ProcessPendingUpdatesForView(mRootView, true);
  }
}

void nsViewManager::UpdateWidgetGeometry() {
  if (!IsRootVM()) {
    RefPtr<nsViewManager> rootViewManager = RootViewManager();
    rootViewManager->UpdateWidgetGeometry();
    return;
  }

  if (mHasPendingWidgetGeometryChanges) {
    mHasPendingWidgetGeometryChanges = false;
    ProcessPendingUpdatesForView(mRootView, false);
  }
}

/* static */ void nsViewManager::CollectVMsForWillPaint(
    nsView* aView, nsViewManager* aParentVM,
    nsTArray<RefPtr<nsViewManager>>& aVMs) {
  nsViewManager* vm = aView->GetViewManager();
  if (vm != aParentVM) {
    aVMs.AppendElement(vm);
  }
}

void nsViewManager::CallWillPaintOnObservers() {
  MOZ_ASSERT(IsRootVM(), "Must be root VM for this to be called!");

  if (!mRootView) {
    return;
  }

  AutoTArray<RefPtr<nsViewManager>, 2> VMs;
  CollectVMsForWillPaint(mRootView, nullptr, VMs);
  for (const auto& vm : VMs) {
    if (vm->GetRootView()) {
      if (RefPtr<PresShell> presShell = vm->GetPresShell()) {
        presShell->WillPaint();
      }
    }
  }
}
