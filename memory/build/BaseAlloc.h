/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#ifndef BASEALLOC_H
#define BASEALLOC_H

#include "Mutex.h"

// The base allocator is a simple memory allocator used internally by
// mozjemalloc for its own structures.
class BaseAlloc {
 public:
  constexpr BaseAlloc() {};

  void Init() MOZ_REQUIRES(gInitLock);

  void* alloc(size_t aSize);

  void* calloc(size_t aNumber, size_t aSize);

  Mutex base_mtx;

  struct Stats {
    size_t mapped = 0;
    size_t committed = 0;
  };
  Stats GetStats() MOZ_EXCLUDES(base_mtx) {
    MutexAutoLock lock(base_mtx);

    MOZ_ASSERT(mStats.mapped >= mStats.committed);
    return mStats;
  }

 private:
  // Allocate fresh pages to satsify at least minsize.
  bool pages_alloc(size_t minsize) MOZ_REQUIRES(base_mtx);

  // Current pages that are being used for internal memory allocations.  These
  // pages are carved up in cacheline-size quanta, so that there is no chance of
  // false cache line sharing.
  void* base_pages MOZ_GUARDED_BY(base_mtx) = nullptr;
  void* base_next_addr MOZ_GUARDED_BY(base_mtx) = nullptr;

  void* base_next_decommitted MOZ_GUARDED_BY(base_mtx) = nullptr;
  // Address immediately past base_pages.
  void* base_past_addr MOZ_GUARDED_BY(base_mtx) = nullptr;

  Stats mStats MOZ_GUARDED_BY(base_mtx);
};

extern BaseAlloc sBaseAlloc;

// A specialization of the base allocator with a free list.
template <typename T>
struct TypedBaseAlloc {
  static T* sFirstFree;

  static size_t size_of() { return sizeof(T); }

  static T* alloc() {
    T* ret;

    sBaseAlloc.base_mtx.Lock();
    if (sFirstFree) {
      ret = sFirstFree;
      sFirstFree = *(T**)ret;
      sBaseAlloc.base_mtx.Unlock();
    } else {
      sBaseAlloc.base_mtx.Unlock();
      ret = (T*)sBaseAlloc.alloc(size_of());
    }

    return ret;
  }

  static void dealloc(T* aNode) {
    MutexAutoLock lock(sBaseAlloc.base_mtx);
    *(T**)aNode = sFirstFree;
    sFirstFree = aNode;
  }
};

template <typename T>
T* TypedBaseAlloc<T>::sFirstFree = nullptr;

template <typename T>
struct BaseAllocFreePolicy {
  void operator()(T* aPtr) { TypedBaseAlloc<T>::dealloc(aPtr); }
};

#endif /* ! BASEALLOC_H */
