/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_ContentClassifierService_h
#define mozilla_ContentClassifierService_h

#include <cstdint>
#include "mozilla/Maybe.h"
#include "mozilla/Mutex.h"
#include "mozilla/Span.h"
#include "mozilla/StaticPtr.h"
#include "mozilla/RefPtr.h"
#include "mozilla/ThreadSafety.h"
#include "mozilla/net/ChannelClassifierUtils.h"
#include "nsIAsyncShutdown.h"
#include "nsIChannel.h"
#include "nsIClassifiedChannel.h"
#include "nsIContentClassifierService.h"
#include "nsIContentClassifierRemoteSettingsClient.h"
#include "nsISupportsImpl.h"
#include "nsLiteralString.h"
#include "nsTArray.h"
#include "nsTHashMap.h"

#include "mozilla/ContentClassifierEngine.h"

namespace mozilla {

enum class ClassifyMode { Annotate, Cancel };

struct ContentClassifierFeature {
  // Feature identifier used by prefs and lookups.
  nsLiteralCString mName;

  // RemoteSettings record names whose attachments are merged into a
  // single ContentClassifierEngine for this feature.
  Span<const nsLiteralCString> mListIds;

  // nsIClassifiedChannel::ClassificationFlags value set on the channel
  // on an annotation match (consumed via UrlClassifierCommon::Annotate-
  // Channel -> SetClassificationFlagsHelper).
  nsIClassifiedChannel::ClassificationFlags mClassificationFlag;

  // nsIWebProgressListener::STATE_LOADED_* value logged in the content
  // blocking log on an annotation match. The corresponding STATE_BLOCKED_*
  // value for a cancellation match is derived from mBlockingErrorCode by
  // UrlClassifierCommon::SetBlockedContent. Set to 0 for features that
  // only annotate the channel and never emit a content blocking log
  // entry (mirrors UrlClassifierCommon::AnnotateChannelWithoutNotifying
  // behavior).
  uint32_t mLoadedState;

  // nsIWebProgressListener::STATE_REPLACED_* value logged in the content
  // blocking log on a blocking match that ends up replaced.
  uint32_t mReplacedState;

  // nsIWebProgressListener::STATE_ALLOWED_* value logged in the content
  // blocking log on a blocking match that ends up allowed.
  uint32_t mAllowedState;

  // NS_ERROR_*_URI value passed to UrlClassifierCommon::SetBlockedContent
  // on a cancellation match. SetBlockedContent uses this to set both the
  // load-info blocking reason and (via GetClassifierBlockingEventCode)
  // the STATE_BLOCKED_* content blocking log entry. Set to NS_OK for
  // features that have no blocking variant in url-classifier; consumers
  // must check this before attempting to use the feature in blocking
  // mode.
  nsresult mBlockingErrorCode;
};

enum class InitPhase {
  NotInited,
  InitSucceeded,
  InitFailed,
  ShutdownStarted,
  ShutdownEnded
};

// Aggregated status across all engines consulted for a single
// classification. Ordering is significant: higher values supersede
// lower ones in ContentClassifierResult::Accumulate, so any Exception
// promotes the aggregate over a Hit, and an Important variant pins the
// status against later non-Important results.
enum class ContentClassifierResultStatus : uint8_t {
  Miss = 0,
  Hit = 1,
  Exception = 2,
  ImportantHit = 3,
  ImportantException = 4,
};

// Aggregated outcome across the engines consulted for one classification.
// Records every engine result that contributed (a match or an exception),
// so the caller can attribute the channel-side annotation / block to the
// right feature definitions.
class ContentClassifierResult {
 public:
  using Status = ContentClassifierResultStatus;

  ContentClassifierResult() = default;

  ContentClassifierResult(ContentClassifierResult&&) = default;
  ContentClassifierResult& operator=(ContentClassifierResult&&) = default;
  ContentClassifierResult(const ContentClassifierResult&) = delete;
  ContentClassifierResult& operator=(const ContentClassifierResult&) = delete;

  Status GetStatus() const { return mStatus; }

  bool Hit() const {
    return mStatus == Status::Hit || mStatus == Status::ImportantHit;
  }
  bool Exception() const {
    return mStatus == Status::Exception ||
           mStatus == Status::ImportantException;
  }
  bool Important() const {
    return mStatus == Status::ImportantHit ||
           mStatus == Status::ImportantException;
  }

  const nsTArray<ContentClassifierEngineResult>& EngineResults() const {
    return mEngineResults;
  }

  void Accumulate(ContentClassifierEngineResult aEngineResult);

 private:
  Status mStatus = Status::Miss;
  nsTArray<ContentClassifierEngineResult> mEngineResults;
};

class ContentClassifierService final : public nsIAsyncShutdownBlocker,
                                       public nsIContentClassifierService {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIASYNCSHUTDOWNBLOCKER
  NS_DECL_NSICONTENTCLASSIFIERSERVICE

  static already_AddRefed<ContentClassifierService> GetInstance();

  static bool IsEnabled();
  static bool IsInitialized();

  // Returns the static table of content classifier features. The table
  // is the single source of truth for how filter list IDs are grouped
  // into engines and how matches are reported.
  static Span<const ContentClassifierFeature> GetFeatures();

  // Returns the feature with the given name, or Nothing() if no such
  // feature exists in the static table.
  static Maybe<const ContentClassifierFeature&> GetFeatureByName(
      const nsACString& aName);

  ContentClassifierResult ClassifyForCancel(
      const ContentClassifierRequest& aRequest);
  ContentClassifierResult ClassifyForAnnotate(
      const ContentClassifierRequest& aRequest);

  [[nodiscard]] net::ChannelBlockDecision MaybeCancelChannel(
      nsIChannel* aChannel, const ContentClassifierResult& aResult);
  void MaybeAnnotateChannel(nsIChannel* aChannel,
                            const ContentClassifierResult& aResult);

 private:
  ContentClassifierService();
  ~ContentClassifierService();

  void Init();
  static void OnPrefChange(const char* aPref, void* aData);
  void LoadFilterLists();
  void RebuildEnginesFromStoredData();
  void InitRSClient();
  void ShutdownRSClient();
  void RemoveBlocker();
  already_AddRefed<nsIAsyncShutdownClient> GetAsyncShutdownBarrier() const;

  ContentClassifierResult ClassifyWithEngines(
      const nsTArray<RefPtr<ContentClassifierEngine>>& aEngines,
      const ContentClassifierRequest& aRequest);

  // Feature names referenced by any of the new "engines" prefs. Used at
  // engine-rebuild time to decide which feature engines to construct in
  // mEngines. Reads prefs; main thread only.
  static nsTArray<nsCString> ActiveFeatureNames();

  // Repopulate the four per-mode engine pointer arrays from the current
  // engines prefs and mEngines. Reads prefs; main thread only. Holds mLock.
  void RefreshActiveEngineLists() MOZ_REQUIRES(mLock);

  // Populate aOut with engines in mEngines named by the comma-separated
  // feature names in aPref. Unknown / unbuilt features are skipped
  // silently (they are already logged at engine-build time). Reads prefs;
  // main thread only. Holds mLock.
  void PopulateEngineListFromPref(
      const char* aPref, nsTArray<RefPtr<ContentClassifierEngine>>& aOut)
      MOZ_REQUIRES(mLock);

  static StaticRefPtr<ContentClassifierService> sInstance;
  static bool sEnabled;

  mozilla::Mutex mLock MOZ_UNANNOTATED;
  InitPhase mInitPhase MOZ_GUARDED_BY(mLock);

  // Feature-keyed engines built from the new engines/engines.pbmode prefs.
  // Each feature's engine is constructed once from the union of rules in
  // its mListIds.
  nsTHashMap<nsCStringHashKey, RefPtr<ContentClassifierEngine>> mEngines
      MOZ_GUARDED_BY(mLock);

  // Engines to consult at classify time, split by phase (Cancel/Annotate)
  // and PBM-ness. Refreshed alongside mEngines whenever the engines
  // selection changes.
  nsTArray<RefPtr<ContentClassifierEngine>> mCancelEngines
      MOZ_GUARDED_BY(mLock);
  nsTArray<RefPtr<ContentClassifierEngine>> mCancelEnginesPBM
      MOZ_GUARDED_BY(mLock);
  nsTArray<RefPtr<ContentClassifierEngine>> mAnnotateEngines
      MOZ_GUARDED_BY(mLock);
  nsTArray<RefPtr<ContentClassifierEngine>> mAnnotateEnginesPBM
      MOZ_GUARDED_BY(mLock);

  // Raw filter list data stored by list name. Populated by the RS client
  // for normal features, and by the HTTP test loader for the synthetic
  // "test_block" / "test_annotate" list IDs.
  nsTHashMap<nsCStringHashKey, nsTArray<uint8_t>> mFilterListData
      MOZ_GUARDED_BY(mLock);

  // RemoteSettings client for fetching filter lists. All reads and
  // writes must happen on the main thread; each call site asserts.
  nsCOMPtr<nsIContentClassifierRemoteSettingsClient> mRSClient;
};

}  // namespace mozilla

#endif  // mozilla_ContentClassifierService_h
