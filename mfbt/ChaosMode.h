/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_ChaosMode_h
#define mozilla_ChaosMode_h

#include "mozilla/Assertions.h"
#include "mozilla/Atomics.h"

#include <cstdint>

namespace mozilla {

enum class ChaosFeature : uint32_t {
  None = 0x0,
  // Altering thread scheduling.
  ThreadScheduling = 0x1,
  // Altering network request scheduling.
  NetworkScheduling = 0x2,
  // Altering timer scheduling.
  TimerScheduling = 0x4,
  // Read and write less-than-requested amounts.
  IOAmounts = 0x8,
  // Iterate over hash tables in random order.
  HashTableIteration = 0x10,
  // Randomly refuse to use cached version of image (when allowed by spec).
  ImageCache = 0x20,
  // Delay dispatching threads to encourage dispatched tasks to run.
  TaskDispatching = 0x40,
  // Delay task running to encourage sending threads to run.
  TaskRunning = 0x80,
  Any = 0xffffffff,
};

/**
 * When "chaos mode" is activated, code that makes implicitly nondeterministic
 * choices is encouraged to make random and extreme choices, to test more
 * code paths and uncover bugs.
 */
class ChaosMode {
  static inline MFBT_DATA Atomic<uint32_t, Relaxed> ChaosModeCounter{0};
  static inline MFBT_DATA ChaosFeature ChaosFeatures = ChaosFeature::Any;

 public:
  static void SetChaosFeature(ChaosFeature aChaosFeature) {
    ChaosFeatures = aChaosFeature;
  }

  static bool isActive(ChaosFeature aFeature) {
    return ChaosModeCounter > 0 &&
           (uint32_t(ChaosFeatures) & uint32_t(aFeature));
  }

  /**
   * Increase the chaos mode activation level. An equivalent number of
   * calls to leaveChaosMode must be made in order to restore the original
   * chaos mode state.
   */
  static void enterChaosMode() { ChaosModeCounter++; }

  /**
   * Decrease the chaos mode activation level. See enterChaosMode().
   */
  static void leaveChaosMode() {
    MOZ_ASSERT(ChaosModeCounter > 0);
    ChaosModeCounter--;
  }

  /**
   * Returns a somewhat (but not uniformly) random uint32_t < aBound.
   * Not to be used for anything except ChaosMode, since it's not very random.
   */
  static uint32_t randomUint32LessThan(uint32_t aBound) {
    MOZ_ASSERT(aBound != 0);
    return uint32_t(rand()) % aBound;
  }

  /**
   * Returns a somewhat (but not uniformly) random int32_t <= aLow and >= aHigh.
   * Not to be used for anything except ChaosMode, since it's not very random.
   */
  static int32_t randomInt32InRange(int32_t aLow, int32_t aHigh) {
    MOZ_ASSERT(aHigh >= aLow);
    return (int32_t(rand()) % (aHigh - aLow + 1)) + aLow;
  }
};

} /* namespace mozilla */

#endif /* mozilla_ChaosMode_h */
