/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_PLATFORM_WMF_MFTENCODER_H
#define DOM_MEDIA_PLATFORM_WMF_MFTENCODER_H

#include <wrl.h>
#include <deque>
#include <functional>
#include <queue>

#include "EncoderConfig.h"
#include "WMF.h"
#include "mozilla/DefineEnum.h"
#include "mozilla/EnumSet.h"
#include "mozilla/MozPromise.h"
#include "mozilla/RefPtr.h"
#include "mozilla/ResultVariant.h"
#include "nsDeque.h"
#include "nsISupportsImpl.h"
#include "nsTArray.h"

namespace mozilla {

class MFTEncoder final {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(MFTEncoder)

  struct InputSample {
    RefPtr<IMFSample> mSample{};
    bool mKeyFrameRequested = false;
  };
  using MPEGHeader = nsTArray<UINT8>;
  struct OutputSample {
    RefPtr<IMFSample> mSample{};
    MPEGHeader mHeader;
  };

  using EncodedData = nsTArray<OutputSample>;
  using EncodePromise =
      MozPromise<EncodedData, MediaResult, /* IsExclusive = */ true>;

  enum class HWPreference {
    HardwareOnly,
    SoftwareOnly,
    PreferHardware,
    PreferSoftware
  };
  explicit MFTEncoder(const HWPreference aHWPreference)
      : mHWPreference(aHWPreference) {}

  HRESULT Create(const GUID& aSubtype, const gfx::IntSize& aFrameSize,
                 const EncoderConfig::CodecSpecific& aCodecSpecific);
  HRESULT Destroy();
  HRESULT SetMediaTypes(IMFMediaType* aInputType, IMFMediaType* aOutputType);
  HRESULT SetModes(const EncoderConfig& aConfig);
  HRESULT SetBitrate(UINT32 aBitsPerSec);

  RefPtr<EncodePromise> Encode(InputSample&& aInput);
  RefPtr<EncodePromise> Drain();

  HRESULT CreateInputSample(RefPtr<IMFSample>* aSample, size_t aSize);

  Result<MPEGHeader, HRESULT> GetMPEGSequenceHeader();

  static nsCString GetFriendlyName(const GUID& aSubtype);

  struct Info final {
    GUID mSubtype;
    nsCString mName;
  };
  struct Factory {
    MOZ_DEFINE_ENUM_CLASS_WITH_TOSTRING_AT_CLASS_SCOPE(
        Provider, (HW_AMD, HW_Intel, HW_NVIDIA, HW_Qualcomm, HW_Unknown, SW))

    Provider mProvider;
    Microsoft::WRL::ComPtr<IMFActivate> mActivate;
    nsCString mName;

    Factory(Provider aProvider,
            Microsoft::WRL::ComPtr<IMFActivate>&& aActivate);
    Factory(Factory&& aOther) = default;
    Factory(const Factory& aOther) = delete;
    ~Factory();

    explicit operator bool() const { return mActivate; }

    HRESULT Shutdown();
  };

 private:
  ~MFTEncoder() { Destroy(); };

  static nsTArray<Info>& Infos();
  static nsTArray<Info> Enumerate();
  static Maybe<Info> GetInfo(const GUID& aSubtype);

  // APIs for synchronous processing model.
  Result<EncodedData, MediaResult> EncodeSync(InputSample&& aInput);
  Result<EncodedData, MediaResult> DrainSync();
  Result<EncodedData, HRESULT> PullOutputs();

  // APIs for asynchronous processing model.
  Result<EncodedData, MediaResult> EncodeAsync(InputSample&& aInput);
  Result<EncodedData, MediaResult> DrainAsync();

  MOZ_DEFINE_ENUM_CLASS_WITH_TOSTRING_AT_CLASS_SCOPE(
      ProcessedResult, (AllAvailableInputsProcessed, InputProcessed,
                        OutputYielded, DrainComplete));
  using ProcessedResults = EnumSet<ProcessedResult>;
  Result<ProcessedResults, HRESULT> ProcessPendingEvents();
  Result<ProcessedResult, HRESULT> ProcessEvent(MediaEventType aType);
  Result<ProcessedResult, HRESULT> ProcessInput();
  Result<ProcessedResult, HRESULT> ProcessOutput();
  Result<ProcessedResult, HRESULT> ProcessDrainComplete();
  Result<MediaEventType, HRESULT> GetPendingEvent();

  // Utilities for both processing models.
  class OutputResult {
   public:
    explicit OutputResult(already_AddRefed<IMFSample> aSample)
        : mSample(aSample), mHeader() {}
    explicit OutputResult(MPEGHeader&& aHeader)
        : mSample(nullptr), mHeader(std::move(aHeader)) {}
    bool IsSample() const { return mSample != nullptr; }
    bool IsHeader() const { return !IsSample(); }
    already_AddRefed<IMFSample> TakeSample() {
      MOZ_ASSERT(IsSample());
      return mSample.forget();
    }
    MPEGHeader TakeHeader() {
      MOZ_ASSERT(IsHeader());
      return std::move(mHeader);
    }

   private:
    RefPtr<IMFSample> mSample;
    MPEGHeader mHeader;
  };
  Result<OutputResult, HRESULT> GetOutputOrNewHeader();
  // Set the output type to the first available type found for the output
  // stream.
  HRESULT UpdateOutputType();
  HRESULT ProcessOutput(RefPtr<IMFSample>& aSample, DWORD& aOutputStatus,
                        DWORD& aBufferStatus);
  HRESULT ProcessInput(InputSample&& aInput);

  bool IsAsync() const { return mAsyncEventGenerator; }

  // Return true when successfully enabled, false for MFT that doesn't support
  // async processing model, and error otherwise.
  using AsyncMFTResult = Result<bool, HRESULT>;
  AsyncMFTResult AttemptEnableAsync();
  HRESULT GetStreamIDs();
  GUID MatchInputSubtype(IMFMediaType* aInputType);
  HRESULT SendMFTMessage(MFT_MESSAGE_TYPE aMsg, ULONG_PTR aData);

  const HWPreference mHWPreference;
  RefPtr<IMFTransform> mEncoder;
  // For MFT object creation. See
  // https://docs.microsoft.com/en-us/windows/win32/medfound/activation-objects
  Maybe<Factory> mFactory;
  // For encoder configuration. See
  // https://docs.microsoft.com/en-us/windows/win32/directshow/encoder-api
  RefPtr<ICodecAPI> mConfig;

  DWORD mInputStreamID;
  DWORD mOutputStreamID;
  MFT_INPUT_STREAM_INFO mInputStreamInfo;
  MFT_OUTPUT_STREAM_INFO mOutputStreamInfo;
  bool mOutputStreamProvidesSample;

  // The following members are used only for asynchronous processing model
  size_t mNumNeedInput;
  std::deque<InputSample> mPendingInputs;

  nsTArray<OutputSample> mOutputs;
  // Holds a temporary MPEGSequenceHeader to be attached to the first output
  // packet after format renegotiation.
  MPEGHeader mOutputHeader;

  RefPtr<IMFMediaEventGenerator> mAsyncEventGenerator;
};

}  // namespace mozilla

#endif  // DOM_MEDIA_PLATFORM_WMF_MFTENCODER_H
