/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * vim: set ts=8 sts=2 et sw=2 tw=80:
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "jit/StubFolding.h"

#include "mozilla/Maybe.h"

#include "gc/GC.h"
#include "jit/BaselineCacheIRCompiler.h"
#include "jit/BaselineIC.h"
#include "jit/CacheIR.h"
#include "jit/CacheIRCloner.h"
#include "jit/CacheIRCompiler.h"
#include "jit/CacheIRSpewer.h"
#include "jit/CacheIRWriter.h"
#include "jit/JitScript.h"
#include "jit/ShapeList.h"

#include "vm/List-inl.h"

using namespace js;
using namespace js::jit;

static bool TryFoldingGuardShapes(JSContext* cx, ICFallbackStub* fallback,
                                  JSScript* script, ICScript* icScript) {
  // Try folding similar stubs with GuardShapes
  // into GuardMultipleShapes

  ICEntry* icEntry = icScript->icEntryForStub(fallback);
  ICStub* entryStub = icEntry->firstStub();
  ICCacheIRStub* firstStub = entryStub->toCacheIRStub();

  // The caller guarantees that there are at least two stubs.
  MOZ_ASSERT(entryStub != fallback);
  MOZ_ASSERT(!firstStub->next()->isFallback());

  const uint8_t* firstStubData = firstStub->stubDataStart();
  const CacheIRStubInfo* stubInfo = firstStub->stubInfo();

  // Check to see if:
  //   a) all of the stubs in this chain have the exact same code.
  //   b) all of the stubs have the same stub field data, except
  //      for a single GuardShape where they differ.
  //   c) at least one stub after the first has a non-zero entry count.
  //   d) All shapes in the GuardShape have the same realm.
  //
  // If all of these conditions hold, then we generate a single stub
  // that covers all the existing cases by replacing GuardShape with
  // GuardMultipleShapes.

  uint32_t numActive = 0;
  mozilla::Maybe<uint32_t> foldableShapeOffset;
  GCVector<Value, 8> shapeList(cx);

  // Helper function: Keep list of different shapes.
  // Can fail on OOM or for cross-realm shapes.
  // Returns true if the shape was successfully added to the list, and false
  // (with no pending exception) otherwise.
  auto addShape = [&shapeList, cx](uintptr_t rawShape) -> bool {
    Shape* shape = reinterpret_cast<Shape*>(rawShape);

    // Only add same realm shapes.
    if (shape->realm() != cx->realm()) {
      return false;
    }

    gc::ReadBarrier(shape);

    if (!shapeList.append(PrivateValue(shape))) {
      cx->recoverFromOutOfMemory();
      return false;
    }
    return true;
  };

  // Find the offset of the first Shape that differs.
  for (ICCacheIRStub* other = firstStub->nextCacheIR(); other;
       other = other->nextCacheIR()) {
    // Verify that the stubs share the same code.
    if (other->stubInfo() != stubInfo) {
      return true;
    }

    if (other->enteredCount() > 0) {
      numActive++;
    }

    if (foldableShapeOffset.isSome()) {
      // Already found.
      // Continue through all stubs to run above code.
      continue;
    }

    const uint8_t* otherStubData = other->stubDataStart();
    uint32_t fieldIndex = 0;
    size_t offset = 0;
    while (stubInfo->fieldType(fieldIndex) != StubField::Type::Limit) {
      StubField::Type fieldType = stubInfo->fieldType(fieldIndex);

      // Continue if the fields have same value.
      if (StubField::sizeIsInt64(fieldType)) {
        if (stubInfo->getStubRawInt64(firstStubData, offset) ==
            stubInfo->getStubRawInt64(otherStubData, offset)) {
          offset += StubField::sizeInBytes(fieldType);
          fieldIndex++;
          continue;
        }
      } else {
        MOZ_ASSERT(StubField::sizeIsWord(fieldType));
        if (stubInfo->getStubRawWord(firstStubData, offset) ==
            stubInfo->getStubRawWord(otherStubData, offset)) {
          offset += StubField::sizeInBytes(fieldType);
          fieldIndex++;
          continue;
        }
      }

      // Early abort if it is a non-shape field that differs.
      if (fieldType != StubField::Type::WeakShape) {
        return true;
      }

      // Save the offset
      foldableShapeOffset.emplace(offset);
      break;
    }
  }

  if (foldableShapeOffset.isNothing()) {
    return true;
  }

  if (numActive == 0) {
    return true;
  }

  // Make sure the shape is the only value that differ.
  // Collect the shape values at the same time.
  for (ICCacheIRStub* stub = firstStub; stub; stub = stub->nextCacheIR()) {
    const uint8_t* stubData = stub->stubDataStart();
    uint32_t fieldIndex = 0;
    size_t offset = 0;

    while (stubInfo->fieldType(fieldIndex) != StubField::Type::Limit) {
      StubField::Type fieldType = stubInfo->fieldType(fieldIndex);
      if (offset == *foldableShapeOffset) {
        // Save the shapes of all stubs.
        MOZ_ASSERT(fieldType == StubField::Type::WeakShape);
        uintptr_t raw = stubInfo->getStubRawWord(stubData, offset);
        if (!addShape(raw)) {
          return true;
        }
      } else {
        // Check all other fields are the same.
        if (StubField::sizeIsInt64(fieldType)) {
          if (stubInfo->getStubRawInt64(firstStubData, offset) !=
              stubInfo->getStubRawInt64(stubData, offset)) {
            return true;
          }
        } else {
          MOZ_ASSERT(StubField::sizeIsWord(fieldType));
          if (stubInfo->getStubRawWord(firstStubData, offset) !=
              stubInfo->getStubRawWord(stubData, offset)) {
            return true;
          }
        }
      }

      offset += StubField::sizeInBytes(fieldType);
      fieldIndex++;
    }
  }

  // Clone the CacheIR and replace
  // - specific GuardShape with GuardMultipleShapes.
  CacheIRWriter writer(cx);
  CacheIRReader reader(stubInfo);
  CacheIRCloner cloner(firstStub);

  // Initialize the operands.
  CacheKind cacheKind = stubInfo->kind();
  for (uint32_t i = 0; i < NumInputsForCacheKind(cacheKind); i++) {
    writer.setInputOperandId(i);
  }

  // Create the shapeList to bake in the new stub.
  Rooted<ListObject*> shapeObj(cx);
  {
    gc::AutoSuppressGC suppressGC(cx);

    shapeObj.set(ShapeListObject::create(cx));

    if (!shapeObj) {
      return false;
    }

    for (uint32_t i = 0; i < shapeList.length(); i++) {
      if (!shapeObj->append(cx, shapeList[i])) {
        cx->recoverFromOutOfMemory();
        return false;
      }

      MOZ_ASSERT(static_cast<Shape*>(shapeList[i].toPrivate())->realm() ==
                 shapeObj->realm());
    }
  }

  bool shapeSuccess = false;
  while (reader.more()) {
    CacheOp op = reader.readOp();
    switch (op) {
      case CacheOp::GuardShape: {
        auto [objId, shapeOffset] = reader.argsForGuardShape();
        if (shapeOffset != *foldableShapeOffset) {
          // Unrelated GuardShape.
          WeakHeapPtr<Shape*>& ptr =
              stubInfo->getStubField<StubField::Type::WeakShape>(firstStub,
                                                                 shapeOffset);
          writer.guardShape(objId, ptr.unbarrieredGet());
          break;
        }

        writer.guardMultipleShapes(objId, shapeObj);
        shapeSuccess = true;
        break;
      }
      default:
        cloner.cloneOp(op, reader, writer);
        break;
    }
  }

  if (!shapeSuccess) {
    // If the shape field that differed was not part of a GuardShape,
    // we can't fold these stubs together.
    return true;
  }

  // Replace the existing stubs with the new folded stub.
  fallback->discardStubs(cx->zone(), icEntry);

  ICAttachResult result = AttachBaselineCacheIRStub(
      cx, writer, cacheKind, script, icScript, fallback, "StubFold");
  if (result == ICAttachResult::OOM) {
    ReportOutOfMemory(cx);
    return false;
  }
  MOZ_ASSERT(result == ICAttachResult::Attached);

  JitSpew(JitSpew_StubFolding,
          "Folded stub at offset %u (icScript: %p) with %zu shapes (%s:%u:%u)",
          fallback->pcOffset(), icScript, shapeList.length(),
          script->filename(), script->lineno(),
          script->column().oneOriginValue());

  fallback->setMayHaveFoldedStub();

  return true;
}

bool js::jit::TryFoldingStubs(JSContext* cx, ICFallbackStub* fallback,
                              JSScript* script, ICScript* icScript) {
  ICEntry* icEntry = icScript->icEntryForStub(fallback);
  ICStub* entryStub = icEntry->firstStub();

  // Don't fold unless there are at least two stubs.
  if (entryStub == fallback) {
    return true;
  }

  ICCacheIRStub* firstStub = entryStub->toCacheIRStub();
  if (firstStub->next()->isFallback()) {
    return true;
  }

  if (!TryFoldingGuardShapes(cx, fallback, script, icScript)) return false;

  return true;
}

bool js::jit::AddToFoldedStub(JSContext* cx, const CacheIRWriter& writer,
                              ICScript* icScript, ICFallbackStub* fallback) {
  ICEntry* icEntry = icScript->icEntryForStub(fallback);
  ICStub* entryStub = icEntry->firstStub();

  // We only update folded stubs if they're the only stub in the IC.
  if (entryStub == fallback) {
    return false;
  }
  ICCacheIRStub* stub = entryStub->toCacheIRStub();
  if (!stub->next()->isFallback()) {
    return false;
  }

  const CacheIRStubInfo* stubInfo = stub->stubInfo();
  const uint8_t* stubData = stub->stubDataStart();

  mozilla::Maybe<uint32_t> shapeFieldOffset;
  RootedValue newShape(cx);
  Rooted<ListObject*> shapeList(cx);

  CacheIRReader stubReader(stubInfo);
  CacheIRReader newReader(writer);
  while (newReader.more() && stubReader.more()) {
    CacheOp newOp = newReader.readOp();
    CacheOp stubOp = stubReader.readOp();
    switch (stubOp) {
      case CacheOp::GuardMultipleShapes: {
        // Check that the new stub has a corresponding GuardShape.
        if (newOp != CacheOp::GuardShape) {
          return false;
        }
        // Check that the object being guarded is the same.
        if (newReader.objOperandId() != stubReader.objOperandId()) {
          return false;
        }

        // Check that the shape offset is the same.
        uint32_t newShapeOffset = newReader.stubOffset();
        uint32_t stubShapesOffset = stubReader.stubOffset();
        if (newShapeOffset != stubShapesOffset) {
          return false;
        }

        MOZ_ASSERT(shapeList == nullptr);
        shapeFieldOffset.emplace(newShapeOffset);

        // Get the shape from the new stub
        StubField shapeField =
            writer.readStubField(newShapeOffset, StubField::Type::WeakShape);
        Shape* shape = reinterpret_cast<Shape*>(shapeField.asWord());
        newShape = PrivateValue(shape);

        // Get the shape array from the old stub.
        JSObject* obj = stubInfo->getStubField<StubField::Type::JSObject>(
            stub, stubShapesOffset);
        shapeList = &obj->as<ShapeListObject>();
        MOZ_ASSERT(shapeList->compartment() == shape->compartment());

        // Don't add a shape if it's from a different realm than the first
        // shape.
        //
        // Since the list was created in the realm which guarded all the shapes
        // added to it, we can use its realm to check and ensure we're not
        // adding a cross-realm shape.
        //
        // The assert verifies this property by checking the first element has
        // the same realm (and since everything in the list has the same realm,
        // checking the first element suffices)
        Realm* shapesRealm = shapeList->realm();
        MOZ_ASSERT_IF(
            !shapeList->isEmpty(),
            shapeList->as<ShapeListObject>().getUnbarriered(0)->realm() ==
                shapesRealm);
        if (shapesRealm != shape->realm()) {
          return false;
        }

        break;
      }
      default: {
        // Check that the op is the same.
        if (newOp != stubOp) {
          return false;
        }

        // Check that the arguments are the same.
        uint32_t argLength = CacheIROpInfos[size_t(newOp)].argLength;
        for (uint32_t i = 0; i < argLength; i++) {
          if (newReader.readByte() != stubReader.readByte()) {
            return false;
          }
        }
      }
    }
  }

  if (shapeFieldOffset.isNothing()) {
    // The stub did not contain the GuardMultipleShapes op. This can happen if a
    // folded stub has been discarded by GC sweeping.
    return false;
  }

  if (!writer.stubDataEqualsIgnoring(stubData, *shapeFieldOffset)) {
    return false;
  }

  ShapeListObject* obj = &shapeList->as<ShapeListObject>();

  // Limit the maximum number of shapes we will add before giving up.
  // If we give up, transition the stub.
  if (obj->length() == ShapeListObject::MaxLength) {
    MOZ_ASSERT(fallback->state().mode() != ICState::Mode::Generic);
    fallback->state().forceTransition();
    fallback->discardStubs(cx->zone(), icEntry);
    return false;
  }

  if (!obj->append(cx, newShape)) {
    cx->recoverFromOutOfMemory();
    return false;
  }

  JitSpew(JitSpew_StubFolding, "ShapeListObject %p: new length: %u",
          shapeList.get(), shapeList->length());

  return true;
}
