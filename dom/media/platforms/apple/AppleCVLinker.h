/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef AppleCVLinker_h
#define AppleCVLinker_h

extern "C" {
#pragma GCC visibility push(default)
#include <CoreVideo/CoreVideo.h>
#pragma GCC visibility pop
}

#include "nscore.h"

namespace mozilla {

class AppleCVLinker
{
public:
  static bool Link();
  static void Unlink();
  static CFStringRef ColorPrimaries_P22;
  static CFStringRef ColorPrimaries_P3_D65;
  static CFStringRef ColorPrimaries_SMPTE_C;
  static CFStringRef ColorPrimaries_ITU_R_709_2;
  static CFStringRef ColorPrimaries_ITU_R_2020;
  static CFStringRef YCbCrMatrix_ITU_R_601_4;
  static CFStringRef YCbCrMatrix_ITU_R_709_2;
  static CFStringRef YCbCrMatrix_ITU_R_2020;
  static CFStringRef TransferFunction_ITU_R_709_2;
  static CFStringRef TransferFunction_sRGB;
  static CFStringRef TransferFunction_SMPTE_ST_2084_PQ;
  static CFStringRef TransferFunction_ITU_R_2100_HLG;

private:
  static void* sLink;
  static nsrefcnt sRefCount;

  static enum LinkStatus {
    LinkStatus_INIT = 0,
    LinkStatus_FAILED,
    LinkStatus_SUCCEEDED
  } sLinkStatus;
  
  static CFStringRef GetIOConst(const char* symbol);
};
} // namespace mozilla
#endif // AppleCVLinker_h
