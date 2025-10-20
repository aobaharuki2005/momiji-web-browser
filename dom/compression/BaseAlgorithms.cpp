/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "BaseAlgorithms.h"

#include "mozilla/dom/BufferSourceBinding.h"
#include "mozilla/dom/BufferSourceBindingFwd.h"
#include "mozilla/dom/TransformStreamDefaultController.h"
#include "mozilla/dom/UnionTypes.h"

namespace mozilla::dom::compression {

// Step 3 of
// https://wicg.github.io/compression/#dom-decompressionstream-decompressionstream
// Let transformAlgorithm be an algorithm which takes a chunk argument and
// runs the compress and enqueue a chunk algorithm with this and chunk.
MOZ_CAN_RUN_SCRIPT
void DecompressionStreamAlgorithms::TransformCallbackImpl(
    JS::Handle<JS::Value> aChunk, TransformStreamDefaultController& aController,
    ErrorResult& aRv) {
  AutoJSAPI jsapi;
  if (!jsapi.Init(aController.GetParentObject())) {
    aRv.ThrowUnknownError("Internal error");
    return;
  }
  JSContext* cx = jsapi.cx();

  // https://compression.spec.whatwg.org/#decompress-and-enqueue-a-chunk

  // Step 1: If chunk is not a BufferSource type, then throw a TypeError.
  RootedUnion<OwningBufferSource> bufferSource(cx);
  if (!bufferSource.Init(cx, aChunk)) {
    aRv.MightThrowJSException();
    aRv.StealExceptionFromJSContext(cx);
    return;
  }

  // Step 2: Let buffer be the result of decompressing chunk with ds's format
  // and context. If this results in an error, then throw a TypeError.
  // Step 3 - 5: (Done in DecompressAndEnqueue)
  ProcessTypedArraysFixed(
      bufferSource,
      [&](const Span<uint8_t>& aData) MOZ_CAN_RUN_SCRIPT_BOUNDARY {
        DecompressAndEnqueue(cx, aData, Flush::No, aController, aRv);
      });
}

// Step 4 of
// https://compression.spec.whatwg.org/#dom-decompressionstream-decompressionstream
// Let flushAlgorithm be an algorithm which takes no argument and runs the
// compress flush and enqueue algorithm with this.
MOZ_CAN_RUN_SCRIPT void DecompressionStreamAlgorithms::FlushCallbackImpl(
    TransformStreamDefaultController& aController, ErrorResult& aRv) {
  AutoJSAPI jsapi;
  if (!jsapi.Init(aController.GetParentObject())) {
    aRv.ThrowUnknownError("Internal error");
    return;
  }
  JSContext* cx = jsapi.cx();

  // https://wicg.github.io/compression/#decompress-flush-and-enqueue

  // Step 1: Let buffer be the result of decompressing an empty input with
  // ds's format and context, with the finish flag.
  // Step 2 - 4: (Done in DecompressAndEnqueue)
  DecompressAndEnqueue(cx, Span<const uint8_t>(), Flush::Yes, aController, aRv);
}

NS_IMPL_CYCLE_COLLECTION_INHERITED(DecompressionStreamAlgorithms,
                                   TransformerAlgorithmsBase)
NS_IMPL_ADDREF_INHERITED(DecompressionStreamAlgorithms,
                         TransformerAlgorithmsBase)
NS_IMPL_RELEASE_INHERITED(DecompressionStreamAlgorithms,
                          TransformerAlgorithmsBase)
NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(DecompressionStreamAlgorithms)
NS_INTERFACE_MAP_END_INHERITING(TransformerAlgorithmsBase)

}  // namespace mozilla::dom::compression
