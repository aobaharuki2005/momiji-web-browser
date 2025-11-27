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
      mRootView(nullptr) {}

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

void nsViewManager::PaintWindow(nsIWidget* aWidget) {
  RefPtr ps = mPresShell;
  if (!ps) {
    return;
  }
  RefPtr renderer = aWidget->GetWindowRenderer();
  if (!renderer->NeedsWidgetInvalidation()) {
    renderer->FlushRendering(wr::RenderReasons::WIDGET);
  } else {
    ps->SyncPaintFallback(ps->GetRootFrame(), renderer);
  }
  mozilla::StartupTimeline::RecordOnce(mozilla::StartupTimeline::FIRST_PAINT);
}

void nsViewManager::WillPaintWindow(nsIWidget* aWidget) {
  WindowRenderer* renderer = aWidget->GetWindowRenderer();
  if (renderer->NeedsWidgetInvalidation()) {
    return;
  }
  if (RefPtr ps = mPresShell) {
    // FIXME(bug 2002232): Why is this needed?
    ps->PaintSynchronously();
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
