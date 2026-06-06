/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_AppleVDADecoder_h
#define mozilla_AppleVDADecoder_h

#include <CoreFoundation/CFDictionary.h>  // For CFDictionaryRef
#include <CoreMedia/CoreMedia.h>          // For CMVideoFormatDescriptionRef
#include <VideoToolbox/VideoToolbox.h>    // For VTDecompressionSessionRef

#include "AppleDecoderModule.h"
#include "AppleVTDecoder.h"
#include "PerformanceRecorder.h"
#include "PlatformDecoderModule.h"
#include "ReorderQueue.h"
#include "TimeUnits.h"
#include "mozilla/Atomics.h"
#include "mozilla/DefineEnum.h"
#include "mozilla/ProfilerUtils.h"
#include "mozilla/gfx/Types.h"

#include "VideoDecodeAcceleration/VDADecoder.h"

namespace mozilla {

DDLoggedTypeDeclNameAndBase(AppleVDADecoder, MediaDataDecoder);

typedef uint32_t VDADecodeFrameFlags;
typedef uint32_t VDADecodeInfoFlags;
enum {
  kVDADecodeInfo_Asynchronous = 1UL << 0,
  kVDADecodeInfo_FrameDropped = 1UL << 1
};

enum {
  kVDADecoderFlush_EmitFrames = 1 << 0
};

class AppleVDADecoder final : public MediaDataDecoder,
                        public DecoderDoctorLifeLogger<AppleVDADecoder>{
public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(AppleVDADecoder, final);
  AppleVDADecoder(const VideoInfo& aConfig,
      layers::ImageContainer* aImageContainer,
      const CreateDecoderParams::OptionSet& aOptions,
      layers::KnowsCompositor* aKnowsCompositor,
      Maybe<TrackingId> aTrackingId);

  class AppleFrameRef {
  public:
    media::TimeUnit decode_timestamp;
    media::TimeUnit composition_timestamp;
    media::TimeUnit duration;
    int64_t byte_offset;
    bool is_sync_point;


    explicit AppleFrameRef(const MediaRawData& aSample)
        : decode_timestamp(aSample.mTimecode),
          composition_timestamp(aSample.mTime),
          duration(aSample.mDuration),
          byte_offset(aSample.mOffset),
          is_sync_point(aSample.mKeyframe) {}

    AppleFrameRef(const media::TimeUnit& aDts,
                  const media::TimeUnit& aPts,
                  const media::TimeUnit& aDuration,
                  int64_t aByte_offset,
                  bool aIs_sync_point)
      : decode_timestamp(aDts)
      , composition_timestamp(aPts)
      , duration(aDuration)
      , byte_offset(aByte_offset)
      , is_sync_point(aIs_sync_point)
    {
    }
  };

  // Access from the taskqueue and the decoder's thread.
  // OutputFrame is thread-safe.
  void OutputFrame(CVPixelBufferRef aImage,
                       AppleFrameRef aFrameRef);
  void OnDecodeError(OSStatus aError);

  RefPtr<InitPromise> Init() override;
  RefPtr<DecodePromise> Decode(MediaRawData* aSample) override;
  RefPtr<DecodePromise> Drain() override;
  RefPtr<FlushPromise> Flush() override;
  RefPtr<ShutdownPromise> Shutdown() override;
  bool IsHardwareAccelerated(nsACString& aFailureReason) const override
  {
    return true;
  }

  nsCString GetDescriptionName() const override {
    return mIsHardwareAccelerated ? "apple hardware VDA decoder"_ns
                                  : "apple software VDA decoder"_ns;
  }

  void SetSeekThreshold(const media::TimeUnit& aTime) override;

private:
  friend class AppleDecoderModule;  // To access InitializeSession.
  virtual ~AppleVDADecoder();

  // Flush and Drain operation, always run
  RefPtr<FlushPromise> ProcessFlush();
  RefPtr<DecodePromise> ProcessDrain();
  void ProcessShutdown();
  void ProcessDecode(MediaRawData* aSample);
  void MaybeResolveBufferedFrames();

  void MaybeRegisterCallbackThread();

  void AssertOnTaskQueue() { MOZ_ASSERT(mTaskQueue->IsCurrentThreadIn()); }

  AppleFrameRef* CreateAppleFrameRef(const MediaRawData* aSample);
  CFDictionaryRef CreateOutputConfiguration();

  const RefPtr<MediaByteBuffer> mExtraData;
  const uint32_t mPictureWidth;
  const uint32_t mPictureHeight;
  const uint32_t mDisplayWidth;
  const uint32_t mDisplayHeight;
  const gfx::YUVColorSpace mColorSpace;
  const gfx::ColorSpace2 mColorPrimaries;
  const gfx::TransferFunction mTransferFunction;
  const gfx::ColorRange mColorRange;
  const gfx::ColorDepth mColorDepth;

  // Method to set up the decompression session.
  MediaResult InitializeSession();
  nsresult WaitForAsynchronousFrames();
  CFDictionaryRef CreateDecoderSpecification();
  CFDictionaryRef CreateDecoderExtensions();

  MOZ_DEFINE_ENUM_CLASS_WITH_TOSTRING_AT_CLASS_SCOPE(StreamType,
                                                     (Unknown, H264, VP9, AV1));

  const StreamType mStreamType;
  const RefPtr<TaskQueue> mTaskQueue;
  VDADecoder mDecoder;
  const uint32_t mMaxRefFrames;
  const RefPtr<layers::ImageContainer> mImageContainer;
  // Increased when Input is called, and decreased when ProcessFrame runs.
  // Reaching 0 indicates that there's no pending Input.
  const RefPtr<layers::KnowsCompositor> mKnowsCompositor;
  Atomic<uint32_t> mInputIncoming;
  Atomic<bool> mIsShutDown;
  const bool mUseSoftwareImages;
  const Maybe<TrackingId> mTrackingId;

  // Set on reader/decode thread calling Flush() to indicate that output is
  // not required and so input samples on mTaskQueue need not be processed.
  Atomic<bool> mIsFlushing;
  std::atomic<ProfilerThreadId> mCallbackThreadId;
  // Protects mReorderQueue and mPromise.
  Monitor mMonitor MOZ_UNANNOTATED;
  ReorderQueue mReorderQueue;
  MozMonitoredPromiseHolder<DecodePromise> mPromise;

  nsCString GetCodecName() const override;

  // Decoded frame will be dropped if its pts is smaller than this
  // value. It shold be initialized before Input() or after Flush(). So it is
  // safe to access it in OutputFrame without protecting.
  Maybe<media::TimeUnit> mSeekTargetThreshold;

  CMVideoFormatDescriptionRef mFormat;
  VTDecompressionSessionRef mSession;
  Atomic<bool> mIsHardwareAccelerated;
  PerformanceRecorderMulti<DecodeStage> mPerformanceRecorder;

};

} // namespace mozilla

#endif // mozilla_AppleVDADecoder_h
