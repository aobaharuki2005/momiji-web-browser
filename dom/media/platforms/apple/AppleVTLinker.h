/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef AppleVTLinker_h
#define AppleVTLinker_h

extern "C" {
#pragma GCC visibility push(default)
#include <VideoToolbox/VideoToolbox.h>
#pragma GCC visibility pop
}

#include "nscore.h"
#include "AppleUtils.h"

namespace mozilla {

class AppleVTLinker
{
public:
  static bool Link();
  static void Unlink();
  static CFStringRef skPropEnableHWAccel_Decode;
  static CFStringRef skPropUsingHWAccel_Decode;
  static CFStringRef skPropUsingAsyncComp_Decode;

  static CFStringRef skPropEnableHWAccel_Encode;
  static CFStringRef skPropUsingLowLat_Encode;
  static CFStringRef skPropUsingHWAccel_Encode;
  static CFStringRef skPropRequireHWAccel_Encode;
  static CFStringRef skPropCompKeyForceFrame;

  static CFStringRef skPropAvgBitRate;
  static CFStringRef skPropConstBitRate;

  static CFStringRef skPropH264_Baseline;
  static CFStringRef skPropH264_Main;
  static CFStringRef skPropH264_High;

  static CFStringRef skPropAllowFrameReordering;
  static CFStringRef skPropBaseLayerFRFraction;
  static CFStringRef skPropMaxKeyFrameInterval;

  static CFStringRef skPropMaxFrameDelayCount;
  static CFStringRef skPropSpeedOverQuality;
  static CFStringRef skPropExpFrameRate;
  static CFStringRef skPropCompRealTime;
  static CFStringRef skPropCompColorPrimaries;
  static CFStringRef skPropCompYCbCrMatrix;
  static CFStringRef skPropCompTransferFunction;

  static CFStringRef skPropCompProfileLevel;
private:
  static void* sLink;

  static enum LinkStatus {
    LinkStatus_INIT = 0,
    LinkStatus_FAILED,
    LinkStatus_SUCCEEDED
  } sLinkStatus;

  static CFStringRef GetIOConst(const char* symbol);
};

#define LINK_FUNC(func) extern typeof(func)* func;
#include "AppleVTFunctions.h"
#undef LINK_FUNC

} // namespace mozilla

#endif // AppleVTLinker_h
