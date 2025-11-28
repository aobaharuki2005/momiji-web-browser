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

nsViewManager::nsViewManager() : mPresShell(nullptr), mRootView(nullptr) {}

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

nsView* nsViewManager::CreateView() { return new nsView(this); }

void nsViewManager::SetRootView(nsView* aView) {
  MOZ_ASSERT(!aView || aView->GetViewManager() == this,
             "Unexpected viewmanager on root view");

  // Do NOT destroy the current root view. It's the caller's responsibility
  // to destroy it
  mRootView = aView;
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
