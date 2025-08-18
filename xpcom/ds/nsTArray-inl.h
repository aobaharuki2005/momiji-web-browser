/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsTArray_h__
#  error "Don't include this file directly"
#endif

// NOTE: We don't use MOZ_COUNT_CTOR/MOZ_COUNT_DTOR to perform leak checking of
// nsTArray_base objects intentionally for the following reasons:
// * The leak logging isn't as useful as other types of logging, as
//   nsTArray_base is frequently relocated without invoking a constructor, such
//   as when stored within another nsTArray. This means that
//   XPCOM_MEM_LOG_CLASSES cannot be used to identify specific leaks of nsTArray
//   objects.
// * The nsTArray type is layout compatible with the ThinVec crate with the
//   correct flags, and ThinVec does not currently perform leak logging.
//   This means that if a large number of arrays are transferred between Rust
//   and C++ code using ThinVec, for example within another ThinVec, they
//   will not be logged correctly and might appear as e.g. negative leaks.
// * Leaks which have been found thanks to the leak logging added by this
//   type have often not been significant, and/or have needed to be
//   circumvented using some other mechanism. Most leaks found with this type
//   in them also include other types which will continue to be tracked.

template <class Alloc, class RelocationStrategy>
nsTArray_base<Alloc, RelocationStrategy>::nsTArray_base() : mHdr(EmptyHdr()) {}

template <class Alloc, class RelocationStrategy>
nsTArray_base<Alloc, RelocationStrategy>::~nsTArray_base() {
  if (!HasEmptyHeader() && !UsesAutoArrayBuffer()) {
    Alloc::Free(mHdr);
  }
}

template <class Alloc, class RelocationStrategy>
nsTArray_base<Alloc, RelocationStrategy>::nsTArray_base(const nsTArray_base&)
    : mHdr(EmptyHdr()) {
  // Actual copying happens through nsTArray_CopyEnabler, we just need to do the
  // initialization of mHdr.
}

template <class Alloc, class RelocationStrategy>
nsTArray_base<Alloc, RelocationStrategy>&
nsTArray_base<Alloc, RelocationStrategy>::operator=(const nsTArray_base&) {
  // Actual copying happens through nsTArray_CopyEnabler, so do nothing here (do
  // not copy mHdr).
  return *this;
}

// defined in nsTArray.cpp
bool IsTwiceTheRequiredBytesRepresentableAsUint32(size_t aCapacity,
                                                  size_t aElemSize);

template <class Alloc, class RelocationStrategy>
template <typename ActualAlloc>
typename ActualAlloc::ResultTypeProxy
nsTArray_base<Alloc, RelocationStrategy>::ExtendCapacity(size_type aLength,
                                                         size_type aCount,
                                                         size_type aElemSize) {
  mozilla::CheckedInt<size_type> newLength = aLength;
  newLength += aCount;

  if (!newLength.isValid()) {
    return ActualAlloc::FailureResult();
  }

  return this->EnsureCapacity<ActualAlloc>(newLength.value(), aElemSize);
}

template <class Alloc, class RelocationStrategy>
template <typename ActualAlloc>
typename ActualAlloc::ResultTypeProxy
nsTArray_base<Alloc, RelocationStrategy>::EnsureCapacityImpl(
    size_type aCapacity, size_type aElemSize) {
  MOZ_ASSERT(aCapacity > mHdr->mCapacity,
             "Should have been checked by caller (EnsureCapacity)");

  // If the requested memory allocation exceeds size_type(-1)/2, then
  // our doubling algorithm may not be able to allocate it.
  // Additionally, if it exceeds uint32_t(-1) then we couldn't fit in the
  // Header::mCapacity member. Just bail out in cases like that.  We don't want
  // to be allocating 2 GB+ arrays anyway.
  if (!IsTwiceTheRequiredBytesRepresentableAsUint32(aCapacity, aElemSize)) {
    ActualAlloc::SizeTooBig((size_t)aCapacity * aElemSize);
    return ActualAlloc::FailureResult();
  }

  size_t reqSize = sizeof(Header) + aCapacity * aElemSize;

  if (HasEmptyHeader()) {
    // Malloc() new data
    Header* header = static_cast<Header*>(ActualAlloc::Malloc(reqSize));
    if (!header) {
      return ActualAlloc::FailureResult();
    }
    header->mLength = 0;
    header->mCapacity = aCapacity;
    header->mIsAutoBuffer = 0;
    mHdr = header;

    return ActualAlloc::SuccessResult();
  }

  // We increase our capacity so that the allocated buffer grows exponentially,
  // which gives us amortized O(1) appending. Below the threshold, we use
  // powers-of-two. Above the threshold, we grow by at least 1.125, rounding up
  // to the nearest MiB.
  const size_t slowGrowthThreshold = 8 * 1024 * 1024;

  size_t bytesToAlloc;
  if (reqSize >= slowGrowthThreshold) {
    size_t currSize = sizeof(Header) + Capacity() * aElemSize;
    size_t minNewSize = currSize + (currSize >> 3);  // multiply by 1.125
    bytesToAlloc = reqSize > minNewSize ? reqSize : minNewSize;

    // Round up to the next multiple of MiB.
    const size_t MiB = 1 << 20;
    bytesToAlloc = MiB * ((bytesToAlloc + MiB - 1) / MiB);
  } else {
    // Round up to the next power of two.
    bytesToAlloc = mozilla::RoundUpPow2(reqSize);
  }

  Header* header;
  if (UsesAutoArrayBuffer() || !RelocationStrategy::allowRealloc) {
    // Malloc() and copy
    header = static_cast<Header*>(ActualAlloc::Malloc(bytesToAlloc));
    if (!header) {
      return ActualAlloc::FailureResult();
    }

    RelocationStrategy::RelocateNonOverlappingRegionWithHeader(
        header, mHdr, Length(), aElemSize);

    if (!UsesAutoArrayBuffer()) {
      ActualAlloc::Free(mHdr);
    }
  } else {
    // Realloc() existing data
    header = static_cast<Header*>(ActualAlloc::Realloc(mHdr, bytesToAlloc));
    if (!header) {
      return ActualAlloc::FailureResult();
    }
  }

  // How many elements can we fit in bytesToAlloc?
  size_t newCapacity = (bytesToAlloc - sizeof(Header)) / aElemSize;
  MOZ_ASSERT(newCapacity >= aCapacity, "Didn't enlarge the array enough!");
  header->mCapacity = newCapacity;
  header->mIsAutoBuffer = false;

  mHdr = header;

  return ActualAlloc::SuccessResult();
}

// We don't need use Alloc template parameter specified here because failure to
// shrink the capacity will leave the array unchanged.
template <class Alloc, class RelocationStrategy>
void nsTArray_base<Alloc, RelocationStrategy>::ShrinkCapacity(
    size_type aElemSize, size_t aElemAlign) {
  if (HasEmptyHeader() || UsesAutoArrayBuffer()) {
    return;
  }

  if (mHdr->mLength >= mHdr->mCapacity) {  // should never be greater than...
    return;
  }

  size_type length = Length();

  if (length == 0) {
    nsTArrayFallibleAllocator::Free(mHdr);
    mHdr = EmptyHdr();
    return;
  }

  size_type newSize = sizeof(Header) + length * aElemSize;

  Header* newHeader;
  if (!RelocationStrategy::allowRealloc) {
    // Malloc() and copy.
    newHeader =
        static_cast<Header*>(nsTArrayFallibleAllocator::Malloc(newSize));
    if (!newHeader) {
      return;
    }

    RelocationStrategy::RelocateNonOverlappingRegionWithHeader(
        newHeader, mHdr, Length(), aElemSize);

    nsTArrayFallibleAllocator::Free(mHdr);
  } else {
    // Realloc() existing data.
    newHeader =
        static_cast<Header*>(nsTArrayFallibleAllocator::Realloc(mHdr, newSize));
    if (!newHeader) {
      return;
    }
  }

  mHdr = newHeader;
  mHdr->mCapacity = length;
  // mIsAutoBuffer will already always be 0, but assigning the full 32-bit width
  // rather than just the capacity slightly reduces bitwise operations.
  mHdr->mIsAutoBuffer = false;
}

template <class Alloc, class RelocationStrategy>
void nsTArray_base<Alloc, RelocationStrategy>::ShrinkCapacityToZero(
    size_type aElemSize, size_t aElemAlign) {
  MOZ_ASSERT(mHdr->mLength == 0);

  if (HasEmptyHeader() || UsesAutoArrayBuffer()) {
    return;
  }

  nsTArrayFallibleAllocator::Free(mHdr);
  mHdr = EmptyHdr();
}

template <class Alloc, class RelocationStrategy>
template <typename ActualAlloc>
void nsTArray_base<Alloc, RelocationStrategy>::ShiftData(index_type aStart,
                                                         size_type aOldLen,
                                                         size_type aNewLen,
                                                         size_type aElemSize,
                                                         size_t aElemAlign) {
  if (aOldLen == aNewLen) {
    return;
  }

  // Determine how many elements need to be shifted
  size_type num = mHdr->mLength - (aStart + aOldLen);

  // Compute the resulting length of the array
  mHdr->mLength += aNewLen - aOldLen;
  if (mHdr->mLength == 0) {
    ShrinkCapacityToZero(aElemSize, aElemAlign);
  } else {
    // Maybe nothing needs to be shifted
    if (num == 0) {
      return;
    }
    // Perform shift (change units to bytes first)
    aStart *= aElemSize;
    aNewLen *= aElemSize;
    aOldLen *= aElemSize;
    char* baseAddr = reinterpret_cast<char*>(mHdr + 1) + aStart;
    RelocationStrategy::RelocateOverlappingRegion(
        baseAddr + aNewLen, baseAddr + aOldLen, num, aElemSize);
  }
}

template <class Alloc, class RelocationStrategy>
template <typename ActualAlloc>
void nsTArray_base<Alloc, RelocationStrategy>::SwapFromEnd(index_type aStart,
                                                           size_type aCount,
                                                           size_type aElemSize,
                                                           size_t aElemAlign) {
  // This method is part of the implementation of
  // nsTArray::SwapRemoveElement{s,}At. For more information, read the
  // documentation on that method.
  if (aCount == 0) {
    return;
  }

  // We are going to be removing aCount elements. Update our length to point to
  // the new end of the array.
  size_type oldLength = mHdr->mLength;
  mHdr->mLength -= aCount;

  if (mHdr->mLength == 0) {
    // If we have no elements remaining in the array, we can free our buffer.
    ShrinkCapacityToZero(aElemSize, aElemAlign);
    return;
  }

  // Determine how many elements we need to move from the end of the array into
  // the now-removed section. This will either be the number of elements which
  // were removed (if there are more elements in the tail of the array), or the
  // entire tail of the array, whichever is smaller.
  size_type relocCount = std::min(aCount, mHdr->mLength - aStart);
  if (relocCount == 0) {
    return;
  }

  // Move the elements which are now stranded after the end of the array back
  // into the now-vacated memory.
  index_type sourceBytes = (oldLength - relocCount) * aElemSize;
  index_type destBytes = aStart * aElemSize;

  // Perform the final copy. This is guaranteed to be a non-overlapping copy
  // as our source contains only still-valid entries, and the destination
  // contains only invalid entries which need to be overwritten.
  MOZ_ASSERT(sourceBytes >= destBytes,
             "The source should be after the destination.");
  MOZ_ASSERT(sourceBytes - destBytes >= relocCount * aElemSize,
             "The range should be nonoverlapping");

  char* baseAddr = reinterpret_cast<char*>(mHdr + 1);
  RelocationStrategy::RelocateNonOverlappingRegion(
      baseAddr + destBytes, baseAddr + sourceBytes, relocCount, aElemSize);
}

template <class Alloc, class RelocationStrategy>
template <typename ActualAlloc>
typename ActualAlloc::ResultTypeProxy
nsTArray_base<Alloc, RelocationStrategy>::InsertSlotsAt(index_type aIndex,
                                                        size_type aCount,
                                                        size_type aElemSize,
                                                        size_t aElemAlign) {
  if (MOZ_UNLIKELY(aIndex > Length())) {
    mozilla::detail::InvalidArrayIndex_CRASH(aIndex, Length());
  }

  if (!ActualAlloc::Successful(
          this->ExtendCapacity<ActualAlloc>(Length(), aCount, aElemSize))) {
    return ActualAlloc::FailureResult();
  }

  // Move the existing elements as needed.  Note that this will
  // change our mLength, so no need to call IncrementLength.
  ShiftData<ActualAlloc>(aIndex, 0, aCount, aElemSize, aElemAlign);

  return ActualAlloc::SuccessResult();
}

template <class Alloc, class RelocationStrategy>
template <typename ActualAlloc, class Allocator>
typename ActualAlloc::ResultTypeProxy
nsTArray_base<Alloc, RelocationStrategy>::SwapArrayElements(
    nsTArray_base<Allocator, RelocationStrategy>& aOther, size_type aElemSize,
    size_t aElemAlign) {
  // If neither array uses an auto buffer which is big enough to store the
  // other array's elements, then ensure that both arrays use malloc'ed storage
  // and swap their mHdr pointers.
  if ((!UsesAutoArrayBuffer() || Capacity() < aOther.Length()) &&
      (!aOther.UsesAutoArrayBuffer() || aOther.Capacity() < Length())) {
    auto* thisHdr = TakeHeaderForMove<ActualAlloc>(aElemSize);
    if (MOZ_UNLIKELY(!thisHdr)) {
      return ActualAlloc::FailureResult();
    }
    auto* otherHdr = aOther.template TakeHeaderForMove<ActualAlloc>(aElemSize);
    if (MOZ_UNLIKELY(!otherHdr)) {
      // Ensure thisHdr and the elements inside it are safely
      // cleaned up in this error case, by returning it to
      // being owned by this.
      MOZ_ASSERT(UsesAutoArrayBuffer() || HasEmptyHeader());
      mHdr = thisHdr;
      return ActualAlloc::FailureResult();
    }
    // Avoid replacing the potentially auto-buffer with the empty header if
    // we're empty.
    if (otherHdr != EmptyHdr()) {
      mHdr = otherHdr;
    }
    if (thisHdr != EmptyHdr()) {
      aOther.mHdr = thisHdr;
    }
    return ActualAlloc::SuccessResult();
  }

  // Swap the two arrays by copying, since at least one is using an auto
  // buffer which is large enough to hold all of the aOther's elements.  We'll
  // copy the shorter array into temporary storage.
  //
  // (We could do better than this in some circumstances.  Suppose we're
  // swapping arrays X and Y.  X has space for 2 elements in its auto buffer,
  // but currently has length 4, so it's using malloc'ed storage.  Y has length
  // 2.  When we swap X and Y, we don't need to use a temporary buffer; we can
  // write Y straight into X's auto buffer, write X's malloc'ed buffer on top
  // of Y, and then switch X to using its auto buffer.)

  if (!ActualAlloc::Successful(
          EnsureCapacity<ActualAlloc>(aOther.Length(), aElemSize)) ||
      !Allocator::Successful(
          aOther.template EnsureCapacity<Allocator>(Length(), aElemSize))) {
    return ActualAlloc::FailureResult();
  }

  // The EnsureCapacity calls above shouldn't have caused *both* arrays to
  // switch from their auto buffers to malloc'ed space.
  MOZ_ASSERT(UsesAutoArrayBuffer() || aOther.UsesAutoArrayBuffer(),
             "One of the arrays should be using its auto buffer.");

  size_type smallerLength = XPCOM_MIN(Length(), aOther.Length());
  size_type largerLength = XPCOM_MAX(Length(), aOther.Length());
  void* smallerElements;
  void* largerElements;
  if (Length() <= aOther.Length()) {
    smallerElements = Hdr() + 1;
    largerElements = aOther.Hdr() + 1;
  } else {
    smallerElements = aOther.Hdr() + 1;
    largerElements = Hdr() + 1;
  }

  // Allocate temporary storage for the smaller of the two arrays.  We want to
  // allocate this space on the stack, if it's not too large.  Sounds like a
  // job for AutoTArray!  (One of the two arrays we're swapping is using an
  // auto buffer, so we're likely not allocating a lot of space here.  But one
  // could, in theory, allocate a huge AutoTArray on the heap.)
  AutoTArray<uint8_t, 64 * sizeof(void*)> temp;
  if (!ActualAlloc::Successful(temp.template EnsureCapacity<ActualAlloc>(
          smallerLength * aElemSize, sizeof(uint8_t)))) {
    return ActualAlloc::FailureResult();
  }

  RelocationStrategy::RelocateNonOverlappingRegion(
      temp.Elements(), smallerElements, smallerLength, aElemSize);
  RelocationStrategy::RelocateNonOverlappingRegion(
      smallerElements, largerElements, largerLength, aElemSize);
  RelocationStrategy::RelocateNonOverlappingRegion(
      largerElements, temp.Elements(), smallerLength, aElemSize);

  // Swap the arrays' lengths.
  MOZ_ASSERT((aOther.Length() == 0 || !HasEmptyHeader()) &&
                 (Length() == 0 || !aOther.HasEmptyHeader()),
             "Don't set sEmptyTArrayHeader's length.");
  size_type tempLength = Length();

  // Avoid writing to EmptyHdr, since it can trigger false
  // positives with TSan.
  if (!HasEmptyHeader()) {
    mHdr->mLength = aOther.Length();
  }
  if (!aOther.HasEmptyHeader()) {
    aOther.mHdr->mLength = tempLength;
  }

  return ActualAlloc::SuccessResult();
}

template <class Alloc, class RelocationStrategy>
template <class Allocator>
void nsTArray_base<Alloc, RelocationStrategy>::MoveInit(
    nsTArray_base<Allocator, RelocationStrategy>& aOther, size_type aElemSize,
    size_t aElemAlign) {
  // This method is similar to SwapArrayElements, but specialized for the case
  // where the target array is empty with no allocated heap storage. It is
  // provided and used to simplify template instantiation and enable better code
  // generation.

  MOZ_ASSERT(Length() == 0);
  MOZ_ASSERT(Capacity() == 0 || UsesAutoArrayBuffer());

  // If neither array uses an auto buffer which is big enough to store the
  // other array's elements, then ensure that both arrays use malloc'ed storage
  // and swap their mHdr pointers.
  if ((!UsesAutoArrayBuffer() || Capacity() < aOther.Length()) &&
      !aOther.UsesAutoArrayBuffer()) {
    mHdr = aOther.mHdr;

    aOther.mHdr = EmptyHdr();

    return;
  }

  // Move the data by copying, since at least one has an auto
  // buffer which is large enough to hold all of the aOther's elements.

  EnsureCapacity<nsTArrayInfallibleAllocator>(aOther.Length(), aElemSize);

  // The EnsureCapacity calls above shouldn't have caused *both* arrays to
  // switch from their auto buffers to malloc'ed space.
  MOZ_ASSERT(UsesAutoArrayBuffer() || aOther.UsesAutoArrayBuffer(),
             "One of the arrays should be using its auto buffer.");

  RelocationStrategy::RelocateNonOverlappingRegion(Hdr() + 1, aOther.Hdr() + 1,
                                                   aOther.Length(), aElemSize);

  // Swap the arrays' lengths.
  MOZ_ASSERT((aOther.Length() == 0 || !HasEmptyHeader()) &&
                 (Length() == 0 || !aOther.HasEmptyHeader()),
             "Don't set sEmptyTArrayHeader's length.");

  // Avoid writing to EmptyHdr, since it can trigger false
  // positives with TSan.
  if (!HasEmptyHeader()) {
    mHdr->mLength = aOther.Length();
  }
  if (!aOther.HasEmptyHeader()) {
    aOther.mHdr->mLength = 0;
  }
}

template <class Alloc, class RelocationStrategy>
template <class Allocator>
void nsTArray_base<Alloc, RelocationStrategy>::MoveConstructNonAutoArray(
    nsTArray_base<Allocator, RelocationStrategy>& aOther, size_type aElemSize,
    size_t aElemAlign) {
  // We know that we are not an (Copyable)AutoTArray and we know that we are
  // empty, so don't use SwapArrayElements which doesn't know either of these
  // facts and is very complex. Use nsTArrayInfallibleAllocator regardless of
  // Alloc because this is called from a move constructor, which cannot report
  // an error to the caller.
  mHdr =
      aOther.template TakeHeaderForMove<nsTArrayInfallibleAllocator>(aElemSize);
}

template <class Alloc, class RelocationStrategy>
template <typename ActualAlloc>
auto nsTArray_base<Alloc, RelocationStrategy>::TakeHeaderForMove(
    size_type aElemSize) -> Header* {
  if (IsEmpty()) {
    return EmptyHdr();
  }
  if (!UsesAutoArrayBuffer()) {
    return std::exchange(mHdr, EmptyHdr());
  }

  size_type size = sizeof(Header) + Length() * aElemSize;
  Header* header = static_cast<Header*>(ActualAlloc::Malloc(size));
  if (!header) {
    return nullptr;
  }

  RelocationStrategy::RelocateNonOverlappingRegionWithHeader(
      header, mHdr, Length(), aElemSize);
  header->mCapacity = Length();
  header->mIsAutoBuffer = false;

  mHdr->mLength = 0;
  MOZ_ASSERT(UsesAutoArrayBuffer());
  MOZ_ASSERT(IsEmpty());
  return header;
}
