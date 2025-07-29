/* -*- Mode: C++; tab-width: 20; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/layers/NativeLayerRootRemoteMacParent.h"

namespace mozilla {
namespace layers {

NativeLayerRootRemoteMacParent::NativeLayerRootRemoteMacParent(
    RefPtr<NativeLayerRootCA> aRealNativeLayerRoot)
    : mRealNativeLayerRoot(aRealNativeLayerRoot) {
  MOZ_ASSERT(mRealNativeLayerRoot);
}

mozilla::ipc::IPCResult
NativeLayerRootRemoteMacParent::RecvCommitNativeLayerCommands(
    nsTArray<NativeLayerCommand>&& aCommands) {
  return IPC_OK();
}

void NativeLayerRootRemoteMacParent::HandleCreateLayer(uint64_t aID,
                                                       IntSize aSize,
                                                       bool aOpaque) {
  RefPtr<NativeLayerCA> layer =
      mRealNativeLayerRoot->CreateLayerForSurfacePresentation(aSize, aOpaque);
  mKnownLayers.InsertOrUpdate(aID, layer);
}

void NativeLayerRootRemoteMacParent::HandleCreateLayerForExternalTexture(
    uint64_t aID, bool aOpaque) {
  RefPtr<NativeLayer> layer =
      mRealNativeLayerRoot->CreateLayerForExternalTexture(aOpaque);
  mKnownLayers.InsertOrUpdate(aID, layer);
}

void NativeLayerRootRemoteMacParent::HandleCreateLayerForColor(
    uint64_t aID, DeviceColor aColor) {
  RefPtr<NativeLayer> layer = mRealNativeLayerRoot->CreateLayerForColor(aColor);
  mKnownLayers.InsertOrUpdate(aID, layer);
}

void NativeLayerRootRemoteMacParent::HandleLayerDestroyed(uint64_t aID) {
  mKnownLayers.Remove(aID);
}

void NativeLayerRootRemoteMacParent::HandleSetLayers(
    const nsTArray<uint64_t>& aIDs) {
  nsTArray<RefPtr<NativeLayer>> layers;
  for (auto ID : aIDs) {
    auto entry = mKnownLayers.MaybeGet(ID);
    if (!entry) {
      gfxWarning() << "Got a SetLayers for an unknown layer.";
      continue;
    }

    RefPtr<NativeLayer> layer = *entry;
    layers.AppendElement(layer);
  }
  mRealNativeLayerRoot->SetLayers(layers);
}

void NativeLayerRootRemoteMacParent::HandleLayerInfo(
    uint64_t aID, uint32_t aSurfaceID, IntPoint aPosition, IntRect aDisplayRect,
    Maybe<IntRect> aClipRect, Maybe<RoundedRect> aRoundedClipRect,
    Matrix4x4 aTransform, int8_t aSamplingFilter, bool aSurfaceIsFlipped) {
  auto entry = mKnownLayers.MaybeGet(aID);
  if (!entry) {
    gfxWarning() << "Got a LayerInfo for an unknown layer.";
    return;
  }

  RefPtr<NativeLayerCA> layer = (*entry)->AsNativeLayerCA();
  MOZ_ASSERT(layer, "All of our known layers should be NativeLayerCA.");

  // Set the surface of this layer.
  auto surfaceRef = IOSurfaceLookup(aSurfaceID);
  if (surfaceRef) {
    // The call to IOSurfaceLookup leaves us with a retain count of 1.
    // The CFTypeRefPtr will take care of it when it falls out of scope,
    // since we declare it with create rule semantics.
    CFTypeRefPtr<IOSurfaceRef> surface =
        CFTypeRefPtr<IOSurfaceRef>::WrapUnderCreateRule(surfaceRef);
    layer->SetSurfaceToPresent(surface);
  }

  // Set the other properties of layer.
  layer->SetPosition(aPosition);
  layer->SetDisplayRect(aDisplayRect);
  layer->SetClipRect(aClipRect);
  layer->SetRoundedClipRect(aRoundedClipRect);
  layer->SetTransform(aTransform);
  layer->SetSamplingFilter(static_cast<gfx::SamplingFilter>(aSamplingFilter));
  layer->SetSurfaceIsFlipped(aSurfaceIsFlipped);
}

}  // namespace layers
}  // namespace mozilla
