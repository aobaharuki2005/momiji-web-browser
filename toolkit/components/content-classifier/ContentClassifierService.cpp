/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ContentClassifierService.h"

#include "mozilla/Logging.h"
#include "mozilla/net/HttpBaseChannel.h"
#include "mozilla/net/ChannelClassifierUtils.h"
#include "MainThreadUtils.h"
#include "nsDebug.h"
#include "mozilla/ContentClassifierEngine.h"
#include "mozilla/ClearOnShutdown.h"
#include "mozilla/dom/Promise.h"
#include "mozilla/Preferences.h"
#include "mozilla/Services.h"
#include "mozilla/StaticPrefs_privacy.h"
#include "mozilla/Components.h"
#include "mozilla/MozPromise.h"
#include "mozilla/StaticPtr.h"
#include "nsIAsyncShutdown.h"
#include "nsIChannel.h"
#include "nsIClassifiedChannel.h"
#include "nsIStreamLoader.h"
#include "nsIURI.h"
#include "nsNetUtil.h"
#include "nsContentUtils.h"
#include "nsIWebProgressListener.h"

namespace mozilla {

static LazyLogModule gContentClassifierLog("ContentClassifier");

StaticRefPtr<ContentClassifierService> ContentClassifierService::sInstance;
bool ContentClassifierService::sEnabled = false;

namespace {

constexpr nsLiteralCString kTrackersListIds[] = {"disconnect-tracker-base"_ns};
constexpr nsLiteralCString kTrackersContentListIds[] = {
    "disconnect-tracker-content"_ns};
constexpr nsLiteralCString kSocialTrackersListIds[] = {"mozilla-social"_ns};
constexpr nsLiteralCString kFingerprintersListIds[] = {
    "disconnect-fingerprinters-base"_ns};
constexpr nsLiteralCString kEmailTrackersListIds[] = {
    "disconnect-email-base"_ns};
constexpr nsLiteralCString kCryptominersListIds[] = {
    "disconnect-cryptominer-base"_ns};
constexpr nsLiteralCString kMajorExceptionListIds[] = {
    "mozilla-major-exceptions"_ns};
constexpr nsLiteralCString kMinorExceptionListIds[] = {
    "mozilla-minor-exceptions"_ns};
constexpr nsLiteralCString kTestBlockListIds[] = {"test_block"_ns};
constexpr nsLiteralCString kTestAnnotateListIds[] = {"test_annotate"_ns};

constexpr ContentClassifierFeature kFeatures[] = {
    {"trackers"_ns, Span<const nsLiteralCString>(kTrackersListIds),
     nsIClassifiedChannel::ClassificationFlags::CLASSIFIED_TRACKING,
     nsIWebProgressListener::STATE_LOADED_LEVEL_1_TRACKING_CONTENT,
     nsIWebProgressListener::STATE_REPLACED_TRACKING_CONTENT,
     nsIWebProgressListener::STATE_ALLOWED_TRACKING_CONTENT,
     NS_ERROR_TRACKING_URI},
    // The annotation variant adds content-track-digest256, which mirrors
    // url-classifier's promotion to STATE_LOADED_LEVEL_2_TRACKING_CONTENT
    // when a content-track-* table matches.
    {"trackers-content"_ns,
     Span<const nsLiteralCString>(kTrackersContentListIds),
     nsIClassifiedChannel::ClassificationFlags::CLASSIFIED_TRACKING,
     nsIWebProgressListener::STATE_LOADED_LEVEL_2_TRACKING_CONTENT,
     nsIWebProgressListener::STATE_REPLACED_TRACKING_CONTENT,
     nsIWebProgressListener::STATE_ALLOWED_TRACKING_CONTENT,
     NS_ERROR_TRACKING_URI},
    {"social-trackers"_ns, Span<const nsLiteralCString>(kSocialTrackersListIds),
     nsIClassifiedChannel::ClassificationFlags::CLASSIFIED_SOCIALTRACKING,
     nsIWebProgressListener::STATE_LOADED_SOCIALTRACKING_CONTENT,
     nsIWebProgressListener::STATE_REPLACED_TRACKING_CONTENT,
     nsIWebProgressListener::STATE_ALLOWED_TRACKING_CONTENT,
     NS_ERROR_SOCIALTRACKING_URI},
    {"fingerprinters"_ns, Span<const nsLiteralCString>(kFingerprintersListIds),
     nsIClassifiedChannel::ClassificationFlags::CLASSIFIED_FINGERPRINTING,
     nsIWebProgressListener::STATE_LOADED_FINGERPRINTING_CONTENT,
     nsIWebProgressListener::STATE_REPLACED_FINGERPRINTING_CONTENT,
     nsIWebProgressListener::STATE_ALLOWED_FINGERPRINTING_CONTENT,
     NS_ERROR_FINGERPRINTING_URI},
    {"email-trackers"_ns, Span<const nsLiteralCString>(kEmailTrackersListIds),
     nsIClassifiedChannel::ClassificationFlags::CLASSIFIED_EMAILTRACKING,
     nsIWebProgressListener::STATE_LOADED_EMAILTRACKING_LEVEL_1_CONTENT,
     nsIWebProgressListener::STATE_REPLACED_TRACKING_CONTENT,
     nsIWebProgressListener::STATE_ALLOWED_TRACKING_CONTENT,
     NS_ERROR_EMAILTRACKING_URI},
    {"cryptominers"_ns, Span<const nsLiteralCString>(kCryptominersListIds),
     nsIClassifiedChannel::ClassificationFlags::CLASSIFIED_CRYPTOMINING,
     nsIWebProgressListener::STATE_LOADED_CRYPTOMINING_CONTENT,
     nsIWebProgressListener::STATE_REPLACED_TRACKING_CONTENT,
     nsIWebProgressListener::STATE_ALLOWED_TRACKING_CONTENT,
     NS_ERROR_CRYPTOMINING_URI},
    {"minor-exceptions"_ns,
     Span<const nsLiteralCString>(kMinorExceptionListIds),
     nsIClassifiedChannel::ClassificationFlags::CLASSIFIED_TRACKING, 0, 0, 0,
     NS_OK},
    {"major-exceptions"_ns,
     Span<const nsLiteralCString>(kMajorExceptionListIds),
     nsIClassifiedChannel::ClassificationFlags::CLASSIFIED_TRACKING, 0, 0, 0,
     NS_OK},
    // Test-only features. Their list data is not fetched from
    // RemoteSettings; instead, the HTTP test loader (driven by the
    // *.test_list_urls prefs) writes the downloaded rule text into
    // mFilterListData under the synthetic list IDs "test_block" /
    // "test_annotate". They behave like any other feature once built.
    {"test_block"_ns, Span<const nsLiteralCString>(kTestBlockListIds),
     nsIClassifiedChannel::ClassificationFlags::CLASSIFIED_TRACKING,
     nsIWebProgressListener::STATE_LOADED_LEVEL_1_TRACKING_CONTENT,
     nsIWebProgressListener::STATE_REPLACED_TRACKING_CONTENT,
     nsIWebProgressListener::STATE_ALLOWED_TRACKING_CONTENT,
     NS_ERROR_TRACKING_URI},
    {"test_annotate"_ns, Span<const nsLiteralCString>(kTestAnnotateListIds),
     nsIClassifiedChannel::ClassificationFlags::CLASSIFIED_TRACKING,
     nsIWebProgressListener::STATE_LOADED_LEVEL_1_TRACKING_CONTENT,
     nsIWebProgressListener::STATE_REPLACED_TRACKING_CONTENT,
     nsIWebProgressListener::STATE_ALLOWED_TRACKING_CONTENT, NS_OK},
};

// Prefs that name feature engines built into mEngines.
constexpr const char* kFeatureEnginesPrefs[] = {
    "privacy.trackingprotection.content.protection.engines",
    "privacy.trackingprotection.content.protection.engines.pbmode",
    "privacy.trackingprotection.content.annotation.engines",
    "privacy.trackingprotection.content.annotation.engines.pbmode",
};

bool HasAnyConfiguredFeatures() {
  nsAutoCString value;
  for (const char* pref : kFeatureEnginesPrefs) {
    Preferences::GetCString(pref, value);
    if (!value.IsEmpty()) {
      return true;
    }
  }
  return false;
}

void AppendFeatureNamesFromPref(const char* aPref, nsTArray<nsCString>& aOut) {
  nsAutoCString value;
  Preferences::GetCString(aPref, value);
  for (const auto& part : value.Split(',')) {
    nsAutoCString name(part);
    name.Trim("\b\t\r\n ");
    if (!name.IsEmpty() && !aOut.Contains(name)) {
      aOut.AppendElement(name);
    }
  }
}

void NotifyListsLoadedForTesting() {
  if (!StaticPrefs::privacy_trackingprotection_content_testing()) {
    return;
  }
  nsCOMPtr<nsIObserverService> obs = services::GetObserverService();
  if (obs) {
    obs->NotifyObservers(
        nullptr, NS_CONTENT_CLASSIFIER_FILTER_LISTS_LOADED_TOPIC, nullptr);
  }
}

}  // namespace

NS_IMPL_ISUPPORTS(ContentClassifierService, nsIAsyncShutdownBlocker,
                  nsIContentClassifierService)

ContentClassifierService::ContentClassifierService()
    : mLock("ContentClassifierService::mLock"),
      mInitPhase(InitPhase::NotInited) {
  sEnabled =
      Preferences::GetBool(
          "privacy.trackingprotection.content.protection.enabled", false) ||
      Preferences::GetBool(
          "privacy.trackingprotection.content.annotation.enabled", false);
}

ContentClassifierService::~ContentClassifierService() = default;

// static
bool ContentClassifierService::IsEnabled() {
  if (!sInstance) {
    return false;
  }

  return sEnabled;
}

// static
Span<const ContentClassifierFeature> ContentClassifierService::GetFeatures() {
  return Span<const ContentClassifierFeature>(kFeatures);
}

// static
Maybe<const ContentClassifierFeature&>
ContentClassifierService::GetFeatureByName(const nsACString& aName) {
  for (const auto& feature : kFeatures) {
    if (feature.mName.Equals(aName)) {
      return SomeRef(feature);
    }
  }
  return Nothing();
}

// static
bool ContentClassifierService::IsInitialized() {
  if (!sInstance) {
    return false;
  }

  MutexAutoLock lock(sInstance->mLock);
  return sInstance->mInitPhase == InitPhase::InitSucceeded;
}

// static
void ContentClassifierService::OnPrefChange(const char* aPref, void*) {
  MOZ_ASSERT(NS_IsMainThread());
  // Access sInstance directly rather than GetInstance(), because
  // GetInstance() returns nullptr when the feature is disabled, but we
  // need to handle enable/disable transitions here.
  RefPtr<ContentClassifierService> service = sInstance;
  if (!service) {
    return;
  }

  if (!IsInitialized()) {
    return;
  }

  bool wasEnabled = sEnabled;
  sEnabled =
      Preferences::GetBool(
          "privacy.trackingprotection.content.protection.enabled", false) ||
      Preferences::GetBool(
          "privacy.trackingprotection.content.annotation.enabled", false);

  // mRSClient is main-thread only (see header); the NS_IsMainThread
  // assert at the top of this function covers this read and the
  // subsequent Init/Shutdown calls.
  const bool hasRSClient = !!service->mRSClient;

  if (!wasEnabled && sEnabled && !hasRSClient) {
    // Feature just became enabled. Start the RS client if list names are set.
    if (HasAnyConfiguredFeatures()) {
      service->InitRSClient();
    }
    return;
  }

  if (wasEnabled && !sEnabled) {
    // Feature just became disabled. Tear down the RS client and engines.
    service->ShutdownRSClient();
    return;
  }

  // Feature enabled state unchanged. Handle individual pref changes.
  const nsDependentCString prefStr(aPref);
  const bool isFeatureSelectionPref =
      prefStr.EqualsLiteral(
          "privacy.trackingprotection.content.protection.engines") ||
      prefStr.EqualsLiteral(
          "privacy.trackingprotection.content.protection.engines.pbmode") ||
      prefStr.EqualsLiteral(
          "privacy.trackingprotection.content.annotation.engines") ||
      prefStr.EqualsLiteral(
          "privacy.trackingprotection.content.annotation.engines.pbmode");

  if (isFeatureSelectionPref) {
    if (!sEnabled) {
      // The feature is disabled; nothing to rebuild or fetch. Enabling
      // will pick up the new pref.
      return;
    }
    // Active feature selection changed. Start RS client if needed, then
    // rebuild engines from already-stored data to reflect the new selection.
    if (!hasRSClient && HasAnyConfiguredFeatures()) {
      service->InitRSClient();
      // InitRSClient's async init will rebuild engines once data arrives.
      return;
    }
    {
      MutexAutoLock lock(service->mLock);
      service->RebuildEnginesFromStoredData();
    }
    NotifyListsLoadedForTesting();
    return;
  }

  const bool isTestListUrlsPref =
      prefStr.EqualsLiteral(
          "privacy.trackingprotection.content.protection.test_list_urls") ||
      prefStr.EqualsLiteral(
          "privacy.trackingprotection.content.annotation.test_list_urls");
  if (isTestListUrlsPref) {
    // Test list URLs changed. Reload via the HTTP test path.
    service->LoadFilterLists();
    return;
  }

  // An .enabled pref changed but the combined enabled state didn't flip
  // (e.g. one was already true). Nothing to do - engines are already
  // populated via whichever path is active.
}

void ContentClassifierService::Init() {
  MOZ_ASSERT(XRE_IsParentProcess());
  AssertIsOnMainThread();

  {
    MutexAutoLock lock(mLock);

    if (mInitPhase != InitPhase::NotInited) {
      return;
    }

    MOZ_LOG(gContentClassifierLog, LogLevel::Info,
            ("ContentClassifierService::Init - initializing"));

    nsCOMPtr<nsIAsyncShutdownClient> shutdownBarrier =
        GetAsyncShutdownBarrier();
    if (!shutdownBarrier) {
      mInitPhase = InitPhase::InitFailed;
      return;
    }

    bool closed;
    nsresult rv = shutdownBarrier->GetIsClosed(&closed);
    if (NS_FAILED(rv) || closed) {
      mInitPhase = InitPhase::InitFailed;
      return;
    }

    rv = shutdownBarrier->AddBlocker(
        this, NS_LITERAL_STRING_FROM_CSTRING(__FILE__), __LINE__, u""_ns);
    if (NS_FAILED(rv)) {
      mInitPhase = InitPhase::InitFailed;
      return;
    }

    rv = Preferences::RegisterCallback(
        &ContentClassifierService::OnPrefChange,
        "privacy.trackingprotection.content.protection.enabled"_ns);
    if (NS_FAILED(rv)) {
      mInitPhase = InitPhase::InitFailed;
      return;
    }

    rv = Preferences::RegisterCallback(
        &ContentClassifierService::OnPrefChange,
        "privacy.trackingprotection.content.annotation.enabled"_ns);
    if (NS_FAILED(rv)) {
      mInitPhase = InitPhase::InitFailed;
      return;
    }
    rv = Preferences::RegisterCallback(
        &ContentClassifierService::OnPrefChange,
        "privacy.trackingprotection.content.protection.test_list_urls"_ns);
    if (NS_FAILED(rv)) {
      mInitPhase = InitPhase::InitFailed;
      return;
    }

    rv = Preferences::RegisterCallback(
        &ContentClassifierService::OnPrefChange,
        "privacy.trackingprotection.content.annotation.test_list_urls"_ns);
    if (NS_FAILED(rv)) {
      mInitPhase = InitPhase::InitFailed;
      return;
    }

    rv = Preferences::RegisterCallback(
        &ContentClassifierService::OnPrefChange,
        "privacy.trackingprotection.content.protection.engines"_ns);
    if (NS_FAILED(rv)) {
      mInitPhase = InitPhase::InitFailed;
      return;
    }

    rv = Preferences::RegisterCallback(
        &ContentClassifierService::OnPrefChange,
        "privacy.trackingprotection.content.annotation.engines"_ns);
    if (NS_FAILED(rv)) {
      mInitPhase = InitPhase::InitFailed;
      return;
    }

    rv = Preferences::RegisterCallback(
        &ContentClassifierService::OnPrefChange,
        "privacy.trackingprotection.content.protection.engines.pbmode"_ns);
    if (NS_FAILED(rv)) {
      mInitPhase = InitPhase::InitFailed;
      return;
    }

    rv = Preferences::RegisterCallback(
        &ContentClassifierService::OnPrefChange,
        "privacy.trackingprotection.content.annotation.engines.pbmode"_ns);
    if (NS_FAILED(rv)) {
      mInitPhase = InitPhase::InitFailed;
      return;
    }

    mInitPhase = InitPhase::InitSucceeded;
  }

  // Lock released; safe to call into JS.
  // Only initialize the RS client if list_names prefs are set,
  // to avoid interfering with the test-only HTTP loading path.
  if (sEnabled && HasAnyConfiguredFeatures()) {
    InitRSClient();
  }

  if (StaticPrefs::privacy_trackingprotection_content_testing()) {
    LoadFilterLists();
  }
}

void ContentClassifierService::InitRSClient() {
  MOZ_ASSERT(NS_IsMainThread());

  if (mRSClient) {
    return;
  }

  MOZ_LOG_FMT(gContentClassifierLog, LogLevel::Info,
              "InitRSClient - creating RS client");

  nsresult rv;
  mRSClient =
      do_GetService(NS_CONTENTCLASSIFIERREMOTESETTINGSCLIENT_CONTRACTID, &rv);
  if (NS_WARN_IF(NS_FAILED(rv))) {
    MOZ_LOG_FMT(gContentClassifierLog, LogLevel::Error,
                "InitRSClient - failed to get RS client service: {:#x}",
                static_cast<uint32_t>(rv));
    return;
  }

  // The returned Promise is ignored: C++ doesn't need to await the
  // initial import. Callers that do (such as tests) observe the
  // NS_CONTENT_CLASSIFIER_FILTER_LISTS_LOADED_TOPIC notification.
  RefPtr<dom::Promise> unused;
  rv = mRSClient->Init(this, getter_AddRefs(unused));
  if (NS_WARN_IF(NS_FAILED(rv))) {
    MOZ_LOG_FMT(gContentClassifierLog, LogLevel::Error,
                "InitRSClient - failed to init RS client: {:#x}",
                static_cast<uint32_t>(rv));
    mRSClient = nullptr;
    return;
  }
}

void ContentClassifierService::ShutdownRSClient() {
  MOZ_ASSERT(NS_IsMainThread());

  MOZ_LOG_FMT(gContentClassifierLog, LogLevel::Info, "ShutdownRSClient");

  if (mRSClient) {
    // Release mRSClient before reacquiring mLock. The JS Shutdown()
    // implementation does not call back into us, but drop the strong
    // reference first to be defensive.
    nsCOMPtr<nsIContentClassifierRemoteSettingsClient> client =
        std::move(mRSClient);
    client->Shutdown();
  }

  MutexAutoLock lock(mLock);
  mFilterListData.Clear();
  mEngines.Clear();
  mCancelEngines.Clear();
  mCancelEnginesPBM.Clear();
  mAnnotateEngines.Clear();
  mAnnotateEnginesPBM.Clear();
}

// static
already_AddRefed<ContentClassifierService>
ContentClassifierService::GetInstance() {
  if (!sInstance) {
    sInstance = new ContentClassifierService();
    ClearOnShutdown(&sInstance);
    sInstance->Init();
  }

  if (!IsInitialized() || !IsEnabled()) {
    return nullptr;
  }

  return do_AddRef(sInstance);
}

already_AddRefed<nsIAsyncShutdownClient>
ContentClassifierService::GetAsyncShutdownBarrier() const {
  nsCOMPtr<nsIAsyncShutdownService> svc = components::AsyncShutdown::Service();
  MOZ_RELEASE_ASSERT(svc);

  nsCOMPtr<nsIAsyncShutdownClient> client;
  nsresult rv = svc->GetProfileBeforeChange(getter_AddRefs(client));
  MOZ_RELEASE_ASSERT(NS_SUCCEEDED(rv));
  MOZ_RELEASE_ASSERT(client);

  return client.forget();
}

NS_IMETHODIMP ContentClassifierService::BlockShutdown(
    nsIAsyncShutdownClient* aClient) {
  MOZ_ASSERT(NS_IsMainThread());

  MOZ_LOG(gContentClassifierLog, LogLevel::Info,
          ("ContentClassifierService::BlockShutdown - shutting down"));

  // ShutdownRSClient clears the filter list data and engines. It also
  // tears down the RS client if one was created (the HTTP-only test
  // path leaves mRSClient null).
  ShutdownRSClient();

  MutexAutoLock lock(mLock);

  mInitPhase = InitPhase::ShutdownStarted;

  Preferences::UnregisterCallback(
      &ContentClassifierService::OnPrefChange,
      "privacy.trackingprotection.content.protection.enabled"_ns);
  Preferences::UnregisterCallback(
      &ContentClassifierService::OnPrefChange,
      "privacy.trackingprotection.content.annotation.enabled"_ns);
  Preferences::UnregisterCallback(
      &ContentClassifierService::OnPrefChange,
      "privacy.trackingprotection.content.protection.test_list_urls"_ns);
  Preferences::UnregisterCallback(
      &ContentClassifierService::OnPrefChange,
      "privacy.trackingprotection.content.annotation.test_list_urls"_ns);
  Preferences::UnregisterCallback(
      &ContentClassifierService::OnPrefChange,
      "privacy.trackingprotection.content.protection.engines"_ns);
  Preferences::UnregisterCallback(
      &ContentClassifierService::OnPrefChange,
      "privacy.trackingprotection.content.annotation.engines"_ns);
  Preferences::UnregisterCallback(
      &ContentClassifierService::OnPrefChange,
      "privacy.trackingprotection.content.protection.engines.pbmode"_ns);
  Preferences::UnregisterCallback(
      &ContentClassifierService::OnPrefChange,
      "privacy.trackingprotection.content.annotation.engines.pbmode"_ns);

  content_classifier_teardown_domain_resolver();

  RemoveBlocker();

  return NS_OK;
}

void ContentClassifierService::RemoveBlocker() {
  MOZ_ASSERT(NS_IsMainThread());
  mLock.AssertCurrentThreadOwns();
  nsCOMPtr<nsIAsyncShutdownClient> asc = GetAsyncShutdownBarrier();
  MOZ_ASSERT(asc);
  DebugOnly<nsresult> rv = asc->RemoveBlocker(this);
  MOZ_ASSERT(NS_SUCCEEDED(rv));
  mInitPhase = InitPhase::ShutdownEnded;
}

// Fold a single per-engine outcome into the aggregate. All matched engine
// results are appended so callers can attribute per-feature annotations,
// but the aggregate Status is promoted monotonically: a later
// non-Important Hit cannot demote an earlier Exception, and Important
// pins the status.
void ContentClassifierResult::Accumulate(
    ContentClassifierEngineResult aEngineResult) {
  Status engineStatus = Status::Miss;
  if (aEngineResult.Exception()) {
    engineStatus = aEngineResult.Important() ? Status::ImportantException
                                             : Status::Exception;
  } else if (aEngineResult.Matched()) {
    engineStatus =
        aEngineResult.Important() ? Status::ImportantHit : Status::Hit;
  }

  if (engineStatus > mStatus) {
    mStatus = engineStatus;
  }
  mEngineResults.AppendElement(std::move(aEngineResult));
}

ContentClassifierResult ContentClassifierService::ClassifyWithEngines(
    const nsTArray<RefPtr<ContentClassifierEngine>>& aEngines,
    const ContentClassifierRequest& aRequest) {
  MOZ_ASSERT(!NS_IsMainThread());
  mLock.AssertCurrentThreadOwns();
  ContentClassifierResult result;
  if (mInitPhase != InitPhase::InitSucceeded) {
    MOZ_LOG(gContentClassifierLog, LogLevel::Warning,
            ("ClassifyWithEngines - service not initialized; returning Miss"));
    return result;
  }
  if (!aRequest.Valid()) {
    MOZ_LOG(gContentClassifierLog, LogLevel::Warning,
            ("ClassifyWithEngines - invalid request; returning Miss"));
    return result;
  }
  for (const auto& engine : aEngines) {
    result.Accumulate(engine->CheckNetworkRequest(aRequest));
    if (result.GetStatus() ==
        ContentClassifierResult::Status::ImportantException) {
      break;
    }
  }
  return result;
}

NS_IMETHODIMP ContentClassifierService::GetName(nsAString& aName) {
  aName.AssignLiteral("ContentClassifierService: Shutting down");
  return NS_OK;
}

NS_IMETHODIMP ContentClassifierService::GetState(nsIPropertyBag** aState) {
  *aState = nullptr;
  return NS_OK;
}

ContentClassifierResult ContentClassifierService::ClassifyForAnnotate(
    const ContentClassifierRequest& aRequest) {
  MutexAutoLock lock(mLock);
  const nsTArray<RefPtr<ContentClassifierEngine>>& engines =
      aRequest.PrivateBrowsing() ? mAnnotateEnginesPBM : mAnnotateEngines;
  ContentClassifierResult result = ClassifyWithEngines(engines, aRequest);
  MOZ_LOG(gContentClassifierLog, LogLevel::Debug,
          ("ClassifyForAnnotate - url=%s hit=%d exception=%d",
           aRequest.Url().get(), result.Hit(), result.Exception()));
  return result;
}

ContentClassifierResult ContentClassifierService::ClassifyForCancel(
    const ContentClassifierRequest& aRequest) {
  MutexAutoLock lock(mLock);
  const nsTArray<RefPtr<ContentClassifierEngine>>& engines =
      aRequest.PrivateBrowsing() ? mCancelEnginesPBM : mCancelEngines;
  // Note: this processes all engines, even when we get an early block, out of
  // caution.
  ContentClassifierResult result = ClassifyWithEngines(engines, aRequest);
  MOZ_LOG(gContentClassifierLog, LogLevel::Debug,
          ("ClassifyForCancel - url=%s hit=%d exception=%d",
           aRequest.Url().get(), result.Hit(), result.Exception()));
  return result;
}

void ContentClassifierService::MaybeAnnotateChannel(
    nsIChannel* aChannel, const ContentClassifierResult& aResult) {
  NS_ENSURE_TRUE_VOID(aChannel);
  if (!aResult.Hit()) {
    return;
  }

  nsCOMPtr<nsIURI> uri;
  aChannel->GetURI(getter_AddRefs(uri));

  for (const auto& engineResult : aResult.EngineResults()) {
    if (!engineResult.Matched() || engineResult.Exception()) {
      continue;
    }
    const ContentClassifierFeature& feature = engineResult.Feature();
    if (feature.mLoadedState == 0) {
      continue;
    }
    if (uri) {
      MOZ_LOG_FMT(gContentClassifierLog, LogLevel::Debug,
                  "MaybeAnnotateChannel - url={} feature={}",
                  uri->GetSpecOrDefault(), feature.mName);
    }
    net::ChannelClassifierUtils::AnnotateChannel(
        aChannel, feature.mClassificationFlag, feature.mLoadedState);
  }
}

net::ChannelBlockDecision ContentClassifierService::MaybeCancelChannel(
    nsIChannel* aChannel, const ContentClassifierResult& aResult) {
  NS_ENSURE_TRUE(aChannel, net::ChannelBlockDecision::Allowed);
  if (!aResult.Hit()) {
    return net::ChannelBlockDecision::Allowed;
  }

  // Closest analogue to the URLClassifier's "first cancelling feature
  // wins" rule. Classification itself keeps evaluating all engines (so
  // exception rules can suppress a Hit), but at decision time we pick
  // the first matched feature whose definition carries a non-NS_OK
  // blocking error code. Iteration order is the order in
  // ClassifyWithEngines, which is the order of the engines pref.
  const ContentClassifierFeature* blockingFeature = nullptr;
  for (const auto& engineResult : aResult.EngineResults()) {
    if (!engineResult.Matched() || engineResult.Exception()) {
      continue;
    }
    const ContentClassifierFeature& feature = engineResult.Feature();
    if (feature.mBlockingErrorCode != NS_OK) {
      blockingFeature = &feature;
      break;
    }
  }
  if (!blockingFeature) {
    MOZ_LOG(gContentClassifierLog, LogLevel::Warning,
            ("MaybeCancelChannel - no matched feature carries a blocking error "
             "code; nothing to cancel"));
    return net::ChannelBlockDecision::Allowed;
  }

  nsCOMPtr<nsIURI> uri;
  aChannel->GetURI(getter_AddRefs(uri));
  if (uri) {
    MOZ_LOG(gContentClassifierLog, LogLevel::Debug,
            ("MaybeCancelChannel - url=%s", uri->GetSpecOrDefault().get()));
  }

  if (net::ChannelClassifierUtils::IsAllowListed(aChannel)) {
    return net::ChannelBlockDecision::Allowed;
  }

  net::ChannelBlockDecision decision = net::ChannelBlockDecision::Allowed;
  net::ChannelClassifierUtils::MaybeBlockChannel(
      aChannel, "content-classifier"_ns, "content-classifier-block"_ns,
      blockingFeature->mBlockingErrorCode, blockingFeature->mReplacedState,
      blockingFeature->mAllowedState, &decision);
  return decision;
}

// nsIContentClassifierService

NS_IMETHODIMP ContentClassifierService::SetFilterListData(
    const nsACString& aName, const nsTArray<uint8_t>& aData) {
  MOZ_ASSERT(NS_IsMainThread());

  MOZ_LOG_FMT(gContentClassifierLog, LogLevel::Debug,
              "SetFilterListData - name={} size={}", aName, aData.Length());

  MutexAutoLock lock(mLock);
  if (mInitPhase != InitPhase::InitSucceeded) {
    return NS_ERROR_NOT_INITIALIZED;
  }
  mFilterListData.InsertOrUpdate(nsCString(aName), aData.Clone());
  return NS_OK;
}

NS_IMETHODIMP ContentClassifierService::RemoveFilterList(
    const nsACString& aName) {
  MOZ_ASSERT(NS_IsMainThread());

  MOZ_LOG_FMT(gContentClassifierLog, LogLevel::Debug,
              "RemoveFilterList - name={}", aName);

  MutexAutoLock lock(mLock);
  if (mInitPhase != InitPhase::InitSucceeded) {
    return NS_ERROR_NOT_INITIALIZED;
  }
  mFilterListData.Remove(nsCString(aName));
  return NS_OK;
}

NS_IMETHODIMP ContentClassifierService::GetFeatureNames(
    nsTArray<nsCString>& aNames) {
  aNames.Clear();
  for (const auto& feature : GetFeatures()) {
    aNames.AppendElement(feature.mName);
  }
  return NS_OK;
}

NS_IMETHODIMP ContentClassifierService::ApplyFilterLists() {
  MOZ_ASSERT(NS_IsMainThread());

  MOZ_LOG_FMT(gContentClassifierLog, LogLevel::Info,
              "ApplyFilterLists - rebuilding engines from stored data");

  {
    MutexAutoLock lock(mLock);
    if (mInitPhase != InitPhase::InitSucceeded) {
      return NS_ERROR_NOT_INITIALIZED;
    }
    RebuildEnginesFromStoredData();
  }

  NotifyListsLoadedForTesting();

  return NS_OK;
}

// Parses a byte buffer of adblock-format filter list text into rules.
// Tolerates both LF and CRLF line endings; skips empty lines.
static void ParseFilterListRules(const nsTArray<uint8_t>& aData,
                                 nsTArray<nsCString>& aRules) {
  nsDependentCSubstring content(reinterpret_cast<const char*>(aData.Elements()),
                                aData.Length());
  for (const auto& line : content.Split('\n')) {
    nsCString rule(line);
    // Trim trailing CR for CRLF line endings.
    if (!rule.IsEmpty() && rule.Last() == '\r') {
      rule.Truncate(rule.Length() - 1);
    }
    if (!rule.IsEmpty()) {
      aRules.AppendElement(std::move(rule));
    }
  }
}

// static
nsTArray<nsCString> ContentClassifierService::ActiveFeatureNames() {
  nsTArray<nsCString> names;
  for (const char* pref : kFeatureEnginesPrefs) {
    AppendFeatureNamesFromPref(pref, names);
  }
  return names;
}

void ContentClassifierService::PopulateEngineListFromPref(
    const char* aPref, nsTArray<RefPtr<ContentClassifierEngine>>& aOut) {
  MOZ_ASSERT(NS_IsMainThread());
  mLock.AssertCurrentThreadOwns();
  nsTArray<nsCString> names;
  AppendFeatureNamesFromPref(aPref, names);
  for (const auto& name : names) {
    auto entry = mEngines.Lookup(name);
    if (entry) {
      aOut.AppendElement(entry.Data());
    }
  }
}

void ContentClassifierService::RefreshActiveEngineLists() {
  MOZ_ASSERT(NS_IsMainThread());
  mLock.AssertCurrentThreadOwns();
  mCancelEngines.Clear();
  mCancelEnginesPBM.Clear();
  mAnnotateEngines.Clear();
  mAnnotateEnginesPBM.Clear();
  PopulateEngineListFromPref(
      "privacy.trackingprotection.content.protection.engines", mCancelEngines);
  PopulateEngineListFromPref(
      "privacy.trackingprotection.content.protection.engines.pbmode",
      mCancelEnginesPBM);
  PopulateEngineListFromPref(
      "privacy.trackingprotection.content.annotation.engines",
      mAnnotateEngines);
  PopulateEngineListFromPref(
      "privacy.trackingprotection.content.annotation.engines.pbmode",
      mAnnotateEnginesPBM);
}

void ContentClassifierService::RebuildEnginesFromStoredData() {
  mLock.AssertCurrentThreadOwns();
  MOZ_ASSERT(NS_IsMainThread());

  if (mInitPhase != InitPhase::InitSucceeded) {
    return;
  }

  nsTArray<nsCString> referenced = ActiveFeatureNames();

  MOZ_LOG_FMT(gContentClassifierLog, LogLevel::Debug,
              "RebuildEnginesFromStoredData - {} referenced features, "
              "{} stored lists",
              referenced.Length(), mFilterListData.Count());

  mEngines.Clear();

  for (const auto& name : referenced) {
    Maybe<const ContentClassifierFeature&> maybeFeature =
        GetFeatureByName(name);
    if (maybeFeature.isNothing()) {
      MOZ_LOG_FMT(gContentClassifierLog, LogLevel::Warning,
                  "RebuildEnginesFromStoredData - unknown feature \"{}\"",
                  name);
      continue;
    }
    const ContentClassifierFeature& feature = *maybeFeature;

    nsTArray<nsCString> rules;
    size_t presentLists = 0;
    for (const auto& listId : feature.mListIds) {
      auto entry = mFilterListData.Lookup(listId);
      if (!entry) {
        MOZ_LOG_FMT(gContentClassifierLog, LogLevel::Warning,
                    "RebuildEnginesFromStoredData - list \"{}\" for feature "
                    "\"{}\" not found in stored data; engine will be built "
                    "from the remaining lists",
                    listId, feature.mName);
        continue;
      }
      ParseFilterListRules(entry.Data(), rules);
      ++presentLists;
    }
    if (presentLists == 0) {
      MOZ_LOG_FMT(gContentClassifierLog, LogLevel::Warning,
                  "RebuildEnginesFromStoredData - no stored lists available "
                  "for feature \"{}\"; skipping engine",
                  feature.mName);
      continue;
    }

    RefPtr<ContentClassifierEngine> engine =
        new ContentClassifierEngine(feature);
    nsresult rv = engine->InitFromRules(rules);
    if (NS_FAILED(rv)) {
      MOZ_LOG_FMT(gContentClassifierLog, LogLevel::Error,
                  "RebuildEnginesFromStoredData - failed to init engine for "
                  "feature \"{}\": {:#x}",
                  feature.mName, static_cast<uint32_t>(rv));
      continue;
    }

    MOZ_LOG_FMT(gContentClassifierLog, LogLevel::Info,
                "RebuildEnginesFromStoredData - loaded engine for feature "
                "\"{}\" with {} rules",
                feature.mName, rules.Length());
    mEngines.InsertOrUpdate(name, std::move(engine));
  }

  RefreshActiveEngineLists();
}

// HTTP-based list loading (test only)

class FilterListLoader final : public nsIStreamLoaderObserver {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS

  explicit FilterListLoader(nsTArray<nsCString>* aRules) : mRules(aRules) {}

  NS_IMETHOD
  OnStreamComplete(nsIStreamLoader* aLoader, nsISupports* aCtxt,
                   nsresult aStatus, uint32_t aResultLength,
                   const uint8_t* aResult) override {
    MOZ_ASSERT(NS_IsMainThread());

    NS_ENSURE_SUCCESS(aStatus, aStatus);
    if (NS_FAILED(aStatus)) {
      MOZ_LOG(gContentClassifierLog, LogLevel::Debug,
              ("FilterListLoader::OnStreamComplete - failed with status 0x%x",
               static_cast<uint32_t>(aStatus)));
      mPromiseHolder.RejectIfExists(aStatus, __func__);
      return aStatus;
    }

    nsAutoCString content(reinterpret_cast<const char*>(aResult),
                          aResultLength);

    for (const auto& line : content.Split('\n')) {
      if (!line.IsEmpty()) {
        mRules->AppendElement(line);
      }
    }

    MOZ_LOG(gContentClassifierLog, LogLevel::Debug,
            ("FilterListLoader::OnStreamComplete - loaded %zu rules",
             mRules->Length()));

    mPromiseHolder.ResolveIfExists(true, __func__);

    return NS_OK;
  }

  RefPtr<GenericPromise> Load(const nsACString& aURL) {
    MOZ_ASSERT(NS_IsMainThread());

    nsCOMPtr<nsIURI> uri;
    nsresult rv = NS_NewURI(getter_AddRefs(uri), aURL);
    NS_ENSURE_SUCCESS(rv, GenericPromise::CreateAndReject(rv, __func__));

    nsCOMPtr<nsIChannel> channel;
    uint32_t loadFlags = nsIChannel::LOAD_BYPASS_URL_CLASSIFIER;
    rv = NS_NewChannel(getter_AddRefs(channel), uri,
                       nsContentUtils::GetSystemPrincipal(),
                       nsILoadInfo::SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
                       nsIContentPolicy::TYPE_OTHER,
                       nullptr,  // nsICookieJarSettings
                       nullptr,  // aPerformanceStorage
                       nullptr,  // aLoadGroup
                       nullptr,  // aInterfaceRequestor
                       loadFlags);
    NS_ENSURE_SUCCESS(rv, GenericPromise::CreateAndReject(rv, __func__));

    nsCOMPtr<nsIStreamLoader> loader;
    rv = NS_NewStreamLoader(getter_AddRefs(loader), this);
    NS_ENSURE_SUCCESS(rv, GenericPromise::CreateAndReject(rv, __func__));

    rv = channel->AsyncOpen(loader);
    NS_ENSURE_SUCCESS(rv, GenericPromise::CreateAndReject(rv, __func__));

    return mPromiseHolder.Ensure(__func__);
  }

 private:
  ~FilterListLoader() {
    mPromiseHolder.RejectIfExists(NS_ERROR_ABORT, __func__);
  }

  nsTArray<nsCString>* mRules;
  MozPromiseHolder<GenericPromise> mPromiseHolder;
};

NS_IMPL_ISUPPORTS(FilterListLoader, nsIStreamLoaderObserver)

void ContentClassifierService::LoadFilterLists() {
  MOZ_LOG(gContentClassifierLog, LogLevel::Debug,
          ("ContentClassifierService::LoadFilterLists - loading filter lists"));

  nsTArray<RefPtr<GenericPromise>> promises;

  nsAutoCString blockListPref;
  Preferences::GetCString(
      "privacy.trackingprotection.content.protection.test_list_urls",
      blockListPref);

  nsTArray<nsCString> blockListURLs;
  for (const nsACString& url : blockListPref.Split('|')) {
    if (!url.IsEmpty()) {
      blockListURLs.AppendElement(url);
      MOZ_LOG(
          gContentClassifierLog, LogLevel::Debug,
          ("LoadFilterLists - block list URL: %s", nsAutoCString(url).get()));
    }
  }

  nsAutoCString annotationListPref;
  Preferences::GetCString(
      "privacy.trackingprotection.content.annotation.test_list_urls",
      annotationListPref);

  nsTArray<nsCString> annotationListURLs;
  for (const nsACString& url : annotationListPref.Split('|')) {
    if (!url.IsEmpty()) {
      annotationListURLs.AppendElement(url);
      MOZ_LOG(gContentClassifierLog, LogLevel::Debug,
              ("LoadFilterLists - annotation list URL: %s",
               nsAutoCString(url).get()));
    }
  }

  nsTArray<nsTArray<nsCString>> blockFilterRules;
  nsTArray<nsTArray<nsCString>> annotateFilterRules;
  blockFilterRules.SetLength(blockListURLs.Length());
  annotateFilterRules.SetLength(annotationListURLs.Length());

  for (size_t i = 0; i < blockListURLs.Length(); ++i) {
    RefPtr<FilterListLoader> loader =
        new FilterListLoader(&blockFilterRules[i]);
    promises.AppendElement(loader->Load(blockListURLs[i]));
  }

  for (size_t i = 0; i < annotationListURLs.Length(); ++i) {
    RefPtr<FilterListLoader> loader =
        new FilterListLoader(&annotateFilterRules[i]);
    promises.AppendElement(loader->Load(annotationListURLs[i]));
  }

  GenericPromise::AllSettled(GetMainThreadSerialEventTarget(), promises)
      ->Then(
          GetMainThreadSerialEventTarget(), __func__,
          [self = RefPtr{this},
           annotateFilterRules = std::move(annotateFilterRules),
           blockFilterRules = std::move(blockFilterRules)](
              const GenericPromise::AllSettledPromiseType::ResolveOrRejectValue&
                  aResults) {
            // Synthesize entries in mFilterListData for the test_block /
            // test_annotate features so they go through the normal
            // RebuildEnginesFromStoredData path.
            auto serialize = [](const nsTArray<nsTArray<nsCString>>& aPerUrl,
                                nsTArray<uint8_t>& aOut) {
              for (const auto& rules : aPerUrl) {
                for (const auto& rule : rules) {
                  aOut.AppendElements(
                      reinterpret_cast<const uint8_t*>(rule.BeginReading()),
                      rule.Length());
                  aOut.AppendElement('\n');
                }
              }
            };

            {
              ReleasableMutexAutoLock lock(self->mLock);
              if (blockFilterRules.IsEmpty()) {
                self->mFilterListData.Remove("test_block"_ns);
              } else {
                nsTArray<uint8_t> bytes;
                serialize(blockFilterRules, bytes);
                self->mFilterListData.InsertOrUpdate("test_block"_ns,
                                                     std::move(bytes));
              }
              if (annotateFilterRules.IsEmpty()) {
                self->mFilterListData.Remove("test_annotate"_ns);
              } else {
                nsTArray<uint8_t> bytes;
                serialize(annotateFilterRules, bytes);
                self->mFilterListData.InsertOrUpdate("test_annotate"_ns,
                                                     std::move(bytes));
              }
              self->RebuildEnginesFromStoredData();
            }
            NotifyListsLoadedForTesting();
          });
}

}  // namespace mozilla
