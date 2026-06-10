/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

#ifndef wasm_component_h
#define wasm_component_h

#ifdef ENABLE_WASM_COMPONENTS

#  include "js/WasmComponent.h"

#  include "mozilla/HashTable.h"
#  include "mozilla/Maybe.h"
#  include "mozilla/RefPtr.h"
#  include "mozilla/Span.h"
#  include "mozilla/Variant.h"
#  include "mozilla/Vector.h"
#  include "wasm/WasmModule.h"

namespace js {
namespace wasm {

// A "sort", or "kind", of item in the component model, used for all cases where
// we must refer to a different item.
//
// This type is also used for the `externdesc` type, which describes what
// components (not core modules) can import and export, and whose cases are a
// subset of `sort`. Sorts that are valid for `externdesc` have the highest bit
// set. Additionally, sorts that can be exported by core modules (core:sort)
// have the second-highest bit set, and correspond to wasm::DefinitionKind.
enum class ComponentSort : uint8_t {
  Func = 0x80 | 0x01,
  Type = 0x80 | 0x03,
  Component = 0x80 | 0x04,
  Instance = 0x80 | 0x05,

  CoreFunction = 0x40 | int(DefinitionKind::Function),
  CoreTable = 0x40 | int(DefinitionKind::Table),
  CoreMemory = 0x40 | int(DefinitionKind::Memory),
  CoreGlobal = 0x40 | int(DefinitionKind::Global),
  CoreTag = 0x40 | int(DefinitionKind::Tag),

  CoreType = 0x10,
  CoreModule = 0x80 | 0x11,
  CoreInstance = 0x12,
};

// Checks if the given sort is valid for a component import or export (the
// component `externdesc` type).
inline bool ComponentSortValidForExternDesc(ComponentSort sort) {
  return (uint8_t(sort) & 0x80) != 0;
}

// Checks if the given sort is for a core item that can be imported or exported,
// i.e. a DefinitionKind imported into the component model. To extract the
// underlying DefinitionKind, use CoreSortFromComponentSort.
inline bool ComponentSortIsCoreSort(ComponentSort sort) {
  return (uint8_t(sort) & 0x40) != 0;
}

// Extracts the underlying DefinitionKind from a ComponentSort (if there is
// one).
inline DefinitionKind CoreSortFromComponentSort(ComponentSort sort) {
  MOZ_ASSERT(ComponentSortIsCoreSort(sort));
  return DefinitionKind(uint8_t(sort) & ~0xc0);
}

// Every kind of type that can be defined in the component model. Not all types
// are valid in all contexts.
enum class ComponentTypeKind : uint8_t {
  Bool = 0x7f,
  S8 = 0x7e,
  U8 = 0x7d,
  S16 = 0x7c,
  U16 = 0x7b,
  S32 = 0x7a,
  U32 = 0x79,
  S64 = 0x78,
  U64 = 0x77,
  F32 = 0x76,
  F64 = 0x75,
  Char = 0x74,
  String = 0x73,

  Record = 0x72,
  Variant = 0x71,
  List = 0x70,
  Tuple = 0x6f,
  Flags = 0x6e,
  Enum = 0x6d,
  Option = 0x6b,
  Result = 0x6a,
  Own = 0x69,
  Borrow = 0x68,

  Func = 0x40,  // async func types are not a separate kind
  Component = 0x41,
  Instance = 0x42,
  Resource = 0x3f,  // resource types with callbacks are not a separate kind

  // Convenience for ComponentTypeKindIsPrimitive. "First" and "last" refer to
  // the actual byte value.
  FirstPrimitive = String,
  LastPrimitive = Bool,
};

// Checks if the given kind is for a primitive type (`primvaltype`), i.e. one
// that doesn't need to be defined and referenced.
inline bool ComponentTypeKindIsPrimitive(ComponentTypeKind kind) {
  return ComponentTypeKind::FirstPrimitive <= kind &&
         kind <= ComponentTypeKind::LastPrimitive;
}

// Checks if the given kind is for a value type (`valtype`), i.e. one that can
// be used for function parameters.
inline bool ComponentTypeKindIsValueType(ComponentTypeKind kind) {
  return ComponentTypeKindIsPrimitive(kind) ||
         (ComponentTypeKind::Borrow <= kind &&
          kind <= ComponentTypeKind::Record &&
          int(kind) != 0x6c  // the one weird gap in the binary
         );
}

// A value type in the component model, i.e. one that can be used in function
// parameters or other value contexts.
class ComponentValType {
  static constexpr uint32_t TypeIndexFlag = 1 << 31;
  uint32_t bits_;

  explicit ComponentValType(uint32_t bits) : bits_(bits) {}

 public:
  // Creates a ComponentValType for a primitive (i.e. not a type reference).
  static ComponentValType primitive(ComponentTypeKind kind) {
    MOZ_ASSERT(ComponentTypeKindIsPrimitive(kind));
    return ComponentValType(uint32_t(kind));
  }
  // Creates a ComponentValType referencing another type in the component.
  static ComponentValType typeIndex(uint32_t idx) {
    MOZ_ASSERT(!(idx & TypeIndexFlag));
    return ComponentValType(TypeIndexFlag | idx);
  }

  bool isPrimitive() const { return !(bits_ & TypeIndexFlag); }
  bool isTypeIndex() const { return bits_ & TypeIndexFlag; }
  ComponentTypeKind asPrimitive() const {
    MOZ_ASSERT(isPrimitive());
    return ComponentTypeKind(bits_);
  }
  uint32_t asTypeIndex() const {
    MOZ_ASSERT(isTypeIndex());
    return bits_ & ~TypeIndexFlag;
  }
};
using ComponentValTypeVector =
    mozilla::Vector<ComponentValType, 0, SystemAllocPolicy>;

struct ComponentRecordField {
  CacheableName name;
  ComponentValType type;

  ComponentRecordField(CacheableName&& name_, ComponentValType type_)
      : name(std::move(name_)), type(type_) {}
};
using ComponentRecordFieldVector =
    mozilla::Vector<ComponentRecordField, 0, SystemAllocPolicy>;

struct ComponentVariantCase {
  CacheableName name;
  mozilla::Maybe<ComponentValType> type;
};
using ComponentVariantCaseVector =
    mozilla::Vector<ComponentVariantCase, 0, SystemAllocPolicy>;

struct ComponentResultType {
  mozilla::Maybe<ComponentValType> type;
  mozilla::Maybe<ComponentValType> errorType;
};

struct ComponentFuncType {
  ComponentValTypeVector paramTypes;
  CacheableNameVector paramNames;
  mozilla::Maybe<ComponentValType> resultType;
  bool isAsync;
};

// A type defined within a component.
class ComponentDefType {
  ComponentTypeKind kind_;

  // TODO(wasm-cm): Add component types, instance types, resource types?
  using TypeProps = mozilla::Variant<mozilla::Nothing,            // primitive,
                                     ComponentRecordFieldVector,  // record
                                     ComponentVariantCaseVector,  // variant
                                     ComponentValType,        // list, option
                                     ComponentValTypeVector,  // tuple
                                     CacheableNameVector,     // flags, enum
                                     ComponentResultType,     // result
                                     uint32_t,                // own, borrow

                                     ComponentFuncType  // func
                                     >;
  TypeProps props_;

  explicit ComponentDefType(ComponentTypeKind kind)
      : kind_(kind), props_(mozilla::Nothing()) {
    MOZ_ASSERT(ComponentTypeKindIsPrimitive(kind));
  }
  explicit ComponentDefType(ComponentRecordFieldVector&& fields)
      : kind_(ComponentTypeKind::Record), props_(std::move(fields)) {}
  explicit ComponentDefType(ComponentVariantCaseVector&& cases)
      : kind_(ComponentTypeKind::Variant), props_(std::move(cases)) {}
  explicit ComponentDefType(ComponentTypeKind kind, ComponentValType&& type)
      : kind_(kind), props_(std::move(type)) {
    MOZ_ASSERT(kind == ComponentTypeKind::List ||
               kind == ComponentTypeKind::Option);
  }
  explicit ComponentDefType(ComponentValTypeVector&& types)
      : kind_(ComponentTypeKind::Tuple), props_(std::move(types)) {}
  explicit ComponentDefType(ComponentTypeKind kind,
                            CacheableNameVector&& labels)
      : kind_(kind), props_(std::move(labels)) {
    MOZ_ASSERT(kind == ComponentTypeKind::Flags ||
               kind == ComponentTypeKind::Enum);
  }
  explicit ComponentDefType(ComponentResultType&& type)
      : kind_(ComponentTypeKind::Result), props_(std::move(type)) {}
  explicit ComponentDefType(ComponentFuncType&& funcType)
      : kind_(ComponentTypeKind::Func), props_(std::move(funcType)) {}

 public:
  static ComponentDefType primitive(ComponentTypeKind kind) {
    MOZ_ASSERT(ComponentTypeKindIsPrimitive(kind));
    return ComponentDefType(kind);
  }
  static ComponentDefType record(ComponentRecordFieldVector&& fields) {
    return ComponentDefType(std::move(fields));
  }
  static ComponentDefType variant(ComponentVariantCaseVector&& cases) {
    return ComponentDefType(std::move(cases));
  }
  static ComponentDefType list(ComponentValType&& type) {
    return ComponentDefType(ComponentTypeKind::List, std::move(type));
  }
  static ComponentDefType tuple(ComponentValTypeVector&& types) {
    return ComponentDefType(std::move(types));
  }
  static ComponentDefType flags(CacheableNameVector&& labels) {
    return ComponentDefType(ComponentTypeKind::Flags, std::move(labels));
  }
  static ComponentDefType enum_(CacheableNameVector&& labels) {
    return ComponentDefType(ComponentTypeKind::Enum, std::move(labels));
  }
  static ComponentDefType option(ComponentValType&& type) {
    return ComponentDefType(ComponentTypeKind::Option, std::move(type));
  }
  static ComponentDefType result(ComponentResultType&& type) {
    return ComponentDefType(std::move(type));
  }
  static ComponentDefType func(ComponentFuncType&& ft) {
    return ComponentDefType(std::move(ft));
  }

  ComponentTypeKind kind() const { return kind_; }

  const ComponentRecordFieldVector& asRecord() const {
    MOZ_RELEASE_ASSERT(kind() == ComponentTypeKind::Record);
    return props_.as<ComponentRecordFieldVector>();
  }
  const ComponentVariantCaseVector& asVariant() const {
    MOZ_RELEASE_ASSERT(kind() == ComponentTypeKind::Variant);
    return props_.as<ComponentVariantCaseVector>();
  }
  const ComponentValTypeVector& asTuple() const {
    MOZ_RELEASE_ASSERT(kind() == ComponentTypeKind::Tuple);
    return props_.as<ComponentValTypeVector>();
  }
  ComponentValType asOption() const {
    MOZ_RELEASE_ASSERT(kind() == ComponentTypeKind::Option);
    return props_.as<ComponentValType>();
  }
  ComponentResultType asResult() const {
    MOZ_RELEASE_ASSERT(kind() == ComponentTypeKind::Result);
    return props_.as<ComponentResultType>();
  }
  const ComponentFuncType& asFunc() const {
    MOZ_RELEASE_ASSERT(kind() == ComponentTypeKind::Func);
    return props_.as<ComponentFuncType>();
  }
};

class Component;

[[nodiscard]] bool FlattenTypes(const Component& c,
                                const ComponentValTypeVector& types,
                                ValTypeVector* result);
[[nodiscard]] bool FlattenType(const Component& c, const ComponentValType& type,
                               ValTypeVector* result);
[[nodiscard]] bool FlattenRecord(const Component& c,
                                 const ComponentRecordFieldVector& fields,
                                 ValTypeVector* result);
mozilla::Maybe<FuncType> FlattenFuncType(const Component& c,
                                         const ComponentFuncType& funcType);

// A hash policy for StronglyUniqueNameSet that hashes items based on their
// trimmed, lowercased versions, but matches based on the full strongly-unique
// rules.
//
// The full strongly-unique rules are not hash-friendly; we have not yet figured
// out any way to "normalize" the name to a unique key that satisfies the
// strange carve-out rules for constructor and method names. But, we don't want
// to quadratically check each new name against every other name, so we take a
// disappointing halfway approach of hashing only the base part of the name, and
// then running the full strongly-unique logic in `match`. This results in more
// hash collisions and a less-inexpensive `match` method, but at least it keeps
// things from growing quadratically.
struct StronglyUniqueNameHasher {
  using Key = mozilla::Span<const char>;
  using Lookup = mozilla::Span<const char>;

  static HashNumber hash(const Lookup& aLookup);
  static bool match(const Key& aKey, const Lookup& aLookup);
};

// A class which can be used to check if a set of component model names is
// strongly-unique.
class StronglyUniqueNameSet {
  mozilla::HashSet<mozilla::Span<const char>, StronglyUniqueNameHasher,
                   SystemAllocPolicy>
      data_;

 public:
  [[nodiscard]] bool add(mozilla::Span<const char> name, bool* duplicate);
};

struct ComponentCanonOpt {
  // TODO(wasm-cm)
};

using ComponentCanonOptVector =
    mozilla::Vector<ComponentCanonOpt, 0, SystemAllocPolicy>;

struct ComponentLiftedFuncDesc {
  // TODO(wasm-cm): Actually store something useful here. I'm not sure at the
  // moment if it makes sense to store the raw index, options, and dest type, or
  // to store some kind of new value here. It will all depend on what
  // instantiation actually looks like. So not touching it for now.
};

// An alias to another item defined in the component model, usually in a core or
// component instance, but also possibly an "outer" alias referring to an item
// defined in a parent component.
//
// All three possible kinds of aliases (component export, core export, and
// outer) boil down to two u32 indexes, the first referring to a component
// instance or core instance, and the second referring to an item within some
// index space on that instance.
class ComponentAlias {
  // For export aliases, the index of the component instance or core instance.
  // For outer aliases, the number of enclosing components to jump out to.
  uint32_t instanceIndex_;

  // The index of the aliased item in its component instance or core instance.
  uint32_t innerIndex_;

  // Whether the alias is to be interpreted as an outer alias.
  bool isOuter_;

  // Whether `instanceIdx` refers to a core instance or component instance.
  bool isCoreInstance_;

  // The sort of item being aliased.
  ComponentSort sort_;

  explicit ComponentAlias(uint32_t instanceIdx, uint32_t innerIdx,
                          ComponentSort sort, bool isOuter, bool isCoreInstance)
      : instanceIndex_(instanceIdx),
        innerIndex_(innerIdx),
        isOuter_(isOuter),
        isCoreInstance_(isCoreInstance),
        sort_(sort) {}

 public:
  static ComponentAlias fromExport(uint32_t instanceIdx, uint32_t innerIdx,
                                   ComponentSort sort) {
    MOZ_ASSERT(!ComponentSortIsCoreSort(sort));
    return ComponentAlias(instanceIdx, innerIdx, sort, /*isOuter=*/false,
                          /*isCoreInstance=*/false);
  }
  static ComponentAlias fromCoreExport(uint32_t instanceIdx, uint32_t innerIdx,
                                       ComponentSort sort) {
    MOZ_ASSERT(ComponentSortIsCoreSort(sort));
    return ComponentAlias(instanceIdx, innerIdx, sort, /*isOuter=*/false,
                          /*isCoreInstance=*/true);
  }
  static ComponentAlias outer(uint32_t count, uint32_t index,
                              ComponentSort sort) {
    MOZ_ASSERT(!ComponentSortIsCoreSort(sort));
    return ComponentAlias(count, index, sort, /*isOuter=*/true,
                          /*isCoreInstance=*/false);
  }

  bool isExport() const { return !isOuter_ && !isCoreInstance_; }
  bool isCoreExport() const { return !isOuter_ && isCoreInstance_; }
  bool isOuter() const {
    MOZ_ASSERT(!isCoreInstance_);
    return isOuter_;
  }

  ComponentSort sort() const { return sort_; }
  uint32_t instanceIndex() const { return instanceIndex_; }
  uint32_t itemIndex() const { return innerIndex_; }
};

struct CoreInstanceInstantiateArg {
  CacheableName name;
  uint32_t instanceIndex;
};

using CoreInstanceInstantiateArgVector =
    mozilla::Vector<CoreInstanceInstantiateArg, 0, SystemAllocPolicy>;

// Instructions for instantiating a core instance from a core module,
// corresponding to this text production:
//
//     (core instance (instantiate <modidx>) (with ...)*)`
//
struct CoreInstanceDescFromModule {
  // The core module to instantiate.
  uint32_t moduleIndex;

  // The instance's "with" declarations. In the binary format there is no inline
  // export form, only a form that uses the exports of another core instance.
  CoreInstanceInstantiateArgVector args;
};

// Instructions for instantiating a core instance by re-exporting core items
// already present in the component's index spaces. Corresponds to this text:
//
//     (core instance (export ...)*)
//
// This form of core instantiation semantically creates a new anonymous module
// which imports the given definitions and re-exports them. Alternatively, you
// can consider it a mere renaming of the items exported by other modules, but
// creating an anonymous module simplifies our implementation. Note that the
// module does not live in the component's core module index space.
//
// TODO(wasm-cm): Fill this out and figure out how to satisfy the module's
// imports.
struct CoreInstanceDescFromInlineExports {
  SharedModule mod;
};

// Instructions for instantiating a core instance.
using CoreInstanceDesc = mozilla::Variant<CoreInstanceDescFromModule,
                                          CoreInstanceDescFromInlineExports>;

// Describes an import or export from a wasm component.
class ComponentExternDesc {
  ComponentSort sort_;

  // Used for kinds CoreModule, Func, Component, Instance, and the `eq` case of
  // Type.
  uint32_t typeIndex_;

  explicit ComponentExternDesc(ComponentSort sort) : sort_(sort) {
    MOZ_ASSERT(ComponentSortValidForExternDesc(sort));
  }

 public:
  ComponentExternDesc() = default;

  static ComponentExternDesc func(uint32_t funcTypeIndex) {
    ComponentExternDesc desc(ComponentSort::Func);
    desc.typeIndex_ = funcTypeIndex;
    return desc;
  }
  static ComponentExternDesc coreModule(uint32_t coreModuleTypeIndex) {
    ComponentExternDesc desc(ComponentSort::CoreModule);
    desc.typeIndex_ = coreModuleTypeIndex;
    return desc;
  }

  ComponentSort sort() const { return sort_; }
};

class ComponentImport {
  CacheableName name_;
  ComponentExternDesc externDesc_;

 public:
  explicit ComponentImport(CacheableName&& name,
                           const ComponentExternDesc& externDesc)
      : name_(std::move(name)), externDesc_(externDesc) {}

  const CacheableName& name() const { return name_; }
  const ComponentExternDesc& externDesc() const { return externDesc_; }
};

class ComponentExport {
  CacheableName name_;
  ComponentSort sort_;
  uint32_t index_;

 public:
  explicit ComponentExport(CacheableName&& name, ComponentSort sort,
                           uint32_t index)
      : name_(std::move(name)), sort_(sort), index_(index) {}

  const CacheableName& name() const { return name_; }
  ComponentSort sort() const { return sort_; }
  uint32_t index() const { return index_; }
};

class Component : public JS::WasmComponent {
  using CoreModuleVector = mozilla::Vector<SharedModule, 0, SystemAllocPolicy>;
  using CoreInstanceVector =
      mozilla::Vector<CoreInstanceDesc, 0, SystemAllocPolicy>;
  using TypeVector = mozilla::Vector<ComponentDefType, 0, SystemAllocPolicy>;
  using FuncVector =
      mozilla::Vector<ComponentLiftedFuncDesc, 0, SystemAllocPolicy>;
  using ImportVector = Vector<ComponentImport, 0, SystemAllocPolicy>;
  using ExportVector = Vector<ComponentExport, 0, SystemAllocPolicy>;
  using AliasVector = Vector<ComponentAlias, 0, SystemAllocPolicy>;

  // JS API and JS::WasmComponent implementation:
  JSObject* createObject(JSContext* cx) const override;

 public:
  CoreModuleVector coreModules;
  CoreInstanceVector coreInstances;
  TypeVector types;
  FuncVector funcs;
  ImportVector imports;
  ExportVector exports;

  AliasVector
      coreFuncs;  // TODO(wasm-cm): This will have to accommodate lowered funcs
  AliasVector coreTables;
  AliasVector coreMemories;
  AliasVector coreGlobals;
  AliasVector coreTags;

  const FuncType& typeForCoreFunc(uint32_t coreFuncIndex) {
    const ComponentAlias& alias = coreFuncs[coreFuncIndex];
    SharedModule mod = moduleForCoreInstance(alias.instanceIndex());
    return mod->codeMeta().getFuncType(alias.itemIndex());
  }

  SharedModule moduleForCoreInstance(uint32_t instanceIndex) {
    CoreInstanceDesc& instance = coreInstances[instanceIndex];

    return instance.match(
        [&coreModules = this->coreModules](CoreInstanceDescFromModule& desc) {
          return coreModules[desc.moduleIndex];
        },
        [](CoreInstanceDescFromInlineExports& desc) { return desc.mod; });
  }

  size_t gcMallocBytesExcludingCode() const {
    // TODO(wasm-cm): Right now, this only sums up the sizes of the inner
    // modules, but this is not an accurate picture of a component's memory
    // footprint.
    size_t total = 0;
    for (const SharedModule& module : coreModules) {
      total += module->gcMallocBytesExcludingCode();
    }
    return total;
  }

  size_t tier1CodeMemoryUsed() const {
    // TODO(wasm-cm): As above, this only sums up the memory for core modules,
    // and does not account for other potential code memory.
    size_t total = 0;
    for (const SharedModule& module : coreModules) {
      total += module->tier1CodeMemoryUsed();
    }
    return total;
  }
};

using MutableComponent = RefPtr<Component>;
using SharedComponent = RefPtr<const Component>;

}  // namespace wasm
}  // namespace js

#endif  // ENABLE_WASM_COMPONENTS

#endif  // wasm_component_h
