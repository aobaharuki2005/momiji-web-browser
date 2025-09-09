/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MatroskaDecoder.h"

#include "MediaContainerType.h"
#include "PDMFactory.h"
#include "PlatformDecoderModule.h"
#include "VideoUtils.h"
#include "mozilla/StaticPrefs_media.h"
#include "nsMimeTypes.h"

namespace mozilla {

/* static */
bool MatroskaDecoder::IsMatroskaType(const MediaContainerType& aType) {
  const auto& mimeType = aType.Type();
  return mimeType == MEDIAMIMETYPE(VIDEO_MATROSKA) ||
         mimeType == MEDIAMIMETYPE(AUDIO_MATROSKA);
}

/* static */
nsTArray<UniquePtr<TrackInfo>> MatroskaDecoder::GetTracksInfo(
    const MediaContainerType& aType, MediaResult& aError) {
  nsTArray<UniquePtr<TrackInfo>> tracks;

  aError = NS_OK;

  const MediaCodecs& codecs = aType.ExtendedType().Codecs();
  if (codecs.IsEmpty()) {
    return tracks;
  }
  // TODO : add codec support.
  for (const auto& codec : codecs.Range()) {
    aError = MediaResult(
        NS_ERROR_DOM_MEDIA_FATAL_ERR,
        RESULT_DETAIL("Unknown codec:%s", NS_ConvertUTF16toUTF8(codec).get()));
  }
  return tracks;
}

/* static */
bool MatroskaDecoder::IsSupportedType(const MediaContainerType& aContainerType,
                                      DecoderDoctorDiagnostics* aDiagnostics) {
  if (!StaticPrefs::media_mkv_enabled() || !IsMatroskaType(aContainerType)) {
    return false;
  }

  MediaResult rv = NS_OK;
  auto tracks = GetTracksInfo(aContainerType, rv);
  if (NS_FAILED(rv)) {
    return false;
  }

  if (!tracks.IsEmpty()) {
    // Look for exact match as we know the codecs used.
    RefPtr<PDMFactory> platform = new PDMFactory();
    for (const auto& track : tracks) {
      if (!track ||
          platform->Supports(SupportDecoderParams(*track), aDiagnostics)
              .isEmpty()) {
        return false;
      }
    }
    return true;
  }

  return false;
}

/* static */
nsTArray<UniquePtr<TrackInfo>> MatroskaDecoder::GetTracksInfo(
    const MediaContainerType& aType) {
  MediaResult rv = NS_OK;
  return GetTracksInfo(aType, rv);
}

}  // namespace mozilla
