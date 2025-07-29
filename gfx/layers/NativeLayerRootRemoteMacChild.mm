/* -*- Mode: C++; tab-width: 20; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/layers/NativeLayerRemoteMac.h"
#include "mozilla/layers/NativeLayerRootRemoteMacChild.h"
#include "mozilla/layers/SurfacePool.h"

namespace mozilla {
namespace layers {

already_AddRefed<NativeLayer> NativeLayerRootRemoteMacChild::CreateLayer(
    const gfx::IntSize& aSize, bool aIsOpaque,
    SurfacePoolHandle* aSurfacePoolHandle) {
  RefPtr<NativeLayer> layer = new NativeLayerRemoteMac(
      aSize, aIsOpaque, aSurfacePoolHandle->AsSurfacePoolHandleCA());
  return layer.forget();
}

already_AddRefed<NativeLayer>
NativeLayerRootRemoteMacChild::CreateLayerForExternalTexture(bool aIsOpaque) {
  RefPtr<NativeLayer> layer = new NativeLayerRemoteMac(aIsOpaque);
  return layer.forget();
}

already_AddRefed<NativeLayer>
NativeLayerRootRemoteMacChild::CreateLayerForColor(gfx::DeviceColor aColor) {
  RefPtr<NativeLayer> layer = new NativeLayerRemoteMac(aColor);
  return layer.forget();
}

void NativeLayerRootRemoteMacChild::AppendLayer(NativeLayer* aLayer) {}

void NativeLayerRootRemoteMacChild::RemoveLayer(NativeLayer* aLayer) {}

void NativeLayerRootRemoteMacChild::SetLayers(
    const nsTArray<RefPtr<NativeLayer>>& aLayers) {}

void NativeLayerRootRemoteMacChild::PrepareForCommit() {}

bool NativeLayerRootRemoteMacChild::CommitToScreen() { return false; }

NativeLayerRootRemoteMacChild::NativeLayerRootRemoteMacChild()
    : mRemoteChild(MakeRefPtr<NativeLayerRemoteChild>()) {}

NativeLayerRootRemoteMacChild::~NativeLayerRootRemoteMacChild() {}

}  // namespace layers
}  // namespace mozilla
