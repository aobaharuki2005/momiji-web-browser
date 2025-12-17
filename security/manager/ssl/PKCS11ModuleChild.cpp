/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifdef MOZ_NO_SMART_CARDS
#  error This file should not be used under MOZ_NO_SMART_CARDS.
#endif  // MOZ_NO_SMART_CARDS

#include "mozilla/psm/PKCS11ModuleChild.h"

#include "mozilla/ipc/Endpoint.h"
#include "nsDebugImpl.h"

namespace mozilla::psm {

nsresult PKCS11ModuleChild::Start(Endpoint<PPKCS11ModuleChild>&& aEndpoint) {
  MOZ_ASSERT(NS_IsMainThread());
  MOZ_ASSERT(!mTaskQueue);

  nsDebugImpl::SetMultiprocessMode("PKCS11ModuleChild");

  nsresult rv = NS_CreateBackgroundTaskQueue("PKCS11ModuleChild",
                                             getter_AddRefs(mTaskQueue));
  if (NS_FAILED(rv)) {
    return rv;
  }

  rv = mTaskQueue->Dispatch(NS_NewRunnableFunction(
      "PKCS11ModuleChild::StartBind",
      [self = RefPtr{this}, endpoint = std::move(aEndpoint)]() mutable {
        MOZ_ALWAYS_TRUE(endpoint.Bind(self));
      }));
  return rv;
}

}  // namespace mozilla::psm
