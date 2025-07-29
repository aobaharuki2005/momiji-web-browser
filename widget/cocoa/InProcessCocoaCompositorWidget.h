/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef widget_cocoa_InProcessCocoaCompositorWidget_h
#define widget_cocoa_InProcessCocoaCompositorWidget_h

#include "CocoaCompositorWidget.h"
#include "CompositorWidget.h"

class nsCocoaWindow;

namespace mozilla {
namespace widget {

class InProcessCocoaCompositorWidget final
    : public CocoaCompositorWidget,
      public PlatformCompositorWidgetDelegate {
 public:
  InProcessCocoaCompositorWidget(const CocoaCompositorWidgetInitData& aInitData,
                                 const layers::CompositorOptions& aOptions,
                                 nsCocoaWindow* aWidget);

  // CompositorWidget overrides

  void ObserveVsync(VsyncObserver* aObserver) override;
  nsIWidget* RealWidget() override;
  CompositorWidgetDelegate* AsDelegate() override { return this; }

  RefPtr<mozilla::layers::NativeLayerRoot> GetNativeLayerRoot() override;

  // PlatformCompositorWidgetDelegate overrides
  void NotifyClientSizeChanged(const LayoutDeviceIntSize& aClientSize) override;

 private:
  nsCocoaWindow* mWindow;
};

}  // namespace widget
}  // namespace mozilla

#endif  // widget_cocoa_InProcessCocoaCompositorWidget_h
