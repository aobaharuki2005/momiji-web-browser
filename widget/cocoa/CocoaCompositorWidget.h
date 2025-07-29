/* -*- Mode: c++; c-basic-offset: 2; tab-width: 20; indent-tabs-mode: nil; -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_widget_CocoaCompositorWidget_h
#define mozilla_widget_CocoaCompositorWidget_h

#include "CompositorWidget.h"

namespace mozilla {
namespace widget {

class PlatformCompositorWidgetDelegate : public CompositorWidgetDelegate {
 public:
  virtual void NotifyClientSizeChanged(
      const LayoutDeviceIntSize& aClientSize) = 0;

  // CompositorWidgetDelegate Overrides
  PlatformCompositorWidgetDelegate* AsPlatformSpecificDelegate() override {
    return this;
  }
};

class CocoaCompositorWidgetInitData;

class CocoaCompositorWidget : public CompositorWidget {
 public:
  CocoaCompositorWidget(const layers::CompositorOptions& aOptions);
  ~CocoaCompositorWidget();

  virtual void Init(CompositorWidgetInitData&& aInitData);

  // CompositorWidget overrides
  RefPtr<layers::NativeLayerRoot> GetNativeLayerRoot() override;

  already_AddRefed<gfx::DrawTarget> StartRemoteDrawingInRegion(
      const LayoutDeviceIntRegion& aInvalidRegion) override;
  void EndRemoteDrawingInRegion(
      gfx::DrawTarget* aDrawTarget,
      const LayoutDeviceIntRegion& aInvalidRegion) override;

  LayoutDeviceIntSize GetClientSize() override;

  void NotifyClientSizeChanged(const LayoutDeviceIntSize& aClientSize);

  CocoaCompositorWidget* AsCocoa() override { return this; }

 protected:
  LayoutDeviceIntSize mClientSize;

 private:
  void CreateNativeLayerRoot();

  RefPtr<layers::NativeLayerRoot> mNativeLayerRoot;
};

}  // namespace widget
}  // namespace mozilla

#endif  // mozilla_widget_CocoaCompositorWidget_h
