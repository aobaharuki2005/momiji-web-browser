/*
 * Copyright (C) 2021 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#include <stdint.h>
#ifdef XP_WIN
#  include <windows.h>
#else
#  include <time.h>
#  include <unistd.h>
#endif

#include "mozilla/Flow.h"

// Some infrastructure that we use for computing a per process UUID

// FNV-1a hasher
// We use this to construct a randomish UUID by hashing the PID and the
// current time.
//
// It's probably not the best choice of hasher but it works for Perfetto
// so it's good enough for us.
struct Hasher {
  static const uint64_t kOffsetBasis = 14695981039346656037ULL;
  static const uint64_t kPrime = 1099511628211ULL;

  uint64_t hash = kOffsetBasis;

  void Update(const void* data, size_t size) {
    const uint8_t* ptr = static_cast<const uint8_t*>(data);
    for (size_t i = 0; i < size; ++i) {
      hash ^= ptr[i];
      hash *= kPrime;
    }
  }
  void Update(uint64_t value) { Update(&value, sizeof(value)); }
  void Update(uint32_t value) { Update(&value, sizeof(value)); }

  uint64_t Get() const { return hash; }
};

#if defined(__APPLE__) && defined(__MACH__)
#  include <time.h>
#  include <sys/time.h>
#  include <sys/types.h>
#  include <mach/mach_time.h>

#if !defined(MAC_OS_VERSION_10_12) || MAC_OS_X_VERSION_MAX_ALLOWED < MAC_OS_VERSION_10_12
#  include <mach/mach.h>
#  include <mach/clock.h>
    //taken from https://github.com/ChisholmKyle/PosixMachTiming/
    /* timing struct for osx */
    typedef struct RoTimingMach {
        mach_timebase_info_data_t timebase;
        clock_serv_t cclock;
    } RoTimingMach;

    /* internal timing struct for osx */
    static RoTimingMach ro_timing_mach_g;

    /* mach clock port */
    static mach_port_t clock_port;

    /* emulate posix clock_gettime */
    static inline int clock_gettime_missing (clockid_t id, struct timespec *tspec)
    {
        int retval = -1;
        mach_timespec_t mts;
        if (id == CLOCK_REALTIME) {
            retval = clock_get_time (ro_timing_mach_g.cclock, &mts);
            if (retval == 0 && tspec != NULL) {
                tspec->tv_sec = mts.tv_sec;
                tspec->tv_nsec = mts.tv_nsec;
            }
        } else if (id == CLOCK_MONOTONIC) {
            retval = clock_get_time (clock_port, &mts);
            if (retval == 0 && tspec != NULL) {
                tspec->tv_sec = mts.tv_sec;
                tspec->tv_nsec = mts.tv_nsec;
            }
        } else {}
        return retval;
    }


#endif
#endif

static uint64_t CurrentTime() {
#ifdef XP_WIN
  return GetTickCount64();
#else
  timespec ts;
#if !defined(MAC_OS_VERSION_10_12) || MAC_OS_X_VERSION_MAX_ALLOWED < MAC_OS_VERSION_10_12
  clock_gettime_missing(CLOCK_UPTIME_RAW, &ts);
#else
  clock_gettime(CLOCK_MONOTONIC, &ts);
#endif
  return ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
#endif
}

static uint64_t CurrentPID() {
#ifdef XP_WIN
  return GetCurrentProcessId();
#else
  return getpid();
#endif
}

// This is inspired by the perfetto code in TrackRegistry::ComputeProcessUuid
uint64_t ComputeProcessUUID() {
  auto pid = CurrentPID();
  auto time = CurrentTime();
  Hasher hasher;
  hasher.Update(pid);
  hasher.Update(time);
  return hasher.Get();
}

MFBT_DATA uint64_t gProcessUUID;

MFBT_API void Flow::Init() { gProcessUUID = ComputeProcessUUID(); }
