/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef gfxMacPlatformFontList_H_
#define gfxMacPlatformFontList_H_

#include <CoreFoundation/CoreFoundation.h>

#include "CoreTextFontList.h"

class gfxMacPlatformFontList final : public CoreTextFontList {
public:
  static gfxMacPlatformFontList* PlatformFontList() {
    return static_cast<gfxMacPlatformFontList*>(
        gfxPlatformFontList::PlatformFontList());
  }

  nsTArray<std::pair<const char**, uint32_t>> GetFilteredPlatformFontLists()
      override;

  static void LookupSystemFont(mozilla::LookAndFeel::FontID aSystemFontID,
                               nsACString& aSystemFontName,
                               gfxFontStyle& aFontStyle);

   // Values for the entryType field in FontFamilyListEntry records passed
  // from chrome to content process.
  enum FontFamilyEntryType {
    kStandardFontFamily = 0,          // a standard installed font family
    kTextSizeSystemFontFamily = 1,    // name of 'system' font at text sizes
    kDisplaySizeSystemFontFamily = 2  // 'system' font at display sizes
  };
 protected:
  bool DeprecatedFamilyIsAvailable(const nsACString& aName) override;
  FontVisibility GetVisibilityForFamily(const nsACString& aName) const override;

 private:
  friend class gfxPlatformMac;

  gfxMacPlatformFontList();
  virtual ~gfxMacPlatformFontList() = default;

  nsresult InitFontListForPlatform() MOZ_REQUIRES(mLock) override;
  void InitSharedFontListForPlatform() MOZ_REQUIRES(mLock) override;

  // Special-case font faces treated as font families (set via prefs)
  void InitSingleFaceList() MOZ_REQUIRES(mLock) override;
  void InitAliasesForSingleFaceList() MOZ_REQUIRES(mLock) override;

  // initialize system fonts
  void InitSystemFontNames() MOZ_REQUIRES(mLock);

  nsTArray<nsCString> mSingleFaceFonts;
};

#endif /* gfxMacPlatformFontList_H_ */
