/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SanitizerTypes.h"

namespace mozilla::dom::sanitizer {

bool CanonicalName::IsDataAttribute() const {
  return StringBeginsWith(nsDependentAtomString(mLocalName), u"data-"_ns) &&
         !mNamespace;
}

template <typename SanitizerName>
void CanonicalName::SetSanitizerName(SanitizerName& aSanitizerName) const {
  mLocalName->ToString(aSanitizerName.mName);
  if (mNamespace) {
    mNamespace->ToString(aSanitizerName.mNamespace);
  } else {
    aSanitizerName.mNamespace.SetIsVoid(true);
  }
}

SanitizerAttributeNamespace CanonicalName::ToSanitizerAttributeNamespace()
    const {
  SanitizerAttributeNamespace result;
  SetSanitizerName(result);
  return result;
}

SanitizerElementNamespace CanonicalName::ToSanitizerElementNamespace() const {
  SanitizerElementNamespace result;
  SetSanitizerName(result);
  return result;
}

SanitizerElementNamespaceWithAttributes
CanonicalName::ToSanitizerElementNamespaceWithAttributes(
    const CanonicalElementAttributes& aElementAttributes) const {
  SanitizerElementNamespaceWithAttributes result;
  SetSanitizerName(result);
  if (aElementAttributes.mAttributes) {
    result.mAttributes.Construct(
        ToSanitizerAttributes(*aElementAttributes.mAttributes));
  }
  if (aElementAttributes.mRemoveAttributes) {
    result.mRemoveAttributes.Construct(
        ToSanitizerAttributes(*aElementAttributes.mRemoveAttributes));
  }
  return result;
}

std::ostream& operator<<(std::ostream& aStream, const CanonicalName& aName) {
  nsAutoCString localName;
  aName.mLocalName->ToUTF8String(localName);
  aStream << '"' << localName << '"';
  if (aName.mNamespace) {
    nsAutoCString nameSpace;
    aName.mNamespace->ToUTF8String(nameSpace);
    return aStream << " (namespace: \"" << nameSpace << "\")";
  }
  return aStream << " (namespace: null)";
}

bool CanonicalElementAttributes::Equals(
    const CanonicalElementAttributes& aOther) const {
  if (mAttributes.isSome() != aOther.mAttributes.isSome() ||
      mRemoveAttributes.isSome() != aOther.mRemoveAttributes.isSome()) {
    return false;
  }

  if (mAttributes) {
    if (mAttributes->Count() != aOther.mAttributes->Count()) {
      return false;
    }

    for (const CanonicalName& attr : *mAttributes) {
      if (!aOther.mAttributes->Contains(attr)) {
        return false;
      }
    }
  }

  if (mRemoveAttributes) {
    if (mRemoveAttributes->Count() != aOther.mRemoveAttributes->Count()) {
      return false;
    }

    for (const CanonicalName& attr : *mRemoveAttributes) {
      if (!aOther.mRemoveAttributes->Contains(attr)) {
        return false;
      }
    }
  }

  return true;
}

nsTArray<OwningStringOrSanitizerAttributeNamespace> ToSanitizerAttributes(
    const CanonicalNameSet& aSet) {
  nsTArray<OwningStringOrSanitizerAttributeNamespace> attributes;
  for (const CanonicalName& canonical : aSet) {
    OwningStringOrSanitizerAttributeNamespace owning;
    owning.SetAsSanitizerAttributeNamespace() =
        canonical.ToSanitizerAttributeNamespace();
    attributes.InsertElementSorted(owning,
                                   SanitizerComparator<decltype(owning)>());
  }
  return attributes;
}

}  // namespace mozilla::dom::sanitizer
