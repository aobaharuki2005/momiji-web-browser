/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsView.h"

#include "nsDeviceContext.h"
#include "mozilla/BasicEvents.h"
#include "mozilla/IntegerPrintfMacros.h"
#include "mozilla/Poison.h"
#include "mozilla/PresShell.h"
#include "mozilla/StaticPrefs_layout.h"
#include "mozilla/dom/Document.h"
#include "mozilla/dom/BrowserParent.h"
#include "mozilla/widget/Screen.h"
#include "nsIWidget.h"
#include "nsViewManager.h"
#include "nsIFrame.h"
#include "nsXULPopupManager.h"
#include "nsIWidgetListener.h"
#include "nsContentUtils.h"  // for nsAutoScriptBlocker
#include "nsDocShell.h"
#include "nsLayoutUtils.h"
#include "mozilla/StartupTimeline.h"

using namespace mozilla;
using namespace mozilla::widget;

nsView::nsView(nsViewManager* aViewManager)
    : mViewManager(aViewManager), mForcedRepaint(false) {
  MOZ_COUNT_CTOR(nsView);

  // Views should be transparent by default. Not being transparent is
  // a promise that the view will paint all its pixels opaquely. Views
  // should make this promise explicitly by calling
  // SetViewContentTransparency.
}

nsView::~nsView() {
  MOZ_COUNT_DTOR(nsView);

  if (mViewManager) {
    nsView* rootView = mViewManager->GetRootView();
    if (rootView == this) {
      // Inform the view manager that the root view has gone away...
      mViewManager->SetRootView(nullptr);
    }
    mViewManager = nullptr;
  }

  if (mPreviousWindow) {
    mPreviousWindow->SetPreviouslyAttachedWidgetListener(nullptr);
  }

  // Destroy and release the widget
  DestroyWidget();
}

class DestroyWidgetRunnable : public Runnable {
 public:
  NS_DECL_NSIRUNNABLE

  explicit DestroyWidgetRunnable(nsIWidget* aWidget)
      : mozilla::Runnable("DestroyWidgetRunnable"), mWidget(aWidget) {}

 private:
  nsCOMPtr<nsIWidget> mWidget;
};

NS_IMETHODIMP DestroyWidgetRunnable::Run() {
  mWidget->Destroy();
  mWidget = nullptr;
  return NS_OK;
}

void nsView::DestroyWidget() {
  if (mWindow) {
    // If we are not attached to a base window, we're going to tear down our
    // widget here. However, if we're attached to somebody elses widget, we
    // want to leave the widget alone: don't reset the client data or call
    // Destroy. Just clear our event view ptr and free our reference to it.
    mWindow->SetAttachedWidgetListener(nullptr);
    mWindow = nullptr;
  }
}

void nsView::Destroy() {
  this->~nsView();
  mozWritePoison(this, sizeof(*this));
  nsView::operator delete(this);
}

struct WidgetViewBounds {
  nsRect mBounds;
  int32_t mRoundTo = 1;
};

static WidgetViewBounds CalcWidgetViewBounds(const nsRect& aBounds,
                                             int32_t aAppUnitsPerDevPixel,
                                             nsIFrame* aParentFrame,
                                             nsIWidget* aThisWidget,
                                             WindowType aType) {
  nsRect viewBounds(aBounds);
  nsIWidget* parentWidget = nullptr;
  if (aParentFrame) {
    nsPoint offset;
    parentWidget = aParentFrame->GetNearestWidget(offset);
    // make viewBounds be relative to the parent widget, in appunits
    viewBounds += offset;

    if (parentWidget && aType == WindowType::Popup) {
      // put offset into screen coordinates. (based on client area origin)
      LayoutDeviceIntPoint screenPoint = parentWidget->WidgetToScreenOffset();
      viewBounds +=
          nsPoint(NSIntPixelsToAppUnits(screenPoint.x, aAppUnitsPerDevPixel),
                  NSIntPixelsToAppUnits(screenPoint.y, aAppUnitsPerDevPixel));
    }
  }

  nsIWidget* widget = parentWidget ? parentWidget : aThisWidget;
  int32_t roundTo = widget ? widget->RoundsWidgetCoordinatesTo() : 1;
  return {viewBounds, roundTo};
}

static LayoutDeviceIntRect WidgetViewBoundsToDevicePixels(
    const WidgetViewBounds& aViewBounds, int32_t aAppUnitsPerDevPixel,
    WindowType aType, TransparencyMode aTransparency) {
  // Compute widget bounds in device pixels
  // TODO(emilio): We should probably use outside pixels for transparent
  // windows (not just popups) as well.
  if (aType != WindowType::Popup) {
    return LayoutDeviceIntRect::FromUnknownRect(
        aViewBounds.mBounds.ToNearestPixels(aAppUnitsPerDevPixel));
  }
  // We use outside pixels for transparent windows if possible, so that we
  // don't truncate the contents. For opaque popups, we use nearest pixels
  // which prevents having pixels not drawn by the frame.
  const bool opaque = aTransparency == TransparencyMode::Opaque;
  const auto idealBounds = LayoutDeviceIntRect::FromUnknownRect(
      opaque ? aViewBounds.mBounds.ToNearestPixels(aAppUnitsPerDevPixel)
             : aViewBounds.mBounds.ToOutsidePixels(aAppUnitsPerDevPixel));

  return nsIWidget::MaybeRoundToDisplayPixels(idealBounds, aTransparency,
                                              aViewBounds.mRoundTo);
}

LayoutDeviceIntRect nsView::CalcWidgetBounds(
    const nsRect& aBounds, int32_t aAppUnitsPerDevPixel, nsIFrame* aParentFrame,
    nsIWidget* aThisWidget, WindowType aType, TransparencyMode aTransparency) {
  auto viewBounds = CalcWidgetViewBounds(aBounds, aAppUnitsPerDevPixel,
                                         aParentFrame, aThisWidget, aType);
  return WidgetViewBoundsToDevicePixels(viewBounds, aAppUnitsPerDevPixel, aType,
                                        aTransparency);
}

// Attach to a top level widget and start receiving mirrored events.
void nsView::AttachToTopLevelWidget(nsIWidget* aWidget) {
  MOZ_ASSERT(aWidget, "null widget ptr");
#ifdef DEBUG
  nsIWidgetListener* parentListener = aWidget->GetWidgetListener();
  MOZ_ASSERT(!parentListener || parentListener->GetAppWindow(),
             "Expect a top level widget");
  MOZ_ASSERT(!parentListener || !parentListener->GetAsMenuPopupFrame(),
             "Expect a top level widget");
#endif

  /// XXXjimm This is a temporary workaround to an issue w/document
  // viewer (bug 513162).
  if (nsIWidgetListener* listener = aWidget->GetAttachedWidgetListener()) {
    if (nsView* oldView = listener->GetView()) {
      oldView->DetachFromTopLevelWidget();
    }
  }

  // Note, the previous device context will be released. Detaching
  // will not restore the old one.
  aWidget->AttachViewToTopLevel(!nsIWidget::UsePuppetWidgets());

  mWindow = aWidget;

  mWindow->SetAttachedWidgetListener(this);
  if (mWindow->GetWindowType() != WindowType::Invisible) {
    mWindow->AsyncEnableDragDrop(true);
  }
}

// Detach this view from an attached widget.
void nsView::DetachFromTopLevelWidget() {
  MOZ_ASSERT(mWindow, "null mWindow for DetachFromTopLevelWidget!");

  mWindow->SetAttachedWidgetListener(nullptr);
  if (nsIWidgetListener* listener =
          mWindow->GetPreviouslyAttachedWidgetListener()) {
    if (nsView* view = listener->GetView()) {
      // Ensure the listener doesn't think it's being used anymore
      view->mPreviousWindow = nullptr;
    }
  }

  // If the new view's frame is paint suppressed then the window
  // will want to use us instead until that's done
  mWindow->SetPreviouslyAttachedWidgetListener(this);

  mPreviousWindow = mWindow;
  mWindow = nullptr;
}

#ifdef DEBUG
void nsView::List(FILE* out, int32_t aIndent) const {
  int32_t i;
  for (i = aIndent; --i >= 0;) fputs("  ", out);
  fprintf(out, "%p ", (void*)this);
  if (mWindow) {
    nsrefcnt widgetRefCnt = mWindow.get()->AddRef() - 1;
    mWindow.get()->Release();
    fprintf(out, "(widget=%p[%" PRIuPTR "] pos=%s) ", (void*)mWindow,
            widgetRefCnt, ToString(mWindow->GetBounds()).c_str());
  }
  fprintf(out, "{%d, %d}", mSize.width, mSize.height);
  for (i = aIndent; --i >= 0;) fputs("  ", out);
  fputs(">\n", out);
}
#endif  // DEBUG

bool nsView::IsRoot() const {
  NS_ASSERTION(mViewManager != nullptr,
               " View manager is null in nsView::IsRoot()");
  return mViewManager->GetRootView() == this;
}

PresShell* nsView::GetPresShell() { return GetViewManager()->GetPresShell(); }

bool nsView::WindowResized(nsIWidget* aWidget, int32_t aWidth,
                           int32_t aHeight) {
  // The root view may not be set if this is the resize associated with
  // window creation
  SetForcedRepaint(true);
  if (this != mViewManager->GetRootView()) {
    return false;
  }

  PresShell* ps = mViewManager->GetPresShell();
  if (!ps) {
    return false;
  }

  nsPresContext* pc = ps->GetPresContext();
  if (!pc) {
    return false;
  }

  // ensure DPI is up-to-date, in case of window being opened and sized
  // on a non-default-dpi display (bug 829963)
  pc->DeviceContext()->CheckDPIChange();
  int32_t p2a = pc->AppUnitsPerDevPixel();
  if (auto* frame = ps->GetRootFrame()) {
    // Usually the resize would deal with this, but there are some cases (like
    // web-extension popups) where frames might already be correctly sized etc
    // due to a call to e.g. nsDocumentViewer::GetContentSize or so.
    frame->InvalidateFrame();
  }
  const LayoutDeviceIntSize size(aWidth, aHeight);
  mViewManager->SetWindowDimensions(LayoutDeviceIntSize::ToAppUnits(size, p2a));

  if (nsXULPopupManager* pm = nsXULPopupManager::GetInstance()) {
    pm->AdjustPopupsOnWindowChange(ps);
  }

  return true;
}

#ifdef MOZ_WIDGET_ANDROID
void nsView::DynamicToolbarMaxHeightChanged(ScreenIntCoord aHeight) {
  MOZ_ASSERT(XRE_IsParentProcess(),
             "Should be only called for the browser parent process");
  MOZ_ASSERT(this == mViewManager->GetRootView(),
             "Should be called for the root view");

  CallOnAllRemoteChildren(
      [aHeight](dom::BrowserParent* aBrowserParent) -> CallState {
        aBrowserParent->DynamicToolbarMaxHeightChanged(aHeight);
        return CallState::Continue;
      });
}

void nsView::DynamicToolbarOffsetChanged(ScreenIntCoord aOffset) {
  MOZ_ASSERT(XRE_IsParentProcess(),
             "Should be only called for the browser parent process");
  MOZ_ASSERT(this == mViewManager->GetRootView(),
             "Should be called for the root view");
  CallOnAllRemoteChildren(
      [aOffset](dom::BrowserParent* aBrowserParent) -> CallState {
        // Skip background tabs.
        if (!aBrowserParent->GetDocShellIsActive()) {
          return CallState::Continue;
        }

        aBrowserParent->DynamicToolbarOffsetChanged(aOffset);
        return CallState::Stop;
      });
}

void nsView::KeyboardHeightChanged(ScreenIntCoord aHeight) {
  MOZ_ASSERT(XRE_IsParentProcess(),
             "Should be only called for the browser parent process");
  MOZ_ASSERT(this == mViewManager->GetRootView(),
             "Should be called for the root view");
  CallOnAllRemoteChildren(
      [aHeight](dom::BrowserParent* aBrowserParent) -> CallState {
        // Skip background tabs.
        if (!aBrowserParent->GetDocShellIsActive()) {
          return CallState::Continue;
        }

        aBrowserParent->KeyboardHeightChanged(aHeight);
        return CallState::Stop;
      });
}

void nsView::AndroidPipModeChanged(bool aPipMode) {
  MOZ_ASSERT(XRE_IsParentProcess(),
             "Should be only called for the browser parent process");
  MOZ_ASSERT(this == mViewManager->GetRootView(),
             "Should be called for the root view");
  CallOnAllRemoteChildren(
      [aPipMode](dom::BrowserParent* aBrowserParent) -> CallState {
        aBrowserParent->AndroidPipModeChanged(aPipMode);
        return CallState::Continue;
      });
}
#endif

void nsView::WillPaintWindow(nsIWidget* aWidget) {
  RefPtr<nsViewManager> vm = mViewManager;
  vm->WillPaintWindow(aWidget);
}

bool nsView::PaintWindow(nsIWidget* aWidget, LayoutDeviceIntRegion aRegion) {
  RefPtr<nsViewManager> vm = mViewManager;
  vm->Refresh(this, aRegion);
  return true;
}

void nsView::DidPaintWindow() {
  RefPtr<nsViewManager> vm = mViewManager;
  vm->DidPaintWindow();
}

void nsView::DidCompositeWindow(mozilla::layers::TransactionId aTransactionId,
                                const TimeStamp& aCompositeStart,
                                const TimeStamp& aCompositeEnd) {
  PresShell* presShell = mViewManager->GetPresShell();
  if (!presShell) {
    return;
  }

  nsAutoScriptBlocker scriptBlocker;

  nsPresContext* context = presShell->GetPresContext();
  nsRootPresContext* rootContext = context->GetRootPresContext();
  if (rootContext) {
    rootContext->NotifyDidPaintForSubtree(aTransactionId, aCompositeEnd);
  }

  mozilla::StartupTimeline::RecordOnce(mozilla::StartupTimeline::FIRST_PAINT2,
                                       aCompositeEnd);
}

nsEventStatus nsView::HandleEvent(WidgetGUIEvent* aEvent,
                                  bool aUseAttachedEvents) {
  MOZ_ASSERT(aEvent->mWidget, "null widget ptr");

  nsEventStatus result = nsEventStatus_eIgnore;
  auto* listener = [&]() -> nsIWidgetListener* {
    if (!aUseAttachedEvents) {
      if (auto* l = aEvent->mWidget->GetWidgetListener()) {
        return l;
      }
    }
    return aEvent->mWidget->GetAttachedWidgetListener();
  }();
  if (NS_WARN_IF(!listener)) {
    return result;
  }
  nsViewManager::MaybeUpdateLastUserEventTime(aEvent);
  if (RefPtr<PresShell> ps = listener->GetPresShell()) {
    if (nsIFrame* root = ps->GetRootFrame()) {
      ps->HandleEvent(root, aEvent, false, &result);
    }
  }
  return result;
}

void nsView::SafeAreaInsetsChanged(
    const LayoutDeviceIntMargin& aSafeAreaInsets) {
  if (!IsRoot()) {
    return;
  }

  PresShell* presShell = mViewManager->GetPresShell();
  if (!presShell) {
    return;
  }

  LayoutDeviceIntMargin windowSafeAreaInsets;
  const LayoutDeviceIntRect windowRect = mWindow->GetScreenBounds();
  if (nsCOMPtr<nsIScreen> screen = mWindow->GetWidgetScreen()) {
    windowSafeAreaInsets = nsContentUtils::GetWindowSafeAreaInsets(
        screen, aSafeAreaInsets, windowRect);
  }

  presShell->GetPresContext()->SetSafeAreaInsets(windowSafeAreaInsets);

  // https://github.com/w3c/csswg-drafts/issues/4670
  // Actually we don't set this value on sub document. This behaviour is
  // same as Blink.
  CallOnAllRemoteChildren(
      [windowSafeAreaInsets](dom::BrowserParent* aBrowserParent) -> CallState {
        (void)aBrowserParent->SendSafeAreaInsetsChanged(windowSafeAreaInsets);
        return CallState::Continue;
      });
}

bool nsView::IsPrimaryFramePaintSuppressed() const {
  return StaticPrefs::layout_show_previous_page() &&
         mViewManager->GetPresShell() &&
         mViewManager->GetPresShell()->IsPaintingSuppressed();
}

void nsView::CallOnAllRemoteChildren(
    const std::function<CallState(dom::BrowserParent*)>& aCallback) {
  PresShell* presShell = mViewManager->GetPresShell();
  if (!presShell) {
    return;
  }

  dom::Document* document = presShell->GetDocument();
  if (!document) {
    return;
  }

  nsPIDOMWindowOuter* window = document->GetWindow();
  if (!window) {
    return;
  }

  nsContentUtils::CallOnAllRemoteChildren(window, aCallback);
}
