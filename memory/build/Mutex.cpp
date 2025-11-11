/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "Mutex.h"

#include <errno.h>

#include "mozilla/Assertions.h"

bool Mutex::SpinInKernelSpace() {
    //modify the condition to 10.12 so we use os_unfair_lock
    //for all >10.12 systems. gsvelto used 10.15 because he
    //attached another flag that is specific to 10.15.
    //this change keeps everything simple and is a faithful
    //rendition of the original author's implementation
    if (__builtin_available(macOS 10.12 , *)) {
        return true;
    }

    return false;
}
const bool Mutex::gSpinInKernelSpace = SpinInKernelSpace();

bool Mutex::TryLock() {
  MOZ_ASSERT(mInitialised);

#if defined(XP_WIN)
  return !!TryEnterCriticalSection(mMutex.addr());
#elif defined(XP_DARWIN)
  if(__builtin_available(macOS 10.12, *))  
  return os_unfair_lock_trylock(&mMutex.mUnfairLock);
  else
      return OSSpinLockTry(&mMutex.mSpinLock);
#else
  switch (pthread_mutex_trylock(&mMutex)) {
    case 0:
      return true;
    case EBUSY:
      return false;
    default:
      MOZ_CRASH("pthread_mutex_trylock error.");
  }
#endif
}
