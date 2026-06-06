/* -*- Mode: C++; tab-width: 20; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef RLBOXSOUNDTOUCH_H_
#define RLBOXSOUNDTOUCH_H_

#include "RLBoxSoundTouchTypes.h"

// Load general firefox configuration of RLBox
#include "mozilla/rlbox/rlbox_config.h"

#ifdef MOZ_WASM_SANDBOXING_SOUNDTOUCH
// Include the generated header file so that we are able to resolve the symbols
// in the wasm binary
#  include "rlbox.wasm.h"
#  define RLBOX_USE_STATIC_CALLS() rlbox_wasm2c_sandbox_lookup_symbol
#  include "mozilla/rlbox/rlbox_wasm2c_sandbox.hpp"
#else
// Extra configuration for no-op sandbox
#  define RLBOX_USE_STATIC_CALLS() rlbox_noop_sandbox_lookup_symbol
#  include "mozilla/rlbox/rlbox_noop_sandbox.hpp"
#endif

#include "mozilla/rlbox/rlbox.hpp"
#include "AudioStream.h"
//  Use abort() instead of exception in SoundTouch.
#define ST_NO_EXCEPTION_HANDLING 1
#include "soundtouch/SoundTouchFactory.h"

#if defined(WIN32)
#if defined(BUILDING_SOUNDTOUCH)
#define RLBOX_SOUNDTOUCH_API __declspec(dllexport)
#else
#define RLBOX_SOUNDTOUCH_API __declspec(dllimport)
#endif
#else
#define RLBOX_SOUNDTOUCH_API __attribute__((visibility("default")))
#endif

namespace mozilla {

class RLBoxSoundTouch {
 public:
  RLBoxSoundTouch();
  bool Init();
  ~RLBoxSoundTouch();

  void setSampleRate(uint aRate);
  void setChannels(uint aChannels);
  void setPitch(double aPitch);
  void setSetting(int aSettingId, int aValue);
  void setTempo(double aTempo);
  uint numChannels();
  tainted_soundtouch<uint> numSamples();
  tainted_soundtouch<uint> numUnprocessedSamples();
  void setRate(double aRate);
  void putSamples(const mozilla::AudioDataValue* aSamples, uint aNumSamples);
  uint receiveSamples(mozilla::AudioDataValue* aOutput, uint aMaxSamples);
  void flush();

 private:
  bool mCreated{false};
  uint mChannels{0};
  rlbox_sandbox_soundtouch mSandbox;
  tainted_soundtouch<mozilla::AudioDataValue*> mSampleBuffer{nullptr};
  uint mSampleBufferSize{1};
  tainted_soundtouch<soundtouch::SoundTouch*> mTimeStretcher{nullptr};

  void resizeSampleBuffer(uint aNewSize);
};

}  // namespace mozilla
#endif
