/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MatroskaDemuxer.h"

namespace mozilla {

extern LazyLogModule gMediaDemuxerLog;
#define MKV_DEBUG(msg, ...) \
  MOZ_LOG(gMediaDemuxerLog, LogLevel::Debug, (msg, ##__VA_ARGS__))

MatroskaDemuxer::MatroskaDemuxer(MediaResource* aResource)
    : WebMDemuxer(aResource) {}

nsresult MatroskaDemuxer::SetVideoCodecInfo(nestegg* aContext, int aTrackId) {
  mVideoCodec = nestegg_track_codec_id(aContext, aTrackId);
  // TODO : implement codec support
  switch (mVideoCodec) {
    default:
      NS_WARNING("Unknown Matroska video codec");
      return NS_ERROR_FAILURE;
  }
  return NS_OK;
}

nsresult MatroskaDemuxer::SetAudioCodecInfo(
    nestegg* aContext, int aTrackId, const nestegg_audio_params& aParams) {
  mAudioCodec = nestegg_track_codec_id(aContext, aTrackId);
  // TODO : implement codec support
  switch (mAudioCodec) {
    default:
      NS_WARNING("Unknown Matroska audio codec");
      return NS_ERROR_FAILURE;
  }
  return NS_OK;
}

bool MatroskaDemuxer::CheckKeyFrameByExamineByteStream(
    const MediaRawData* aSample) {
  // TODO : implement codec support
  switch (mVideoCodec) {
    default:
      MOZ_ASSERT_UNREACHABLE(
          "Cannot detect keyframes in unknown Matroska video codec");
      return false;
  }
}

}  // namespace mozilla

#undef MKV_DEBUG
