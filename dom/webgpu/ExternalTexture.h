/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef ExternalTexture_H_
#define ExternalTexture_H_

#include <array>

#include "ObjectModel.h"
#include "mozilla/Span.h"
#include "mozilla/gfx/Types.h"
#include "mozilla/webgpu/WebGPUTypes.h"
#include "nsIGlobalObject.h"
#include "nsTArrayForwardDeclare.h"

namespace mozilla {
namespace dom {
class OwningHTMLVideoElementOrVideoFrame;
}
namespace layers {
class BufferDescriptor;
class Image;
}  // namespace layers

namespace webgpu {

class Device;
class WebGPUParent;

// NOTE: Incomplete. Follow-up to complete implementation is at
// <https://bugzilla.mozilla.org/show_bug.cgi?id=1827116>.
class ExternalTexture : public ObjectBase {
 public:
  GPU_DECL_CYCLE_COLLECTION(ExternalTexture)
  GPU_DECL_JS_WRAP(ExternalTexture)

  explicit ExternalTexture(nsIGlobalObject* const aGlobal) : mGlobal(aGlobal) {}

  nsIGlobalObject* GetParentObject() const { return mGlobal; }

 private:
  nsCOMPtr<nsIGlobalObject> mGlobal;

  ~ExternalTexture() = default;
  void Cleanup() {}
};

// The client side of an imported external texture source. This gets imported
// from either an HTMLVideoElement or a VideoFrame. ExternalTextures can then
// be created from a source. It is important to separate the source from the
// external texture as multiple external textures can be created from the same
// source.
// The client side is responsible for creating and destroying the host side.
// Any external texture created from this source must ensure the source remains
// alive as long as it is required by the external texture, by holding a strong
// reference.
class ExternalTextureSourceClient {
  NS_INLINE_DECL_REFCOUNTING(ExternalTextureSourceClient)

 public:
  // Creates an ExternalTextureSourceClient from a video element or video frame.
  // Returns nullptr on failure. Throws security error if the source is not
  // origin-clean.
  static already_AddRefed<ExternalTextureSourceClient> Create(
      Device* aDevice, const dom::OwningHTMLVideoElementOrVideoFrame& aSource,
      ErrorResult& aRv);

  const RawId mId;

  // External texture sources can consist of up to 3 planes of texture data, but
  // on the client side we do not know how many planes will actually be
  // required. We therefore unconditionally make IDs for 3 textures and 3
  // texture views, and the host side will only use the IDs that it requires.
  const std::array<RawId, 3> mTextureIds;
  const std::array<RawId, 3> mViewIds;

 private:
  ExternalTextureSourceClient(WebGPUChild* aBridge, RawId aId,
                              const std::array<RawId, 3>& aTextureIds,
                              const std::array<RawId, 3>& aViewIds);
  ~ExternalTextureSourceClient();

  // Used to free resources on the host side when we are destroyed, if the
  // bridge is still valid.
  const WeakPtr<WebGPUChild> mBridge;
};

// Host side of an external texture source. This is responsible for creating
// and managing the lifecycle of the wgpu textures and texture views created
// from the provided SurfaceDescriptor.
class ExternalTextureSourceHost {
 public:
  // Creates an external texture source from a descriptor. If this fails it
  // will create an external texture source in an error state, which will be
  // propagated to any external textures created from it.
  static ExternalTextureSourceHost Create(
      WebGPUParent* aParent, RawId aDeviceId, RawId aQueueId,
      const ExternalTextureSourceDescriptor& aDesc);

  // Texture and TextureView IDs used by the source. These will be a subset of
  // the IDs provided by the client in the descriptor.
  Span<const RawId> TextureIds() const { return mTextureIds; }
  Span<const RawId> ViewIds() const { return mViewIds; }

 private:
  ExternalTextureSourceHost(Span<const RawId> aTextureIds,
                            Span<const RawId> aViewIds, gfx::IntSize aSize,
                            gfx::SurfaceFormat aFormat,
                            gfx::YUVRangedColorSpace aColorSpace,
                            const std::array<float, 6>& aSampleTransform,
                            const std::array<float, 6>& aLoadTransform);

  static ExternalTextureSourceHost CreateFromBufferDesc(
      WebGPUParent* aParent, RawId aDeviceId, RawId aQueueId,
      const ExternalTextureSourceDescriptor& aDesc,
      const layers::BufferDescriptor& aSd, uint8_t* aBuffer);

  // Creates an external texture source in an error state that will be
  // propagated to any external textures created from it.
  static ExternalTextureSourceHost CreateError();

  // These should be const but can't be else we wouldn't be move constructible.
  // While we are always provided with 3 texture IDs and 3 view IDs by the
  // client, we only store here the IDs that are actually used. For example an
  // RGBA format source will only require 1 texture and 1 view. NV12 will
  // require 2 views, and either 1 or 2 textures depending on whether the
  // platform natively supports NV12 format textures.
  AutoTArray<RawId, 3> mTextureIds;
  AutoTArray<RawId, 3> mViewIds;
  const gfx::IntSize mSize;
  MOZ_MAYBE_UNUSED const gfx::SurfaceFormat mFormat;
  MOZ_MAYBE_UNUSED const gfx::YUVRangedColorSpace mColorSpace;
  MOZ_MAYBE_UNUSED const std::array<float, 6> mSampleTransform;
  MOZ_MAYBE_UNUSED const std::array<float, 6> mLoadTransform;
};

}  // namespace webgpu
}  // namespace mozilla

#endif  // GPU_ExternalTexture_H_
