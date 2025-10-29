/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#include "BaseAlloc.h"

#include <cstring>

#include "Globals.h"

using namespace mozilla;

MOZ_CONSTINIT BaseAlloc sBaseAlloc;

// Initialize base allocation data structures.
void BaseAlloc::Init() MOZ_REQUIRES(gInitLock) { mMutex.Init(); }

bool BaseAlloc::pages_alloc(size_t minsize) MOZ_REQUIRES(mMutex) {
  MOZ_ASSERT(minsize != 0);
  size_t csize = CHUNK_CEILING(minsize);
  void* base_pages = chunk_alloc(csize, kChunkSize, true);
  if (!base_pages) {
    return false;
  }
  mNextAddr = base_pages;
  mPastAddr = (void*)((uintptr_t)base_pages + csize);
  // Leave enough pages for minsize committed, since otherwise they would
  // have to be immediately recommitted.
  size_t pminsize = PAGE_CEILING(minsize);
  mNextDecommitted = (void*)((uintptr_t)base_pages + pminsize);
  if (pminsize < csize) {
    pages_decommit(mNextDecommitted, csize - pminsize);
  }
  mStats.mMapped += csize;
  mStats.mCommitted += pminsize;

  return true;
}

void* BaseAlloc::alloc(size_t aSize) {
  // Round size up to nearest multiple of the cacheline size.
  size_t csize = CACHELINE_CEILING(aSize);

  MutexAutoLock lock(mMutex);
  // Make sure there's enough space for the allocation.
  if ((uintptr_t)mNextAddr + csize > (uintptr_t)mPastAddr) {
    if (!pages_alloc(csize)) {
      return nullptr;
    }
  }
  // Allocate.
  void* ret = mNextAddr;
  mNextAddr = (void*)((uintptr_t)mNextAddr + csize);
  // Make sure enough pages are committed for the new allocation.
  if ((uintptr_t)mNextAddr > (uintptr_t)mNextDecommitted) {
    void* pbase_next_addr = (void*)(PAGE_CEILING((uintptr_t)mNextAddr));

    if (!pages_commit(mNextDecommitted,
                      (uintptr_t)mNextAddr - (uintptr_t)mNextDecommitted)) {
      return nullptr;
    }

    mStats.mCommitted +=
        (uintptr_t)pbase_next_addr - (uintptr_t)mNextDecommitted;
    mNextDecommitted = pbase_next_addr;
  }

  return ret;
}

void* BaseAlloc::calloc(size_t aNumber, size_t aSize) {
  void* ret = alloc(aNumber * aSize);
  if (ret) {
    memset(ret, 0, aNumber * aSize);
  }
  return ret;
}
