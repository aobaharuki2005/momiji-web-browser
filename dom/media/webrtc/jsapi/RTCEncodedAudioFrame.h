/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#ifndef MOZILLA_DOM_MEDIA_WEBRTC_JSAPI_RTCENCODEDAUDIOFRAME_H_
#define MOZILLA_DOM_MEDIA_WEBRTC_JSAPI_RTCENCODEDAUDIOFRAME_H_

#include "jsapi/RTCEncodedFrameBase.h"
#include "mozilla/RefPtr.h"
#include "mozilla/dom/RTCEncodedAudioFrameBinding.h"
#include "nsIGlobalObject.h"

namespace mozilla::dom {

struct RTCEncodedAudioFrameData : RTCEncodedFrameState {
  RTCEncodedAudioFrameMetadata mMetadata;
};

// Wraps a libwebrtc frame, allowing the frame buffer to be modified, and
// providing read-only access to various metadata. After the libwebrtc frame is
// extracted (with RTCEncodedFrameBase::TakeFrame), the frame buffer is
// detached, but the metadata remains accessible.
class RTCEncodedAudioFrame final : public RTCEncodedAudioFrameData,
                                   public RTCEncodedFrameBase {
 public:
  explicit RTCEncodedAudioFrame(
      nsIGlobalObject* aGlobal,
      std::unique_ptr<webrtc::TransformableFrameInterface> aFrame,
      uint64_t aCounter, RTCRtpScriptTransformer* aOwner);

  // nsISupports
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_CYCLE_COLLECTION_CLASS_INHERITED(RTCEncodedAudioFrame,
                                           RTCEncodedFrameBase)

  // webidl (timestamp and data accessors live in base class)
  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;

  nsIGlobalObject* GetParentObject() const;

  void GetMetadata(RTCEncodedAudioFrameMetadata& aMetadata) const;

  bool CheckOwner(RTCRtpScriptTransformer* aOwner) const override;

  bool IsVideo() const override { return false; }

  // [Serializable] implementations: {Read, Write}StructuredClone
  static already_AddRefed<RTCEncodedAudioFrame> ReadStructuredClone(
      JSContext* aCx, nsIGlobalObject* aGlobal,
      JSStructuredCloneReader* aReader);
  bool WriteStructuredClone(JSContext* aCx,
                            JSStructuredCloneWriter* aWriter) const;

 private:
  virtual ~RTCEncodedAudioFrame();

  // forbid copy/move to keep mState member in base valid
  RTCEncodedAudioFrame(const RTCEncodedAudioFrame&) = delete;
  RTCEncodedAudioFrame& operator=(const RTCEncodedAudioFrame&) = delete;
  RTCEncodedAudioFrame(RTCEncodedAudioFrame&&) = delete;
  RTCEncodedAudioFrame& operator=(RTCEncodedAudioFrame&&) = delete;

  RefPtr<RTCRtpScriptTransformer> mOwner;
};

}  // namespace mozilla::dom
#endif  // MOZILLA_DOM_MEDIA_WEBRTC_JSAPI_RTCENCODEDAUDIOFRAME_H_
