/* -*- Mode: C++; tab-width: 20; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/layers/NativeLayerRootRemoteMacSnapshotter.h"

#include "mozilla/layers/NativeLayerRootRemoteMacChild.h"

namespace mozilla {
namespace layers {

/* static */ UniquePtr<NativeLayerRootRemoteMacSnapshotter>
NativeLayerRootRemoteMacSnapshotter::Create(
    NativeLayerRootRemoteMacChild* aLayerRoot) {
  return UniquePtr<NativeLayerRootRemoteMacSnapshotter>(
      new NativeLayerRootRemoteMacSnapshotter(aLayerRoot));
}

NativeLayerRootRemoteMacSnapshotter::NativeLayerRootRemoteMacSnapshotter(
    NativeLayerRootRemoteMacChild* aLayerRoot)
    : mLayerRoot(aLayerRoot) {}

bool NativeLayerRootRemoteMacSnapshotter::ReadbackPixels(
    const gfx::IntSize& aReadbackSize, gfx::SurfaceFormat aReadbackFormat,
    const Range<uint8_t>& aReadbackBuffer) {
  return mLayerRoot->ReadbackPixels(aReadbackSize, aReadbackFormat,
                                    aReadbackBuffer);
}

already_AddRefed<profiler_screenshots::RenderSource>
NativeLayerRootRemoteMacSnapshotter::GetWindowContents(
    const gfx::IntSize& aSize) {
  return nullptr;
}

already_AddRefed<profiler_screenshots::DownscaleTarget>
NativeLayerRootRemoteMacSnapshotter::CreateDownscaleTarget(
    const gfx::IntSize& aSize) {
  return nullptr;
}

already_AddRefed<profiler_screenshots::AsyncReadbackBuffer>
NativeLayerRootRemoteMacSnapshotter::CreateAsyncReadbackBuffer(
    const gfx::IntSize& aSize) {
  return nullptr;
}

}  // namespace layers
}  // namespace mozilla
