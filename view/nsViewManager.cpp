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
  nsRect dim(nsPoint(), aSize);
  v->SetDimensions(dim);
  return v;
}

void nsViewManager::SetRootView(nsView* aView) {
  MOZ_ASSERT(!aView || aView->GetViewManager() == this,
             "Unexpected viewmanager on root view");

  // Do NOT destroy the current root view. It's the caller's responsibility
  // to destroy it
  mRootView = aView;
}

void nsViewManager::GetWindowDimensions(nscoord* aWidth, nscoord* aHeight) {
  if (nullptr != mRootView) {
    if (mDelayedResize == nsSize(NSCOORD_NONE, NSCOORD_NONE)) {
      nsRect dim = mRootView->GetBounds();
      *aWidth = dim.Width();
      *aHeight = dim.Height();
    } else {
      *aWidth = mDelayedResize.width;
      *aHeight = mDelayedResize.height;
    }
  } else {
    *aWidth = 0;
    *aHeight = 0;
  }
}

void nsViewManager::DoSetWindowDimensions(nscoord aWidth, nscoord aHeight) {
  nsRect oldDim = mRootView->GetBounds();
  nsRect newDim(0, 0, aWidth, aHeight);
  // We care about resizes even when one dimension is already zero.
  if (oldDim.IsEqualEdges(newDim)) {
    return;
  }
  // Don't resize the widget. It is already being set elsewhere.
  mRootView->SetDimensions(newDim);
  if (RefPtr<PresShell> presShell = mPresShell) {
    presShell->ResizeReflow(aWidth, aHeight);
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

void nsViewManager::SetWindowDimensions(nscoord aWidth, nscoord aHeight,
                                        bool aDelayResize) {
  if (mRootView) {
    if (!ShouldDelayResize() && !aDelayResize) {
      if (mDelayedResize != nsSize(NSCOORD_NONE, NSCOORD_NONE) &&
          mDelayedResize != nsSize(aWidth, aHeight)) {
        // We have a delayed resize; that now obsolete size may already have
        // been flushed to the PresContext so we need to update the PresContext
        // with the new size because if the new size is exactly the same as the
        // root view's current size then DoSetWindowDimensions will not
        // request a resize reflow (which would correct it). See bug 617076.
        mDelayedResize = nsSize(aWidth, aHeight);
        FlushDelayedResize();
      }
      mDelayedResize.SizeTo(NSCOORD_NONE, NSCOORD_NONE);
      DoSetWindowDimensions(aWidth, aHeight);
    } else {
      mDelayedResize.SizeTo(aWidth, aHeight);
      if (mPresShell) {
        mPresShell->SetNeedStyleFlush();
        mPresShell->SetNeedLayoutFlush();
      }
    }
  }
}

void nsViewManager::FlushDelayedResize() {
  if (mDelayedResize != nsSize(NSCOORD_NONE, NSCOORD_NONE)) {
    DoSetWindowDimensions(mDelayedResize.width, mDelayedResize.height);
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

    MOZ_ASSERT(!aView->GetFrame() || !aView->GetFrame()->GetParent(),
               "Frame should be a display root");

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
        presShell->SyncPaintFallback(aView->GetFrame(), renderer);
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
  for (uint32_t i = 0; i < widgets.Length(); ++i) {
    nsView* view = nsView::GetViewFor(widgets[i]);
    if (!view) {
      continue;
    }
    if (view->mNeedsWindowPropertiesSync) {
      view->mNeedsWindowPropertiesSync = false;
      if (nsViewManager* vm = view->GetViewManager()) {
        if (PresShell* presShell = vm->GetPresShell()) {
          presShell->SyncWindowProperties(/* aSync */ true);
        }
      }
    }
  }
  if (rootPresShell->GetViewManager() != this) {
    return;  // presentation might have been torn down
  }
  if (aFlushDirtyRegion) {
    nsAutoScriptBlocker scriptBlocker;
    SetPainting(true);
    for (nsIWidget* widget : widgets) {
      if (nsView* view = nsView::GetViewFor(widget)) {
        RefPtr<nsViewManager> viewManager = view->GetViewManager();
        viewManager->ProcessPendingUpdatesPaint(MOZ_KnownLive(widget));
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
  if (aWidget->NeedsPaint()) {
    // If an ancestor widget was hidden and then shown, we could
    // have a delayed resize to handle.
    if (mDelayedResize != nsSize(NSCOORD_NONE, NSCOORD_NONE) && mPresShell &&
        mPresShell->IsVisible()) {
      FlushDelayedResize();
    }
    nsView* view = nsView::GetViewFor(aWidget);
    if (!view) {
      NS_ERROR("FlushDelayedResize destroyed the nsView?");
      return;
    }

    nsIWidgetListener* previousListener =
        aWidget->GetPreviouslyAttachedWidgetListener();

    if (previousListener && previousListener != view &&
        view->IsPrimaryFramePaintSuppressed()) {
      return;
    }

    if (RefPtr<PresShell> presShell = mPresShell) {
#ifdef MOZ_DUMP_PAINTING
      if (nsLayoutUtils::InvalidationDebuggingIsEnabled()) {
        printf_stderr(
            "---- PAINT START ----PresShell(%p), nsView(%p), nsIWidget(%p)\n",
            presShell.get(), view, aWidget);
      }
#endif

      presShell->PaintAndRequestComposite(
          view->GetFrame(), aWidget->GetWindowRenderer(), PaintFlags::None);
      view->SetForcedRepaint(false);

#ifdef MOZ_DUMP_PAINTING
      if (nsLayoutUtils::InvalidationDebuggingIsEnabled()) {
        printf_stderr("---- PAINT END ----\n");
      }
#endif
    }
  }
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
  if (aWidget) {
    nsView* view = nsView::GetViewFor(aWidget);
    WindowRenderer* renderer = aWidget->GetWindowRenderer();
    if (view &&
        (view->ForcedRepaint() || !renderer->NeedsWidgetInvalidation())) {
      ProcessPendingUpdates();
      // Re-get the view pointer here since the ProcessPendingUpdates might have
      // destroyed it during CallWillPaintOnObservers.
      view = nsView::GetViewFor(aWidget);
      if (view) {
        view->SetForcedRepaint(false);
      }
    }
  }
}

bool nsViewManager::PaintWindow(nsIWidget* aWidget,
                                const LayoutDeviceIntRegion& aRegion) {
  if (!aWidget) {
    return false;
  }
  // Get the view pointer here since NS_WILL_PAINT might have
  // destroyed it during CallWillPaintOnObservers (bug 378273).
  nsView* view = nsView::GetViewFor(aWidget);
  if (view && !aRegion.IsEmpty()) {
    Refresh(view, aRegion);
  }

  return true;
}

void nsViewManager::DidPaintWindow() {
  if (RefPtr<PresShell> presShell = mPresShell) {
    presShell->DidPaintWindow();
  }
}

void nsViewManager::DispatchEvent(WidgetGUIEvent* aEvent, nsView* aView,
                                  nsEventStatus* aStatus) {
  AUTO_PROFILER_LABEL("nsViewManager::DispatchEvent", OTHER);

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

  // Find the view whose coordinates system we're in.
  // If the view has no frame, look for a view that does.
  if (nsIFrame* frame = aView->GetFrame()) {
    // Hold a refcount to the presshell. The continued existence of the
    // presshell will delay deletion of this view hierarchy should the event
    // want to cause its destruction in, say, some JavaScript event handler.
    if (RefPtr<PresShell> presShell = aView->GetViewManager()->GetPresShell()) {
      presShell->HandleEvent(frame, aEvent, false, aStatus);
      return;
    }
  }

  *aStatus = nsEventStatus_eIgnore;
}

void nsViewManager::ResizeView(nsView* aView, const nsRect& aRect) {
  NS_ASSERTION(aView->GetViewManager() == this, "wrong view manager");

  nsRect oldDimensions = aView->GetBounds();
  if (!oldDimensions.IsEqualEdges(aRect)) {
    aView->SetDimensions(aRect);
  }

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
