/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_htmlaccel_htmlaccelEnabled_h
#define mozilla_htmlaccel_htmlaccelEnabled_h

#if defined(__x86_64__)
#  include "mozilla/SSE.h"
#endif

namespace mozilla::htmlaccel {

/// This function is appropriate to call when the SIMD path is compiled
/// with `HTML_ACCEL_FLAGS`.
///
/// Keep this in sync with `HTML_ACCEL_FLAGS` in `toolchain.configure`.
inline bool htmlaccelEnabled() {
#if !defined(__clang__) && defined(__GNUC__) && __GNUC__ < 12
  // __GNUC__ is stuck at 4 in clang, so we need to check __clang__ above.
  // GCC 12 or newer is required for __builtin_shuffle.
  return false;
#elif defined(__aarch64__) && defined(__LITTLE_ENDIAN__)
  return true;
#elif defined(__x86_64__)
  return mozilla::supports_bmi() && mozilla::supports_avx();
#else
  return false;
#endif
}

}  // namespace mozilla::htmlaccel

#endif  // mozilla_htmlaccel_htmlaccelEnabled_h
