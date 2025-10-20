/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_COMPRESSION_FORMATZLIB_H_
#define DOM_COMPRESSION_FORMATZLIB_H_

#include "BaseAlgorithms.h"
#include "mozilla/dom/TransformerCallbackHelpers.h"
#include "zlib.h"

// See the zlib manual in https://www.zlib.net/manual.html or in
// https://searchfox.org/mozilla-central/source/modules/zlib/src/zlib.h

namespace mozilla::dom {
enum class CompressionFormat : uint8_t;
}

namespace mozilla::dom::compression {

class CompressionStreamAlgorithms : public TransformerAlgorithmsWrapper {
 public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_CYCLE_COLLECTION_CLASS_INHERITED(CompressionStreamAlgorithms,
                                           TransformerAlgorithmsBase)

  static Result<already_AddRefed<CompressionStreamAlgorithms>, nsresult> Create(
      CompressionFormat format);

 private:
  CompressionStreamAlgorithms() = default;

  [[nodiscard]] nsresult Init(CompressionFormat format);

  // Step 3 of
  // https://wicg.github.io/compression/#dom-compressionstream-compressionstream
  // Let transformAlgorithm be an algorithm which takes a chunk argument and
  // runs the compress and enqueue a chunk algorithm with this and chunk.
  MOZ_CAN_RUN_SCRIPT
  void TransformCallbackImpl(JS::Handle<JS::Value> aChunk,
                             TransformStreamDefaultController& aController,
                             ErrorResult& aRv) override;

  // Step 4 of
  // https://wicg.github.io/compression/#dom-compressionstream-compressionstream
  // Let flushAlgorithm be an algorithm which takes no argument and runs the
  // compress flush and enqueue algorithm with this.
  MOZ_CAN_RUN_SCRIPT void FlushCallbackImpl(
      TransformStreamDefaultController& aController, ErrorResult& aRv) override;

  // Shared by:
  // https://wicg.github.io/compression/#compress-and-enqueue-a-chunk
  // https://wicg.github.io/compression/#compress-flush-and-enqueue
  MOZ_CAN_RUN_SCRIPT void CompressAndEnqueue(
      JSContext* aCx, Span<const uint8_t> aInput, Flush aFlush,
      TransformStreamDefaultController& aController, ErrorResult& aRv);

  ~CompressionStreamAlgorithms() override;

  z_stream mZStream = {};
};

class ZLibDecompressionStreamAlgorithms : public DecompressionStreamAlgorithms {
 public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_CYCLE_COLLECTION_CLASS_INHERITED(ZLibDecompressionStreamAlgorithms,
                                           DecompressionStreamAlgorithms)

  static Result<already_AddRefed<ZLibDecompressionStreamAlgorithms>, nsresult>
  Create(CompressionFormat format);

 private:
  ZLibDecompressionStreamAlgorithms() = default;

  [[nodiscard]] nsresult Init(CompressionFormat format);

 private:
  // Shared by:
  // https://wicg.github.io/compression/#decompress-and-enqueue-a-chunk
  // https://wicg.github.io/compression/#decompress-flush-and-enqueue
  // All data errors throw TypeError by step 2: If this results in an error,
  // then throw a TypeError.
  MOZ_CAN_RUN_SCRIPT void DecompressAndEnqueue(
      JSContext* aCx, Span<const uint8_t> aInput, Flush aFlush,
      TransformStreamDefaultController& aController, ErrorResult& aRv) override;

  ~ZLibDecompressionStreamAlgorithms() override;

  z_stream mZStream = {};
  bool mObservedStreamEnd = false;
};

}  // namespace mozilla::dom::compression

#endif  // DOM_COMPRESSION_FORMATZLIB_H_
