/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

#include "wasm/WasmComponent.h"

#ifdef ENABLE_WASM_COMPONENTS

#  include "js/friend/ErrorMessages.h"  // js::GetErrorMessage, JSMSG_*
#  include "util/Text.h"
#  include "vm/GlobalObject.h"
#  include "wasm/WasmJS.h"

using namespace js;
using namespace js::wasm;

static constexpr mozilla::Span<const char> attributeConstructor =
    mozilla::MakeStringSpan("[constructor]");
static constexpr mozilla::Span<const char> attributeMethod =
    mozilla::MakeStringSpan("[method]");
static constexpr mozilla::Span<const char> attributeStatic =
    mozilla::MakeStringSpan("[static]");

// Component model names are encoded as UTF-8, and in fact an ASCII subset of
// UTF-8, so this is fine.
static inline char LowercaseNameChar(char c) {
  return ('A' <= c && c <= 'Z') ? c + ('a' - 'A') : c;
}

static inline mozilla::Span<const char> TrimAttribute(
    mozilla::Span<const char> name) {
  if (CharsStartsWith(name, attributeConstructor)) {
    return name.Subspan(attributeConstructor.Length());
  }
  if (CharsStartsWith(name, attributeMethod)) {
    return name.Subspan(attributeMethod.Length());
  }
  if (CharsStartsWith(name, attributeStatic)) {
    return name.Subspan(attributeStatic.Length());
  }
  return name;
}

static inline bool NameHasAttribute(mozilla::Span<const char> name) {
  // The name should already be well-formed from parse time.
  return name.Length() == 0 || name.data()[0] == '[';
}

// We hash only the base part of the name, e.g. "foo" for "[constructor]foo".
HashNumber StronglyUniqueNameHasher::hash(const Lookup& aLookup) {
  const Lookup& trimmed = TrimAttribute(aLookup);

  HashNumber hash = 0;
  for (size_t i = 0; i < trimmed.Length(); i++) {
    char c = trimmed.data()[i];
    if (c == '.') {
      break;
    }
    hash = mozilla::AddToHash(hash, LowercaseNameChar(trimmed.data()[i]));
  }
  return hash;
}

bool StronglyUniqueNameHasher::match(const Key& aKey, const Lookup& aLookup) {
  mozilla::Span<const char> newTrimmed = TrimAttribute(aLookup);
  mozilla::Span<const char> existingTrimmed = TrimAttribute(aKey);

  // Rule 1: If one name is l and the other name is [constructor]l (for the
  // same label l), they are strongly-unique.
  bool newIsConstructor = CharsStartsWith(aLookup, attributeConstructor);
  bool existingIsConstructor = CharsStartsWith(aKey, attributeConstructor);
  if (newIsConstructor != existingIsConstructor &&
      newTrimmed == existingTrimmed) {
    return false;
  }

  // Rule 2: If one name is l and the other name is [*]l.l (for the same label l
  // and any annotation * with a dotted l.l name), they are not strongly-unique.
  mozilla::Maybe<mozilla::Span<const char>> plain;
  mozilla::Maybe<mozilla::Span<const char>> dotted;
  if (!NameHasAttribute(aLookup)) {
    plain.emplace(aLookup);
  } else if (!NameHasAttribute(aKey)) {
    plain.emplace(aKey);
  }
  if (CharsStartsWith(aLookup, attributeMethod) ||
      CharsStartsWith(aLookup, attributeStatic)) {
    dotted.emplace(aLookup);
  } else if (CharsStartsWith(aKey, attributeMethod) ||
             CharsStartsWith(aKey, attributeStatic)) {
    dotted.emplace(aKey);
  }
  if (plain.isSome() && dotted.isSome()) {
    mozilla::Span<const char> dottedTrimmed = TrimAttribute(dotted.value());
    size_t indexOfDot = dottedTrimmed.IndexOf('.');
    MOZ_RELEASE_ASSERT(indexOfDot != mozilla::Span<const char>::npos);
    auto [before, after] = dottedTrimmed.SplitAt(indexOfDot);
    after = after.Subspan(1);  // The SplitAt method includes the dot.
    if (plain.value() == after && plain.value() == before) {
      return true;
    }
  }

  // Rule 3: Lowercase the names, trim attributes, and compare directly.
  if (newTrimmed.Length() != existingTrimmed.Length()) {
    return false;
  }
  for (size_t i = 0; i < newTrimmed.Length(); i++) {
    if (LowercaseNameChar(newTrimmed[i]) !=
        LowercaseNameChar(existingTrimmed[i])) {
      return false;
    }
  }
  return true;
}

bool StronglyUniqueNameSet::add(mozilla::Span<const char> name,
                                bool* duplicate) {
  *duplicate = false;

  auto p = data_.lookupForAdd(name);
  if (p) {
    *duplicate = true;
    return true;
  }

  return data_.add(p, std::move(name));
}

mozilla::Maybe<FuncType> wasm::FlattenFuncType(
    const Component& c, const ComponentFuncType& funcType) {
  ValTypeVector params;
  ValTypeVector results;

  // TODO(wasm-cm): Handle (and test) the case where params or results exceed
  // the maximums set by the component model, at which point the ABI falls back
  // to passing values in memory. (Or maybe this will all change with lazy
  // lowering, who knows.)

  if (!FlattenTypes(c, funcType.paramTypes, &params)) {
    return mozilla::Nothing();
  }
  if (funcType.resultType.isSome()) {
    if (!FlattenType(c, funcType.resultType.ref(), &results)) {
      return mozilla::Nothing();
    }
  }

  return mozilla::Some(FuncType(std::move(params), std::move(results)));
}

bool wasm::FlattenTypes(const Component& c, const ComponentValTypeVector& types,
                        ValTypeVector* result) {
  // Pre-reserve at least enough space for a bunch of primitives. We still may
  // exceed the capacity reserved here but at least we can avoid a little bit of
  // allocation. (Appends after this point are not to be considered infallible.)
  if (!result->reserve(types.length())) {
    return false;
  }

  for (const ComponentValType& t : types) {
    if (!FlattenType(c, t, result)) {
      return false;
    }
  }

  return true;
}

static ValType JoinVariantValType(ValType a, ValType b) {
  MOZ_ASSERT(a.isNumber() && b.isNumber());
  if (a == b) {
    return a;
  } else if ((a == ValType::i32() && b == ValType::f32()) ||
             (a == ValType::f32() && b == ValType::i32())) {
    return ValType::i32();
  } else {
    return ValType::i64();
  }
}

bool wasm::FlattenType(const Component& c, const ComponentValType& type,
                       ValTypeVector* result) {
  ComponentTypeKind kind;
  if (type.isTypeIndex()) {
    kind = c.types[type.asTypeIndex()].kind();
  } else {
    kind = type.asPrimitive();
  }

  switch (kind) {
    // Simple primitives
    case ComponentTypeKind::Bool:
    case ComponentTypeKind::U8:
    case ComponentTypeKind::U16:
    case ComponentTypeKind::U32:
    case ComponentTypeKind::S8:
    case ComponentTypeKind::S16:
    case ComponentTypeKind::S32:
    case ComponentTypeKind::Char:
    case ComponentTypeKind::Flags:
    case ComponentTypeKind::Enum:
    case ComponentTypeKind::Own:
    case ComponentTypeKind::Borrow: {
      if (!result->append(ValType::i32())) {
        return false;
      }
    } break;
    case ComponentTypeKind::U64:
    case ComponentTypeKind::S64: {
      if (!result->append(ValType::i64())) {
        return false;
      }
    } break;
    case ComponentTypeKind::F32: {
      if (!result->append(ValType::f32())) {
        return false;
      }
    } break;
    case ComponentTypeKind::F64: {
      if (!result->append(ValType::f64())) {
        return false;
      }
    } break;

    // Strings are always two i32's
    case ComponentTypeKind::String: {
      if (!result->append(ValType::i32())) {
        return false;
      }
      if (!result->append(ValType::i32())) {
        return false;
      }
    } break;

    // Compound types have dedicated logic. Note that our data storage for some
    // types disagrees with the categories in the canonical ABI explainer, e.g.
    // we represent tuples as a vector of value types, not a record.
    case ComponentTypeKind::List: {
      // This will have to change when support is added for fixed-length lists.
      if (!result->append(ValType::i32())) {
        return false;
      }
      if (!result->append(ValType::i32())) {
        return false;
      }
    } break;
    case ComponentTypeKind::Record: {
      const ComponentRecordFieldVector& fields =
          c.types[type.asTypeIndex()].asRecord();
      if (!FlattenRecord(c, fields, result)) {
        return false;
      }
    } break;
    case ComponentTypeKind::Tuple: {
      const ComponentValTypeVector& types =
          c.types[type.asTypeIndex()].asTuple();
      if (!FlattenTypes(c, types, result)) {
        return false;
      }
    } break;
    case ComponentTypeKind::Variant: {
      // Flatten the discriminant
      if (!result->append(ValType::i32())) {
        return false;
      }

      // Flatten all the cases (overlapped, with joins)
      const ComponentVariantCaseVector& cases =
          c.types[type.asTypeIndex()].asVariant();
      size_t startIndex = result->length();
      for (const ComponentVariantCase& case_ : cases) {
        if (!case_.type) {
          continue;
        }

        ValTypeVector caseFlattened;
        if (!FlattenType(c, *case_.type, &caseFlattened)) {
          return false;
        }
        for (size_t i = 0; i < caseFlattened.length(); i++) {
          size_t existingIndex = startIndex + i;
          if (existingIndex < result->length()) {
            // Join the new type with the existing one.
            (*result)[existingIndex] =
                JoinVariantValType((*result)[existingIndex], caseFlattened[i]);
          } else {
            // Append the new type to the overall list.
            if (!result->append(caseFlattened[i])) {
              return false;
            }
          }
        }
      }
    } break;
    case ComponentTypeKind::Option: {
      ComponentValType inner = c.types[type.asTypeIndex()].asOption();
      if (!result->append(ValType::i32())) {
        return false;
      }
      if (!FlattenType(c, inner, result)) {
        return false;
      }
    } break;
    case ComponentTypeKind::Result: {
      ComponentResultType inner = c.types[type.asTypeIndex()].asResult();
      // Result types are encoded just like a variant with two cases, but each
      // case may or may not have a type.

      // Discriminant
      if (!result->append(ValType::i32())) {
        return false;
      }

      // Payload(s)
      size_t startIndex = result->length();
      if (inner.type.isSome()) {
        if (!FlattenType(c, *inner.type, result)) {
          return false;
        }
      }
      if (inner.errorType.isSome()) {
        ValTypeVector errorFlattened;
        if (!FlattenType(c, *inner.errorType, &errorFlattened)) {
          return false;
        }
        for (size_t i = 0; i < errorFlattened.length(); i++) {
          size_t existingIndex = startIndex + i;
          if (existingIndex < result->length()) {
            (*result)[existingIndex] =
                JoinVariantValType((*result)[existingIndex], errorFlattened[i]);
          } else {
            if (!result->append(errorFlattened[i])) {
              return false;
            }
          }
        }
      }
    } break;

    case ComponentTypeKind::Component:
    case ComponentTypeKind::Func:
    case ComponentTypeKind::Instance:
    case ComponentTypeKind::Resource: {
      MOZ_CRASH("should have been rejected when the func type was validated");
    } break;
  }

  return true;
}

bool wasm::FlattenRecord(const Component& c,
                         const ComponentRecordFieldVector& fields,
                         ValTypeVector* result) {
  for (const ComponentRecordField& field : fields) {
    if (!FlattenType(c, field.type, result)) {
      return false;
    }
  }

  return true;
}

/* virtual */
JSObject* Component::createObject(JSContext* cx) const {
  if (!GlobalObject::ensureConstructor(cx, cx->global(), JSProto_WebAssembly)) {
    return nullptr;
  }

  JS::RootedVector<JSString*> parameterStrings(cx);
  JS::RootedVector<Value> parameterArgs(cx);
  bool canCompileStrings = false;
  if (!cx->isRuntimeCodeGenEnabled(JS::RuntimeCode::WASM, nullptr,
                                   JS::CompilationType::Undefined,
                                   parameterStrings, nullptr, parameterArgs,
                                   NullHandleValue, &canCompileStrings)) {
    return nullptr;
  }
  if (!canCompileStrings) {
    JS_ReportErrorNumberASCII(cx, GetErrorMessage, nullptr,
                              JSMSG_CSP_BLOCKED_WASM, "WebAssembly.Component");
    return nullptr;
  }

  RootedObject proto(cx, &cx->global()->getPrototype(JSProto_WasmComponent));
  return WasmComponentObject::create(cx, *this, proto);
}

#endif  // ENABLE_WASM_COMPONENTS
