/* -*- Mode: C++;tab-width: 2;indent-tabs-mode: nil;c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <dlfcn.h>

#include "AppleVTLinker.h"
#include "mozilla/ArrayUtils.h"
#include "nsDebug.h"

#define LOG(...) MOZ_LOG(sPDMLog, mozilla::LogLevel::Debug, (__VA_ARGS__))

namespace mozilla {

AppleVTLinker::LinkStatus
AppleVTLinker::sLinkStatus = LinkStatus_INIT;

void* AppleVTLinker::sLink = nullptr;
CFStringRef AppleVTLinker::skPropEnableHWAccel_Decode = nullptr;
CFStringRef AppleVTLinker::skPropUsingHWAccel_Decode = nullptr;
CFStringRef AppleVTLinker::skPropUsingAsyncComp_Decode = nullptr;

CFStringRef AppleVTLinker::skPropRequireHWAccel_Encode = nullptr;
CFStringRef AppleVTLinker::skPropUsingLowLat_Encode = nullptr;
CFStringRef AppleVTLinker::skPropEnableHWAccel_Encode = nullptr;
CFStringRef AppleVTLinker::skPropUsingHWAccel_Encode = nullptr;
CFStringRef AppleVTLinker::skPropAvgBitRate = nullptr;
CFStringRef AppleVTLinker::skPropConstBitRate = nullptr;
CFStringRef AppleVTLinker::skPropH264_Baseline = nullptr;
CFStringRef AppleVTLinker::skPropH264_Main = nullptr;
CFStringRef AppleVTLinker::skPropH264_High = nullptr;
CFStringRef AppleVTLinker::skPropAllowFrameReordering = nullptr;
CFStringRef AppleVTLinker::skPropBaseLayerFRFraction = nullptr;
CFStringRef AppleVTLinker::skPropMaxKeyFrameInterval = nullptr;
CFStringRef AppleVTLinker::skPropSpeedOverQuality = nullptr;
CFStringRef AppleVTLinker::skPropExpFrameRate = nullptr;
CFStringRef AppleVTLinker::skPropMaxFrameDelayCount = nullptr;
CFStringRef AppleVTLinker::skPropCompRealTime = nullptr;
CFStringRef AppleVTLinker::skPropCompKeyForceFrame = nullptr;
CFStringRef AppleVTLinker::skPropCompProfileLevel = nullptr;
CFStringRef AppleVTLinker::skPropCompColorPrimaries = nullptr;
CFStringRef AppleVTLinker::skPropCompYCbCrMatrix = nullptr;
CFStringRef AppleVTLinker::skPropCompTransferFunction = nullptr;

#define LINK_FUNC(func) typeof(func) func;
#include "AppleVTFunctions.h"
#undef LINK_FUNC

/* static */ bool
AppleVTLinker::Link()
{
  if (sLinkStatus) {
    return sLinkStatus == LinkStatus_SUCCEEDED;
  }

  const char* dlnames[] =
    { "/System/Library/Frameworks/VideoToolbox.framework/VideoToolbox",
      "/System/Library/PrivateFrameworks/VideoToolbox.framework/VideoToolbox" };
  bool dlfound = false;
  for (size_t i = 0;i < std::size(dlnames);i++) {
    if ((sLink = dlopen(dlnames[i], RTLD_NOW | RTLD_LOCAL))) {
      dlfound = true;
      break;
    }
  }
  if (!dlfound) {
    NS_WARNING("Couldn't load VideoToolbox framework");
    goto fail;
  }

#define LINK_FUNC(func)                                        \
  func = (typeof(func))dlsym(sLink, #func);                    \
  if (!func) {                                                 \
    NS_WARNING("Couldn't load VideoToolbox function " #func ); \
    goto fail;                                                 \
  }
#include "AppleVTFunctions.h"
#undef LINK_FUNC

  // Will only resolve in 10.9 and later.
  skPropEnableHWAccel_Decode =
    GetIOConst("kVTVideoDecoderSpecification_EnableHardwareAcceleratedVideoDecoder");
  skPropUsingHWAccel_Decode =
    GetIOConst("kVTDecompressionPropertyKey_UsingHardwareAcceleratedVideoDecoder");
  skPropUsingAsyncComp_Decode =
    GetIOConst("kVTDecodeFrame_EnableAsynchronousDecompression");

  skPropRequireHWAccel_Encode =
    GetIOConst("kVTVideoEncoderSpecification_RequireHardwareAcceleratedVideoEncoder");
  skPropUsingLowLat_Encode =
    GetIOConst("kVTVideoEncoderSpecification_EnableLowLatencyRateControl");
  skPropEnableHWAccel_Encode =
    GetIOConst("kVTVideoEncoderSpecification_EnableHardwareAcceleratedVideoEncoder");
  skPropUsingHWAccel_Encode =
    GetIOConst("kVTCompressionPropertyKey_UsingHardwareAcceleratedVideoEncoder");

  skPropAvgBitRate =
    GetIOConst("kVTCompressionPropertyKey_AverageBitRate");
  skPropConstBitRate =
    GetIOConst("kVTCompressionPropertyKey_ConstantBitRate");

  skPropH264_Baseline =
    GetIOConst("kVTProfileLevel_H264_Baseline_AutoLevel");
  skPropH264_Main =
    GetIOConst("kVTProfileLevel_H264_Main_AutoLevel");
  skPropH264_High =
    GetIOConst("kVTProfileLevel_H264_High_AutoLevel");

  skPropAllowFrameReordering =
    GetIOConst("kVTCompressionPropertyKey_AllowFrameReordering");
  skPropBaseLayerFRFraction =
    GetIOConst("kVTCompressionPropertyKey_BaseLayerFrameRateFraction");
  skPropMaxKeyFrameInterval =
    GetIOConst("kVTCompressionPropertyKey_MaxKeyFrameInterval");
  skPropSpeedOverQuality =
    GetIOConst("kVTCompressionPropertyKey_PrioritizeEncodingSpeedOverQuality");

  skPropExpFrameRate =
    GetIOConst("kVTCompressionPropertyKey_ExpectedFrameRate");
  skPropMaxFrameDelayCount =
    GetIOConst("kVTCompressionPropertyKey_MaxFrameDelayCount");
  skPropCompRealTime =
    GetIOConst("kVTCompressionPropertyKey_RealTime");
  skPropCompKeyForceFrame =
    GetIOConst("kVTEncodeFrameOptionKey_ForceKeyFrame");

  skPropCompColorPrimaries =
    GetIOConst("kVTCompressionPropertyKey_ColorPrimaries");
  skPropCompYCbCrMatrix =
    GetIOConst("kVTCompressionPropertyKey_YCbCrMatrix");
  skPropCompTransferFunction = 
    GetIOConst("kVTCompressionPropertyKey_TransferFunction");

  skPropCompProfileLevel =
    GetIOConst("kVTCompressionPropertyKey_ProfileLevel");

  LOG("Loaded VideoToolbox framework.");
  sLinkStatus = LinkStatus_SUCCEEDED;
  return true;

fail:
  Unlink();

  sLinkStatus = LinkStatus_FAILED;
  return false;
}

/* static */ void
AppleVTLinker::Unlink()
{
  if (sLink) {
    LOG("Unlinking VideoToolbox framework.");
#define LINK_FUNC(func)                                                   \
    func = nullptr;
#include "AppleVTFunctions.h"
#undef LINK_FUNC
    dlclose(sLink);
    sLink = nullptr;
    skPropEnableHWAccel_Decode = nullptr;
    skPropUsingHWAccel_Decode = nullptr;
    skPropUsingAsyncComp_Decode = nullptr;
    skPropRequireHWAccel_Encode = nullptr;
    skPropUsingLowLat_Encode = nullptr;
    skPropEnableHWAccel_Encode = nullptr;
    skPropUsingHWAccel_Encode = nullptr;
    skPropAvgBitRate = nullptr;
    skPropConstBitRate = nullptr;
    skPropH264_Baseline = nullptr;
    skPropH264_Main = nullptr;
    skPropH264_High = nullptr;
    skPropAllowFrameReordering = nullptr;
    skPropBaseLayerFRFraction = nullptr;
    skPropMaxKeyFrameInterval = nullptr;
    skPropSpeedOverQuality = nullptr;
    skPropExpFrameRate = nullptr;
    skPropMaxFrameDelayCount = nullptr;
    skPropCompRealTime = nullptr;
    skPropCompKeyForceFrame = nullptr;
    skPropCompProfileLevel = nullptr;
    sLinkStatus = LinkStatus_INIT;
  }
}

/* static */ CFStringRef
AppleVTLinker::GetIOConst(const char* symbol)
{
  CFStringRef* address = (CFStringRef*)dlsym(sLink, symbol);
  if (!address) {
    return nullptr;
  }

  return *address;
}

} // namespace mozilla
#undef LOG
