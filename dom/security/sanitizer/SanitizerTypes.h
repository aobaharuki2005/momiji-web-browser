/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_SanitizerTypes_h
#define mozilla_dom_SanitizerTypes_h

#include "fmt/format.h"
#include "mozilla/Maybe.h"
#include "mozilla/dom/SanitizerBinding.h"
#include "nsHashtablesFwd.h"
#include "nsTHashSet.h"

namespace mozilla::dom::sanitizer {

struct CanonicalElementAttributes;

// The name of an element/attribute combined with its namespace.
class CanonicalName : public PLDHashEntryHdr {
 public:
  using KeyType = const CanonicalName&;
  using KeyTypePointer = const CanonicalName*;

  explicit CanonicalName(KeyTypePointer aKey)
      : mLocalName(aKey->mLocalName), mNamespace(aKey->mNamespace) {}
  CanonicalName(CanonicalName&&) = default;
  CanonicalName(RefPtr<nsAtom> aLocalName, RefPtr<nsAtom> aNamespace)
      : mLocalName(std::move(aLocalName)), mNamespace(std::move(aNamespace)) {}
  CanonicalName(nsStaticAtom* aLocalName, nsStaticAtom* aNamespace)
      : mLocalName(aLocalName), mNamespace(aNamespace) {}
  ~CanonicalName() = default;

  KeyType GetKey() const { return *this; }
  bool KeyEquals(KeyTypePointer aKey) const {
    return mLocalName == aKey->mLocalName && mNamespace == aKey->mNamespace;
  }

  static KeyTypePointer KeyToPointer(KeyType aKey) { return &aKey; }
  static PLDHashNumber HashKey(KeyTypePointer aKey) {
    return mozilla::HashGeneric(aKey->mLocalName.get(), aKey->mNamespace.get());
  }

  enum { ALLOW_MEMMOVE = true };

  // Caution: Only use this for attribute names, not elements!
  // Returns true for names that start with data-* and have a null namespace.
  bool IsDataAttribute() const;

  SanitizerAttributeNamespace ToSanitizerAttributeNamespace() const;
  SanitizerElementNamespace ToSanitizerElementNamespace() const;
  SanitizerElementNamespaceWithAttributes
  ToSanitizerElementNamespaceWithAttributes(
      const CanonicalElementAttributes& aElementAttributes) const;

  CanonicalName Clone() const { return CanonicalName(mLocalName, mNamespace); }

 protected:
  friend std::ostream& operator<<(std::ostream& aStream,
                                  const CanonicalName& aName);

  template <typename SanitizerName>
  void SetSanitizerName(SanitizerName& aName) const;

  RefPtr<nsAtom> mLocalName;
  // A "null" namespace is represented by the nullptr.
  RefPtr<nsAtom> mNamespace;
};

std::ostream& operator<<(std::ostream& aStream, const CanonicalName& aName);

using CanonicalNameSet = nsTHashSet<CanonicalName>;

struct CanonicalElementAttributes {
  Maybe<CanonicalNameSet> mAttributes;
  Maybe<CanonicalNameSet> mRemoveAttributes;

  bool Equals(const CanonicalElementAttributes& aOther) const;
};

using CanonicalElementMap =
    nsTHashMap<CanonicalName, CanonicalElementAttributes>;

nsTArray<OwningStringOrSanitizerAttributeNamespace> ToSanitizerAttributes(
    const CanonicalNameSet& aSet);

inline const auto& GetAsDictionary(
    const OwningStringOrSanitizerAttributeNamespace& aOwning) {
  return aOwning.GetAsSanitizerAttributeNamespace();
}

inline const auto& GetAsDictionary(
    const OwningStringOrSanitizerElementNamespace& aOwning) {
  return aOwning.GetAsSanitizerElementNamespace();
}

inline const auto& GetAsDictionary(
    const OwningStringOrSanitizerElementNamespaceWithAttributes& aOwning) {
  return aOwning.GetAsSanitizerElementNamespaceWithAttributes();
}

inline const auto& GetAsDictionary(
    const StringOrSanitizerElementNamespace& aElement) {
  return aElement.GetAsSanitizerElementNamespace();
}

inline const auto& GetAsDictionary(
    const StringOrSanitizerElementNamespaceWithAttributes& aElement) {
  return aElement.GetAsSanitizerElementNamespaceWithAttributes();
}

template <typename SanitizerNameNamespace>
class MOZ_STACK_CLASS SanitizerComparator final {
 public:
  bool Equals(const SanitizerNameNamespace& aItemA,
              const SanitizerNameNamespace& aItemB) const {
    const auto& itemA = GetAsDictionary(aItemA);
    const auto& itemB = GetAsDictionary(aItemB);

    return itemA.mNamespace.IsVoid() == itemB.mNamespace.IsVoid() &&
           itemA.mNamespace == itemB.mNamespace && itemA.mName == itemB.mName;
  }

  // https://wicg.github.io/sanitizer-api/#sanitizerconfig-less-than-item
  bool LessThan(const SanitizerNameNamespace& aItemA,
                const SanitizerNameNamespace& aItemB) const {
    const auto& itemA = GetAsDictionary(aItemA);
    const auto& itemB = GetAsDictionary(aItemB);

    // Step 1. If itemA["namespace"] is null:
    if (itemA.mNamespace.IsVoid()) {
      // Step 1.1. If itemB["namespace"] is not null, return true.
      if (!itemB.mNamespace.IsVoid()) {
        return true;
      }
    } else {
      // Step 2. Otherwise:
      // Step 2.1. If itemB["namespace"] is null, return false.
      if (itemB.mNamespace.IsVoid()) {
        return false;
      }

      int result = Compare(itemA.mNamespace, itemB.mNamespace);
      // Step 2.2. If itemA["namespace"] is code unit less than
      // itemB["namespace"], return true.
      if (result < 0) {
        return true;
      }
      // Step 2.3. If itemA["namespace"] is not equal itemB["namespace"], return
      // false.
      // XXX https://github.com/WICG/sanitizer-api/pull/341
      if (result != 0) {
        return false;
      }
    }

    // Step 3. Return itemA["name"] is code unit less thanitemB["name"].
    return itemA.mName < itemB.mName;
  }
};

}  // namespace mozilla::dom::sanitizer

template <>
struct fmt::formatter<mozilla::dom::sanitizer::CanonicalName>
    : ostream_formatter {};

#endif
