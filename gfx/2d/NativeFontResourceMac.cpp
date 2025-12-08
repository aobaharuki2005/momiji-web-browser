/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <unordered_map>
#include "NativeFontResourceMac.h"
#include "UnscaledFontMac.h"
#include "Types.h"

#include "mozilla/RefPtr.h"
#include "mozilla/DataMutex.h"

#ifdef MOZ_WIDGET_UIKIT
#  include <CoreFoundation/CoreFoundation.h>
#endif

#include "nsIMemoryReporter.h"
#include "nsCocoaFeatures.h"

namespace mozilla {
namespace gfx {

#define FONT_NAME_MAX 32
MOZ_RUNINIT static StaticDataMutex<
    std::unordered_map<void*, nsAutoCStringN<FONT_NAME_MAX>>>
    sWeakFontDataMap("WeakFonts");

void FontDataDeallocate(void*, void* info) {
  auto fontMap = sWeakFontDataMap.Lock();
  fontMap->erase(info);
  free(info);
}

class NativeFontResourceMacReporter final : public nsIMemoryReporter {
  ~NativeFontResourceMacReporter() = default;

  MOZ_DEFINE_MALLOC_SIZE_OF(MallocSizeOf)
 public:
  NS_DECL_ISUPPORTS

  NS_IMETHOD CollectReports(nsIHandleReportCallback* aHandleReport,
                            nsISupports* aData, bool aAnonymize) override {
    auto fontMap = sWeakFontDataMap.Lock();

    nsAutoCString path("explicit/gfx/native-font-resource-mac/font(");

    unsigned int unknownFontIndex = 0;
    for (auto& i : *fontMap) {
      nsAutoCString subPath(path);

      if (aAnonymize) {
        subPath.AppendPrintf("<anonymized-%p>", this);
      } else {
        if (i.second.Length()) {
          subPath.AppendLiteral("psname=");
          subPath.Append(i.second);
        } else {
          subPath.AppendPrintf("Unknown(%d)", unknownFontIndex);
        }
      }

      size_t bytes = MallocSizeOf(i.first) + FONT_NAME_MAX;

      subPath.Append(")");

      aHandleReport->Callback(""_ns, subPath, KIND_HEAP, UNITS_BYTES, bytes,
                              "Memory used by this native font."_ns, aData);

      unknownFontIndex++;
    }
    return NS_OK;
  }
};

NS_IMPL_ISUPPORTS(NativeFontResourceMacReporter, nsIMemoryReporter)

void NativeFontResourceMac::RegisterMemoryReporter() {
  RegisterStrongMemoryReporter(new NativeFontResourceMacReporter);
}

/* static */
already_AddRefed<NativeFontResourceMac> NativeFontResourceMac::Create(
    const uint8_t* aFontData, uint32_t aDataLength) {
  CFDataRef data = CFDataCreate(kCFAllocatorDefault, aFontData, aDataLength);
  if (!data) {
    return nullptr;
  }
  // create a provider
  CGDataProviderRef provider = CGDataProviderCreateWithCFData(data);
  // release our reference to the CFData, provider keeps it alive
   CFRelease(data);

  // create the font object
  CGFontRef fontRef = CGFontCreateWithDataProvider(provider);
  // release our reference, font will keep it alive as long as needed
  CGDataProviderRelease(provider);

  if (!fontRef) {
    return nullptr;
  }

  // passes ownership of fontRef to the NativeFontResourceMac instance
  RefPtr<NativeFontResourceMac> fontResource =
    new NativeFontResourceMac(fontRef, aDataLength);

  return fontResource.forget();
}

already_AddRefed<UnscaledFont> NativeFontResourceMac::CreateUnscaledFont(
    uint32_t aIndex, const uint8_t* aInstanceData,
    uint32_t aInstanceDataLength) {
  RefPtr<UnscaledFont> unscaledFont =
      new UnscaledFontMac(mFontRef, true);
  return unscaledFont.forget();
}

}  // namespace gfx
}  // namespace mozilla
