/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_SanitizerTypes_h
#define mozilla_dom_SanitizerTypes_h

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
  template <typename SanitizerName>
  void SetSanitizerName(SanitizerName& aName) const;

  RefPtr<nsAtom> mLocalName;
  // A "null" namespace is represented by the nullptr.
  RefPtr<nsAtom> mNamespace;
};

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

}  // namespace mozilla::dom::sanitizer

#endif
