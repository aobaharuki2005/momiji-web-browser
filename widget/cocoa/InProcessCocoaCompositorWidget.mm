/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "HeadlessCompositorWidget.h"
#include "HeadlessWidget.h"
#include "mozilla/VsyncDispatcher.h"
#include "mozilla/widget/PlatformWidgetTypes.h"

#include "InProcessCocoaCompositorWidget.h"
#include "nsCocoaWindow.h"

namespace mozilla {
namespace widget {

/* static */
RefPtr<CompositorWidget> CompositorWidget::CreateLocal(
    const CompositorWidgetInitData& aInitData,
    const layers::CompositorOptions& aOptions, nsIWidget* aWidget) {
  MOZ_ASSERT(aWidget);
  if (aInitData.type() ==
      CompositorWidgetInitData::THeadlessCompositorWidgetInitData) {
    return new HeadlessCompositorWidget(aInitData, aOptions,
                                        static_cast<HeadlessWidget*>(aWidget));
  } else {
    return new InProcessCocoaCompositorWidget(
        aInitData.get_CocoaCompositorWidgetInitData(), aOptions,
        static_cast<nsCocoaWindow*>(aWidget));
  }
}

InProcessCocoaCompositorWidget::InProcessCocoaCompositorWidget(
    const CocoaCompositorWidgetInitData& aInitData,
    const layers::CompositorOptions& aOptions, nsCocoaWindow* aWindow)
    : CocoaCompositorWidget(aOptions), mWindow(aWindow) {
  // Our base class, CocoaCompositorWidget, also has an Init method
  // which is necessary to complete construction. But that method
  // uses move semantics for aInitData, so we can't call it here.
  // Adding move semantics to everything up our calling chain would
  // be very disruptive, so we instead just do the important work
  // of Init here.
  mClientSize = aInitData.clientSize();
}

void InProcessCocoaCompositorWidget::ObserveVsync(VsyncObserver* aObserver) {
  if (RefPtr<CompositorVsyncDispatcher> cvd =
          mWindow->GetCompositorVsyncDispatcher()) {
    cvd->SetCompositorVsyncObserver(aObserver);
  }
}

nsIWidget* InProcessCocoaCompositorWidget::RealWidget() { return mWindow; }

RefPtr<mozilla::layers::NativeLayerRoot>
InProcessCocoaCompositorWidget::GetNativeLayerRoot() {
  return mWindow->GetNativeLayerRoot();
}

void InProcessCocoaCompositorWidget::NotifyClientSizeChanged(
    const LayoutDeviceIntSize& aClientSize) {
  CocoaCompositorWidget::NotifyClientSizeChanged(aClientSize);
}

}  // namespace widget
}  // namespace mozilla
