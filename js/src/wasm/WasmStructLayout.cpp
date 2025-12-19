/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * vim: set ts=8 sts=2 et sw=2 tw=80:
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "wasm/WasmStructLayout.h"

#include "jstypes.h"  // RoundUp

// This is a simple implementation of a layouter.  It places the OOL pointer
// at the start of the IL payload area, regardless of whether an OOL area is
// actually necessary.

namespace js::wasm {

#ifdef DEBUG
static bool IsWordAligned(uintptr_t x) { return (x % sizeof(void*)) == 0; }
#endif

bool StructLayout::init(uint32_t firstUsableILOffset, uint32_t usableILSize) {
  // Not actually necessary, but it would be strange if this wasn't so.
  MOZ_ASSERT(IsWordAligned(firstUsableILOffset));
  MOZ_ASSERT(IsWordAligned(usableILSize));
  // Must have at least enough space to hold the OOL pointer
  MOZ_ASSERT(usableILSize >= sizeof(void*));
  // Set up mutable state
  startILO_ = firstUsableILOffset;
  endPlusILO_ = firstUsableILOffset + usableILSize;
  // Install the OOL pointer immediately after the start of the usable area
  oolptrILO_ = js::RoundUp(startILO_, sizeof(void*));
  MOZ_ASSERT(IsWordAligned(oolptrILO_));
  nextILO_ = oolptrILO_ + sizeof(void*);
  return true;
}

// Add a field of the specified size, and get back its access path.  The two
// release assertions together guarantee that the maximum offset that could be
// generated is roughly `16 * js::wasm::MaxStructFields`, so there is no need
// to use checked integers in the layout computations.

bool StructLayout::addField(uint32_t fieldSize, FieldAccessPath* path) {
  MOZ_ASSERT(fieldSize == 16 || fieldSize == 8 || fieldSize == 4 ||
             fieldSize == 2 || fieldSize == 1);
  // Guard against field-offset overflow.
  numFieldsProcessed_++;
  MOZ_RELEASE_ASSERT(numFieldsProcessed_ <= js::wasm::MaxStructFields);
  MOZ_RELEASE_ASSERT(fieldSize <= 16);
  // Figure out where nextILO_ would advance to if the field were placed in
  // the inline area.
  uint32_t nextNextILO = js::RoundUp(nextILO_, fieldSize) + fieldSize;
  if (nextNextILO <= endPlusILO_) {
    // It'll fit in-line
    nextILO_ = nextNextILO;
    *path = FieldAccessPath(nextILO_ - fieldSize);
    return true;
  }
  // Otherwise out-of-line
  nextOOLO_ = js::RoundUp(nextOOLO_, fieldSize) + fieldSize;
  *path = FieldAccessPath(oolptrILO_, nextOOLO_ - fieldSize);
  return true;
}

uint32_t StructLayout::totalSizeIL() const {
  return js::RoundUp(nextILO_, sizeof(void*));
}

bool StructLayout::hasOOL() const { return nextOOLO_ > 0; }

uint32_t StructLayout::totalSizeOOL() const {
  MOZ_ASSERT(hasOOL());
  return js::RoundUp(nextOOLO_, sizeof(void*));
}

FieldAccessPath StructLayout::oolPointerPath() const {
  MOZ_ASSERT(hasOOL());
  return FieldAccessPath(oolptrILO_);
}

}  // namespace js::wasm
