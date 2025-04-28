/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "AwakeTimeStamp.h"

#ifdef XP_WIN
#  include <windows.h>
#endif

#include "mozilla/Assertions.h"
#include "mozilla/DebugOnly.h"

namespace mozilla {

static constexpr uint64_t kUSperS = 1000000;
static constexpr uint64_t kUSperMS = 1000;
#ifndef XP_WIN
static constexpr uint64_t kNSperUS = 1000;
#endif

double AwakeTimeDuration::ToSeconds() const {
  return static_cast<double>(mValueUs) / kUSperS;
}
double AwakeTimeDuration::ToMilliseconds() const {
  return static_cast<double>(mValueUs) / kUSperMS;
}
double AwakeTimeDuration::ToMicroseconds() const {
  return static_cast<double>(mValueUs);
}

AwakeTimeDuration AwakeTimeDuration::FromSeconds(uint64_t aSeconds) {
  return AwakeTimeDuration(aSeconds * 1000000);
}
AwakeTimeDuration AwakeTimeDuration::FromMilliseconds(uint64_t aMilliseconds) {
  return AwakeTimeDuration(aMilliseconds * 1000);
}
AwakeTimeDuration AwakeTimeDuration::FromMicroseconds(uint64_t aMicroseconds) {
  return AwakeTimeDuration(aMicroseconds);
}

AwakeTimeDuration AwakeTimeStamp::operator-(
    AwakeTimeStamp const& aOther) const {
  return AwakeTimeDuration(mValueUs - aOther.mValueUs);
}

AwakeTimeStamp AwakeTimeStamp::operator-(
    AwakeTimeDuration const& aOther) const {
  return AwakeTimeStamp(mValueUs - aOther.mValueUs);
}

AwakeTimeStamp AwakeTimeStamp::operator+(
    const AwakeTimeDuration& aDuration) const {
  return AwakeTimeStamp(mValueUs + aDuration.mValueUs);
}

void AwakeTimeStamp::operator+=(const AwakeTimeDuration& aOther) {
  mValueUs += aOther.mValueUs;
}

void AwakeTimeStamp::operator-=(const AwakeTimeDuration& aOther) {
  MOZ_ASSERT(mValueUs >= aOther.mValueUs);
  mValueUs -= aOther.mValueUs;
}

// Apple things
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

AwakeTimeStamp AwakeTimeStamp::Now() {
#if !defined(MAC_OS_VERSION_10_12) || MAC_OS_X_VERSION_MAX_ALLOWED < MAC_OS_VERSION_10_12
    struct timespec tv;
    return AwakeTimeStamp(clock_gettime_missing(CLOCK_UPTIME_RAW, &tv)/ kNSperUS);
#else
    return AwakeTimeStamp(clock_gettime_nsec_np(CLOCK_UPTIME_RAW) / kNSperUS);
#endif
}
AwakeTimeStamp AwakeTimeStamp::NowLoRes() { return Now(); }

#elif defined(XP_WIN)

// Number of hundreds of nanoseconds in a microsecond
static constexpr uint64_t kHNSperUS = 10;

AwakeTimeStamp AwakeTimeStamp::NowLoRes() {
  ULONGLONG interrupt_time;
  DebugOnly<bool> rv = QueryUnbiasedInterruptTime(&interrupt_time);
  MOZ_ASSERT(rv);

  return AwakeTimeStamp(interrupt_time / kHNSperUS);
}

#else  // Linux and other POSIX but not macOS
#  include <time.h>

uint64_t TimespecToMicroseconds(struct timespec aTs) {
  return aTs.tv_sec * kUSperS + aTs.tv_nsec / kNSperUS;
}

AwakeTimeStamp AwakeTimeStamp::NowLoRes() {
  struct timespec ts = {0};
  DebugOnly<int> rv = clock_gettime(CLOCK_MONOTONIC, &ts);
  MOZ_ASSERT(!rv);
  return AwakeTimeStamp(TimespecToMicroseconds(ts));
}

#endif

};  // namespace mozilla
