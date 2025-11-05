/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/htmlaccel/htmlaccel.h"
#include "mozilla/htmlaccel/htmlaccelNotInline.h"

namespace mozilla::htmlaccel {

// TODO: Perhaps inlining this one on aarch64 wouldn't run into the
// LLVM LICM vs. regalloc bug. But then, inlining this would only
// avoid the overhead of one function call and wouldn't reuse the
// SIMD contants in a useful way.
MOZ_NEVER_INLINE bool ContainsMarkup(const char16_t* aPtr,
                                     const char16_t* aEnd) {
  return detail::ContainsMarkup(aPtr, aEnd);
}

/// The innerHTML / DOMParser case for the data state in the HTML parser
MOZ_NEVER_INLINE int32_t AccelerateDataFastest(const char16_t* aPtr,
                                               const char16_t* aEnd) {
  return detail::AccelerateTextNode(aPtr, aEnd, detail::ZERO_LT_AMP_CR, true);
}

/// View Source case for the data state in the HTML parser
MOZ_NEVER_INLINE int32_t AccelerateDataViewSource(const char16_t* aPtr,
                                                  const char16_t* aEnd) {
  return detail::AccelerateTextNode(aPtr, aEnd, detail::ZERO_LT_AMP_CR_LF,
                                    true);
}

/// Normal network case for the data state in the HTML parser
MOZ_NEVER_INLINE int32_t AccelerateDataLineCol(const char16_t* aPtr,
                                               const char16_t* aEnd) {
  return detail::AccelerateTextNode(aPtr, aEnd, detail::ZERO_LT_AMP_CR_LF,
                                    false);
}

}  // namespace mozilla::htmlaccel
