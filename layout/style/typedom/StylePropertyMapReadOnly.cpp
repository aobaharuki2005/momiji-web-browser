/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/StylePropertyMapReadOnly.h"

#include "CSSUnsupportedValue.h"
#include "mozilla/Assertions.h"
#include "mozilla/ErrorResult.h"
#include "mozilla/RefPtr.h"
#include "mozilla/dom/CSSStyleValue.h"
#include "mozilla/dom/StylePropertyMapReadOnlyBinding.h"
#include "nsCycleCollectionParticipant.h"
#include "nsICSSDeclaration.h"
#include "nsQueryObject.h"
#include "nsReadableUtils.h"
#include "nsString.h"
#include "nsStyledElement.h"

namespace mozilla::dom {

StylePropertyMapReadOnly::StylePropertyMapReadOnly(
    nsCOMPtr<nsISupports> aParent, bool aComputed)
    : mParent(std::move(aParent)), mComputed(aComputed) {
  MOZ_ASSERT(mParent);
}

NS_IMPL_CYCLE_COLLECTING_ADDREF(StylePropertyMapReadOnly)
NS_IMPL_CYCLE_COLLECTING_RELEASE(StylePropertyMapReadOnly)
NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(StylePropertyMapReadOnly)
  NS_WRAPPERCACHE_INTERFACE_MAP_ENTRY
  NS_INTERFACE_MAP_ENTRY(nsISupports)
NS_INTERFACE_MAP_END

NS_IMPL_CYCLE_COLLECTION_WRAPPERCACHE(StylePropertyMapReadOnly, mParent)

nsISupports* StylePropertyMapReadOnly::GetParentObject() const {
  return mParent;
}

JSObject* StylePropertyMapReadOnly::WrapObject(
    JSContext* aCx, JS::Handle<JSObject*> aGivenProto) {
  return StylePropertyMapReadOnly_Binding::Wrap(aCx, this, aGivenProto);
}

// start of StylePropertyMapReadOnly Web IDL implementation

// XXX This is not yet fully implemented and optimized!
void StylePropertyMapReadOnly::Get(const nsACString& aProperty,
                                   OwningUndefinedOrCSSStyleValue& aRetVal,
                                   ErrorResult& aRv) const {
  if (mComputed) {
    aRv.Throw(NS_ERROR_NOT_IMPLEMENTED);
    return;
  }

  // Step 3.

  RefPtr<nsStyledElement> styledElement = do_QueryObject(mParent);
  if (!styledElement) {
    aRv.Throw(NS_ERROR_NOT_IMPLEMENTED);
    return;
  }

  nsCOMPtr<nsICSSDeclaration> declaration = styledElement->Style();

  nsCString value;
  declaration->GetPropertyValue(aProperty, value);

  // Step 4.

  if (!value.IsEmpty()) {
    auto unsupportedValue = MakeRefPtr<CSSUnsupportedValue>(mParent, value);

    aRetVal.SetAsCSSStyleValue() = std::move(unsupportedValue);
  } else {
    aRetVal.SetUndefined();
  }
}

// XXX This is not yet fully implemented and optimized!
void StylePropertyMapReadOnly::GetAll(const nsACString& aProperty,
                                      nsTArray<RefPtr<CSSStyleValue>>& aRetVal,
                                      ErrorResult& aRv) const {
  OwningUndefinedOrCSSStyleValue retVal;

  Get(aProperty, retVal, aRv);
  if (aRv.Failed()) {
    return;
  }

  if (retVal.IsCSSStyleValue()) {
    auto styleValue = retVal.GetAsCSSStyleValue();
    aRetVal.AppendElement(styleValue);
  }
}

bool StylePropertyMapReadOnly::Has(const nsACString& aProperty,
                                   ErrorResult& aRv) const {
  aRv.Throw(NS_ERROR_NOT_IMPLEMENTED);
  return false;
}

uint32_t StylePropertyMapReadOnly::Size() const { return 0; }

uint32_t StylePropertyMapReadOnly::GetIterableLength() const { return 0; }

const nsACString& StylePropertyMapReadOnly::GetKeyAtIndex(
    uint32_t aIndex) const {
  return EmptyCString();
}

nsTArray<RefPtr<CSSStyleValue>> StylePropertyMapReadOnly::GetValueAtIndex(
    uint32_t aIndex) const {
  return nsTArray<RefPtr<CSSStyleValue>>();
}

// end of StylePropertyMapReadOnly Web IDL implementation

size_t StylePropertyMapReadOnly::SizeOfExcludingThis(
    MallocSizeOf aMallocSizeOf) const {
  return 0;
}

size_t StylePropertyMapReadOnly::SizeOfIncludingThis(
    MallocSizeOf aMallocSizeOf) const {
  return SizeOfExcludingThis(aMallocSizeOf) + aMallocSizeOf(this);
}

}  // namespace mozilla::dom
