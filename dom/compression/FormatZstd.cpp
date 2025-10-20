/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "FormatZstd.h"

#include "BaseAlgorithms.h"
#include "mozilla/dom/TransformStreamDefaultController.h"
#include "zstd/zstd.h"

namespace mozilla::dom::compression {

NS_IMPL_CYCLE_COLLECTION_INHERITED(ZstdDecompressionStreamAlgorithms,
                                   DecompressionStreamAlgorithms)
NS_IMPL_ADDREF_INHERITED(ZstdDecompressionStreamAlgorithms,
                         DecompressionStreamAlgorithms)
NS_IMPL_RELEASE_INHERITED(ZstdDecompressionStreamAlgorithms,
                          DecompressionStreamAlgorithms)
NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(ZstdDecompressionStreamAlgorithms)
NS_INTERFACE_MAP_END_INHERITING(DecompressionStreamAlgorithms)

Result<already_AddRefed<ZstdDecompressionStreamAlgorithms>, nsresult>
ZstdDecompressionStreamAlgorithms::Create() {
  RefPtr<ZstdDecompressionStreamAlgorithms> alg =
      new ZstdDecompressionStreamAlgorithms();
  MOZ_TRY(alg->Init());
  return alg.forget();
}

[[nodiscard]] nsresult ZstdDecompressionStreamAlgorithms::Init() {
  mDStream = ZSTD_createDStream();
  if (!mDStream) {
    return NS_ERROR_OUT_OF_MEMORY;
  }

  // Refuse any frame requiring larger than (1 << WINDOW_LOG_MAX) window size.
  // Note: 1 << 23 == 8 * 1024 * 1024
  static const uint8_t WINDOW_LOG_MAX = 23;
  ZSTD_DCtx_setParameter(mDStream, ZSTD_d_windowLogMax, WINDOW_LOG_MAX);

  return NS_OK;
}

// Shared by:
// https://wicg.github.io/compression/#decompress-and-enqueue-a-chunk
// https://wicg.github.io/compression/#decompress-flush-and-enqueue
// All data errors throw TypeError by step 2: If this results in an error,
// then throw a TypeError.
MOZ_CAN_RUN_SCRIPT void ZstdDecompressionStreamAlgorithms::DecompressAndEnqueue(
    JSContext* aCx, Span<const uint8_t> aInput, Flush aFlush,
    TransformStreamDefaultController& aController, ErrorResult& aRv) {
  MOZ_ASSERT_IF(aFlush == Flush::Yes, !aInput.Length());

  if (mObservedStreamEnd && aInput.Length() > 0) {
    aRv.ThrowTypeError("Unexpected input after the end of stream");
    return;
  }

  ZSTD_inBuffer inBuffer = {/* src  */ const_cast<uint8_t*>(aInput.Elements()),
                            /* size */ aInput.Length(),
                            /* pos  */ 0};

  JS::RootedVector<JSObject*> array(aCx);

  while (inBuffer.pos < inBuffer.size && !mObservedStreamEnd) {
    UniquePtr<uint8_t[], JS::FreePolicy> buffer(
        static_cast<uint8_t*>(JS_malloc(aCx, kBufferSize)));
    if (!buffer) {
      aRv.ThrowTypeError("Out of memory");
      return;
    }

    ZSTD_outBuffer outBuffer = {/* dst  */ buffer.get(),
                                /* size */ kBufferSize,
                                /* pos  */ 0};

    size_t rv = ZSTD_decompressStream(mDStream, &outBuffer, &inBuffer);
    if (ZSTD_isError(rv)) {
      aRv.ThrowTypeError("zstd decompression error: "_ns +
                         nsDependentCString(ZSTD_getErrorName(rv)));
      return;
    }

    if (rv == 0) {
      mObservedStreamEnd = true;
    }

    // Step 3: If buffer is empty, return.
    // (We'll implicitly return when the array is empty.)

    // Step 4: Split buffer into one or more non-empty pieces and convert them
    // into Uint8Arrays.
    // (The buffer is 'split' by having a fixed sized buffer above.)

    size_t written = outBuffer.pos;
    if (written > 0) {
      JS::Rooted<JSObject*> view(aCx, nsJSUtils::MoveBufferAsUint8Array(
                                          aCx, written, std::move(buffer)));
      if (!view || !array.append(view)) {
        JS_ClearPendingException(aCx);
        aRv.ThrowTypeError("Out of memory");
        return;
      }
    }
  }

  // Step 5: For each Uint8Array array, enqueue array in ds's transform.
  for (const auto& view : array) {
    JS::Rooted<JS::Value> value(aCx, JS::ObjectValue(*view));
    aController.Enqueue(aCx, value, aRv);
    if (aRv.Failed()) {
      return;
    }
  }

  // Step 6: If the end of the compressed input has been reached, and ds's
  // context has not fully consumed chunk, then throw a TypeError.
  if (mObservedStreamEnd && inBuffer.pos < inBuffer.size) {
    aRv.ThrowTypeError("Unexpected input after the end of stream");
    return;
  }

  // Step 3 of
  // https://wicg.github.io/compression/#decompress-flush-and-enqueue
  // If the end of the compressed input has not been reached, then throw a
  // TypeError.
  if (aFlush == Flush::Yes && !mObservedStreamEnd) {
    aRv.ThrowTypeError("The input is ended without reaching the stream end");
    return;
  }
}

ZstdDecompressionStreamAlgorithms::~ZstdDecompressionStreamAlgorithms() {
  if (mDStream) {
    ZSTD_freeDStream(mDStream);
    mDStream = nullptr;
  }
}

}  // namespace mozilla::dom::compression
