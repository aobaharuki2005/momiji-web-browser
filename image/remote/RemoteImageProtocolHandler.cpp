/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "RemoteImageProtocolHandler.h"

namespace mozilla::image {

StaticRefPtr<RemoteImageProtocolHandler> RemoteImageProtocolHandler::sSingleton;

NS_IMPL_ISUPPORTS(RemoteImageProtocolHandler, nsIProtocolHandler,
                  nsISupportsWeakReference);

NS_IMETHODIMP RemoteImageProtocolHandler::GetScheme(nsACString& aScheme) {
  aScheme.AssignLiteral("moz-remote-image");
  return NS_OK;
}

NS_IMETHODIMP RemoteImageProtocolHandler::AllowPort(int32_t, const char*,
                                                    bool* aAllow) {
  *aAllow = false;
  return NS_OK;
}

NS_IMETHODIMP RemoteImageProtocolHandler::NewChannel(nsIURI* aURI,
                                                     nsILoadInfo* aLoadInfo,
                                                     nsIChannel** aOutChannel) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

} // namespace mozilla::image
