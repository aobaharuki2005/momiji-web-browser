/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_a11y_AccessibleWrap_h_
#define mozilla_a11y_AccessibleWrap_h_

#include "nsCOMPtr.h"
#include "LocalAccessible.h"
#include "mozilla/Attributes.h"
#include "mozilla/mscom/Utils.h"
#include "mozilla/StaticPtr.h"
#include "nsXULAppAPI.h"
#include "Units.h"

namespace mozilla {
namespace a11y {
class DocRemoteAccessibleWrap;
class MsaaAccessible;

/**
 * Windows specific functionality for an accessibility tree node that originated
 * in mDoc's content process.
 */
class AccessibleWrap : public LocalAccessible {
 public:  // construction, destruction
  AccessibleWrap(nsIContent* aContent, DocAccessible* aDoc);

  // nsISupports
  NS_DECL_ISUPPORTS_INHERITED

 public:
  // LocalAccessible
  virtual void Shutdown() override;

 public:
  /**
   * Determine whether this is the root accessible for its HWND.
   */
  bool IsRootForHWND();

  MsaaAccessible* GetMsaa();
  virtual void GetNativeInterface(void** aOutAccessible) override;

 protected:
  virtual ~AccessibleWrap();

  RefPtr<MsaaAccessible> mMsaa;
};

}  // namespace a11y
}  // namespace mozilla

#endif
