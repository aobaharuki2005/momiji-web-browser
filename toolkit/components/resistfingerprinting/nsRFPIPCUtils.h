/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_resistfingerprinting_nsRFPIPCUtils_h
#define mozilla_resistfingerprinting_nsRFPIPCUtils_h

#include "ipc/IPCMessageUtils.h"
#include "ipc/EnumSerializer.h"
#include "nsRFPService.h"

namespace IPC {

// CanvasFingerprintingEvent
template <>
struct ParamTraits<mozilla::CanvasFingerprintingEvent> {
  typedef mozilla::CanvasFingerprintingEvent paramType;

  static void Write(MessageWriter* aWriter, const paramType& aParam) {
    WriteParam(aWriter, aParam.alias);
    WriteParam(aWriter, aParam.knownTextBitmask);
    WriteParam(aWriter, aParam.source);
  }

  static bool Read(MessageReader* aReader, paramType* aResult) {
    mozilla::CanvasFingerprinterAlias alias;
    uint32_t knownTextBitmask;
    uint8_t source;

    if (!ReadParam(aReader, &alias) || !ReadParam(aReader, &knownTextBitmask) ||
        !ReadParam(aReader, &source)) {
      return false;
    }

    *aResult =
        mozilla::CanvasFingerprintingEvent(alias, knownTextBitmask, source);
    return true;
  }
};

}  // namespace IPC

#endif  // mozilla_resistfingerprinting_nsRFPIPCUtils_h
