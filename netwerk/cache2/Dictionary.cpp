/* vim: set ts=2 sts=2 et sw=2: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <algorithm>

#include "Dictionary.h"

#include "nsAppDirectoryServiceDefs.h"
#include "nsICacheStorage.h"
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

static LazyLogModule gDictionaryLog("CompressionDictionaries");

#define DICTIONARY_LOG(args) \
  MOZ_LOG(gDictionaryLog, mozilla::LogLevel::Debug, args)

/**
 * Reference to the DictionaryCache singleton. May be null.
 */
StaticRefPtr<DictionaryCache> gDictionaryCache;

DictionaryCacheEntry::DictionaryCacheEntry(const nsACString& aURI,
                                           const nsACString& aPattern,
                                           const nsACString& aId,
                                           const Maybe<nsCString>& aHash)
    : mURI(aURI), mPattern(aPattern), mId(aId) {
  if (aHash) {
    mHash = aHash.value();
  }
}

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

void DictionaryCacheEntry::Prefetch() {
  // Start reading the cache entry into memory
  // XXX
}

// static
already_AddRefed<DictionaryCache> DictionaryCache::GetInstance() {
  if (!gDictionaryCache) {
    gDictionaryCache = new DictionaryCache();
    MOZ_ASSERT(NS_SUCCEEDED(gDictionaryCache->Init()));
  }
  return do_AddRef(gDictionaryCache);
}

nsresult DictionaryCache::Init() { return NS_OK; }

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
      if (dict->GetURI().Equals(aKey)) {
        // We're overwriting an existing entry.  It might be the same, of
        // course
        DICTIONARY_LOG(("Reusing dictionary for %s: %p",
                        PromiseFlatCString(dict->GetURI()).get(), dict));
        dict->Clear();
        *aDictEntry = do_AddRef(dict).take();
        return NS_OK;
      }
    }
    // New entry
    RefPtr<DictionaryCacheEntry> dict =
        new DictionaryCacheEntry(aKey, aPattern, aId, aHash);
    DICTIONARY_LOG(("New dictionary for %s: %p", PromiseFlatCString(aKey).get(),
                    dict.get()));
    list->insertFront(dict);
    *aDictEntry = do_AddRef(dict).take();
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
already_AddRefed<DictionaryCacheEntry> DictionaryCache::GetDictionaryFor(
    nsIURI* aURI) {
  // Note: IETF 2.2.3 Multiple Matching Directories
  // We need to return match-dest matches first
  // If no match-dest, then the longest match
  nsCString prepath;
  if (NS_FAILED(aURI->GetPrePath(prepath))) {
    return nullptr;
  }
  if (auto origin = mDictionaryCache.Lookup(prepath)) {
    // Find the longest match
    uint32_t longest = 0;
    nsCString path;
    RefPtr<DictionaryCacheEntry> result;

    aURI->GetPathQueryRef(path);

    for (const auto& dict : *(origin->get())) {
      if (dict->Valid() && dict->Match(path, longest)) {
        result = dict;
      }
    }
    if (result) {
      result->removeFrom(*(origin->get()));
      origin->get()->insertFront(result);
    }
    return result.forget();
  }
  // We don't have an entry at all.  We need to check if there's an
  // entry on disk for <origin>, unless we know we have all entries
  // in the memory cache.  For now, assume we have all entries, so a
  // miss means no dictionaries.

  // XXX handle unknown origins by checking the disk cache.  This means
  // the lookup will have to be async (or return that we need to look
  // it up in the caller
  // Maybe pass in a lambda for completion when we have the origin
  // If we know ALL origins with dictionaries in the cache and all dictionaries
  // for each origin (i.e. if this isn't a cache, but an in-memory index),
  // then this can be synchronous

  return nullptr;
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
