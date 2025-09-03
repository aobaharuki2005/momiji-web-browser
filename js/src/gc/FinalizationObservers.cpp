/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * vim: set ts=8 sts=2 et sw=2 tw=80:
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * GC support for FinalizationRegistry and WeakRef objects.
 */

#include "gc/FinalizationObservers.h"

#include "mozilla/ScopeExit.h"

#include "builtin/FinalizationRegistryObject.h"
#include "builtin/WeakRefObject.h"
#include "gc/GCRuntime.h"
#include "gc/Zone.h"
#include "vm/JSContext.h"

#include "gc/WeakMap-inl.h"
#include "vm/JSObject-inl.h"
#include "vm/NativeObject-inl.h"

using namespace js;
using namespace js::gc;

/* static */
ObserverListPtr ObserverListPtr::fromValue(Value value) {
  MOZ_ASSERT(value.isDouble());  // Stored as PrivateValue.
  return ObserverListPtr(value);
}

ObserverListPtr::ObserverListPtr(ObserverListObject* element)
    : ObserverListPtr(element, ElementKind) {}

ObserverListPtr::ObserverListPtr(ObserverList* list)
    : ObserverListPtr(list, ListHeadKind) {}

ObserverListPtr::ObserverListPtr(void* ptr, Kind kind)
    : value(PrivateValue(uintptr_t(ptr) | kind)) {
  MOZ_ASSERT((uintptr_t(ptr) & KindMask) == 0);
}

ObserverListPtr::ObserverListPtr(Value value) : value(value) {}

template <typename F>
auto ObserverListPtr::map(F&& func) const {
  if (isElement()) {
    return func(asElement());
  }

  return func(asList());
}

bool ObserverListPtr::isElement() const { return kind() == ElementKind; }

ObserverListPtr::Kind ObserverListPtr::kind() const {
  uintptr_t bits = uintptr_t(value.toPrivate());
  return static_cast<Kind>(bits & KindMask);
}

void* ObserverListPtr::ptr() const {
  uintptr_t bits = uintptr_t(value.toPrivate());
  return reinterpret_cast<void*>(bits & ~KindMask);
}

ObserverListObject* ObserverListPtr::asElement() const {
  MOZ_ASSERT(isElement());
  return static_cast<ObserverListObject*>(ptr());
}

ObserverList* ObserverListPtr::asList() const {
  MOZ_ASSERT(!isElement());
  return static_cast<ObserverList*>(ptr());
}

ObserverListPtr ObserverListPtr::getNext() const {
  return map([](auto* element) { return element->getNext(); });
}

ObserverListPtr ObserverListPtr::getPrev() const {
  return map([](auto* element) { return element->getPrev(); });
}

void ObserverListPtr::setNext(ObserverListPtr next) {
  map([next](auto* element) { element->setNext(next); });
}

/* static */
void ObserverListPtr::setPrev(ObserverListPtr prev) {
  map([prev](auto* element) { element->setPrev(prev); });
}

// An iterator for ObserverList that allows removing the current element from
// the list.
class ObserverList::Iter {
  using Ptr = ObserverListPtr;
  const Ptr end;
  Ptr ptr;
  Ptr nextPtr;

 public:
  explicit Iter(ObserverList& list)
      : end(&list), ptr(end.getNext()), nextPtr(ptr.getNext()) {
    MOZ_ASSERT(list.isEmpty() == done());
  }

  bool done() const { return ptr == end; }

  ObserverListObject* get() const {
    MOZ_ASSERT(!done());
    return ptr.asElement();
  }

  void next() {
    MOZ_ASSERT(!done());
    ptr = nextPtr;
    nextPtr = ptr.getNext();
  }

  operator ObserverListObject*() const { return get(); }
  ObserverListObject* operator->() const { return get(); }
};

ObserverList::ObserverList() : next(this), prev(this) { MOZ_ASSERT(isEmpty()); }

ObserverList::~ObserverList() { MOZ_ASSERT(isEmpty()); }

ObserverList::ObserverList(ObserverList&& other) : ObserverList() {
  MOZ_ASSERT(&other != this);
  *this = std::move(other);
}
ObserverList& ObserverList::operator=(ObserverList&& other) {
  MOZ_ASSERT(&other != this);
  MOZ_ASSERT(isEmpty());

  AutoTouchingGrayThings atgt;

  if (other.isEmpty()) {
    return *this;
  }

  next = other.next;
  prev = other.prev;

  // Check other's list head is correctly linked to its neighbours.
  MOZ_ASSERT(next.getPrev().asList() == &other);
  MOZ_ASSERT(prev.getNext().asList() == &other);

  // Update those neighbours to point to this object.
  next.setPrev(this);
  prev.setNext(this);

  other.next = &other;
  other.prev = &other;
  MOZ_ASSERT(other.isEmpty());

  return *this;
}

bool ObserverList::isEmpty() const {
  ObserverListPtr thisLink = const_cast<ObserverList*>(this);
  MOZ_ASSERT((getNext() == thisLink) == (getPrev() == thisLink));
  return getNext() == thisLink;
}

ObserverListObject* ObserverList::getFirst() const {
  MOZ_ASSERT(!isEmpty());
  return next.asElement();
}

ObserverList::Iter ObserverList::iter() { return Iter(*this); }

void ObserverList::insertFront(ObserverListObject* obj) {
  MOZ_ASSERT(!obj->isInList());

  Ptr oldNext = getNext();

  setNext(obj);
  obj->setNext(oldNext);

  oldNext.setPrev(obj);
  obj->setPrev(this);
}

void ObserverList::setNext(Ptr link) { next = link; }

void ObserverList::setPrev(Ptr link) { prev = link; }

/* static */
const ClassExtension ObserverListObject::classExtension_ = {
    ObserverListObject::objectMoved,  // objectMovedOp
};

bool ObserverListObject::isInList() const {
  bool inList = !getReservedSlot(NextSlot).isUndefined();
  MOZ_ASSERT(inList == !getReservedSlot(PrevSlot).isUndefined());
  return inList;
}

/* static */
size_t ObserverListObject::objectMoved(JSObject* obj, JSObject* old) {
  auto* self = static_cast<ObserverListObject*>(obj);
  self->objectMovedFrom(static_cast<ObserverListObject*>(old));
  return 0;
}

void ObserverListObject::objectMovedFrom(ObserverListObject* old) {
  AutoTouchingGrayThings atgt;

  if (!isInList()) {
    return;
  }

#ifdef DEBUG
  Ptr oldPtr = old;
  MOZ_ASSERT(getNext() != oldPtr);
  MOZ_ASSERT(getPrev() != oldPtr);
  MOZ_ASSERT(getNext().getPrev() == oldPtr);
  MOZ_ASSERT(getPrev().getNext() == oldPtr);
#endif

  getNext().setPrev(this);
  getPrev().setNext(this);
}

void ObserverListObject::unlink() {
  AutoTouchingGrayThings atgt;

  if (!isInList()) {
    return;
  }

  Ptr next = getNext();
  Ptr prev = getPrev();

#ifdef DEBUG
  Ptr thisPtr = this;
  MOZ_ASSERT(prev.getNext() == thisPtr);
  MOZ_ASSERT(next.getPrev() == thisPtr);
#endif

  next.setPrev(prev);
  prev.setNext(next);

  setReservedSlot(NextSlot, UndefinedValue());
  setReservedSlot(PrevSlot, UndefinedValue());
  MOZ_ASSERT(!isInList());
}

ObserverListPtr ObserverListObject::getNext() const {
  Value value = getReservedSlot(NextSlot);
  return Ptr::fromValue(value);
}

ObserverListPtr ObserverListObject::getPrev() const {
  Value value = getReservedSlot(PrevSlot);
  return Ptr::fromValue(value);
}

void ObserverListObject::setNext(Ptr next) {
  setReservedSlot(NextSlot, next.asValue());
}

void ObserverListObject::setPrev(Ptr prev) {
  setReservedSlot(PrevSlot, prev.asValue());
}

FinalizationObservers::FinalizationObservers(Zone* zone)
    : zone(zone),
      registries(zone),
      recordMap(zone),
      crossZoneRecords(zone),
      weakRefMap(zone) {}

FinalizationObservers::~FinalizationObservers() {
  MOZ_ASSERT(registries.empty());
  MOZ_ASSERT(recordMap.empty());
  MOZ_ASSERT(crossZoneRecords.empty());
}

bool GCRuntime::addFinalizationRegistry(
    JSContext* cx, Handle<FinalizationRegistryObject*> registry) {
  if (!cx->zone()->ensureFinalizationObservers() ||
      !cx->zone()->finalizationObservers()->addRegistry(registry)) {
    ReportOutOfMemory(cx);
    return false;
  }

  return true;
}

bool FinalizationObservers::addRegistry(
    Handle<FinalizationRegistryObject*> registry) {
  return registries.put(registry);
}

bool GCRuntime::registerWithFinalizationRegistry(JSContext* cx,
                                                 HandleObject target,
                                                 HandleObject record) {
  MOZ_ASSERT(!IsCrossCompartmentWrapper(target));
  MOZ_ASSERT(
      UncheckedUnwrapWithoutExpose(record)->is<FinalizationRecordObject>());
  MOZ_ASSERT(target->compartment() == record->compartment());

  Zone* zone = cx->zone();
  if (!zone->ensureFinalizationObservers() ||
      !zone->finalizationObservers()->addRecord(target, record)) {
    ReportOutOfMemory(cx);
    return false;
  }

  return true;
}

bool FinalizationObservers::addRecord(HandleObject target,
                                      HandleObject record) {
  // Add a record to the record map and clean up on failure.
  //
  // The following must be updated and kept in sync:
  //  - the zone's recordMap (to observe the target)
  //  - the registry's global objects's recordSet (to trace the record)
  //  - the count of cross zone records (to calculate sweep groups)

  MOZ_ASSERT(target->zone() == zone);

  FinalizationRecordObject* unwrappedRecord =
      &UncheckedUnwrapWithoutExpose(record)->as<FinalizationRecordObject>();

  Zone* registryZone = unwrappedRecord->zone();
  bool crossZone = registryZone != zone;
  if (crossZone && !addCrossZoneWrapper(crossZoneRecords, record)) {
    return false;
  }
  auto wrapperGuard = mozilla::MakeScopeExit([&] {
    if (crossZone) {
      removeCrossZoneWrapper(crossZoneRecords, record);
    }
  });

  GlobalObject* registryGlobal = &unwrappedRecord->global();
  auto* globalData = registryGlobal->getOrCreateFinalizationRegistryData();
  if (!globalData || !globalData->addRecord(unwrappedRecord)) {
    return false;
  }
  auto globalDataGuard = mozilla::MakeScopeExit(
      [&] { globalData->removeRecord(unwrappedRecord); });

  auto ptr = recordMap.lookupForAdd(target);
  if (!ptr && !recordMap.add(ptr, target, RecordVector(zone))) {
    return false;
  }

  if (!ptr->value().append(record)) {
    return false;
  }

  unwrappedRecord->setInRecordMap(true);

  globalDataGuard.release();
  wrapperGuard.release();
  return true;
}

bool FinalizationObservers::addCrossZoneWrapper(WrapperWeakSet& weakSet,
                                                JSObject* wrapper) {
  MOZ_ASSERT(IsCrossCompartmentWrapper(wrapper));
  MOZ_ASSERT(UncheckedUnwrapWithoutExpose(wrapper)->zone() != zone);

  auto ptr = weakSet.lookupForAdd(wrapper);
  MOZ_ASSERT(!ptr);
  return weakSet.add(ptr, wrapper, UndefinedValue());
}

void FinalizationObservers::removeCrossZoneWrapper(WrapperWeakSet& weakSet,
                                                   JSObject* wrapper) {
  MOZ_ASSERT(IsCrossCompartmentWrapper(wrapper));
  MOZ_ASSERT(UncheckedUnwrapWithoutExpose(wrapper)->zone() != zone);

  auto ptr = weakSet.lookupForAdd(wrapper);
  MOZ_ASSERT(ptr);
  weakSet.remove(ptr);
}

static FinalizationRecordObject* UnwrapFinalizationRecord(JSObject* obj) {
  obj = UncheckedUnwrapWithoutExpose(obj);
  if (!obj->is<FinalizationRecordObject>()) {
    MOZ_ASSERT(JS_IsDeadWrapper(obj));
    // CCWs between the compartments have been nuked. The
    // FinalizationRegistry's callback doesn't run in this case.
    return nullptr;
  }
  return &obj->as<FinalizationRecordObject>();
}

void FinalizationObservers::clearRecords() {
  // Clear table entries related to FinalizationRecordObjects, which are not
  // processed after the start of shutdown.
  //
  // WeakRefs are still updated during shutdown to avoid the possibility of
  // stale or dangling pointers.

#ifdef DEBUG
  checkTables();
#endif

  recordMap.clear();
  crossZoneRecords.clear();
}

void GCRuntime::traceWeakFinalizationObserverEdges(JSTracer* trc, Zone* zone) {
  MOZ_ASSERT(CurrentThreadCanAccessRuntime(trc->runtime()));
  FinalizationObservers* observers = zone->finalizationObservers();
  if (observers) {
    observers->traceWeakEdges(trc);
  }
}

void FinalizationObservers::traceRoots(JSTracer* trc) {
  // The cross-zone wrapper weak maps are traced as roots; this does not keep
  // any of their entries alive by itself.
  crossZoneRecords.trace(trc);
}

void FinalizationObservers::traceWeakEdges(JSTracer* trc) {
  // Removing dead pointers from vectors may reorder live pointers to gray
  // things in the vector. This is OK.
  AutoTouchingGrayThings atgt;

  traceWeakWeakRefEdges(trc);
  traceWeakFinalizationRegistryEdges(trc);
}

void FinalizationObservers::traceWeakFinalizationRegistryEdges(JSTracer* trc) {
  // Sweep finalization registry data and queue finalization records for cleanup
  // for any entries whose target is dying and remove them from the map.

  GCRuntime* gc = &trc->runtime()->gc;

  for (RegistrySet::Enum e(registries); !e.empty(); e.popFront()) {
    auto result = TraceWeakEdge(trc, &e.mutableFront(), "FinalizationRegistry");
    if (result.isDead()) {
      auto* registry =
          &result.initialTarget()->as<FinalizationRegistryObject>();
      registry->queue()->setHasRegistry(false);
      e.removeFront();
    } else {
      result.finalTarget()->as<FinalizationRegistryObject>().traceWeak(trc);
    }
  }

  for (RecordMap::Enum e(recordMap); !e.empty(); e.popFront()) {
    RecordVector& records = e.front().value();

    // Sweep finalization records, updating any pointers moved by the GC and
    // remove if necessary.
    records.mutableEraseIf([&](HeapPtr<JSObject*>& heapPtr) {
      auto result = TraceWeakEdge(trc, &heapPtr, "FinalizationRecord");
      JSObject* obj =
          result.isLive() ? result.finalTarget() : result.initialTarget();
      FinalizationRecordObject* record = UnwrapFinalizationRecord(obj);
      MOZ_ASSERT_IF(record, record->isInRecordMap());

      bool shouldRemove = !result.isLive() || shouldRemoveRecord(record);
      if (shouldRemove && record && record->isInRecordMap()) {
        updateForRemovedRecord(obj, record);
      }

      return shouldRemove;
    });

#ifdef DEBUG
    for (JSObject* obj : records) {
      MOZ_ASSERT(UnwrapFinalizationRecord(obj)->isInRecordMap());
    }
#endif

    // Queue finalization records for targets that are dying.
    if (!TraceWeakEdge(trc, &e.front().mutableKey(),
                       "FinalizationRecord target")) {
      for (JSObject* obj : records) {
        FinalizationRecordObject* record = UnwrapFinalizationRecord(obj);
        FinalizationQueueObject* queue = record->queue();
        updateForRemovedRecord(obj, record);
        queue->queueRecordToBeCleanedUp(record);
        gc->queueFinalizationRegistryForCleanup(queue);
      }
      e.removeFront();
    }
  }
}

// static
bool FinalizationObservers::shouldRemoveRecord(
    FinalizationRecordObject* record) {
  // Records are removed from the target's vector for the following reasons:
  return !record ||                        // Nuked CCW to record.
         !record->isRegistered() ||        // Unregistered record.
         !record->queue()->hasRegistry();  // Dead finalization registry.
}

void FinalizationObservers::updateForRemovedRecord(
    JSObject* wrapper, FinalizationRecordObject* record) {
  // Remove other references to a record when it has been removed from the
  // zone's record map. See addRecord().
  MOZ_ASSERT(record->isInRecordMap());

  Zone* registryZone = record->zone();
  if (registryZone != zone) {
    removeCrossZoneWrapper(crossZoneRecords, wrapper);
  }

  GlobalObject* registryGlobal = &record->global();
  auto* globalData = registryGlobal->maybeFinalizationRegistryData();
  globalData->removeRecord(record);

  // The removed record may be gray, and that's OK.
  AutoTouchingGrayThings atgt;

  record->setInRecordMap(false);
}

void GCRuntime::nukeFinalizationRecordWrapper(
    JSObject* wrapper, FinalizationRecordObject* record) {
  // The target of the nuked wrapper may be gray, and that's OK.
  AutoTouchingGrayThings atgt;

  if (record->isInRecordMap()) {
    FinalizationRegistryObject::unregisterRecord(record);
    FinalizationObservers* observers = wrapper->zone()->finalizationObservers();
    observers->updateForRemovedRecord(wrapper, record);
  }
}

void GCRuntime::queueFinalizationRegistryForCleanup(
    FinalizationQueueObject* queue) {
  // Prod the embedding to call us back later to run the finalization callbacks,
  // if necessary.

  if (queue->isQueuedForCleanup()) {
    return;
  }

  JSObject* unwrappedHostDefineData = nullptr;

  if (JSObject* wrapped = queue->getHostDefinedData()) {
    unwrappedHostDefineData = UncheckedUnwrapWithoutExpose(wrapped);
    MOZ_ASSERT(unwrappedHostDefineData);
    // If the hostDefined object becomes a dead wrapper here, the target global
    // has already gone, and the finalization callback won't do anything to it
    // anyway.
    if (JS_IsDeadWrapper(unwrappedHostDefineData)) {
      return;
    }
  }

  callHostCleanupFinalizationRegistryCallback(queue->doCleanupFunction(),
                                              unwrappedHostDefineData);

  // The queue object may be gray, and that's OK.
  AutoTouchingGrayThings atgt;

  queue->setQueuedForCleanup(true);
}

// Register |target| such that when it dies |weakRef| will have its pointer to
// |target| cleared.
bool GCRuntime::registerWeakRef(JSContext* cx, HandleObject target,
                                Handle<WeakRefObject*> weakRef) {
  MOZ_ASSERT(!IsCrossCompartmentWrapper(target));

  Zone* zone = target->zone();
  if (!zone->ensureFinalizationObservers() ||
      !zone->finalizationObservers()->addWeakRefTarget(target, weakRef)) {
    ReportOutOfMemory(cx);
    return false;
  }

  return true;
}

bool FinalizationObservers::addWeakRefTarget(HandleObject target,
                                             Handle<WeakRefObject*> weakRef) {
  auto ptr = weakRefMap.lookupForAdd(target);
  if (!ptr && !weakRefMap.relookupOrAdd(ptr, target, ObserverList())) {
    return false;
  }

  ptr->value().insertFront(weakRef);
  return true;
}

void FinalizationObservers::removeWeakRefTarget(
    Handle<JSObject*> target, Handle<WeakRefObject*> weakRef) {
  MOZ_ASSERT(target);
  MOZ_ASSERT(weakRef->target() == target);

  MOZ_ASSERT(weakRef->isInList());
  weakRef->clearTargetAndUnlink();

  auto ptr = weakRefMap.lookup(target);
  MOZ_ASSERT(ptr);
  ObserverList& list = ptr->value();
  if (list.isEmpty()) {
    weakRefMap.remove(ptr);
  }
}

void FinalizationObservers::traceWeakWeakRefEdges(JSTracer* trc) {
  for (WeakRefMap::Enum e(weakRefMap); !e.empty(); e.popFront()) {
    ObserverList& weakRefs = e.front().value();
    auto result = TraceWeakEdge(trc, &e.front().mutableKey(), "WeakRef target");
    if (result.isDead()) {
      // Clear the observer list if the target is dying.
      while (!weakRefs.isEmpty()) {
        auto* weakRef = &weakRefs.getFirst()->as<WeakRefObject>();
        weakRef->clearTargetAndUnlink();
      }
      e.removeFront();
    } else if (result.finalTarget() != result.initialTarget()) {
      // Update WeakRef targets if the target has been moved.
      traceWeakWeakRefList(trc, weakRefs, result.finalTarget());
    }
  }
}

void FinalizationObservers::traceWeakWeakRefList(JSTracer* trc,
                                                 ObserverList& weakRefs,
                                                 JSObject* target) {
  MOZ_ASSERT(!IsForwarded(target));

  for (auto iter = weakRefs.iter(); !iter.done(); iter.next()) {
    auto* weakRef = &iter.get()->as<WeakRefObject>();
    MOZ_ASSERT(!IsForwarded(weakRef));
    if (weakRef->target() != target) {
      MOZ_ASSERT(MaybeForwarded(weakRef->target()) == target);
      weakRef->setTargetUnbarriered(target);
    }
  }
}

#ifdef DEBUG
void FinalizationObservers::checkTables() const {
  // Check all cross-zone wrappers are present in the appropriate table.
  size_t recordCount = 0;
  for (auto r = recordMap.all(); !r.empty(); r.popFront()) {
    for (JSObject* object : r.front().value()) {
      FinalizationRecordObject* record = UnwrapFinalizationRecord(object);
      if (record && record->isInRecordMap() && record->zone() != zone) {
        MOZ_ASSERT(crossZoneRecords.has(object));
        recordCount++;
      }
    }
  }
  MOZ_ASSERT(crossZoneRecords.count() == recordCount);
}
#endif

FinalizationRegistryGlobalData::FinalizationRegistryGlobalData(Zone* zone)
    : recordSet(zone) {}

bool FinalizationRegistryGlobalData::addRecord(
    FinalizationRecordObject* record) {
  return recordSet.putNew(record);
}

void FinalizationRegistryGlobalData::removeRecord(
    FinalizationRecordObject* record) {
  MOZ_ASSERT_IF(!record->runtimeFromMainThread()->gc.isShuttingDown(),
                recordSet.has(record));
  recordSet.remove(record);
}

void FinalizationRegistryGlobalData::trace(JSTracer* trc) {
  recordSet.trace(trc);
}
