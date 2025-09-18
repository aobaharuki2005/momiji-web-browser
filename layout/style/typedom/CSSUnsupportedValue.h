/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef LAYOUT_STYLE_TYPEDOM_CSSUNSUPPORTEDVALUE_H_
#define LAYOUT_STYLE_TYPEDOM_CSSUNSUPPORTEDVALUE_H_

#include "mozilla/dom/CSSStyleValue.h"
#include "nsString.h"

template <class T>
class nsCOMPtr;
class nsISupports;

namespace mozilla {

namespace dom {

class CSSUnsupportedValue final : public CSSStyleValue {
 public:
  CSSUnsupportedValue(nsCOMPtr<nsISupports> aParent, const nsACString& aValue);

  const nsACString& GetValue() const { return mValue; }

 private:
  virtual ~CSSUnsupportedValue() = default;

  nsCString mValue;
};

}  // namespace dom
}  // namespace mozilla

#endif  // LAYOUT_STYLE_TYPEDOM_CSSUNSUPPORTEDVALUE_H_
