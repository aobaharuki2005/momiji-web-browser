/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * vim: set ts=8 sts=2 et sw=2 tw=80:
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef builtin_intl_DurationFormat_h
#define builtin_intl_DurationFormat_h

#include <stdint.h>

#include "builtin/SelfHostingDefines.h"
#include "builtin/temporal/TemporalUnit.h"
#include "js/Class.h"
#include "vm/NativeObject.h"

namespace mozilla::intl {
class ListFormat;
class NumberFormat;
}  // namespace mozilla::intl

namespace js {

class DurationFormatObject : public NativeObject {
 public:
  static const JSClass class_;
  static const JSClass& protoClass_;

  static constexpr uint32_t INTERNALS_SLOT = 0;
  static constexpr uint32_t NUMBER_FORMAT_YEARS_SLOT = 1;
  static constexpr uint32_t NUMBER_FORMAT_MONTHS_SLOT = 2;
  static constexpr uint32_t NUMBER_FORMAT_WEEKS_SLOT = 3;
  static constexpr uint32_t NUMBER_FORMAT_DAYS_SLOT = 4;
  static constexpr uint32_t NUMBER_FORMAT_HOURS_SLOT = 5;
  static constexpr uint32_t NUMBER_FORMAT_MINUTES_SLOT = 6;
  static constexpr uint32_t NUMBER_FORMAT_SECONDS_SLOT = 7;
  static constexpr uint32_t NUMBER_FORMAT_MILLISECONDS_SLOT = 8;
  static constexpr uint32_t NUMBER_FORMAT_MICROSECONDS_SLOT = 9;
  static constexpr uint32_t NUMBER_FORMAT_NANOSECONDS_SLOT = 10;
  static constexpr uint32_t LIST_FORMAT_SLOT = 11;
  static constexpr uint32_t SLOT_COUNT = 12;

  static_assert(INTERNALS_SLOT == INTL_INTERNALS_OBJECT_SLOT,
                "INTERNALS_SLOT must match self-hosting define for internals "
                "object slot");

 private:
  static constexpr uint32_t numberFormatSlot(temporal::TemporalUnit unit) {
    MOZ_ASSERT(temporal::TemporalUnit::Year <= unit &&
               unit <= temporal::TemporalUnit::Nanosecond);

    static_assert(uint32_t(temporal::TemporalUnit::Year) ==
                  NUMBER_FORMAT_YEARS_SLOT);
    static_assert(uint32_t(temporal::TemporalUnit::Nanosecond) ==
                  NUMBER_FORMAT_NANOSECONDS_SLOT);

    return uint32_t(unit);
  }

 public:
  mozilla::intl::NumberFormat* getNumberFormat(
      temporal::TemporalUnit unit) const {
    const auto& slot = getFixedSlot(numberFormatSlot(unit));
    if (slot.isUndefined()) {
      return nullptr;
    }
    return static_cast<mozilla::intl::NumberFormat*>(slot.toPrivate());
  }

  void setNumberFormat(temporal::TemporalUnit unit,
                       mozilla::intl::NumberFormat* numberFormat) {
    setFixedSlot(numberFormatSlot(unit), PrivateValue(numberFormat));
  }

  mozilla::intl::ListFormat* getListFormat() const {
    const auto& slot = getFixedSlot(LIST_FORMAT_SLOT);
    if (slot.isUndefined()) {
      return nullptr;
    }
    return static_cast<mozilla::intl::ListFormat*>(slot.toPrivate());
  }

  void setListFormat(mozilla::intl::ListFormat* listFormat) {
    setFixedSlot(LIST_FORMAT_SLOT, PrivateValue(listFormat));
  }

 private:
  static const JSClassOps classOps_;
  static const ClassSpec classSpec_;

  static void finalize(JS::GCContext* gcx, JSObject* obj);
};

/**
 * `toLocaleString` implementation for Temporal.Duration objects.
 */
[[nodiscard]] extern bool TemporalDurationToLocaleString(
    JSContext* cx, const JS::CallArgs& args);

}  // namespace js

#endif /* builtin_intl_DurationFormat_h */
