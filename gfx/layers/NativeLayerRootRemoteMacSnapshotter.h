/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_layers_NativeLayerRootRemoteMacSnapshotter_h
#define mozilla_layers_NativeLayerRootRemoteMacSnapshotter_h

#include "mozilla/RefPtr.h"
#include "mozilla/UniquePtr.h"
#include "mozilla/gfx/Point.h"
#include "mozilla/layers/NativeLayer.h"
#include "mozilla/layers/ScreenshotGrabber.h"

namespace mozilla {
namespace layers {

class NativeLayerRootRemoteMacChild;

class NativeLayerRootRemoteMacSnapshotter : public NativeLayerRootSnapshotter {
 public:
  static UniquePtr<NativeLayerRootRemoteMacSnapshotter> Create(
      NativeLayerRootRemoteMacChild* aLayerRoot);

  bool ReadbackPixels(const gfx::IntSize& aReadbackSize,
                      gfx::SurfaceFormat aReadbackFormat,
                      const Range<uint8_t>& aReadbackBuffer);

  already_AddRefed<profiler_screenshots::RenderSource> GetWindowContents(
      const gfx::IntSize& aSize);
  already_AddRefed<profiler_screenshots::DownscaleTarget> CreateDownscaleTarget(
      const gfx::IntSize& aSize);

  already_AddRefed<profiler_screenshots::AsyncReadbackBuffer>
  CreateAsyncReadbackBuffer(const gfx::IntSize& aSize);

 protected:
  explicit NativeLayerRootRemoteMacSnapshotter(
      NativeLayerRootRemoteMacChild* aLayerRoot);

  RefPtr<NativeLayerRootRemoteMacChild> mLayerRoot;
};

}  // namespace layers
}  // namespace mozilla

#endif  // mozilla_layers_NativeLayerRootRemoteMacSnapshotter_h
