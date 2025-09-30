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
#include "nsTHashMap.h"
#include "nsHashKeys.h"

class nsICacheStorage;
class nsIIOService;
class nsILoadContextInfo;

// Version of metadata entries we expect
static const uint32_t METADATA_DICTIONARY_VERSION = 1;
#define META_DICTIONARY_PREFIX "dict:"_ns

namespace mozilla {
namespace net {

class DictionaryOrigin;

// Outstanding requests that offer this dictionary will hold a reference to it.
// If it's replaced (or removed) during the request, we would a) read the data
// into memory* b) unlink this from the origin in the memory cache.
//
// * or we wait for read-into-memory to finish, if we start reading entries
//   when we send the request.
//
// When creating an entry from incoming data, we'll create it with no hash
// initially until the full data has arrived, then update the Hash.
class DictionaryCacheEntry final : public nsICacheEntryOpenCallback,
                                   public nsIStreamListener {
 private:
  ~DictionaryCacheEntry() { MOZ_ASSERT(mUsers == 0); }

 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSICACHEENTRYOPENCALLBACK
  NS_DECL_NSIREQUESTOBSERVER
  NS_DECL_NSISTREAMLISTENER

  DictionaryCacheEntry(const char* aKey);
  DictionaryCacheEntry(const nsACString& aKey, const nsACString& aPattern,
                       const nsACString& aId,
                       const Maybe<nsCString>& aHash = Nothing());

  // returns true if the pattern for the dictionary matches the path given
  bool Match(const nsACString& aFilePath, uint32_t& aLongest);

  // Start reading the cache entry into memory and call completion
  // function when done
  bool Prefetch(nsILoadContextInfo* aLoadContextInfo,
                const std::function<void()>& aFunc);

  const nsACString& GetHash() const { return mHash; }

  bool HasHash() {
    // Hard to statically check since we're called from lambdas in
    // GetDictionaryFor
    return !mHash.IsEmpty();
  }

  void SetHash(const nsACString& aHash) {
    MOZ_ASSERT(NS_IsMainThread());
    mHash = aHash;
  }

  void WriteOnHash(DictionaryOrigin* aOrigin);

  const nsCString& GetId() const { return mId; }

  // keep track of requests that may need the data
  void InUse();
  void UseCompleted();
  bool IsReading() const { return mUsers > 0 && !mWaitingPrefetch.IsEmpty(); }

  void SetReplacement(DictionaryCacheEntry* aEntry, DictionaryOrigin* aOrigin) {
    mReplacement = aEntry;
    mOrigin = aOrigin;
    if (mReplacement) {
      mReplacement->mShouldSuspend = true;
      mReplacement->mBlocked = true;
    }
  }

  bool ShouldSuspendUntilCacheRead() const { return mShouldSuspend; }

  // aFunc is called when we have finished reading a dictionary from the
  // cache, or we have no users waiting for cache data (cancelled, etc)
  void CallbackOnCacheRead(const std::function<void()>& aFunc) {
    // the reasons to call back are identical to Prefetch()
    mWaitingPrefetch.AppendElement(aFunc);
  }

  const nsACString& GetURI() const { return mURI; }

  void Clear() {
    MOZ_ASSERT(NS_IsMainThread());
    mHash.Truncate(0);
    mDictionaryData.clear();
    mDictionaryDataComplete = false;
    MOZ_ASSERT(mWaitingPrefetch.IsEmpty());
  }

  const Vector<uint8_t>& GetDictionary() const { return mDictionaryData; }

  // Accumulate a hash while saving a file being received to the cache
  void AccumulateHash(const char* aBuf, int32_t aCount);
  void FinishHash();

  // return a pointer to the data and length
  uint8_t* DictionaryData(size_t* aLength) const {
    *aLength = mDictionaryData.length();
    return (uint8_t*)mDictionaryData.begin();
  }

  bool DictionaryReady() const { return mDictionaryDataComplete; }

  size_t SizeOfIncludingThis(mozilla::MallocSizeOf mallocSizeOf) const {
    // XXX
    return mallocSizeOf(this);
  }

  static nsresult ReadCacheData(nsIInputStream* aInStream, void* aClosure,
                                const char* aFromSegment, uint32_t aToOffset,
                                uint32_t aCount, uint32_t* aWriteCount);

  void MakeMetadataEntry(nsCString& aNewValue);

  nsresult Write(nsICacheEntry* aEntry);

  nsresult RemoveEntry(nsICacheEntry* aCacheEntry);

  // Parse metadata from DictionaryOrigin
  bool ParseMetadata(const char* aSrc);

  void CopyFrom(DictionaryCacheEntry* aOther) {
    mURI = aOther->mURI;
    mPattern = aOther->mPattern;
    mId = aOther->mId;
    // XXX match-dest
    // XXX type
  }

  void UnblockAddEntry(DictionaryOrigin* aOrigin);

 private:
  nsCString mURI;  // URI (without ref) for the dictionary
  nsCString mPattern;
  nsCString mId;  // max length 1024
                  // XXX add list of match-dest values
                  // XXX add type

  // dcb and dcz use type 'raw'.  We're allowed to ignore types we don't
  // understand, so we can fail to record a dictionary with type != 'raw'
  //  nsCString mType;

  // SHA-256 hash value ready to put into a header
  nsCString mHash;
  uint32_t mUsers{0};  // active requests using this entry
  // in-memory copy of the entry to use to decompress incoming data
  Vector<uint8_t> mDictionaryData;
  bool mDictionaryDataComplete{false};

  // for accumulating SHA-256 hash values for dictionaries
  nsCOMPtr<nsICryptoHash> mCrypto;

  // call these when prefetch is complete
  nsTArray<std::function<void()>> mWaitingPrefetch;

  // If we need to Write() an entry before we know the hash, remember the origin
  // here (creates a temporary cycle). Clear on StopRequest
  RefPtr<DictionaryOrigin> mOrigin;
  // Don't store origin for write if we've already received OnStopRequest
  bool mStopReceived{false};

  // If set, a new entry wants to replace us, and we have active decoding users.
  // When we finish reading data into this entry for decoding, do 2 things:
  // Remove our entry from origin->mEntries (so no future requests find this,
  // and un-Suspend the new channel so it can start saving data into the cache.
  RefPtr<DictionaryCacheEntry> mReplacement;

  // We should suspend until the ond entry has been read
  bool mShouldSuspend{false};

  // We're blocked from taking over for the old entry for now
  bool mBlocked{false};
};

// XXX Do we want to pre-read dictionaries into RAM at startup (lazily)?
// If we have all dictionaries stored in the cache, we don't need to do
// lookups to find if an origin has dictionaries or not, and we don't need to
// store empty entries (and LRU them).  Downside would be if there are a LOT of
// origins with dictionaries, which may eventually happen, it would use more
// memory for rarely used origins.  We could have a limit for dictionaries, and
// above that switch to partial caching and empty entries for origins without.

// XXX Clear all dictionaries when cookies are cleared for a site

// using DictCacheList = AutoCleanLinkedList<RefPtr<DictionaryCacheEntry>>;
using DictCacheList = nsTArray<RefPtr<DictionaryCacheEntry>>;

// XXX if we want to have a parallel LRU list for pushing origins out of memory,
// add this: public LinkedListElement<RefPtr<DictionaryOrigin>>,
class DictionaryOrigin : public nsICacheEntryMetaDataVisitor {
  friend class DictionaryCache;

 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSICACHEENTRYMETADATAVISITOR

  DictionaryOrigin(const nsACString& aOrigin, nsICacheEntry* aEntry)
      : mOrigin(aOrigin), mEntry(aEntry) {}

  void SetCacheEntry(nsICacheEntry* aEntry) { mEntry = aEntry; }
  void Write(DictionaryCacheEntry* aDictEntry);
  already_AddRefed<DictionaryCacheEntry> AddEntry(
      DictionaryCacheEntry* aDictEntry, bool aNewEntry);
  nsresult RemoveEntry(const nsACString& aKey);
  void RemoveEntry(DictionaryCacheEntry* aEntry);
  DictionaryCacheEntry* Match(const nsACString& path);
  void FinishAddEntry(DictionaryCacheEntry* aEntry);

 private:
  virtual ~DictionaryOrigin() {}

  nsCString mOrigin;
  nsCOMPtr<nsICacheEntry> mEntry;
  DictCacheList mEntries;
  // Dictionaries currently being received.  Once these get a Hash, move to
  // mEntries
  DictCacheList mPendingEntries;
};

class DictionaryOriginReader;

// singleton class
class DictionaryCache final {
 private:
  DictionaryCache() { Init(); }
  ~DictionaryCache() {}

  friend class DictionaryOriginReader;
  friend class DictionaryCacheEntry;

 public:
  NS_INLINE_DECL_REFCOUNTING(DictionaryCache)

  static already_AddRefed<DictionaryCache> GetInstance();

  nsresult Init();

  nsresult AddEntry(nsIURI* aURI, const nsACString& aKey,
                    const nsACString& aPattern, const nsACString& aId,
                    const Maybe<nsCString>& aHash, bool aNewEntry,
                    DictionaryCacheEntry** aDictEntry);

  already_AddRefed<DictionaryCacheEntry> AddEntry(
      nsIURI* aURI, bool aNewEntry, DictionaryCacheEntry* aDictEntry);

  nsresult RemoveEntry(nsIURI* aURI, const nsACString& aKey);

  // return an entry
  void GetDictionaryFor(
      nsIURI* aURI,
      const std::function<nsresult(DictionaryCacheEntry*)>& aCallback);

  size_t SizeOfIncludingThis(mozilla::MallocSizeOf mallocSizeOf) const {
    // XXX
    return mallocSizeOf(this);
  }

 private:
  static nsCOMPtr<nsICacheStorage> sCacheStorage;

  // In-memory cache of dictionary entries.  HashMap, keyed by origin, of
  // Linked list (LRU order) of valid dictionaries for the origin.
  // We keep empty entries in there to avoid hitting the disk cache to find out
  // if there are dictionaries for an origin.
  // Static assertions fire if we try to have a LinkedList directly in an
  // nsTHashMap
  nsTHashMap<nsCStringHashKey, RefPtr<DictionaryOrigin>> mDictionaryCache;
};

}  // namespace net
}  // namespace mozilla

#endif  // mozilla_net_Dictionary_h
