/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * vim: set ts=8 sts=2 et sw=2 tw=80:
 *
 * Copyright 2025 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#include "wasm/WasmContext.h"

#include "js/friend/StackLimits.h"
#include "js/TracingAPI.h"
#include "vm/JSContext.h"

#include "wasm/WasmPI.h"

using namespace js::wasm;

Context::Context()
    : triedToInstallSignalHandlers(false),
      haveSignalHandlers(false),
      stackLimit(JS::NativeStackLimitMin)
#ifdef ENABLE_WASM_JSPI
      ,
      activeSuspender_(nullptr),
      onSuspendableStack(0),
      suspendableStacksCount(0),
      suspendedStacks_()
#endif
{
}

Context::~Context() {
#ifdef ENABLE_WASM_JSPI
  MOZ_ASSERT(activeSuspender_ == nullptr);
  MOZ_ASSERT(suspendedStacks_.isEmpty());
#endif
}

void Context::initStackLimit(JSContext* cx) {
  // The wasm stack limit is the same as the jit stack limit. We also don't
  // use the stack limit for triggering interrupts.
  stackLimit = cx->jitStackLimitNoInterrupt;
}

#ifdef ENABLE_WASM_JSPI
SuspenderObject* Context::activeSuspender() { return activeSuspender_; }

void Context::trace(JSTracer* trc) {
  if (activeSuspender_) {
    TraceEdge(trc, &activeSuspender_, "suspender");
  }
}

void Context::traceRoots(JSTracer* trc) {
  // The suspendedStacks_ contains suspended stacks frames that need to be
  // traced only during minor GC. The major GC tracing is happening via
  // SuspenderObject::trace.
  // Non-suspended stack frames are traced as part of TraceJitActivations.
  if (!trc->isTenuringTracer()) {
    return;
  }
  gc::AssertRootMarkingPhase(trc);
  for (const SuspenderObjectData& data : suspendedStacks_) {
    TraceSuspendableStack(trc, data);
  }
}

void Context::enterSuspendableStack(SuspenderObject* suspender,
                                    JS::NativeStackLimit newStackLimit) {
  MOZ_ASSERT(onSuspendableStack == 0);
  MOZ_ASSERT(!activeSuspender_);
  activeSuspender_ = suspender;
  onSuspendableStack = 1;
  stackLimit = newStackLimit;
}

void Context::leaveSuspendableStack(JSContext* cx) {
  MOZ_ASSERT(onSuspendableStack != 0);
  MOZ_ASSERT(activeSuspender_);
  activeSuspender_ = nullptr;
  onSuspendableStack = 0;
  initStackLimit(cx);
}

bool js::IsSuspendableStackActive(JSContext* cx) {
  return cx->wasm().onSuspendableStack != 0;
}

JS::NativeStackLimit js::GetSuspendableStackLimit(JSContext* cx) {
  MOZ_ASSERT(IsSuspendableStackActive(cx));
  return cx->wasm().stackLimit;
}
#endif
