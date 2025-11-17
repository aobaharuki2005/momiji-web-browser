/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "RemoteImageProtocolHandler.h"

#include "nsIURI.h"
#include "nsNetUtil.h"
#include "nsURLHelper.h"
#include "mozilla/dom/ipc/IdType.h"
#include "mozilla/dom/ContentProcessManager.h"

namespace mozilla::image {

using mozilla::dom::ContentParent;
using mozilla::dom::ContentParentId;
using mozilla::dom::ContentProcessManager;
using mozilla::dom::UniqueContentParentKeepAlive;

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

static UniqueContentParentKeepAlive GetLaunchingContentParentForDecode(
    const Maybe<ContentParentId>& aContentParentId) {
  if (aContentParentId.isSome()) {
    if (ContentProcessManager* cpm = ContentProcessManager::GetSingleton()) {
      if (ContentParent* cp = cpm->GetContentProcessById(*aContentParentId)) {
        return cp->TryAddKeepAlive(/* aBrowserId */ 0);
      }
    }
  }

  // We use the extension process as a fallback, because
  // it is usually running, and should be OK to parse images.
  return ContentParent::GetNewOrUsedLaunchingBrowserProcess(
      EXTENSION_REMOTE_TYPE,
      /* aGroup */ nullptr,
      /* aPriority */ hal::PROCESS_PRIORITY_FOREGROUND,
      /* aPreferUsed */ true);
}

// Parse out the relevant parts of the moz-remote-image URL
static nsresult ParseURI(nsIURI* aURI, nsIURI** aRemoteURI, ImageIntSize* aSize,
                         Maybe<ContentParentId>& aContentParentId) {
  MOZ_ASSERT(aURI->SchemeIs("moz-remote-image"));

  nsAutoCString query;
  MOZ_TRY(aURI->GetQuery(query));

  bool hasURL;
  int32_t width = 0;
  int32_t height = 0;

  bool ok = URLParams::Parse(
      query, true, [&](const nsACString& aName, const nsACString& aValue) {
        nsresult rv;
        if (aName.EqualsLiteral("url")) {
          hasURL = true;
          rv = NS_NewURI(aRemoteURI, aValue);
          if (NS_FAILED(rv)) {
            return false;
          }
        } else if (aName.EqualsLiteral("width")) {
          width = aValue.ToInteger(&rv);
          if (NS_FAILED(rv) || width < 0) {
            return false;
          }
        } else if (aName.EqualsLiteral("height")) {
          height = aValue.ToInteger(&rv);
          if (NS_FAILED(rv) || height < 0) {
            return false;
          }
        } else if (aName.EqualsLiteral("contentParentId")) {
          int64_t id = aValue.ToInteger(&rv);
          if (NS_FAILED(rv) || id < 0) {
            return false;
          }
          aContentParentId = Some(ContentParentId(uint64_t(id)));
        }
        return true;
      });
  if (NS_WARN_IF(!ok || !hasURL)) {
    return NS_ERROR_DOM_MALFORMED_URI;
  }

  *aSize = ImageIntSize(width, height);
  return NS_OK;
}

NS_IMETHODIMP RemoteImageProtocolHandler::NewChannel(nsIURI* aURI,
                                                     nsILoadInfo* aLoadInfo,
                                                     nsIChannel** aOutChannel) {
  nsCOMPtr<nsIURI> remoteURI;
  ImageIntSize size;
  Maybe<ContentParentId> contentParentId;
  MOZ_TRY(ParseURI(aURI, getter_AddRefs(remoteURI), &size, contentParentId));

  return NS_ERROR_NOT_IMPLEMENTED;
}

}  // namespace mozilla::image
