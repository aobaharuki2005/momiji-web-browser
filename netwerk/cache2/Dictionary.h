/* vim: set ts=2 sts=2 et sw=2: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_net_Dictionary_h
#define mozilla_net_Dictionary_h

#include "nsCOMPtr.h"
#include "nsICacheEntry.h"
#include "nsICacheEntryOpenCallback.h"
#include "nsICacheStorageService.h"
#include "nsICacheStorageVisitor.h"
#include "nsICryptoHash.h"
#include "nsIInterfaceRequestor.h"
#include "nsIObserver.h"
#include "nsIStreamListener.h"
#include "mozilla/RefPtr.h"
#include "nsString.h"
#include "nsTArray.h"
#include "mozilla/TimeStamp.h"

class nsICacheStorage;
class nsIIOService;
class nsILoadContextInfo;
class nsITimer;

namespace mozilla {
namespace net {

// Outstanding requests that offer this dictionary will hold a reference to it.
// If it's replaced (or removed) during the request, we would a) read the data
// into memory* b) unlink this from the origin in the memory cache.
//
// * or we wait for read-into-memory to finish, if we start reading entries
//   when we send the request.
//
// When creating an entry from incoming data, we'll create it with no hash
// initially until the full data has arrived, then update the Hash.
class DictionaryCacheEntry final
    : public LinkedListElement<RefPtr<DictionaryCacheEntry>> {
 private:
  ~DictionaryCacheEntry() { MOZ_ASSERT(mUsers == 0); }

 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(DictionaryCacheEntry)
  DictionaryCacheEntry(const nsACString& aKey, const nsACString& aPattern,
                       const nsACString& aId,
                       const Maybe<nsCString>& aHash = Nothing());

  // returns true if the pattern for the dictionary matches the path given
  bool Match(const nsACString& aFilePath, uint32_t& aLongest);

  void Prefetch();

  const nsACString& GetHash() const {
    MOZ_ASSERT(NS_IsMainThread());
    return mHash;
  }

  void SetHash(const nsACString& aHash) {
    MOZ_ASSERT(NS_IsMainThread());
    mHash = aHash;
  }

  bool Valid() const { return !mHash.IsEmpty(); }

  const nsCString& GetId() const { return mId; }

  // keep track of requests that may need the data
  void InUse() { mUsers++; }
  void UseCompleted() {
    MOZ_ASSERT(mUsers > 0);
    mUsers--;
    // Purge mDictionaryData
    // XXX Don't clear until we can reload it from disk
    //    mDictionaryData.clear();
  }

  const nsACString& GetURI() const { return mURI; }

  void Clear() {
    MOZ_ASSERT(NS_IsMainThread());
    mHash.Truncate(0);
    mDictionaryData.clear();
  }

  const Vector<uint8_t>& GetDictionary() const { return mDictionaryData; }

  size_t SizeOfIncludingThis(mozilla::MallocSizeOf mallocSizeOf) const {
    // XXX
    return mallocSizeOf(this);
  }

 private:
  nsCString mURI;  // URI (without ref) for the dictionary
  nsCString mPattern;
  nsCString mId;  // max length 1024
  // dcb and dcz use type 'raw'.  We're allowed to ignore types we don't
  // understand, so we can fail to record a dictionary with type != 'raw'
  //  nsCString mType;

  // SHA-256 hash value ready to put into a header
  nsCString mHash;
  uint32_t mUsers{0};  // active requests using this entry
  // in-memory copy of the entry to use to decompress incoming data
  Vector<uint8_t> mDictionaryData;

  // for accumulating SHA-256 hash values for dictionaries
  nsCOMPtr<nsICryptoHash> mCrypto;
};

// XXX Do we want to pre-read dictionaries into RAM at startup (lazily)?
// If we have all dictionaries stored in the cache, we don't need to do
// lookups to find if an origin has dictionaries or not, and we don't need to
// store empty entries (and LRU them).  Downside would be if there are a LOT of
// origins with dictionaries, which may eventually happen, it would use more
// memory for rarely used origins.  We could have a limit for dictionaries, and
// above that switch to partial caching and empty entries for origins without.

// XXX Clear all dictionaries when cookies are cleared for a site

using DictCacheList = AutoCleanLinkedList<RefPtr<DictionaryCacheEntry>>;

// singleton class
class DictionaryCache final {
 private:
  DictionaryCache() {};
  ~DictionaryCache() {};

 public:
  NS_INLINE_DECL_REFCOUNTING(DictionaryCache)
  static already_AddRefed<DictionaryCache> GetInstance();

  nsresult Init();

  nsresult AddEntry(nsIURI* aURI, const nsACString& aKey,
                    const nsACString& aPattern, const nsACString& aId,
                    const Maybe<nsCString>& aHash,
                    DictionaryCacheEntry** aDictEntry);

  nsresult AddEntry(nsIURI* aURI, DictionaryCacheEntry* aDictEntry);

  nsresult RemoveEntry(nsIURI* aURI, const nsACString& aKey);

  // return an entry
  already_AddRefed<DictionaryCacheEntry> GetDictionaryFor(nsIURI* aURI);

  size_t SizeOfIncludingThis(mozilla::MallocSizeOf mallocSizeOf) const {
    // XXX
    return mallocSizeOf(this);
  }

 private:
  // In-memory cache of dictionary entries.  HashMap, keyed by origin, of
  // Linked list (LRU order) of valid dictionaries for the origin.
  // We keep empty entries in there to avoid hitting the disk cache to find out
  // if there are dictionaries for an origin.
  // Static assertions fire if we try to have a LinkedList directly in an
  // nsTHashMap
  nsTHashMap<nsCStringHashKey, UniquePtr<DictCacheList>> mDictionaryCache;
};

}  // namespace net
}  // namespace mozilla

#endif  // mozilla_net_Dictionary_h
