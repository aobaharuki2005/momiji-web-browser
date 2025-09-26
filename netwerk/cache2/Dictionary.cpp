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
#include "nsITimer.h"
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

#include "mozilla/net/NeckoCommon.h"
#include "mozilla/net/NeckoParent.h"

#include "LoadContextInfo.h"
#include "mozilla/ipc/URIUtils.h"
#include "SerializedLoadContext.h"
#include "mozilla/net/NeckoChild.h"

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
  MOZ_ASSERT(NS_IsMainThread());
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
    if (mDictionaryData.empty()) {
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
      DICTIONARY_LOG(
          ("Started Prefetch for %s", PromiseFlatCString(mURI).get()));
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

void DictionaryCacheEntry::AccumulateFile(const char* aBuf, int32_t aCount) {
  AccumulateHash(aBuf, aCount);  // error?
  Unused << mDictionaryData.append(aBuf, aCount);
  DICTIONARY_LOG(("Accumulate %p: %d bytes, total %zu", this, aCount,
                  mDictionaryData.length()));
}

void DictionaryCacheEntry::FinishFile() {
  MOZ_ASSERT(NS_IsMainThread());
  if (mCrypto) {
    DICTIONARY_LOG(("Hash was %s", mHash.get()));
    mCrypto->Finish(true, mHash);
    DICTIONARY_LOG(("Set dictionary hash for %p to %s", this, mHash.get()));
    mCrypto = nullptr;
  }
  mDictionaryDataComplete = true;
  DICTIONARY_LOG(("Unsuspending %zu channels, Dictionary len %zu",
                  mWaitingPrefetch.Length(), mDictionaryData.length()));
  // if we suspended, un-suspend the channel(s)
  for (auto& lambda : mWaitingPrefetch) {
    (lambda)();
  }
  mWaitingPrefetch.Clear();
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

  self->AccumulateFile(aFromSegment, aCount);
  *aWriteCount = aCount;
  return NS_OK;
}

NS_IMETHODIMP
DictionaryCacheEntry::OnStopRequest(nsIRequest* request, nsresult result) {
  DICTIONARY_LOG(("DictionaryCacheEntry %s OnStopRequest", mURI.get()));
  if (NS_SUCCEEDED(result)) {
    FinishFile();
  } else {
    // XXX
    // This is problematic - we requested with dcb/dcz, but can't actually
    // decode them. Probably we should re-request without dcb/dcz, and also nuke
    // the entry
    // XXX
  }
  return NS_OK;
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
  DICTIONARY_LOG(("OnCacheEntryAvailable %s, result %u",
                  PromiseFlatCString(mURI).get(), (uint32_t)status));
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
  }

  return NS_OK;
}

//----------------------------------------------------------------------------------

class DictionaryOriginReader final : public nsICacheEntryOpenCallback {
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSICACHEENTRYOPENCALLBACK

  DictionaryOriginReader() {}

  // Note: don't do this in constructor, since we may call mCallback and
  // the release the self-reference
  void Init(nsACString& aURI,
            const std::function<nsresult(DictionaryCacheEntry*)>& aCallback) {
    mCallback = aCallback;
    mSelf = this;  // keep this alive until we call aCallback
    DictionaryCache::sCacheStorage->AsyncOpenURIString(
        aURI, ""_ns, nsICacheStorage::OPEN_READONLY, this);
  }

 private:
  ~DictionaryOriginReader() {}

  std::function<nsresult(DictionaryCacheEntry*)> mCallback;
  RefPtr<DictionaryOriginReader> mSelf;
};

NS_IMPL_ISUPPORTS(DictionaryOriginReader, nsICacheEntryOpenCallback)

NS_IMETHODIMP DictionaryOriginReader::OnCacheEntryCheck(nsICacheEntry* entry,
                                                        uint32_t* result) {
  *result = nsICacheEntryOpenCallback::ENTRY_WANTED;
  DICTIONARY_LOG(
      ("DictionaryOriginReader::OnCacheEntryCheck this=%p for entry %p", this,
       entry));
  return NS_OK;
}

NS_IMETHODIMP DictionaryOriginReader::OnCacheEntryAvailable(
    nsICacheEntry* entry, bool isNew, nsresult result) {
  MOZ_ASSERT(NS_IsMainThread(), "Got cache entry off main thread!");
  DICTIONARY_LOG(
      ("Dictionary::OnCacheEntryAvailable this=%p for entry %p", this, entry));
  // XXX

  (mCallback)(nullptr);
  mSelf = nullptr;  // this will delete 'this'
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
  DICTIONARY_LOG(("Inited DictionaryCache %p", sCacheStorage.get()));
  return NS_OK;
}

nsresult DictionaryCache::AddEntry(nsIURI* aURI, const nsACString& aKey,
                                   const nsACString& aPattern,
                                   const nsACString& aId,
                                   const Maybe<nsCString>& aHash,
                                   DictionaryCacheEntry** aDictEntry) {
  // Note that normally we're getting an entry in and until all the data
  // has been received, we can't use it.  The Hash being null is a flag
  // that it's not yet valid.
  nsCString hostport;
  if (NS_FAILED(aURI->GetHostPort(hostport))) {
    return NS_ERROR_FAILURE;
  }
  // create for the origin if it doesn't exist
  Unused << mDictionaryCache.WithEntryHandle(hostport, [&](auto&& entry) {
    auto& list = entry.OrInsertWith([&] { return new DictCacheList; });

    for (const auto& dict : *list) {
      // We replace on the URI being the same (not id, which is just an
      // arbitrary extra id sent back to the server)
      if (dict->GetURI().Equals(aKey)) {
        // We're overwriting an existing entry, probably with a new hash.  It
        // might be the same, of course.
        // If there are outstanding requests using this entry, we need
        // to keep it alive for the users until they're done, but not use
        // it for any new requests.  Remove the existing entry from the list
        // and replace with a new one; existing requests will have a ref to it.
        DICTIONARY_LOG(("Replacing dictionary for %s: %p",
                        PromiseFlatCString(dict->GetURI()).get(), dict));
        dict->remove();
        break;
      }
    }
    // New entry
    RefPtr<DictionaryCacheEntry> dict =
        new DictionaryCacheEntry(aKey, aPattern, aId, aHash);
    DICTIONARY_LOG(("New dictionary for %s: %p", PromiseFlatCString(aKey).get(),
                    dict.get()));
    list->insertFront(dict);
    *aDictEntry = do_AddRef(dict).take();

    // Queue event to flush dictionary metadata to the cache
    // XXX
    return NS_OK;
  });
  return NS_OK;
}

nsresult DictionaryCache::AddEntry(nsIURI* aURI,
                                   DictionaryCacheEntry* aDictEntry) {
  // Note that normally we're getting an entry in and until all the data
  // has been received, we can't use it.  The Hash being null is a flag
  // that it's not yet valid.
  nsCString prepath;
  if (NS_FAILED(aURI->GetPrePath(prepath))) {
    return NS_ERROR_FAILURE;
  }
  // create for the origin if it doesn't exist
  Unused << mDictionaryCache.WithEntryHandle(prepath, [&](auto&& entry) {
    auto& list = entry.OrInsertWith([&] { return new DictCacheList; });

    // Remove any entry for the same item
    for (const auto& dict : *list) {
      if (dict->GetURI().Equals(aDictEntry->GetURI())) {
        // We're overwriting an existing entry.  It might be the same, of
        // course
        dict->remove();
        return NS_OK;
      }
    }

    list->insertFront(aDictEntry);
    return NS_OK;
  });
  return NS_OK;
}

nsresult DictionaryCache::RemoveEntry(nsIURI* aURI, const nsACString& aKey) {
  nsCString prepath;
  if (NS_FAILED(aURI->GetPrePath(prepath))) {
    return NS_ERROR_FAILURE;
  }
  if (auto origin = mDictionaryCache.Lookup(prepath)) {
    for (const auto& dict : *(origin->get())) {
      if (dict->GetURI().Equals(aKey)) {
        dict->remove();
        return NS_OK;
      }
    }
    return NS_ERROR_FAILURE;
  }
  return NS_ERROR_FAILURE;
}

// return an entry
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
    uint32_t longest = 0;
    nsCString path;
    RefPtr<DictionaryCacheEntry> result;

    aURI->GetPathQueryRef(path);

    for (const auto& dict : *(origin->get())) {
      if (dict->Match(path, longest)) {
        result = dict;
      }
    }
    if (result) {
      result->removeFrom(*(origin->get()));
      origin->get()->insertFront(result);
    }
    (aCallback)(result);
    return;
  }
  // We don't have an entry at all.  We need to check if there's an
  // entry on disk for <origin>, unless we know we have all entries
  // in the memory cache.

  // Handle unknown origins by checking the disk cache
  if (!sCacheStorage) {  // in case we have no disk storage
    return;
  }

  // To keep track of the callback, we need a new object to get the
  // OnCacheEntryAvailable can resolve the callback.  It will keep a reference
  // to itself until it call aCallback after the cache read has resolved
  nsCString key("dict:"_ns + prepath);
  RefPtr<DictionaryOriginReader> reader = new DictionaryOriginReader();
  reader->Init(key, aCallback);
}

static void MakeMetadataEntry() {
  // XXX
}

bool DictionaryCache::ParseMetaDataEntry(const char* key, const char* value,
                                         nsCString& uri, uint32_t& hitCount,
                                         uint32_t& lastHit, uint32_t& flags) {
  MOZ_ASSERT(NS_IsMainThread());

  DICTIONARY_LOG(("Dictionary::ParseMetaDataEntry key=%s value=%s",
                  key ? key : "", value));

  const char* comma = strchr(value, ',');
  if (!comma) {
    DICTIONARY_LOG(("    could not find first comma"));
    return false;
  }

  uint32_t version = static_cast<uint32_t>(atoi(value));
  DICTIONARY_LOG(("    version -> %u", version));

  if (version != METADATA_DICTIONARY_VERSION) {
    DICTIONARY_LOG(("    metadata version mismatch %u != %u", version,
                    METADATA_DICTIONARY_VERSION));
    return false;
  }

  value = comma + 1;
  comma = strchr(value, ',');
  if (!comma) {
    DICTIONARY_LOG(("    could not find second comma"));
    return false;
  }

  hitCount = static_cast<uint32_t>(atoi(value));
  DICTIONARY_LOG(("    hitCount -> %u", hitCount));

  value = comma + 1;
  comma = strchr(value, ',');
  if (!comma) {
    DICTIONARY_LOG(("    could not find third comma"));
    return false;
  }

  lastHit = static_cast<uint32_t>(atoi(value));
  DICTIONARY_LOG(("    lastHit -> %u", lastHit));

  value = comma + 1;
  flags = static_cast<uint32_t>(atoi(value));
  DICTIONARY_LOG(("    flags -> %u", flags));

  if (key) {
    const char* uriStart = key + (sizeof(META_DICTIONARY_PREFIX) - 1);
    uri.AssignASCII(uriStart);
    DICTIONARY_LOG(("    uri -> %s", uriStart));
  } else {
    uri.Truncate();
  }

  return true;
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
