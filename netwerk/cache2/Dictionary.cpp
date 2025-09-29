/* vim: set ts=2 sts=2 et sw=2: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <algorithm>

#include "Dictionary.h"

#include "nsAppDirectoryServiceDefs.h"
#include "nsIAsyncInputStream.h"
#include "nsICacheStorageService.h"
#include "nsICacheStorage.h"
#include "nsICacheEntry.h"
#include "nsICachingChannel.h"
#include "nsICancelable.h"
#include "nsIChannel.h"
#include "nsContentUtils.h"
#include "mozilla/dom/Document.h"
#include "nsIFile.h"
#include "nsIHttpChannel.h"
#include "nsIInputStream.h"
#include "nsILoadContext.h"
#include "nsILoadContextInfo.h"
#include "nsILoadGroup.h"
#include "nsIObserverService.h"
#include "nsIURI.h"
#include "nsInputStreamPump.h"
#include "nsNetUtil.h"
#include "nsServiceManagerUtils.h"
#include "nsStreamUtils.h"
#include "nsString.h"
#include "nsThreadUtils.h"
#include "mozilla/Logging.h"

#include "mozilla/Components.h"
#include "mozilla/OriginAttributes.h"
#include "mozilla/Preferences.h"
#include "mozilla/SchedulerGroup.h"
#include "mozilla/StaticPrefs_network.h"
#include "mozilla/glean/NetwerkMetrics.h"

#include "mozilla/net/MozURL.h"
#include "mozilla/net/NeckoCommon.h"
#include "mozilla/net/NeckoParent.h"
#include "mozilla/net/NeckoChild.h"

#include "LoadContextInfo.h"
#include "mozilla/ipc/URIUtils.h"
#include "SerializedLoadContext.h"

#include "mozilla/dom/ContentParent.h"
#include "mozilla/ClearOnShutdown.h"

#include "ReferrerInfo.h"

using namespace mozilla;

namespace mozilla {
namespace net {

LazyLogModule gDictionaryLog("CompressionDictionaries");

#define DICTIONARY_LOG(args) \
  MOZ_LOG(gDictionaryLog, mozilla::LogLevel::Debug, args)

/**
 * Reference to the DictionaryCache singleton. May be null.
 */
StaticRefPtr<DictionaryCache> gDictionaryCache;
nsCOMPtr<nsICacheStorage> DictionaryCache::sCacheStorage;

DictionaryCacheEntry::DictionaryCacheEntry(const char* aKey) { mURI = aKey; }

DictionaryCacheEntry::DictionaryCacheEntry(const nsACString& aURI,
                                           const nsACString& aPattern,
                                           const nsACString& aId,
                                           const Maybe<nsCString>& aHash)
    : mURI(aURI), mPattern(aPattern), mId(aId) {
  if (aHash) {
    mHash = aHash.value();
  }
}

NS_IMPL_ISUPPORTS(DictionaryCacheEntry, nsICacheEntryOpenCallback,
                  nsIStreamListener)

// returns true if the pattern for the dictionary matches the path given
bool DictionaryCacheEntry::Match(const nsACString& aFilePath,
                                 uint32_t& aLongest) {
  if (mHash.IsEmpty()) {
    // We don't have the file yet
    return false;
  }
  // Not worth checking if we wouldn't use it
  // XXX Check match-dest
  if (mPattern.Length() > aLongest) {
    DICTIONARY_LOG(("Match: %s to %s", PromiseFlatCString(aFilePath).get(),
                    PromiseFlatCString(mPattern).get()));
    // XXX remove this when we get URLPattern
    // XXX temp: handle https://site/foo* or https://site/foo?query=*, or
    // https://site/foo/*, etc
    if (mPattern.Last() == '*' && aFilePath.Length() >= mPattern.Length()) {
      // XXX not efficient, but this is throw-away code
      nsAutoCString partial(aFilePath);
      partial.Truncate(mPattern.Length() - 1);
      nsAutoCString pattern(mPattern);
      pattern.Truncate(mPattern.Length() - 1);
      if (partial.Equals(pattern)) {
        aLongest = mPattern.Length();
        DICTIONARY_LOG(("Match: %s (longest %u)", mURI.get(), aLongest));
        return true;
      }
      return false;
      // XXX handle https://site/foo/* (
    } else if (mPattern.Equals(aFilePath)) {
      if (mHash.IsEmpty()) {
        return false;
      }
      aLongest = mPattern.Length();
      DICTIONARY_LOG(
          ("Match: %s (longest %u)", PromiseFlatCString(mURI).get(), aLongest));
      return true;
    }
  }
  return false;
}

void DictionaryCacheEntry::InUse() {
  mUsers++;
  DICTIONARY_LOG(("Dictionary users for %s -- %u Users", mURI.get(), mUsers));
}

void DictionaryCacheEntry::UseCompleted() {
  MOZ_ASSERT(mUsers > 0);
  mUsers--;
  // Purge mDictionaryData
  if (mUsers == 0) {  // XXX perhaps we should hold it for a bit longer?
    DICTIONARY_LOG(("Clearing Dictionary data for %s", mURI.get()));
    mDictionaryData.clear();
    mDictionaryDataComplete = false;
  } else {
    DICTIONARY_LOG(("Not clearing Dictionary data for %s -- %u Users",
                    mURI.get(), mUsers));
  }
}

// returns aShouldSuspend=true if we should suspend to wait for the prefetch
bool DictionaryCacheEntry::Prefetch(nsILoadContextInfo* aLoadContextInfo,
                                    const std::function<void()>& aFunc) {
  DICTIONARY_LOG(("Prefetch for %s", mURI.get()));
  // Start reading the cache entry into memory and call completion
  // function when done
  if (mWaitingPrefetch.IsEmpty()) {
    if (!mDictionaryDataComplete) {
      // We haven't requested it yet from the Cache and don't have it in memory
      // already
      // We can't use sCacheStorage because we need the correct LoadContextInfo
      nsCOMPtr<nsICacheStorageService> cacheStorageService(
          components::CacheStorage::Service());
      if (!cacheStorageService) {
        return false;
      }
      nsCOMPtr<nsICacheStorage> cacheStorage;
      nsresult rv = cacheStorageService->DiskCacheStorage(
          aLoadContextInfo, getter_AddRefs(cacheStorage));
      if (NS_FAILED(rv)) {
        return false;
      }
      // Add before we schedule!
      mWaitingPrefetch.AppendElement(aFunc);
      cacheStorage->AsyncOpenURIString(mURI, ""_ns,
                                       nsICacheStorage::OPEN_READONLY, this);
      DICTIONARY_LOG(("Started Prefetch for %s, anonymous=%d", mURI.get(),
                      aLoadContextInfo->IsAnonymous()));
      return true;
    }
    DICTIONARY_LOG(("Prefetch for %s - already have data in memory (%u users)",
                    mURI.get(), mUsers));
    return false;
  }
  DICTIONARY_LOG(("Prefetch for %s - already waiting", mURI.get()));
  return true;
}

void DictionaryCacheEntry::AccumulateHash(const char* aBuf, int32_t aCount) {
  MOZ_ASSERT(NS_IsMainThread());
  if (!mHash.IsEmpty()) {
    if (!mDictionaryData.empty()) {
      // We have data from the cache.... but if we change the hash there will
      // be problems
      // XXX dragons here
      return;
    }
    // accumulating a new hash when we have an existing?
    // XXX probably kill the hash when we get an overwrite; tricky, need to
    // handle loading the old one into ram to decompress the new one.  Also,
    // what if the old one is being used for multiple requests, one of which
    // is an overwrite?   This is an edge case not discussed in the spec - we
    // could separate out a structure for in-flight requests where the data
    // would be used from, so the Entry could be overwritten as needed
    return;  // XXX
  }
  if (!mCrypto) {
    DICTIONARY_LOG(("Calculating new hash for %s", mURI.get()));
    // If mCrypto is null, and mDictionaryData is set, we've already got the
    // data for this dictionary.
    nsresult rv;
    mCrypto = do_CreateInstance(NS_CRYPTO_HASH_CONTRACTID, &rv);
    if (NS_WARN_IF(NS_FAILED(rv))) {
      return;
    }
    rv = mCrypto->Init(nsICryptoHash::SHA256);
    NS_WARNING_ASSERTION(NS_SUCCEEDED(rv), "Cache InitCrypto failed");
  }
  mCrypto->Update(reinterpret_cast<const uint8_t*>(aBuf), aCount);
  DICTIONARY_LOG(("Accumulate Hash %p: %d bytes, total %zu", this, aCount,
                  mDictionaryData.length()));
}

void DictionaryCacheEntry::FinishHash() {
  MOZ_ASSERT(NS_IsMainThread());
  if (mCrypto) {
    mCrypto->Finish(true, mHash);
    mCrypto = nullptr;
    DICTIONARY_LOG(("Hash for %p (%s) is %s", this, mURI.get(), mHash.get()));
    if (mOrigin) {
      DICTIONARY_LOG(("Write on hash"));
      // This will also move us from mPendingEntries to mEntries
      mOrigin->Write(this);
      if (!mBlocked) {
        mOrigin->FinishAddEntry(this);
      }
      mOrigin = nullptr;
    }
  }
}

// Metadata format:
// * XXX What key should these be under?
// * uint16_t version
// * uint16_t flags ?
//
// * Entries:
// ** CString: URI -- the key
// ** CString: Hash
// ** CString: Pattern
// ** match-dest list, terminated by empty string
// *** CString: Match-dest
// ** CString: Id
// ** CString: type
// We store strings with a delimiter, and use escapes for delimiters or escape
// characters in the source strings.
//

// Escape the string and append to aOutput
static void EscapeMetadataString(const nsACString& aInput, nsCString& aOutput) {
  // First calculate how much we'll need to append.  Means we'll walk the source
  // twice, but avoids any potential multiple reallocations
  const char* src = aInput.BeginReading();
  size_t len = 1;  // for initial |
  while (*src) {
    if (*src == '|' || *src == '\\') {
      len += 2;
    } else {
      len++;
    }
    src++;
  }
  aOutput.SetCapacity(aOutput.Length() + len);
  src = aInput.BeginReading();

  aOutput.AppendLiteral("|");
  while (*src) {
    if (*src == '|' || *src == '\\') {
      aOutput.AppendLiteral("\\");
    }
    aOutput.Append(*src++);
  }
}

void DictionaryCacheEntry::MakeMetadataEntry(nsCString& aNewValue) {
  EscapeMetadataString(mHash, aNewValue);
  EscapeMetadataString(mPattern, aNewValue);
  EscapeMetadataString(mId, aNewValue);
  // List of match-dest values is terminated by an empty string
  // XXX add match-dest support
  EscapeMetadataString(""_ns, aNewValue);
  // We don't store type, since we only support type 'raw'  We can support
  // type in the future by considering missing type as raw without changing the
  // format
}

nsresult DictionaryCacheEntry::Write(nsICacheEntry* aCacheEntry) {
  nsAutoCStringN<2048> metadata;
  MakeMetadataEntry(metadata);
  DICTIONARY_LOG(
      ("DictionaryCacheEntry::Write %s %s", mURI.get(), metadata.get()));
  return aCacheEntry->SetMetaDataElement(mURI.get(), metadata.get());
}

nsresult DictionaryCacheEntry::RemoveEntry(nsICacheEntry* aCacheEntry) {
  return aCacheEntry->SetMetaDataElement(mURI.BeginReading(), nullptr);
}

// Parse - | for field seperator; \ for escape of | or \ .
static const char* GetEncodedString(const char* aSrc, nsACString& aOutput) {
  // scan the input string and build the output, handling escapes
  aOutput.Truncate();
  while (*aSrc) {
    if (*aSrc == '|') {
      break;
    }
    if (*aSrc == '\\') {
      aSrc++;
    }
    aOutput.Append(*aSrc++);
  }
  return aSrc;
}

// Parse metadata from DictionaryOrigin
bool DictionaryCacheEntry::ParseMetadata(const char* aSrc) {
  MOZ_ASSERT(*aSrc == '|');
  aSrc++;
  aSrc = GetEncodedString(aSrc, mHash);
  aSrc = GetEncodedString(aSrc, mPattern);
  aSrc = GetEncodedString(aSrc, mId);
  nsAutoCString temp;
  // get match-dest values (list ended with empty string)
  do {
    aSrc = GetEncodedString(aSrc, temp);
    if (!temp.IsEmpty()) {
      // XXX store match-dest
    }
  } while (!temp.IsEmpty());
  // XXX type
  aSrc = GetEncodedString(aSrc, temp);

  DICTIONARY_LOG(("Parse entry %s: |%s| %s id=%s",
                  PromiseFlatCString(mURI).get(),
                  PromiseFlatCString(mHash).get(),
                  PromiseFlatCString(mPattern).get(), mId.get()));
  return true;
}

//-----------------------------------------------------------------------------
// nsIStreamListener implementation
//-----------------------------------------------------------------------------

NS_IMETHODIMP
DictionaryCacheEntry::OnStartRequest(nsIRequest* request) {
  DICTIONARY_LOG(("DictionaryCacheEntry %s OnStartRequest", mURI.get()));
  return NS_OK;
}

NS_IMETHODIMP
DictionaryCacheEntry::OnDataAvailable(nsIRequest* request,
                                      nsIInputStream* aInputStream,
                                      uint64_t aOffset, uint32_t aCount) {
  uint32_t n;
  DICTIONARY_LOG(
      ("DictionaryCacheEntry %s OnDataAvailable %u", mURI.get(), aCount));
  return aInputStream->ReadSegments(&DictionaryCacheEntry::ReadCacheData, this,
                                    aCount, &n);
}

/* static */
nsresult DictionaryCacheEntry::ReadCacheData(
    nsIInputStream* aInStream, void* aClosure, const char* aFromSegment,
    uint32_t aToOffset, uint32_t aCount, uint32_t* aWriteCount) {
  DictionaryCacheEntry* self = static_cast<DictionaryCacheEntry*>(aClosure);

  Unused << self->mDictionaryData.append(aFromSegment, aCount);
  DICTIONARY_LOG(("Accumulate %p (%s): %d bytes, total %zu", self,
                  self->mURI.get(), aCount, self->mDictionaryData.length()));
  *aWriteCount = aCount;
  return NS_OK;
}

NS_IMETHODIMP
DictionaryCacheEntry::OnStopRequest(nsIRequest* request, nsresult result) {
  DICTIONARY_LOG(("DictionaryCacheEntry %s OnStopRequest", mURI.get()));
  if (NS_SUCCEEDED(result)) {
    mDictionaryDataComplete = true;
    DICTIONARY_LOG(("Unsuspending %zu channels, Dictionary len %zu",
                    mWaitingPrefetch.Length(), mDictionaryData.length()));
    // if we suspended, un-suspend the channel(s)
    for (auto& lambda : mWaitingPrefetch) {
      (lambda)();
    }
    mWaitingPrefetch.Clear();
  } else {
    // XXX
    // This is problematic - we requested with dcb/dcz, but can't actually
    // decode them. Probably we should re-request without dcb/dcz, and also nuke
    // the entry
    // XXX
  }

  // If we're being replaced by a new entry, swap now
  RefPtr<DictionaryCacheEntry> self;
  if (mReplacement) {
    DICTIONARY_LOG(("Replacing entry %p with %p for %s", this,
                    mReplacement.get(), mURI.get()));
    // Make sure we don't destroy ourselves
    self = this;
    mReplacement->mShouldSuspend = false;
    mOrigin->RemoveEntry(this);
    // When mReplacement gets all it's data, it will be added to mEntries
    mReplacement->UnblockAddEntry(mOrigin);
    mOrigin = nullptr;
  }

  mStopReceived = true;
  return NS_OK;
}

void DictionaryCacheEntry::UnblockAddEntry(DictionaryOrigin* aOrigin) {
  MOZ_ASSERT(NS_IsMainThread());
  if (!mHash.IsEmpty()) {
    // Already done, we can move to mEntries now
    aOrigin->FinishAddEntry(this);
  }
  mBlocked = false;
}

void DictionaryCacheEntry::WriteOnHash(DictionaryOrigin* aOrigin) {
  bool hasHash = false;
  {
    MOZ_ASSERT(NS_IsMainThread());
    if (!mHash.IsEmpty()) {
      hasHash = true;
    }
  }
  if (hasHash) {
    DICTIONARY_LOG(("Write already hashed"));
    aOrigin->Write(this);
  } else if (!mStopReceived) {
    // This creates a cycle, but we'll clear it when we get FinishFile
    mOrigin = aOrigin;
  }
}

//-----------------------------------------------------------------------------
// nsICacheEntryOpenCallback implementation
//-----------------------------------------------------------------------------
// Note: we don't care if the entry is stale since we're not loading it; we're
// just saying with have this specific set of bits with this hash available
// to use as a dictionary.

NS_IMETHODIMP
DictionaryCacheEntry::OnCacheEntryCheck(nsICacheEntry* aEntry,
                                        uint32_t* result) {
  DICTIONARY_LOG(("OnCacheEntryCheck %s", mURI.get()));
  *result = nsICacheEntryOpenCallback::ENTRY_WANTED;
  return NS_OK;
}

NS_IMETHODIMP
DictionaryCacheEntry::OnCacheEntryAvailable(nsICacheEntry* entry, bool isNew,
                                            nsresult status) {
  DICTIONARY_LOG(("OnCacheEntryAvailable %s, result %u, entry %p", mURI.get(),
                  (uint32_t)status, entry));
  if (entry) {
    nsCOMPtr<nsIInputStream> stream;
    entry->OpenInputStream(0, getter_AddRefs(stream));
    if (!stream) {
      return NS_OK;
    }

    RefPtr<nsInputStreamPump> pump;
    nsresult rv = nsInputStreamPump::Create(getter_AddRefs(pump), stream);
    if (NS_FAILED(rv)) {
      return NS_OK;  // just ignore
    }

    rv = pump->AsyncRead(this);
    if (NS_FAILED(rv)) {
      return NS_OK;  // just ignore
    }
    DICTIONARY_LOG(("Waiting for data"));
  } else {
    // This shouldn't happen.... we should only be fetching something we know
    // is in the cache.
    // Presumably status is something like NS_ERROR_FILE_NOT_FOUND
    // XXX Error out any channels waiting on this cache entry.  Also,
    // remove the dictionary entry from the origin?
    DICTIONARY_LOG(("Prefetched cache entry not available!"));
  }

  return NS_OK;
}

//----------------------------------------------------------------------------------

class DictionaryOriginReader final : public nsICacheEntryOpenCallback,
                                     public nsIStreamListener {
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSICACHEENTRYOPENCALLBACK
  NS_DECL_NSIREQUESTOBSERVER
  NS_DECL_NSISTREAMLISTENER

  DictionaryOriginReader() {}

  // if aOrigin is nullptr, we're just reading; if it's set then we're adding
  // a Dictionary to a maybe-existing Origin
  void Start(DictionaryOrigin* aOrigin, nsACString& aKey, nsIURI* aURI,
             DictionaryCache* aCache,
             const std::function<nsresult(DictionaryCacheEntry*)>& aCallback) {
    mOrigin = aOrigin;
    mURI = aURI;
    mCallback = aCallback;
    mCache = aCache;
    mSelf = this;  // keep this alive until we call aCallback

    // The cache entry is for originattribute extension of
    // META_DICTIONARY_PREFIX, plus key of prepath

    DICTIONARY_LOG(("DictionaryOriginReader::Start(%s): %p",
                    PromiseFlatCString(aKey).get(), this));
    DictionaryCache::sCacheStorage->AsyncOpenURIString(
        aKey, META_DICTIONARY_PREFIX,
        aOrigin
            ? nsICacheStorage::OPEN_NORMALLY
            : nsICacheStorage::OPEN_READONLY | nsICacheStorage::OPEN_SECRETLY,
        this);
  }

 private:
  ~DictionaryOriginReader() {}

  RefPtr<DictionaryOrigin> mOrigin;
  nsCOMPtr<nsIURI> mURI;
  std::function<nsresult(DictionaryCacheEntry*)> mCallback;
  RefPtr<DictionaryCache> mCache;
  RefPtr<DictionaryOriginReader> mSelf;
};

NS_IMPL_ISUPPORTS(DictionaryOriginReader, nsICacheEntryOpenCallback,
                  nsIStreamListener)

//-----------------------------------------------------------------------------
// nsICacheEntryOpenCallback implementation
//-----------------------------------------------------------------------------

NS_IMETHODIMP DictionaryOriginReader::OnCacheEntryCheck(nsICacheEntry* entry,
                                                        uint32_t* result) {
  *result = nsICacheEntryOpenCallback::ENTRY_WANTED;
  DICTIONARY_LOG(
      ("DictionaryOriginReader::OnCacheEntryCheck this=%p for entry %p", this,
       entry));
  return NS_OK;
}

NS_IMETHODIMP DictionaryOriginReader::OnCacheEntryAvailable(
    nsICacheEntry* aCacheEntry, bool isNew, nsresult result) {
  MOZ_ASSERT(NS_IsMainThread(), "Got cache entry off main thread!");
  DICTIONARY_LOG(
      ("DictionaryOriginReader::OnCacheEntryAvailable this=%p for entry %p",
       this, aCacheEntry));

  if (!aCacheEntry) {
    // Didn't have any dictionaries for this origin
    (mCallback)(nullptr);
    return NS_OK;
  }

  // If we have an mOrigin, then it's already been created and inserted
  if (mOrigin) {
    mOrigin->SetCacheEntry(aCacheEntry);
    // There's no data in the cache entry, just metadata
    nsCOMPtr<nsICacheEntryMetaDataVisitor> metadata(mOrigin);
    aCacheEntry->VisitMetaData(metadata);

    // We only have mOrigin if we're creating it in AddEntry(), so no
    // need to Match()
    (mCallback)(nullptr);
    mSelf = nullptr;  // this will delete 'this'
    return NS_OK;
  }

  nsCString prepath;
  if (NS_FAILED(mURI->GetPrePath(prepath))) {
    (mCallback)(nullptr);
    return NS_ERROR_FAILURE;
  }
  // Add the Origin to the hash in DictionaryCache
  Unused << mCache->mDictionaryCache.WithEntryHandle(
      prepath, [&](auto&& entry) {
        auto& origin = entry.OrInsertWith(
            [&] { return new DictionaryOrigin(prepath, aCacheEntry); });

        // There's no data in the cache entry, just metadata
        nsCOMPtr<nsICacheEntryMetaDataVisitor> metadata(origin);
        aCacheEntry->VisitMetaData(metadata);

        nsCString path;
        mURI->GetPathQueryRef(path);
        RefPtr<DictionaryCacheEntry> result = origin->Match(path);

        (mCallback)(result);
        mSelf = nullptr;  // this will delete 'this'
        return NS_OK;
      });
  return NS_OK;
}

//-----------------------------------------------------------------------------
// nsIStreamListener implementation
//-----------------------------------------------------------------------------

NS_IMETHODIMP
DictionaryOriginReader::OnStartRequest(nsIRequest* request) {
  DICTIONARY_LOG(("DictionaryOriginReader %p OnStartRequest", this));
  return NS_OK;
}

NS_IMETHODIMP
DictionaryOriginReader::OnDataAvailable(nsIRequest* request,
                                        nsIInputStream* aInputStream,
                                        uint64_t aOffset, uint32_t aCount) {
  uint32_t n;
  DICTIONARY_LOG(
      ("DictionaryOriginReader %p OnDataAvailable %u", this, aCount));
  return NS_OK;
}

NS_IMETHODIMP
DictionaryOriginReader::OnStopRequest(nsIRequest* request, nsresult result) {
  DICTIONARY_LOG(("DictionaryOriginReader %p OnStopRequest", this));
  return NS_OK;
}

// static
already_AddRefed<DictionaryCache> DictionaryCache::GetInstance() {
  if (!gDictionaryCache) {
    gDictionaryCache = new DictionaryCache();
    MOZ_ASSERT(NS_SUCCEEDED(gDictionaryCache->Init()));
  }
  return do_AddRef(gDictionaryCache);
}

nsresult DictionaryCache::Init() {
  if (XRE_IsParentProcess()) {
    nsCOMPtr<nsICacheStorageService> cacheStorageService(
        components::CacheStorage::Service());
    if (!cacheStorageService) {
      return NS_ERROR_FAILURE;
    }
    nsresult rv = cacheStorageService->DiskCacheStorage(
        nullptr, getter_AddRefs(sCacheStorage));  // Don't need a load context
    if (NS_FAILED(rv)) {
      return rv;
    }
  }
  DICTIONARY_LOG(("Inited DictionaryCache %p", sCacheStorage.get()));
  return NS_OK;
}

nsresult DictionaryCache::AddEntry(nsIURI* aURI, const nsACString& aKey,
                                   const nsACString& aPattern,
                                   const nsACString& aId,
                                   const Maybe<nsCString>& aHash,
                                   bool aNewEntry,
                                   DictionaryCacheEntry** aDictEntry) {
  // Note that normally we're getting an entry in and until all the data
  // has been received, we can't use it.  The Hash being null is a flag
  // that it's not yet valid.
  RefPtr<DictionaryCacheEntry> dict =
      new DictionaryCacheEntry(aKey, aPattern, aId, aHash);
  dict = AddEntry(aURI, aNewEntry, dict);
  if (dict) {
    *aDictEntry = do_AddRef(dict).take();
    return NS_OK;
  }
  DICTIONARY_LOG(
      ("Failed adding entry for %s", PromiseFlatCString(aKey).get()));
  *aDictEntry = nullptr;
  return NS_ERROR_FAILURE;
}

already_AddRefed<DictionaryCacheEntry> DictionaryCache::AddEntry(
    nsIURI* aURI, bool aNewEntry, DictionaryCacheEntry* aDictEntry) {
  // Note that normally we're getting an entry in and until all the data
  // has been received, we can't use it.  The Hash being null is a flag
  // that it's not yet valid.
  nsCString prepath;
  if (NS_FAILED(aURI->GetPrePath(prepath))) {
    return nullptr;
  }
  // create for the origin if it doesn't exist
  RefPtr<DictionaryCacheEntry> newEntry;
  Unused << mDictionaryCache.WithEntryHandle(prepath, [&](auto&& entry) {
    auto& origin = entry.OrInsertWith([&] {
      RefPtr<DictionaryOrigin> origin = new DictionaryOrigin(prepath, nullptr);
      // Create a cache entry for this if it doesn't exist.  Note
      // that the entry we're adding will need to be saved later once
      // we have the entry

      // Open (and parse metadata) or create
      RefPtr<DictionaryOriginReader> reader = new DictionaryOriginReader();
      reader->Start(
          origin, prepath, aURI, this,
          [origin, aDictEntry](
              DictionaryCacheEntry*
                  aDict) {  // XXX avoid so many lambdas which cause allocations
            // Write the dirty entry we couldn't write before once
            // we get the hash
            aDictEntry->WriteOnHash(origin);
            return NS_OK;
          });
      return origin;
    });

    newEntry = origin->AddEntry(aDictEntry, aNewEntry);
    return NS_OK;
  });
  return newEntry.forget();
}

nsresult DictionaryCache::RemoveEntry(nsIURI* aURI, const nsACString& aKey) {
  nsCString prepath;
  if (NS_FAILED(aURI->GetPrePath(prepath))) {
    return NS_ERROR_FAILURE;
  }
  if (auto origin = mDictionaryCache.Lookup(prepath)) {
    return origin.Data()->RemoveEntry(aKey);
  }
  return NS_ERROR_FAILURE;
}

void DictionaryCache::Clear() {
  // There may be active Prefetch()es running, note, and active
  // fetches using dictionaries.  They will stay alive until the
  // channels using them go away.
  mDictionaryCache.Clear();
}

// Remove a dictionary if it exists for the key given
void DictionaryCache::RemoveDictionaryFor(const nsACString& aKey) {
  RefPtr<MozURL> url;
  nsresult rv = MozURL::Init(getter_AddRefs(url), aKey);
  if (NS_SUCCEEDED(rv)) {
    nsDependentCSubstring prepath = url->PrePath();

    if (auto origin = mDictionaryCache.Lookup(prepath)) {
      origin.Data()->RemoveEntry(aKey);
    }
  }
}

// Return an entry via a callback (async).
// If we don't have the origin in-memory, ask the cache for the origin, and
// when we get it, parse the metadata to build a DictionaryOrigin.
// Once we have a DictionaryOrigin (in-memory or parsed), scan it for matches.
// If it's not in the cache, return nullptr via callback.
void DictionaryCache::GetDictionaryFor(
    nsIURI* aURI,
    const std::function<nsresult(DictionaryCacheEntry*)>& aCallback) {
  // Note: IETF 2.2.3 Multiple Matching Directories
  // We need to return match-dest matches first
  // If no match-dest, then the longest match
  nsCString prepath;
  if (NS_FAILED(aURI->GetPrePath(prepath))) {
    (aCallback)(nullptr);
    return;
  }
  if (auto origin = mDictionaryCache.Lookup(prepath)) {
    // Find the longest match
    nsCString path;
    RefPtr<DictionaryCacheEntry> result;

    aURI->GetPathQueryRef(path);
    DICTIONARY_LOG(("GetDictionaryFor(%s %s)", prepath.get(), path.get()));

    result = origin.Data()->Match(path);
    (aCallback)(result);
    return;
  }
  // We don't have an entry at all.  We need to check if there's an
  // entry on disk for <origin>, unless we know we have all entries
  // in the memory cache.

  // Handle unknown origins by checking the disk cache
  if (!sCacheStorage) {
    (aCallback)(nullptr);  // in case we have no disk storage
    return;
  }

  // To keep track of the callback, we need a new object to get the
  // OnCacheEntryAvailable can resolve the callback.  It will keep a reference
  // to itself until it call aCallback after the cache read has resolved
  DICTIONARY_LOG(
      ("Reading %s for dictionary entries", PromiseFlatCString(prepath).get()));
  RefPtr<DictionaryOriginReader> reader = new DictionaryOriginReader();
  // After Start(), if we drop this ref reader will kill itself on
  // completion; it holds a self-ref
  reader->Start(nullptr, prepath, aURI, this, aCallback);
}
//-----------------------------------------------------------------------------
// DictionaryOrigin
//-----------------------------------------------------------------------------
NS_IMPL_ISUPPORTS(DictionaryOrigin, nsICacheEntryMetaDataVisitor)

void DictionaryOrigin::Write(DictionaryCacheEntry* aDictEntry) {
  DICTIONARY_LOG(("DictionaryOrigin::Write %s %p", mOrigin.get(), aDictEntry));
  aDictEntry->Write(mEntry);
}

already_AddRefed<DictionaryCacheEntry> DictionaryOrigin::AddEntry(
    DictionaryCacheEntry* aDictEntry, bool aNewEntry) {
  // Remove any entry for the same item
  for (size_t i = 0; i < mEntries.Length(); i++) {
    if (mEntries[i]->GetURI().Equals(aDictEntry->GetURI())) {
      DictionaryCacheEntry* oldEntry = mEntries[i];
      if (aNewEntry) {
        // We're overwriting an existing entry, perhaps with a new hash.  It
        // might be different, of course.
        // Until we receive and save the new data, we should use the old data.

        // We need to pause this channel, regardless of how it's encoded,
        // until the entry we're replacing has either no users, or has data
        // read in from the cache.  Then we can un-Suspend and start
        // replacing the data in the cache itself.  If there are no current
        // users, and we start replacing the data, we need to remove the
        // old entry so no one tries to use the old data/hash for a new
        // request.

        // Note that when we start replacing data in the cache we need to
        // also remove it from the origin's entry in the cache, in case we
        // exit or crash before we finish replacing the entry and updating
        // the origin's entry with the new hash.

        // Once we've replaced the entry (which will be after we have
        // hash), new requests will use the new data/hash.  I.e. we'll
        // still allow new requests to use the old cache data/hash until
        // the swap occurs.  Once the swap happens, the channels using the
        // old data/hash will still have an mDictDecoding reference to the
        // DictionaryCacheEntry for the old data/hash.

        // XXX possible edge case: if a second request to replace the
        // entry appears. Is this possible, or would the second request
        // for the same URI get subsumed into the older one still in
        // process? I'm guessing it doesn't, so we may need to deal with this

        DICTIONARY_LOG((
            "Replacing dictionary %p for %s: new will be %p", mEntries[i].get(),
            PromiseFlatCString(oldEntry->GetURI()).get(), oldEntry));
        // May be overkill to check HasHash here
        if (mEntries[i]->IsReading() && !aDictEntry->HasHash()) {
          DICTIONARY_LOG(("Old entry is reading data"));
          // If the old entry doesn't already have the data from the
          // dictionary, we'll need to Suspend this channel, and do a
          // replace later.  Remember this new entry so when the current
          // entry has it's data in memory we can un-Suspend the new
          // channel/entry.  When the new entry finishes saving, it will
          // use the mReplacement link to come back and insert itself
          // into mEntries and drop the old entry.  Use an origin link
          // for that since the old entry could in theory get purged and
          // removed from the origin before we finish.
          mEntries[i]->SetReplacement(aDictEntry, this);
          // SetReplacement will also set aDictEntry->mShouldSuspend
          return do_AddRef(aDictEntry);
        } else {
          DICTIONARY_LOG(("Removing old entry, no users or already read data"));
          // We can just replace, there are no users active for the old data.
          // This stops new requests from trying to use the old data we're in
          // the process of replacing Remove the entry from the Origin and
          // Write().
          mEntries[i]->RemoveEntry(mEntry);
          mEntries.RemoveElementAt(i);
        }
      } else {
        // We're updating an existing entry (on a 304 Not Modified).   Assume
        // the values may have changed (though likely they haven't).  Check Spec
        // XXX
        DICTIONARY_LOG(
            ("Updating dictionary for %s (%p)", mOrigin.get(), oldEntry));
        oldEntry->CopyFrom(aDictEntry);
        // write the entry back if something changed
        // XXX Check if something changed
        oldEntry->Write(mEntry);

        // We don't need to reference the entry
        return nullptr;
      }
      break;
    }
  }

  DICTIONARY_LOG(("New dictionary %sfor %s: %p",
                  aDictEntry->HasHash() ? "" : "(pending) ", mOrigin.get(),
                  aDictEntry));
  if (aDictEntry->HasHash()) {
    mEntries.AppendElement(aDictEntry);
  } else {
    // Still need to receive the data.  When we have the hash, move to
    // mEntries (and Write) using entry->mOrigin
    mPendingEntries.AppendElement(aDictEntry);
    aDictEntry->SetReplacement(nullptr, this);
  }

  // DictionaryCache/caller is responsible for ensure this gets written if
  // needed
  return do_AddRef(aDictEntry);
}

nsresult DictionaryOrigin::RemoveEntry(const nsACString& aKey) {
  for (const auto& dict : mEntries) {
    if (dict->GetURI().Equals(aKey)) {
      mEntries.RemoveElement(dict);
      dict->RemoveEntry(mEntry);
      return NS_OK;
    }
  }
  return NS_ERROR_FAILURE;
}

void DictionaryOrigin::FinishAddEntry(DictionaryCacheEntry* aEntry) {
  // if aDictEntry is in mPendingEntries, move to mEntries
  if (mPendingEntries.RemoveElement(aEntry)) {
    // We need to give priority to elements fetched most recently if they
    // have an equivalent match length (and dest)
    mEntries.InsertElementAt(0, aEntry);
  }
}

void DictionaryOrigin::RemoveEntry(DictionaryCacheEntry* aEntry) {
  mEntries.RemoveElement(aEntry);
}

// caller will throw this into a RefPtr
DictionaryCacheEntry* DictionaryOrigin::Match(const nsACString& aPath) {
  uint32_t longest = 0;
  DictionaryCacheEntry* result = nullptr;

  for (const auto& dict : mEntries) {
    if (dict->Match(aPath, longest)) {
      result = dict;
    }
  }
  // XXX if we want to LRU the origins so we can push them out of memory based
  // on LRU, do something like this:
  /*
  if (result) {
    removeFrom(dictionarycase->mDictionaryCacheLRU);
    dictionarycase->mDictionaryCacheLRU.insertFront(this);
  }
  */
  return result;
}

//-----------------------------------------------------------------------------
// DictionaryOrigin::nsICacheEntryMetaDataVisitor
//-----------------------------------------------------------------------------
nsresult DictionaryOrigin::OnMetaDataElement(const char* asciiKey,
                                             const char* asciiValue) {
  DICTIONARY_LOG(("DictionaryOrigin::OnMetaDataElement %s %s",
                  asciiKey ? asciiKey : "", asciiValue));

  RefPtr<DictionaryCacheEntry> entry = new DictionaryCacheEntry(asciiKey);
  if (entry->ParseMetadata(asciiValue)) {
    // XXX Check for duplicates?
    mEntries.AppendElement(entry);
  }
  return NS_OK;
}

// Overall structure:
// Dictionary:
//     DictionaryCache:
//        OriginHashmap:
//           LinkedList: DictionaryCacheEntry
//              Data from cache (sometimes)
//
// Each origin is in the cache as a dictionary-origin entry.  In that
// entry's metadata, we have an LRU-sorted list of dictionary entries to be able
// to build a DictionaryCacheEntry.
// When we offer a dictionary on a load, we'll start prefetching the data into
// the DictionaryCacheEntry for the item in the cache. When the response comes
// in, we'll either use it to decompress, or indicate we no longer care about
// the data. If no one cares about the data, we'll purge it from memory.
//    Hold refs to the data in requests.  When the only ref is in the
//    DictionaryCacheEntry, purge the data. This could also be done via the
//    InUse counter
//
// XXX be careful about thrashing the cache loading and purging, esp with RCWN.
// Note that this makes RCWN somewhat superfluous for loads that have a
// dictionary.
// XXX Perhaps allow a little dwell time in ram if not too large?

// When a load comes in, we need to block decompressing it on having the data
// from the cache if it's dcb or dcz.
// XXX If the cache fails for some reason, we probably should consider
// re-fetching the data without Dictionary-Available.

}  // namespace net
}  // namespace mozilla
