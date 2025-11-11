/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "Now.h"

#ifdef XP_WIN
#  include "mozilla/DynamicallyLinkedFunctionPtr.h"
#endif  // XP_WIN

#include <stdint.h>

#include "mozilla/TimeStamp.h"
#include "mozilla/Maybe.h"

namespace mozilla {

// Apple things
#if defined(__APPLE__) && defined(__MACH__)
#  include <time.h>
#  include <sys/time.h>
#  include <sys/types.h>
#  include <mach/mach_time.h>

const uint64_t kNSperMS = 1000000;
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

Maybe<uint64_t> NowExcludingSuspendMs() {
#if !defined(MAC_OS_VERSION_10_12) || MAC_OS_X_VERSION_MAX_ALLOWED < MAC_OS_VERSION_10_12
  struct timespec ts = {0};
  return Some(clock_gettime_missing(CLOCK_UPTIME_RAW, &ts)/ kNSperMS);
#else
  return Some(clock_gettime_nsec_np(CLOCK_UPTIME_RAW) / kNSperMS);
#endif
}

Maybe<uint64_t> NowIncludingSuspendMs() {
#if !defined(MAC_OS_VERSION_10_12) || MAC_OS_X_VERSION_MAX_ALLOWED < MAC_OS_VERSION_10_12
  struct timespec ts = {0};
  return Some(clock_gettime_missing(CLOCK_MONOTONIC_RAW, &ts)/ kNSperMS);
#else
  return Some(clock_gettime_nsec_np(CLOCK_MONOTONIC_RAW) / kNSperMS);
#endif
}

#elif defined(XP_WIN)

// Number of hundreds of nanoseconds in a millisecond
static constexpr uint64_t kHNSperMS = 10000;

Maybe<uint64_t> NowExcludingSuspendMs() {
  ULONGLONG interrupt_time;
  if (!QueryUnbiasedInterruptTime(&interrupt_time)) {
    return Nothing();
  }
  return Some(interrupt_time / kHNSperMS);
}

Maybe<uint64_t> NowIncludingSuspendMs() {
  static const mozilla::StaticDynamicallyLinkedFunctionPtr<void(WINAPI*)(
      PULONGLONG)>
      pQueryInterruptTime(L"KernelBase.dll", "QueryInterruptTime");
  if (!pQueryInterruptTime) {
    // On Windows, this does include the time the computer was suspended so it's
    // an adequate fallback.
    TimeStamp processCreation = TimeStamp::ProcessCreation();
    TimeStamp now = TimeStamp::Now();
    if (!processCreation.IsNull() && !now.IsNull()) {
      return Some(uint64_t((now - processCreation).ToMilliseconds()));
    } else {
      return Nothing();
    }
  }
  ULONGLONG interrupt_time;
  pQueryInterruptTime(&interrupt_time);
  return Some(interrupt_time / kHNSperMS);
}

#elif defined(XP_UNIX)  // including BSDs and Android
#  include <time.h>

// Number of nanoseconds in a millisecond.
static constexpr uint64_t kNSperMS = 1000000;

uint64_t TimespecToMilliseconds(struct timespec aTs) {
  return aTs.tv_sec * 1000 + aTs.tv_nsec / kNSperMS;
}

Maybe<uint64_t> NowExcludingSuspendMs() {
  struct timespec ts = {0};

#  ifdef XP_OPENBSD
  if (clock_gettime(CLOCK_UPTIME, &ts)) {
#  else
  if (clock_gettime(CLOCK_MONOTONIC, &ts)) {
#  endif
    return Nothing();
  }
  return Some(TimespecToMilliseconds(ts));
}

Maybe<uint64_t> NowIncludingSuspendMs() {
#  ifndef CLOCK_BOOTTIME
  return Nothing();
#  else
  struct timespec ts = {0};

  if (clock_gettime(CLOCK_BOOTTIME, &ts)) {
    return Nothing();
  }
  return Some(TimespecToMilliseconds(ts));
#  endif
}

#else  // catch all

Maybe<uint64_t> NowExcludingSuspendMs() { return Nothing(); }
Maybe<uint64_t> NowIncludingSuspendMs() { return Nothing(); }

#endif

};  // namespace mozilla
