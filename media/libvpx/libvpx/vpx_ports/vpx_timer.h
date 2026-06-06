/*
 *  Copyright (c) 2010 The WebM project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree. An additional intellectual property rights grant can be found
 *  in the file PATENTS.  All contributing project authors may
 *  be found in the AUTHORS file in the root of the source tree.
 */

#ifndef VPX_VPX_PORTS_VPX_TIMER_H_
#define VPX_VPX_PORTS_VPX_TIMER_H_

#include "./vpx_config.h"

#include "vpx/vpx_integer.h"

#if CONFIG_OS_SUPPORT

#if defined(_WIN32)
/*
 * Win32 specific includes
 */
#undef NOMINMAX
#define NOMINMAX
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#else
/*
 * POSIX specific includes
 */
#include <time.h>

/* timersub is not provided by msys at this time. */
#ifndef timersub_ns
#define timersub_ns(a, b, result)                    \
  do {                                               \
    (result)->tv_sec = (a)->tv_sec - (b)->tv_sec;    \
    (result)->tv_nsec = (a)->tv_nsec - (b)->tv_nsec; \
    if ((result)->tv_nsec < 0) {                     \
      --(result)->tv_sec;                            \
      (result)->tv_nsec += 1000000000;               \
    }                                                \
  } while (0)
#endif
#endif

struct vpx_usec_timer {
#if defined(_WIN32)
  LARGE_INTEGER begin, end;
#else
  struct timespec begin, end;
#endif
};

#if defined(__APPLE__) && defined(__MACH__)
#if !defined(MAC_OS_VERSION_10_12) || MAC_OS_X_VERSION_MAX_ALLOWED < MAC_OS_VERSION_10_12
#  include <time.h>
#  include <sys/time.h>
#  include <sys/types.h>
#  include <mach/mach_time.h>

const uint64_t kNSperMS = 1000000;

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
static INLINE void vpx_usec_timer_start(struct vpx_usec_timer *t) {
#if defined(_WIN32)
  QueryPerformanceCounter(&t->begin);
#endif
#ifdef XP_MACOSX
  if(__builtin_available(macOS 10.12, *)) {
#endif
#if defined(CLOCK_MONOTONIC_RAW)
  clock_gettime(CLOCK_MONOTONIC_RAW, &t->begin);
#elif !defined(_WIN32) // need this to avoid compiling for WIN32 
                       // because we modified the original macro
  clock_gettime(CLOCK_MONOTONIC, &t->begin);
#endif
#ifdef XP_MACOSX
  } else {
    clock_gettime_missing(CLOCK_MONOTONIC, &t->begin);
  }
#endif
}

static INLINE void vpx_usec_timer_mark(struct vpx_usec_timer *t) {
#if defined(_WIN32)
  QueryPerformanceCounter(&t->end);
#endif
#ifdef XP_MACOSX
  if(__builtin_available(macOS 10.12, *)) {
#endif
#if defined(CLOCK_MONOTONIC_RAW)
  clock_gettime(CLOCK_MONOTONIC_RAW, &t->end);
#elif !defined(_WIN32) // need this to avoid compiling for WIN32 
                       // because we modified the original macro
  clock_gettime(CLOCK_MONOTONIC, &t->end);
#endif
#ifdef XP_MACOSX
  } else {
    clock_gettime_missing(CLOCK_MONOTONIC, &t->end);
  }
#endif
}

static INLINE int64_t vpx_usec_timer_elapsed(struct vpx_usec_timer *t) {
#if defined(_WIN32)
  LARGE_INTEGER freq, diff;

  diff.QuadPart = t->end.QuadPart - t->begin.QuadPart;

  QueryPerformanceFrequency(&freq);
  return diff.QuadPart * 1000000 / freq.QuadPart;
#else
  struct timespec diff;

  timersub_ns(&t->end, &t->begin, &diff);
  return (int64_t)diff.tv_sec * 1000000 + diff.tv_nsec / 1000;
#endif
}

#else /* CONFIG_OS_SUPPORT = 0*/

/* Empty timer functions if CONFIG_OS_SUPPORT = 0 */
#ifndef timersub_ns
#define timersub_ns(a, b, result)
#endif

struct vpx_usec_timer {
  void *dummy;
};

static INLINE void vpx_usec_timer_start(struct vpx_usec_timer *t) {}

static INLINE void vpx_usec_timer_mark(struct vpx_usec_timer *t) {}

static INLINE int vpx_usec_timer_elapsed(struct vpx_usec_timer *t) { return 0; }

#endif /* CONFIG_OS_SUPPORT */

#endif  // VPX_VPX_PORTS_VPX_TIMER_H_
