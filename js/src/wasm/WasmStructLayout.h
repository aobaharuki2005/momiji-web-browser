/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * vim: set ts=8 sts=2 et sw=2 tw=80:
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef wasm_WasmStructLayout_h
#define wasm_WasmStructLayout_h

#include "mozilla/Assertions.h"

#include <stdint.h>

#include "wasm/WasmConstants.h"  // MaxStructFields

// [SMDOC] Wasm Struct Layout Overview
//
// (1) Struct layout is almost entirely decoupled from the details of
//     WasmStructObject.  Layout needs only to know the fixed-header-size and
//     inline-payload-size for WasmStructObject.  To avoid header-file cycle
//     complexity, the values WasmStructObject_Size_ASSUMED and
//     WasmStructObject_MaxInlineBytes_ASSUMED are defined in this file.  These
//     assumptions are made safe by static assertions in WasmGcObject.h; see
//     comments there.
//
// (2) A structure layout consists of a FieldAccessPath value (see below) for
//     each field, together with the total object size and inline payload size
//     for the WasmStructObject, and possibly the total OOL size required.
//
// (3) Struct layout info is stored in `class wasm::StructType`.  It is
//     computed early in the compilation process, by `StructType::init`, when
//     decoding the module environment.  The struct's AllocKind is also
//     computed.
//
// (4) Structs that do not need an OOL pointer are not forced to have one.
//     Whether one is required can be determined by calling
//     `StructType::hasOOL`.  If one is present, its offset relative to the
//     start of the WasmStructObject is stored in
//     `StructType::oolPointerOffset_`.
//
// (5) When generating code for field accesses, info (4) is not needed.
//     Instead a field access is described by its FieldAccessPath; this is all
//     that is needed (apart from the field's type) to generate the relevant
//     loads/stores.
//
// (6) StructType is the single point of truth for struct layouts.  However,
//     for performance reasons, at instantiation time, some fields of a
//     StructType are copied into the associated TypeDefInstanceData's
//     `cached.strukt` union, mainly so as to make struct allocation faster.
//     This copying is done by `Instance::init`.
//
// (7) WasmStructObject::createStructIL and related machinery look at fields in
//     the TypeDefInstanceData to get relevant run-time info (the AllocKind,
//     etc).
//
// (8) At run-time, it may be necessary to find the OOL pointer for arbitrary
//     WasmStructObjects, mostly in the GC-support routines.  This can be
//     obtained (at some expense) from
//     `WasmStructObject::hasOOLPointer/getOOLPointer` and related methods.
//
// (9) Note: the allocation machinery will ensure that fields of size 1, 2, 4
//     and 8 bytes are naturally aligned.  However, 16 byte fields are only
//     guaranteed 8 byte alignment.  This is because the underlying heap
//     allocator only provides 8 byte alignment, so even if 16 byte fields were
//     16-aligned relative to the start of a WasmStructObject, there's no
//     guarantee they would be 16-aligned when actually written to the heap.

namespace js::wasm {

// These values are defined by WasmStructObject's layout but are needed early
// in the compilation pipeline in order to compute struct layouts.  Rather than
// create a header file cycle involving WasmGcObject.h, WasmTypeDef.h and this
// file, it seems simpler to assume what they are and static_assert this is
// correct on WasmGcObject.h.  These values are expected to change rarely, if
// ever.
//
// See comment on static_assert involving these in WasmGcObject.h.
const size_t WasmStructObject_Size_ASSUMED = 16;

#ifdef JS_64BIT
const size_t WasmStructObject_MaxInlineBytes_ASSUMED = 136;
#else
const size_t WasmStructObject_MaxInlineBytes_ASSUMED = 128;
#endif

//=========================================================================
// FieldAccessPath

// FieldAccessPath describes the offsets needed to access a field in a
// StructType.  It contains either one or two values.
//
// Let `obj` be a `WasmStructObject*`.  Then, for a field with path `p`:
//
// * if !p.hasOOL(), the data is at obj + p.ilOffset().
//
// * if p.hasOOL(), let oolptr = *(obj + p.ilOffset()).
//   The data is at oolptr + p.oolOffset().
//
// It is implied from this that the `ilOffset()` values incorporate the fixed
// header size of WasmStructObject; that does not need to be added on here.

class FieldAccessPath {
  uint32_t path_;
  static constexpr uint32_t ILBits = 9;
  static constexpr uint32_t OOLBits = 32 - ILBits;
  static constexpr uint32_t MaxValidILOffset = (1 << ILBits) - 1;
  static constexpr uint32_t MaxValidOOLOffset = (1 << OOLBits) - 1 - 1;
  static constexpr uint32_t InvalidOOLOffset = MaxValidOOLOffset + 1;
  uint32_t getIL() const { return path_ & MaxValidILOffset; }
  uint32_t getOOL() const { return path_ >> ILBits; }
  // Ensure ILBits is sufficient for any valid IL offset.
  static_assert((WasmStructObject_Size_ASSUMED +
                 WasmStructObject_MaxInlineBytes_ASSUMED) < MaxValidILOffset);
  // A crude check to ensure that OOLBits is sufficient for any situation,
  // assuming a worst-case future scenario where fields can be up to 64 bytes
  // long (eg for Intel AVX512 fields).
  static_assert(js::wasm::MaxStructFields * 64 < MaxValidOOLOffset);

 public:
  FieldAccessPath() : path_(0) {}
  explicit FieldAccessPath(uint32_t offsetIL)
      : path_((InvalidOOLOffset << ILBits) | offsetIL) {
    MOZ_ASSERT(offsetIL <= MaxValidILOffset);
  }
  FieldAccessPath(uint32_t offsetIL, uint32_t offsetOOL)
      : path_((offsetOOL << ILBits) | offsetIL) {
    MOZ_ASSERT(offsetIL <= MaxValidILOffset);
    MOZ_ASSERT(offsetOOL <= MaxValidOOLOffset);
  }
  bool hasOOL() const { return getOOL() != InvalidOOLOffset; }
  uint32_t ilOffset() const { return getIL(); }
  uint32_t oolOffset() const {
    MOZ_ASSERT(hasOOL());
    return getOOL();
  }
};

static_assert(sizeof(FieldAccessPath) == sizeof(uint32_t));

//=========================================================================
// StructLayout, the top level interface for structure layout machinery.

class StructLayout {
  //---------------- Interface ----------------
 public:
  // Initialises the layouter.  `firstUsableILOffset` is the first allowable
  // payload byte offset in the IL object; offsets prior to that are considered
  // reserved.  `usableILSize` is the maximum allowed size of the IL payload
  // area.
  bool init(uint32_t firstUsableILOffset, uint32_t usableILSize);

  // Add a field of the specified size, and get back its access path, or
  // `false` to indicate OOM.
  bool addField(uint32_t fieldSize, FieldAccessPath* path);

  // Return the total IL object size (including reserved area) so far, rounded
  // up to an integral number of words.
  uint32_t totalSizeIL() const;

  // Returns true iff an OOL area is needed.
  bool hasOOL() const;

  // Returns the total OOL block size so far, rounded up to an integral number
  // of words.  Invalid to call if `!hasOOL()`.
  uint32_t totalSizeOOL() const;

  // Returns the access path in the IL area, to get the OOL pointer.
  // Invalid to call if `!hasOOL()`.
  FieldAccessPath oolPointerPath() const;

  //---------------- Implementation ----------------
 private:
  // Set at the start and then unchanged:
  // [start, end) for allowable inline offsets
  uint32_t startILO_ = 0;
  uint32_t endPlusILO_ = 0;
  // The offset of the OOL pointer
  uint32_t oolptrILO_ = 0;
  // These change as fields are added:
  // The next available inline and out-of-line offset
  uint32_t nextILO_ = 0;
  uint32_t nextOOLO_ = 0;
  // The total number of fields processed so far
  uint32_t numFieldsProcessed_ = 0;
};

}  // namespace js::wasm

#endif /* wasm_WasmStructLayout_h */
