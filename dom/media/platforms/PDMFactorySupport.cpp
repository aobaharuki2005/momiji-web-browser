/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "PDMFactorySupport.h"

#include <mutex>

#include "mozilla/AppShutdown.h"
#include "mozilla/Atomics.h"
#include "mozilla/ClearOnShutdown.h"
#include "mozilla/Preferences.h"
#include "mozilla/StaticMutex.h"
#include "mozilla/StaticPtr.h"
#include "mozilla/SyncRunnable.h"
#include "mozilla/gfx/gfxVars.h"
#include "nsThreadUtils.h"

namespace mozilla {

namespace {

// Prefs read by `PDMFactory::CreatePDMs` and the per-process `Create*PDMs`
// helpers. Each `#ifdef` gate matches the corresponding wrapper in
// `StaticPrefList.yaml`. The trailing `nullptr` in each array is a sentinel
// required by `Preferences::RegisterCallbacks`, which walks the array until
// it sees a null pointer.

constexpr const char* kInvalidatingPrefs_CrossPlatform[] = {
    "media.use-blank-decoder",
    "media.gpu-process-decoder",
    "media.rdd-process.enabled",
    "media.utility-process.enabled",
    "media.allow-audio-non-utility",
    "media.prefer-non-ffvpx",
    "media.ffvpx-hw.enabled",
    "media.av1.enabled",
    "media.hevc.enabled",
    "media.gmp.decoder.enabled",
    "media.gmp.decoder.preferred",
    nullptr,
};

#ifdef MOZ_WMF
constexpr const char* kInvalidatingPrefs_WMF[] = {
    "media.wmf.enabled",
    "media.rdd-wmf.enabled",
    "media.wmf.media-engine.enabled",
    nullptr,
};
#endif

#ifdef MOZ_APPLEMEDIA
constexpr const char* kInvalidatingPrefs_AppleMedia[] = {
    "media.rdd-applemedia.enabled",
    nullptr,
};
#endif

#ifdef ANDROID
constexpr const char* kInvalidatingPrefs_Android[] = {
    "media.android-media-codec.preferred",
    "media.utility-android-media-codec.enabled",
    nullptr,
};
#endif

#ifdef MOZ_FFMPEG
constexpr const char* kInvalidatingPrefs_FFmpeg[] = {
    "media.ffmpeg.enabled",
    "media.rdd-ffmpeg.enabled",
    nullptr,
};
#endif

// `sInstanceMutex` is `MOZ_UNANNOTATED` because the `ClearOnShutdown` clearer
// nulls `sInstance` without taking the lock. `Instance()` returns null past
// `AppShutdownConfirmed` so no new instance is created after the clearer
// runs.
static StaticMutex sInstanceMutex MOZ_UNANNOTATED;
static StaticRefPtr<PDMFactorySupport> sInstance;

// `sStale` must be atomic because `Invalidate()` writes it from arbitrary
// threads without taking the lock (see the comment on `Invalidate()`). The
// once-only registration gates live as function-static `bool`s in their
// callers.
static Atomic<bool> sStale{false};

}  // namespace

PDMFactorySupport::PDMFactorySupport() : mFactory(new PDMFactory()) {}

/* static */
media::DecodeSupportSet PDMFactorySupport::IsTypeSupported(
    const nsACString& aMimeType) {
  RefPtr<PDMFactorySupport> support = Instance();
  if (!support) {
    // Past `AppShutdownConfirmed`; report unsupported.
    return media::DecodeSupportSet{};
  }
  return support->SupportsMimeType(aMimeType);
}

/* static */
media::DecodeSupportSet PDMFactorySupport::IsSupported(
    const SupportDecoderParams& aParams,
    DecoderDoctorDiagnostics* aDiagnostics) {
  RefPtr<PDMFactorySupport> support = Instance();
  if (!support) {
    // Past `AppShutdownConfirmed`; report unsupported.
    return media::DecodeSupportSet{};
  }
  return support->Supports(aParams, aDiagnostics);
}

/* static */
RefPtr<PDMFactorySupport> PDMFactorySupport::Instance() {
  StaticMutexAutoLock lock(sInstanceMutex);

  // Refuse to build (or return) an instance after shutdown begins.
  if (AppShutdown::IsInOrBeyond(ShutdownPhase::AppShutdownConfirmed)) {
    return nullptr;
  }

  // Install pref/`gfxVar` listeners before building the inner `PDMFactory`
  // so any change during construction sets `sStale`.
  EnsureInvalidationListenersRegistered(lock);

  // A change during construction sets `sStale`; this caller's `RefPtr`
  // keeps the just-built snapshot, and the next `Instance()` caller drains
  // `sStale` and rebuilds.
  if (sStale.exchange(false) && sInstance) {
    sInstance = nullptr;
  }
  if (!sInstance) {
    sInstance = new PDMFactorySupport();

    // Register `ClearOnShutdown` exactly once per process.
    static std::once_flag sShutdownRegistered;
    std::call_once(sShutdownRegistered, []() {
      if (NS_IsMainThread()) {
        ClearOnShutdown(&sInstance);
      } else {
        NS_DispatchToMainThread(
            NS_NewRunnableFunction("PDMFactorySupport::ClearOnShutdown",
                                   []() { ClearOnShutdown(&sInstance); }));
      }
    });
  }
  return sInstance.get();
}

/* static */
void PDMFactorySupport::Invalidate() {
  // Lock-free on purpose: this is called from arbitrary threads (pref
  // callbacks and gfxVar listeners run on the thread that triggered the
  // change, which may already hold locks the gfx or prefs subsystems care
  // about). Acquiring `sInstanceMutex` here would risk deadlock against the
  // listener-registration path. The atomic store is the only synchronisation
  // needed: the next `Instance()` caller atomically exchanges the flag under
  // `sInstanceMutex` and rebuilds. RefPtrs already returned from earlier
  // `Instance()` calls remain valid and continue to answer with their
  // pre-invalidation snapshot for the lifetime of the reference.
  sStale = true;
}

/* static */
void PDMFactorySupport::OnInvalidatingPrefChanged(const char* /* aPref */,
                                                  void* /* aData */) {
  Invalidate();
}

/* static */
void PDMFactorySupport::OnInvalidatingGfxVarChanged() { Invalidate(); }

/* static */
void PDMFactorySupport::EnsureInvalidationListenersRegistered(
    const StaticMutexAutoLock& /* aProofOfLock */) {
  // Registration runs at most once across the process. `std::call_once`
  // serialises concurrent first calls and provides the once-only guarantee.
  static std::once_flag sListenersRegistered;
  std::call_once(sListenersRegistered, []() {
    auto registerOnMain = []() {
      MOZ_ASSERT(NS_IsMainThread());
      Preferences::RegisterCallbacks(OnInvalidatingPrefChanged,
                                     kInvalidatingPrefs_CrossPlatform);
#ifdef MOZ_WMF
      Preferences::RegisterCallbacks(OnInvalidatingPrefChanged,
                                     kInvalidatingPrefs_WMF);
#endif
#ifdef MOZ_APPLEMEDIA
      Preferences::RegisterCallbacks(OnInvalidatingPrefChanged,
                                     kInvalidatingPrefs_AppleMedia);
#endif
#ifdef ANDROID
      Preferences::RegisterCallbacks(OnInvalidatingPrefChanged,
                                     kInvalidatingPrefs_Android);
#endif
#ifdef MOZ_FFMPEG
      Preferences::RegisterCallbacks(OnInvalidatingPrefChanged,
                                     kInvalidatingPrefs_FFmpeg);
#endif
      // `gfxVars::Set*Listener` requires `gfxVars::IsInitialized()`. Bootstrap
      // it here on the main thread.
      if (!gfx::gfxVars::IsInitialized()) {
        gfx::gfxVars::Initialize();
      }
      gfx::gfxVars::SetCanUseHardwareVideoDecodingListener(
          OnInvalidatingGfxVarChanged);
      gfx::gfxVars::SetUseAV1HwDecodeListener(OnInvalidatingGfxVarChanged);
      gfx::gfxVars::SetUseVP8HwDecodeListener(OnInvalidatingGfxVarChanged);
      gfx::gfxVars::SetUseVP9HwDecodeListener(OnInvalidatingGfxVarChanged);
      // `UseH264HwDecode` / `UseHEVCHwDecode` are only set on Linux/Android/
      // Windows today; registering elsewhere is a harmless no-op.
      gfx::gfxVars::SetUseH264HwDecodeListener(OnInvalidatingGfxVarChanged);
      gfx::gfxVars::SetUseHEVCHwDecodeListener(OnInvalidatingGfxVarChanged);
    };

    if (NS_IsMainThread()) {
      registerOnMain();
    } else {
      nsCOMPtr<nsIEventTarget> mainTarget = GetMainThreadSerialEventTarget();
      nsCOMPtr<nsIRunnable> runnable = NS_NewRunnableFunction(
          "PDMFactorySupport::EnsureInvalidationListenersRegistered",
          std::move(registerOnMain));
      SyncRunnable::DispatchToThread(mainTarget, runnable);
    }
  });
}

}  // namespace mozilla
