/* -*- Mode: C++; tab-width: 20; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "AppleUtils.h"
#include "CoreTextFontList.h"
#include "gfxFontConstants.h"
#include "gfxMacFont.h"
#include "gfxUserFontSet.h"

#include "harfbuzz/hb.h"

#include "MainThreadUtils.h"

#include "mozilla/dom/ContentChild.h"
#include "mozilla/dom/ContentParent.h"
#include "mozilla/gfx/2D.h"
#include "mozilla/Logging.h"
#include "mozilla/Preferences.h"
#include "mozilla/ProfilerLabels.h"
#include "mozilla/Sprintf.h"
#include "mozilla/StaticPrefs_gfx.h"
#include "mozilla/glean/GfxMetrics.h"

#include "nsAppDirectoryServiceDefs.h"
#include "nsCharTraits.h"
#include "nsCocoaFeatures.h"
#include "nsComponentManagerUtils.h"
#include "nsDirectoryServiceDefs.h"
#include "nsDirectoryServiceUtils.h"
#include "nsIDirectoryEnumerator.h"
#include "nsServiceManagerUtils.h"
#include "SharedFontList-impl.h"

using namespace mozilla;
using namespace mozilla::gfx;

static void GetStringForCFString(CFStringRef aSrc, nsAString& aDest) {
  auto len = CFStringGetLength(aSrc);
  aDest.SetLength(len);
  CFStringGetCharacters(aSrc, CFRangeMake(0, len),
                        (UniChar*)aDest.BeginWriting());
}

static CFStringRef CreateCFStringForString(const nsACString& aSrc) {
  return CFStringCreateWithBytes(kCFAllocatorDefault,
                                 (const UInt8*)aSrc.BeginReading(),
                                 aSrc.Length(), kCFStringEncodingUTF8, false);
}

#define LOG_FONTLIST(args) \
  MOZ_LOG(gfxPlatform::GetLog(eGfxLog_fontlist), mozilla::LogLevel::Debug, args)
#define LOG_FONTLIST_ENABLED() \
  MOZ_LOG_TEST(gfxPlatform::GetLog(eGfxLog_fontlist), mozilla::LogLevel::Debug)
#define LOG_CMAPDATA_ENABLED() \
  MOZ_LOG_TEST(gfxPlatform::GetLog(eGfxLog_cmapdata), mozilla::LogLevel::Debug)

#pragma mark -

// Complex scripts will not render correctly unless appropriate AAT or OT
// layout tables are present.
// For OpenType, we also check that the GSUB table supports the relevant
// script tag, to avoid using things like Arial Unicode MS for Lao (it has
// the characters, but lacks OpenType support).

// TODO: consider whether we should move this to gfxFontEntry and do similar
// cmap-masking on other platforms to avoid using fonts that won't shape
// properly.

nsresult CTFontEntry::ReadCMAP(FontInfoData* aFontInfoData) {
  // attempt this once, if errors occur leave a blank cmap
  if (mCharacterMap || mShmemCharacterMap) {
    return NS_OK;
  }

  RefPtr<gfxCharacterMap> charmap;
  nsresult rv;

  uint32_t uvsOffset = 0;
  if (aFontInfoData &&
      (charmap = GetCMAPFromFontInfo(aFontInfoData, uvsOffset))) {
    rv = NS_OK;
  } else {
    uint32_t kCMAP = TRUETYPE_TAG('c', 'm', 'a', 'p');
    charmap = new gfxCharacterMap();
    AutoTable cmapTable(this, kCMAP);

    if (cmapTable) {
      uint32_t cmapLen;
      const uint8_t* cmapData = reinterpret_cast<const uint8_t*>(
          hb_blob_get_data(cmapTable, &cmapLen));
      rv = gfxFontUtils::ReadCMAP(cmapData, cmapLen, *charmap, uvsOffset);
    } else {
      rv = NS_ERROR_NOT_AVAILABLE;
    }
  }
  mUVSOffset.exchange(uvsOffset);

  if (NS_SUCCEEDED(rv) && !mIsDataUserFont && !HasGraphiteTables()) {
    // For downloadable fonts, trust the author and don't
    // try to munge the cmap based on script shaping support.

    // We also assume a Graphite font knows what it's doing,
    // and provides whatever shaping is needed for the
    // characters it supports, so only check/clear the
    // complex-script ranges for non-Graphite fonts

    // for layout support, check for the presence of mort/morx/kerx and/or
    // opentype layout tables
    bool hasAATLayout = HasFontTable(TRUETYPE_TAG('m', 'o', 'r', 'x')) ||
                        HasFontTable(TRUETYPE_TAG('m', 'o', 'r', 't'));
    bool hasAppleKerning = HasFontTable(TRUETYPE_TAG('k', 'e', 'r', 'x'));
    bool hasGSUB = HasFontTable(TRUETYPE_TAG('G', 'S', 'U', 'B'));
    bool hasGPOS = HasFontTable(TRUETYPE_TAG('G', 'P', 'O', 'S'));
    if ((hasAATLayout && !(hasGSUB || hasGPOS)) || hasAppleKerning) {
      mRequiresAAT = true;  // prefer CoreText if font has no OTL tables,
                            // or if it uses the Apple-specific 'kerx'
                            // variant of kerning table
    }

    for (const ScriptRange* sr = gfxPlatformFontList::sComplexScriptRanges;
         sr->rangeStart; sr++) {
      // check to see if the cmap includes complex script codepoints
      if (charmap->TestRange(sr->rangeStart, sr->rangeEnd)) {
        if (hasAATLayout) {
          // prefer CoreText for Apple's complex-script fonts,
          // even if they also have some OpenType tables
          // (e.g. Geeza Pro Bold on 10.6; see bug 614903)
          mRequiresAAT = true;
          // and don't mask off complex-script ranges, we assume
          // the AAT tables will provide the necessary shaping
          continue;
        }

        // We check for GSUB here, as GPOS alone would not be ok.
        if (hasGSUB && SupportsScriptInGSUB(sr->tags, sr->numTags)) {
          continue;
        }

        charmap->ClearRange(sr->rangeStart, sr->rangeEnd);
      }
    }

    // Bug 1360309, 1393624: several of Apple's Chinese fonts have spurious
    // blank glyphs for obscure Tibetan and Arabic-script codepoints.
    // Blocklist these so that font fallback will not use them.
    if (mRequiresAAT &&
        (FamilyName().EqualsLiteral("Songti SC") ||
         FamilyName().EqualsLiteral("Songti TC") ||
         FamilyName().EqualsLiteral("STSong") ||
         // Bug 1390980: on 10.11, the Kaiti fonts are also affected.
         FamilyName().EqualsLiteral("Kaiti SC") ||
         FamilyName().EqualsLiteral("Kaiti TC") ||
         FamilyName().EqualsLiteral("STKaiti"))) {
      charmap->ClearRange(0x0f6b, 0x0f70);
      charmap->ClearRange(0x0f8c, 0x0f8f);
      charmap->clear(0x0f98);
      charmap->clear(0x0fbd);
      charmap->ClearRange(0x0fcd, 0x0fff);
      charmap->clear(0x0620);
      charmap->clear(0x065f);
      charmap->ClearRange(0x06ee, 0x06ef);
      charmap->clear(0x06ff);
    }
  }

  bool setCharMap = true;
  if (NS_SUCCEEDED(rv)) {
    gfxPlatformFontList* pfl = gfxPlatformFontList::PlatformFontList();
    fontlist::FontList* sharedFontList = pfl->SharedFontList();
    if (!IsUserFont() && mShmemFace && mShmemFamily) {
      mShmemFace->SetCharacterMap(sharedFontList, charmap, mShmemFamily);
      if (TrySetShmemCharacterMap()) {
        setCharMap = false;
      }
    } else {
      charmap = pfl->FindCharMap(charmap);
    }
    mHasCmapTable = true;
  } else {
    // if error occurred, initialize to null cmap
    charmap = new gfxCharacterMap();
    mHasCmapTable = false;
  }
  if (setCharMap) {
    // Temporarily retain charmap, until the shared version is
    // ready for use.
    if (mCharacterMap.compareExchange(nullptr, charmap.get())) {
      charmap.get()->AddRef();
    }
  }

  LOG_FONTLIST(("(fontlist-cmap) name: %s, size: %zu hash: %8.8x%s\n",
                mName.get(), charmap->SizeOfIncludingThis(moz_malloc_size_of),
                charmap->mHash, mCharacterMap == charmap ? " new" : ""));
  if (LOG_CMAPDATA_ENABLED()) {
    char prefix[256];
    SprintfLiteral(prefix, "(cmapdata) name: %.220s", mName.get());
    charmap->Dump(prefix, eGfxLog_cmapdata);
  }

  return rv;
}

gfxFont* CTFontEntry::CreateFontInstance(const gfxFontStyle* aFontStyle) {
  RefPtr<UnscaledFontMac> unscaledFont(mUnscaledFont);
  if (!unscaledFont) {
    CGFontRef baseFont = GetFontRef();
    if (!baseFont) {
      return nullptr;
    }
    unscaledFont = new UnscaledFontMac(baseFont, mIsDataUserFont);
    mUnscaledFont = unscaledFont;
  }

  return new gfxMacFont(unscaledFont, this, aFontStyle);
}

bool CTFontEntry::HasVariations() {
  if (!mHasVariationsInitialized) {
    mHasVariationsInitialized = true;
    mHasVariations = gfxPlatform::HasVariationFontSupport() &&
                     HasFontTable(TRUETYPE_TAG('f', 'v', 'a', 'r'));
  }

  return mHasVariations;
}

void CTFontEntry::GetVariationAxes(
    nsTArray<gfxFontVariationAxis>& aVariationAxes) {
  // We could do this by creating a CTFont and calling CTFontCopyVariationAxes,
  // but it is expensive to instantiate a CTFont for every face just to set up
  // the axis information.
  // Instead we use gfxFontUtils to read the font tables directly.
  gfxFontUtils::GetVariationData(this, &aVariationAxes, nullptr);
}

void CTFontEntry::GetVariationInstances(
    nsTArray<gfxFontVariationInstance>& aInstances) {
  // Core Text doesn't offer API for this, so we use gfxFontUtils to read the
  // font tables directly.
  gfxFontUtils::GetVariationData(this, nullptr, &aInstances);
}

bool CTFontEntry::IsCFF() {
  if (!mIsCFFInitialized) {
    mIsCFFInitialized = true;
    mIsCFF = HasFontTable(TRUETYPE_TAG('C', 'F', 'F', ' '));
  }

  return mIsCFF;
}

CTFontEntry::CTFontEntry(const nsACString& aPostscriptName, WeightRange aWeight,
                         bool aIsStandardFace, double aSizeHint)
    : gfxFontEntry(aPostscriptName, aIsStandardFace),
      mFontRef(NULL),
      mSizeHint(aSizeHint),
      mFontRefInitialized(false),
      mRequiresAAT(false),
      mIsCFF(false),
      mIsCFFInitialized(false),
      mHasVariations(false),
      mHasVariationsInitialized(false),
      mHasAATSmallCaps(false),
      mHasAATSmallCapsInitialized(false) {
  mWeightRange = aWeight;
  mOpszAxis.mTag = 0;
}

CTFontEntry::CTFontEntry(const nsACString& aPostscriptName, CGFontRef aFontRef,
                         WeightRange aWeight, StretchRange aStretch,
                         SlantStyleRange aStyle, bool aIsDataUserFont,
                         bool aIsLocalUserFont)
    : gfxFontEntry(aPostscriptName, false),
      mFontRef(NULL),
      mSizeHint(0.0),
      mFontRefInitialized(false),
      mRequiresAAT(false),
      mIsCFF(false),
      mIsCFFInitialized(false),
      mHasVariations(false),
      mHasVariationsInitialized(false),
      mHasAATSmallCaps(false),
      mHasAATSmallCapsInitialized(false) {
  mFontRef = aFontRef;
  mFontRefInitialized = true;
  CFRetain(mFontRef);

  mWeightRange = aWeight;
  mStretchRange = aStretch;
  mFixedPitch = false;  // xxx - do we need this for downloaded fonts?
  mStyleRange = aStyle;
  mOpszAxis.mTag = 0;

  NS_ASSERTION(!(aIsDataUserFont && aIsLocalUserFont),
               "userfont is either a data font or a local font");
  mIsDataUserFont = aIsDataUserFont;
  mIsLocalUserFont = aIsLocalUserFont;
}

gfxFontEntry* CTFontEntry::Clone() const {
  MOZ_ASSERT(!IsUserFont(), "we can only clone installed fonts!");
  CTFontEntry* fe = new CTFontEntry(Name(), Weight(), mStandardFace, mSizeHint);
  fe->mStyleRange = mStyleRange;
  fe->mStretchRange = mStretchRange;
  fe->mFixedPitch = mFixedPitch;
  return fe;
}

CGFontRef CTFontEntry::GetFontRef() {
  {
    AutoReadLock lock(mLock);
    if (mFontRefInitialized) {
      return mFontRef;
    }
  }
  AutoWriteLock lock(mLock);
  if (!mFontRefInitialized) {
    // Cache the CGFontRef, to be released by our destructor.
    mFontRef = CreateOrCopyFontRef();
    mFontRefInitialized = true;
  }
  // Return a non-retained reference; caller does not need to release.
  return mFontRef;
}

CGFontRef CTFontEntry::CreateOrCopyFontRef() {
  if (mFontRef) {
    // We have a cached CGFont, just add a reference. Caller must
    // release, but we'll still own our reference.
    ::CGFontRetain(mFontRef);
    return mFontRef;
  }

  CrashReporter::AutoRecordAnnotation autoFontName(
      CrashReporter::Annotation::FontName, mName);

  // Create a new CGFont; caller will own the only reference to it.
  AutoCFTypeRef<CFStringRef> psname(CreateCFStringForString(mName));
  if (!psname) {
    return nullptr;
  }

  CGFontRef ref = CGFontCreateWithFontName(psname);
  return ref;  // Not saved in mFontRef; caller will own the reference
}

// For a logging build, we wrap the CFDataRef in a FontTableRec so that we can
// use the MOZ_COUNT_[CD]TOR macros in it. A release build without logging
// does not get this overhead.
class FontTableRec {
 public:
  explicit FontTableRec(CFDataRef aDataRef) : mDataRef(aDataRef) {
    MOZ_COUNT_CTOR(FontTableRec);
  }

  ~FontTableRec() {
    MOZ_COUNT_DTOR(FontTableRec);
    CFRelease(mDataRef);
  }

 private:
  CFDataRef mDataRef;
};

/*static*/ void CTFontEntry::DestroyBlobFunc(void* aUserData) {
#ifdef NS_BUILD_REFCNT_LOGGING
  FontTableRec* ftr = static_cast<FontTableRec*>(aUserData);
  delete ftr;
#else
  CFRelease((CFDataRef)aUserData);
#endif
}

hb_blob_t* CTFontEntry::GetFontTable(uint32_t aTag) {
  mLock.ReadLock();
  AutoCFTypeRef<CGFontRef> fontRef(CreateOrCopyFontRef());
  mLock.ReadUnlock();
  if (!fontRef) {
    return nullptr;
  }

  CFDataRef dataRef = ::CGFontCopyTableForTag(fontRef, aTag);
  if (dataRef) {
    return hb_blob_create((const char*)CFDataGetBytePtr(dataRef),
                          CFDataGetLength(dataRef), HB_MEMORY_MODE_READONLY,
#ifdef NS_BUILD_REFCNT_LOGGING
                          new FontTableRec(dataRef),
#else
                          (void*)dataRef,
#endif
                          DestroyBlobFunc);
  }

  return nullptr;
}

bool CTFontEntry::HasFontTable(uint32_t aTableTag) {
  {
    // If we've already initialized mAvailableTables, we can return without
    // needing to take an exclusive lock.
    AutoReadLock lock(mLock);
    if (mAvailableTables.Count()) {
      return mAvailableTables.GetEntry(aTableTag);
    }
  }

  AutoWriteLock lock(mLock);
  if (mAvailableTables.Count() == 0) {
    AutoCFTypeRef<CGFontRef> fontRef(CreateOrCopyFontRef());
    if (!fontRef) {
      return false;
    }
    AutoCFTypeRef<CFArrayRef> tags(::CGFontCopyTableTags(fontRef));
    if (!tags) {
      return false;
    }
    int numTags = (int)CFArrayGetCount(tags);
    for (int t = 0; t < numTags; t++) {
      uint32_t tag = (uint32_t)(uintptr_t)CFArrayGetValueAtIndex(tags, t);
      mAvailableTables.PutEntry(tag);
    }
  }

  return mAvailableTables.GetEntry(aTableTag);
}

static bool CheckForAATSmallCaps(CFArrayRef aFeatures) {
  // Walk the array of feature descriptors from the font, and see whether
  // a small-caps feature setting is available.
  // Just bail out (returning false) if at any point we fail to find the
  // expected dictionary keys, etc; if the font has bad data, we don't even
  // try to search the rest of it.
  auto numFeatures = CFArrayGetCount(aFeatures);
  for (auto f = 0; f < numFeatures; ++f) {
    auto featureDict = (CFDictionaryRef)CFArrayGetValueAtIndex(aFeatures, f);
    if (!featureDict) {
      return false;
    }
    auto featureNum = (CFNumberRef)CFDictionaryGetValue(
        featureDict, CFSTR("CTFeatureTypeIdentifier"));
    if (!featureNum) {
      return false;
    }
    int16_t featureType;
    if (!CFNumberGetValue(featureNum, kCFNumberSInt16Type, &featureType)) {
      return false;
    }
    if (featureType == kLetterCaseType || featureType == kLowerCaseType) {
      // Which selector to look for, depending whether we've found the
      // legacy LetterCase feature or the new LowerCase one.
      const uint16_t smallCaps = (featureType == kLetterCaseType)
                                     ? kSmallCapsSelector
                                     : kLowerCaseSmallCapsSelector;
      auto selectors = (CFArrayRef)CFDictionaryGetValue(
          featureDict, CFSTR("CTFeatureTypeSelectors"));
      if (!selectors) {
        return false;
      }
      auto numSelectors = CFArrayGetCount(selectors);
      for (auto s = 0; s < numSelectors; s++) {
        auto selectorDict =
            (CFDictionaryRef)CFArrayGetValueAtIndex(selectors, s);
        if (!selectorDict) {
          return false;
        }
        auto selectorNum = (CFNumberRef)CFDictionaryGetValue(
            selectorDict, CFSTR("CTFeatureSelectorIdentifier"));
        if (!selectorNum) {
          return false;
        }
        int16_t selectorValue;
        if (!CFNumberGetValue(selectorNum, kCFNumberSInt16Type,
                              &selectorValue)) {
          return false;
        }
        if (selectorValue == smallCaps) {
          return true;
        }
      }
    }
  }
  return false;
}

bool CTFontEntry::SupportsOpenTypeFeature(Script aScript,
                                          uint32_t aFeatureTag) {
  // If we're going to shape with Core Text, we don't support added
  // OpenType features (aside from any CT applies by default), except
  // for 'smcp' which we map to an AAT feature selector.
  if (RequiresAATLayout()) {
    if (aFeatureTag != HB_TAG('s', 'm', 'c', 'p')) {
      return false;
    }
    if (mHasAATSmallCapsInitialized) {
      return mHasAATSmallCaps;
    }
    mHasAATSmallCapsInitialized = true;
    CGFontRef cgFont = GetFontRef();
    if (!cgFont) {
      return mHasAATSmallCaps;
    }

    CrashReporter::AutoRecordAnnotation autoFontName(
        CrashReporter::Annotation::FontName, FamilyName());

    AutoCFTypeRef<CTFontRef> ctFont(
        CTFontCreateWithGraphicsFont(cgFont, 0.0, nullptr, nullptr));
    if (ctFont) {
      AutoCFTypeRef<CFArrayRef> features(CTFontCopyFeatures(ctFont));
      if (features) {
        mHasAATSmallCaps = CheckForAATSmallCaps(features);
      }
    }
    return mHasAATSmallCaps;
  }
  return gfxFontEntry::SupportsOpenTypeFeature(aScript, aFeatureTag);
}

void CTFontEntry::AddSizeOfIncludingThis(MallocSizeOf aMallocSizeOf,
                                         FontListSizes* aSizes) const {
  aSizes->mFontListSize += aMallocSizeOf(this);
  AddSizeOfExcludingThis(aMallocSizeOf, aSizes);
}

static CTFontDescriptorRef CreateDescriptorForFamily(
    const nsACString& aFamilyName, bool aNormalized) {
  AutoCFTypeRef<CFStringRef> family(CreateCFStringForString(aFamilyName));
  const void* values[] = {family};
  const void* keys[] = {kCTFontFamilyNameAttribute};
  AutoCFTypeRef<CFDictionaryRef> attributes(CFDictionaryCreate(
      kCFAllocatorDefault, keys, values, 1, &kCFTypeDictionaryKeyCallBacks,
      &kCFTypeDictionaryValueCallBacks));

  // Not AutoCFTypeRef, because we might return it.
  CTFontDescriptorRef descriptor =
      CTFontDescriptorCreateWithAttributes(attributes);

  if (aNormalized) {
    CTFontDescriptorRef normalized =
        CTFontDescriptorCreateMatchingFontDescriptor(descriptor, nullptr);
    if (normalized) {
      CFRelease(descriptor);
      return normalized;
    }
  }

  return descriptor;
}

void CTFontFamily::LocalizedName(nsACString& aLocalizedName) {
  AutoCFTypeRef<CTFontDescriptorRef> descriptor(
      CreateDescriptorForFamily(mName, true));
  if (descriptor) {
    AutoCFTypeRef<CFStringRef> name(
        static_cast<CFStringRef>(CTFontDescriptorCopyLocalizedAttribute(
            descriptor, kCTFontFamilyNameAttribute, nullptr)));
    if (name) {
      nsAutoString localized;
      GetStringForCFString(name, localized);
      if (!localized.IsEmpty()) {
        CopyUTF16toUTF8(localized, aLocalizedName);
        return;
      }
    }
  }

  // failed to get localized name, just use the canonical one
  aLocalizedName = mName;
}

// Return the CSS weight value to use for the given face, overriding what
// AppKit gives us (used to adjust families with bad weight values, see
// bug 931426).
// A return value of 0 indicates no override - use the existing weight.
static inline int GetWeightOverride(const nsAString& aPSName) {
  nsAutoCString prefName("font.weight-override.");
  // The PostScript name is required to be ASCII; if it's not, the font is
  // broken anyway, so we really don't care that this is lossy.
  LossyAppendUTF16toASCII(aPSName, prefName);
  return Preferences::GetInt(prefName.get(), 0);
}

// The Core Text weight trait is documented as
//
//   ...a float value between -1.0 and 1.0 for normalized weight.
//   The value of 0.0 corresponds to the regular or medium font weight.
//
// (https://developer.apple.com/documentation/coretext/kctfontweighttrait)
//
// CSS 'normal' font-weight is defined as 400, so we map 0.0 to this.
// The exact mapping to use for other values is not well defined; the table
// here is empirically determined by looking at what Core Text returns for
// the various system fonts that have a range of weights.
static inline int32_t CoreTextWeightToCSSWeight(CGFloat aCTWeight) {
  using Mapping = std::pair<CGFloat, int32_t>;
  constexpr Mapping kCoreTextToCSSWeights[] = {
      // clang-format off
      {-1.0, 1},
      {-0.8, 100},
      {-0.6, 200},
      {-0.4, 300},
      {0.0,  400},  // standard 'regular' weight
      {0.23, 500},
      {0.3,  600},
      {0.4,  700},  // standard 'bold' weight
      {0.56, 800},
      {0.62, 900},  // Core Text seems to return 0.62 for faces with both
                    // usWeightClass=800 and 900 in their OS/2 tables!
                    // We use 900 as there are also fonts that return 0.56,
                    // so we want an intermediate value for that.
      {1.0,  1000},
      // clang-format on
  };
  const auto* begin = &kCoreTextToCSSWeights[0];
  const auto* end = begin + std::size(kCoreTextToCSSWeights);
  auto m = std::upper_bound(begin, end, aCTWeight,
                            [](CGFloat aValue, const Mapping& aMapping) {
                              return aValue <= aMapping.first;
                            });
  if (m == end) {
    NS_WARNING("Core Text weight out of range");
    return 1000;
  }
  if (m->first == aCTWeight || m == begin) {
    return m->second;
  }
  // Interpolate between the preceding and found entries:
  const auto* prev = m - 1;
  const auto t = (aCTWeight - prev->first) / (m->first - prev->first);
  return NS_round(prev->second * (1.0 - t) + m->second * t);
}

// The Core Text width trait is documented as
//
//   ...a float between -1.0 and 1.0. The value of 0.0 corresponds to regular
//   glyph spacing, and negative values represent condensed glyph spacing
//
// (https://developer.apple.com/documentation/coretext/kctfontweighttrait)
//
// CSS 'normal' font-stretch is 100%; 'ultra-expanded' is 200%, and 'ultra-
// condensed' is 50%. We map the extremes of the Core Text trait to these
// values, and interpolate in between these and normal.
static inline FontStretch CoreTextWidthToCSSStretch(CGFloat aCTWidth) {
  if (aCTWidth >= 0.0) {
    return FontStretch::FromFloat(100.0 + aCTWidth * 100.0);
  }
  return FontStretch::FromFloat(100.0 + aCTWidth * 50.0);
}

void CTFontFamily::AddFace(CTFontDescriptorRef aFace) {
  AutoCFTypeRef<CFStringRef> psname(
      (CFStringRef)CTFontDescriptorCopyAttribute(aFace, kCTFontNameAttribute));
  AutoCFTypeRef<CFStringRef> facename(
      (CFStringRef)CTFontDescriptorCopyAttribute(aFace,
                                                 kCTFontStyleNameAttribute));

  AutoCFTypeRef<CFDictionaryRef> traitsDict(
      (CFDictionaryRef)CTFontDescriptorCopyAttribute(aFace,
                                                     kCTFontTraitsAttribute));
  CFNumberRef weight =
      (CFNumberRef)CFDictionaryGetValue(traitsDict, kCTFontWeightTrait);
  CFNumberRef width =
      (CFNumberRef)CFDictionaryGetValue(traitsDict, kCTFontWidthTrait);
  CFNumberRef symbolicTraits =
      (CFNumberRef)CFDictionaryGetValue(traitsDict, kCTFontSymbolicTrait);

  bool isStandardFace = false;

  // make a nsString
  nsAutoString postscriptFontName;
  GetStringForCFString(psname, postscriptFontName);

  int32_t cssWeight = GetWeightOverride(postscriptFontName);
  if (cssWeight) {
    // scale down and clamp, to get a value from 1..9
    cssWeight = ((cssWeight + 50) / 100);
    cssWeight = std::clamp(cssWeight, 1, 9);
    cssWeight *= 100;  // scale up to CSS values
  } else {
    CGFloat weightValue;
    CFNumberGetValue(weight, kCFNumberCGFloatType, &weightValue);
    cssWeight = CoreTextWeightToCSSWeight(weightValue);
  }

  if (kCFCompareEqualTo == CFStringCompare(facename, CFSTR("Regular"), 0) ||
      kCFCompareEqualTo == CFStringCompare(facename, CFSTR("Bold"), 0) ||
      kCFCompareEqualTo == CFStringCompare(facename, CFSTR("Italic"), 0) ||
      kCFCompareEqualTo == CFStringCompare(facename, CFSTR("Oblique"), 0) ||
      kCFCompareEqualTo == CFStringCompare(facename, CFSTR("Bold Italic"), 0) ||
      kCFCompareEqualTo ==
          CFStringCompare(facename, CFSTR("Bold Oblique"), 0)) {
    isStandardFace = true;
  }

  // create a font entry
  CTFontEntry* fontEntry = new CTFontEntry(
      NS_ConvertUTF16toUTF8(postscriptFontName),
      WeightRange(FontWeight::FromInt(cssWeight)), isStandardFace);

  CGFloat widthValue;
  CFNumberGetValue(width, kCFNumberCGFloatType, &widthValue);
  fontEntry->mStretchRange =
      StretchRange(CoreTextWidthToCSSStretch(widthValue));

  SInt32 traitsValue;
  CFNumberGetValue(symbolicTraits, kCFNumberSInt32Type, &traitsValue);
  if (traitsValue & kCTFontItalicTrait) {
    fontEntry->mStyleRange = SlantStyleRange(FontSlantStyle::ITALIC);
  }

  if (traitsValue & kCTFontMonoSpaceTrait) {
    fontEntry->mFixedPitch = true;
  }

  if (gfxPlatform::HasVariationFontSupport()) {
    fontEntry->SetupVariationRanges();
  }

  if (LOG_FONTLIST_ENABLED()) {
    nsAutoCString weightString;
    fontEntry->Weight().ToString(weightString);
    nsAutoCString stretchString;
    fontEntry->Stretch().ToString(stretchString);
    LOG_FONTLIST(
        ("(fontlist) added (%s) to family (%s)"
         " with style: %s weight: %s stretch: %s",
         fontEntry->Name().get(), Name().get(),
         fontEntry->IsItalic() ? "italic" : "normal", weightString.get(),
         stretchString.get()));
  }

  // insert into font entry array of family
  AddFontEntryLocked(fontEntry);
}

void CTFontFamily::FindStyleVariationsLocked(FontInfoData* aFontInfoData) {
  if (mHasStyles) {
    return;
  }

  AUTO_PROFILER_LABEL_DYNAMIC_NSCSTRING("CTFontFamily::FindStyleVariations",
                                        LAYOUT, mName);

  if (mForSystemFont) {
    MOZ_ASSERT(gfxPlatform::HasVariationFontSupport());

    auto addToFamily = [&](CTFontRef aFont) MOZ_REQUIRES(mLock) {
      AutoCFTypeRef<CFStringRef> psName(CTFontCopyPostScriptName(aFont));
      nsAutoString nameUTF16;
      nsAutoCString nameUTF8;
      GetStringForCFString(psName, nameUTF16);
      CopyUTF16toUTF8(nameUTF16, nameUTF8);

      auto* fe =
          new CTFontEntry(nameUTF8, WeightRange(FontWeight::NORMAL), true, 0.0);

      // Set the appropriate style, assuming it may not have a variation range.
      CTFontSymbolicTraits traits = CTFontGetSymbolicTraits(aFont);
      fe->mStyleRange = SlantStyleRange((traits & kCTFontTraitItalic)
                                            ? FontSlantStyle::ITALIC
                                            : FontSlantStyle::NORMAL);

      // Set up weight (and width, if present) ranges.
      fe->SetupVariationRanges();
      AddFontEntryLocked(fe);
    };

    addToFamily(mForSystemFont);

    // See if there is a corresponding italic face, and add it to the family.
    AutoCFTypeRef<CTFontRef> italicFont(CTFontCreateCopyWithSymbolicTraits(
        mForSystemFont, 0.0, nullptr, kCTFontTraitItalic, kCTFontTraitItalic));
    if (italicFont != mForSystemFont) {
      addToFamily(italicFont);
    }

    CFRelease(mForSystemFont);
    mForSystemFont = nullptr;

    SetHasStyles(true);

    return;
  }

  struct Context {
    CTFontFamily* family;
    const void* prevValue = nullptr;
  };

  auto addFaceFunc = [](const void* aValue, void* aContext) -> void {
    Context* context = (Context*)aContext;
    if (aValue == context->prevValue) {
      return;
    }
    context->prevValue = aValue;
    CTFontFamily* family = context->family;
    // Calling family->AddFace requires that family->mLock is held. We know
    // this will be true because FindStyleVariationsLocked already requires it,
    // but the thread-safety analysis can't track that through into the lambda
    // here, so we disable the check to avoid a spurious warning.
    MOZ_PUSH_IGNORE_THREAD_SAFETY;
    family->AddFace((CTFontDescriptorRef)aValue);
    MOZ_POP_THREAD_SAFETY;
  };

  AutoCFTypeRef<CTFontDescriptorRef> descriptor(
      CreateDescriptorForFamily(mName, false));
  AutoCFTypeRef<CFArrayRef> faces(
      CTFontDescriptorCreateMatchingFontDescriptors(descriptor, nullptr));

  if (faces) {
    Context context{this};
    CFArrayApplyFunction(faces, CFRangeMake(0, CFArrayGetCount(faces)),
                         addFaceFunc, &context);
  }

  SortAvailableFonts();
  SetHasStyles(true);

  if (mIsBadUnderlineFamily) {
    SetBadUnderlineFonts();
  }

  CheckForSimpleFamily();
}

/* CoreTextFontList */
#pragma mark -

CoreTextFontList::CoreTextFontList()
    : gfxPlatformFontList(false), mDefaultFont(nullptr) {
#ifdef MOZ_BUNDLED_FONTS
  // We activate bundled fonts if the pref is > 0 (on) or < 0 (auto), only an
  // explicit value of 0 (off) will disable them.
  if (StaticPrefs::gfx_bundled_fonts_activate_AtStartup() != 0) {
    auto timerId = glean::fontlist::bundledfonts_activate.Start(); 
    ActivateBundledFonts();
    TimeStamp end = TimeStamp::Now();
    glean::fontlist::bundledfonts_activate.StopAndAccumulate(
        std::move(timerId));
  }
#endif

  // Load the font-list preferences now, so that we don't have to do it from
  // Init[Shared]FontListForPlatform, which may be called off-main-thread.
  gfxFontUtils::GetPrefsFontList("font.preload-names-list", mPreloadFonts);
}

CoreTextFontList::~CoreTextFontList() {
  AutoLock lock(mLock);

  if (XRE_IsParentProcess()) {
    CFNotificationCenterRemoveObserver(
        CFNotificationCenterGetLocalCenter(), this,
        kCTFontManagerRegisteredFontsChangedNotification, 0);
  }

  if (mDefaultFont) {
    CFRelease(mDefaultFont);
  }
}

void CoreTextFontList::AddFamily(const nsACString& aFamilyName,
                                 FontVisibility aVisibility) {
  nsAutoCString key;
  ToLowerCase(aFamilyName, key);

  RefPtr<gfxFontFamily> familyEntry =
      new CTFontFamily(aFamilyName, aVisibility);
  mFontFamilies.InsertOrUpdate(key, RefPtr{familyEntry});

  // check the bad underline blocklist
  if (mBadUnderlineFamilyNames.ContainsSorted(key)) {
    familyEntry->SetBadUnderlineFamily();
  }
}

void CoreTextFontList::AddFamily(CFStringRef aFamily) {
  // CTFontManager includes internal family names and LastResort; skip those.
  if (!aFamily ||
      CFStringCompare(aFamily, CFSTR("LastResort"),
                      kCFCompareCaseInsensitive) == kCFCompareEqualTo ||
      CFStringCompare(aFamily, CFSTR(".LastResort"),
                      kCFCompareCaseInsensitive) == kCFCompareEqualTo) {
    return;
  }

  nsAutoString familyName;
  GetStringForCFString(aFamily, familyName);

  NS_ConvertUTF16toUTF8 nameUtf8(familyName);
  AddFamily(nameUtf8, GetVisibilityForFamily(nameUtf8));
}

/* static */
void CoreTextFontList::ActivateFontsFromDir(
    const nsACString& aDir, nsTHashSet<nsCStringHashKey>* aLoadedFamilies) {
  AutoCFTypeRef<CFURLRef> directory(CFURLCreateFromFileSystemRepresentation(
      kCFAllocatorDefault, (const UInt8*)nsPromiseFlatCString(aDir).get(),
      aDir.Length(), true));
  if (!directory) {
    return;
  }
  AutoCFTypeRef<CFURLEnumeratorRef> enumerator(
      CFURLEnumeratorCreateForDirectoryURL(kCFAllocatorDefault, directory,
                                           kCFURLEnumeratorDefaultBehavior,
                                           nullptr));
  if (!enumerator) {
    return;
  }
  AutoCFTypeRef<CFMutableArrayRef> urls(
      CFArrayCreateMutable(kCFAllocatorDefault, 0, &kCFTypeArrayCallBacks));
  if (!urls) {
    return;
  }

  CFURLRef url;
  CFURLEnumeratorResult result;
  do {
    result = CFURLEnumeratorGetNextURL(enumerator, &url, nullptr);
    if (result != kCFURLEnumeratorSuccess) {
      continue;
    }
    CFArrayAppendValue(urls, url);

    if (!aLoadedFamilies) {
      continue;
    }
    AutoCFTypeRef<CFArrayRef> descriptors(
        CTFontManagerCreateFontDescriptorsFromURL(url));
    if (!descriptors || !CFArrayGetCount(descriptors)) {
      continue;
    }
    CTFontDescriptorRef desc =
        (CTFontDescriptorRef)CFArrayGetValueAtIndex(descriptors, 0);
    AutoCFTypeRef<CFStringRef> name(
        (CFStringRef)CTFontDescriptorCopyAttribute(desc,
                                                   kCTFontFamilyNameAttribute));
    nsAutoCString key;
    key.SetLength((CFStringGetLength(name) + 1) * 3);
    if (CFStringGetCString(name, key.BeginWriting(), key.Length(),
                           kCFStringEncodingUTF8)) {
      key.SetLength(strlen(key.get()));
      aLoadedFamilies->Insert(key);
    }
  } while (result != kCFURLEnumeratorEnd);

  /* HAY GUYS NEW FUCKING API, FUCK YOU CORPORATE WELFARE HACKS 
   * CTFontManagerRegisterFontURLs(urls, kCTFontManagerScopeProcess, false,
                                nullptr);
    */
  CTFontManagerRegisterFontsForURLs(urls, kCTFontManagerScopeProcess, nullptr);

}

void CoreTextFontList::ReadSystemFontList(dom::SystemFontList* aList)
    MOZ_NO_THREAD_SAFETY_ANALYSIS {
  // Note: We rely on the records for mSystemFontFamilyName (if present) being
  // *before* the main font list, so that name is known in the content process
  // by the time we add the actual family records to the font list.
  aList->entries().AppendElement(FontFamilyListEntry(
      mSystemFontFamilyName, FontVisibility::Unknown, kSystemFontFamily));
  if (mUseSizeSensitiveSystemFont) {
      aList->entries().AppendElement(FontFamilyListEntry(
                  mSystemFontFamilyName, FontVisibility::Unknown,
                  kDisplaySizeSystemFontFamily));
  }
  // Now collect the list of available families, with visibility attributes.
  for (auto f = mFontFamilies.Iter(); !f.Done(); f.Next()) {
    auto macFamily = f.Data().get();
    aList->entries().AppendElement(FontFamilyListEntry(
        macFamily->Name(), macFamily->Visibility(), kStandardFontFamily));
  }
}

void CoreTextFontList::PreloadNamesList() {
  uint32_t numFonts = mPreloadFonts.Length();
  for (uint32_t i = 0; i < numFonts; i++) {
    nsAutoCString key;
    GenerateFontListKey(mPreloadFonts[i], key);

    // only search canonical names!
    gfxFontFamily* familyEntry = mFontFamilies.GetWeak(key);
    if (familyEntry) {
      familyEntry->ReadOtherFamilyNames(this);
    }
  }
}

gfxFontFamily* CoreTextFontList::FindSystemFontFamily(
    const nsACString& aFamily) {
  nsAutoCString key;
  GenerateFontListKey(aFamily, key);

  gfxFontFamily* familyEntry;
  if ((familyEntry = mFontFamilies.GetWeak(key))) {
    return CheckFamily(familyEntry);
  }

  return nullptr;
}

void CoreTextFontList::RegisteredFontsChangedNotificationCallback(
    CFNotificationCenterRef center, void* observer, CFStringRef name,
    const void* object, CFDictionaryRef userInfo) {
  if (!CFEqual(name, kCTFontManagerRegisteredFontsChangedNotification)) {
    return;
  }

  CoreTextFontList* fl = static_cast<CoreTextFontList*>(observer);
  if (!fl->IsInitialized()) {
    return;
  }

  // xxx - should be carefully pruning the list of fonts, not rebuilding it from
  // scratch
  fl->UpdateFontList();

  auto flags = gfxPlatform::GlobalReflowFlags::NeedsReframe |
               gfxPlatform::GlobalReflowFlags::FontsChanged;
  gfxPlatform::ForceGlobalReflow(flags);
  dom::ContentParent::NotifyUpdatedFonts(true);
}

gfxFontEntry* CoreTextFontList::PlatformGlobalFontFallback(
    nsPresContext* aPresContext, const uint32_t aCh, Script aRunScript,
    const gfxFontStyle* aMatchStyle, FontFamily& aMatchedFamily) {
  CFStringRef str;
  UniChar ch[2];
  CFIndex length = 1;

  if (IS_IN_BMP(aCh)) {
    ch[0] = aCh;
    str = CFStringCreateWithCharactersNoCopy(kCFAllocatorDefault, ch, 1,
                                             kCFAllocatorNull);
  } else {
    ch[0] = H_SURROGATE(aCh);
    ch[1] = L_SURROGATE(aCh);
    str = CFStringCreateWithCharactersNoCopy(kCFAllocatorDefault, ch, 2,
                                             kCFAllocatorNull);
    length = 2;
  }
  if (!str) {
    return nullptr;
  }

  // use CoreText to find the fallback family

  gfxFontEntry* fontEntry = nullptr;
  bool cantUseFallbackFont = false;

  if (!mDefaultFont) {
    mDefaultFont = CTFontCreateWithName(CFSTR("LucidaGrande"), 12.f, NULL);
  }

  AutoCFTypeRef<CTFontRef> fallback(
      CTFontCreateForString(mDefaultFont, str, CFRangeMake(0, length)));

  if (fallback) {
    AutoCFTypeRef<CFStringRef> familyNameRef(CTFontCopyFamilyName(fallback));

    if (familyNameRef &&
        CFStringCompare(familyNameRef, CFSTR("LastResort"),
                        kCFCompareCaseInsensitive) != kCFCompareEqualTo &&
        CFStringCompare(familyNameRef, CFSTR(".LastResort"),
                        kCFCompareCaseInsensitive) != kCFCompareEqualTo) {
      AutoTArray<UniChar, 1024> buffer;
      CFIndex familyNameLen = CFStringGetLength(familyNameRef);
      buffer.SetLength(familyNameLen + 1);
      CFStringGetCharacters(familyNameRef, CFRangeMake(0, familyNameLen),
                            buffer.Elements());
      buffer[familyNameLen] = 0;
      NS_ConvertUTF16toUTF8 familyNameString(
          reinterpret_cast<char16_t*>(buffer.Elements()), familyNameLen);

      if (SharedFontList()) {
        fontlist::Family* family =
            FindSharedFamily(aPresContext, familyNameString);
        if (family) {
          fontlist::Face* face =
              family->FindFaceForStyle(SharedFontList(), *aMatchStyle);
          if (face) {
            fontEntry = GetOrCreateFontEntryLocked(face, family);
          }
          if (fontEntry) {
            if (fontEntry->HasCharacter(aCh)) {
              aMatchedFamily = FontFamily(family);
            } else {
              fontEntry = nullptr;
              cantUseFallbackFont = true;
            }
          }
        }
      }

      // The macOS system font does not appear in the shared font list, so if
      // we didn't find the fallback font above, we should also check for an
      // unshared fontFamily in the system list.
      if (!fontEntry) {
        gfxFontFamily* family = FindSystemFontFamily(familyNameString);
        if (family) {
          fontEntry = family->FindFontForStyle(*aMatchStyle);
          if (fontEntry) {
            if (fontEntry->HasCharacter(aCh)) {
              aMatchedFamily = FontFamily(family);
            } else {
              fontEntry = nullptr;
              cantUseFallbackFont = true;
            }
          }
        }
      }
    }
  }

  if (cantUseFallbackFont) {
    glean::fontlist::bad_fallback_font
        .EnumGet(static_cast<glean::fontlist::BadFallbackFontLabel>(
            cantUseFallbackFont))
        .Add();
  }

  CFRelease(str);

  return fontEntry;
}

gfxFontEntry* CoreTextFontList::LookupLocalFont(
    nsPresContext* aPresContext, const nsACString& aFontName,
    WeightRange aWeightForEntry, StretchRange aStretchForEntry,
    SlantStyleRange aStyleForEntry) {
  if (aFontName.IsEmpty() || aFontName[0] == '.') {
    return nullptr;
  }

  AutoLock lock(mLock);

  CrashReporter::AutoRecordAnnotation autoFontName(
      CrashReporter::Annotation::FontName, aFontName);

  AutoCFTypeRef<CFStringRef> faceName(CreateCFStringForString(aFontName));
  if (!faceName) {
    return nullptr;
  }

  // lookup face based on postscript or full name
  AutoCFTypeRef<CGFontRef> fontRef(CGFontCreateWithFontName(faceName));
  if (!fontRef) {
    return nullptr;
  }

  // It's possible for CGFontCreateWithFontName to return a font that has been
  // deactivated/uninstalled, or a font that is excluded from the font list due
  // to CSS font-visibility restriction. So we need to check whether this font
  // is allowed to be used.

  // CGFontRef doesn't offer a family-name API, so we go via a CTFontRef.
  AutoCFTypeRef<CTFontRef> ctFont(
      CTFontCreateWithGraphicsFont(fontRef, 0.0, nullptr, nullptr));
  if (!ctFont) {
    return nullptr;
  }
  AutoCFTypeRef<CFStringRef> name(CTFontCopyFamilyName(ctFont));
  // Convert the family name to a key suitable for font-list lookup (8-bit,
  // lowercased).
  nsAutoCString key;
  if (name) {
    // CFStringGetLength is in UTF-16 code units. The maximum this count can
    // expand when converted to UTF-8 is 3x. We add 1 to ensure there will also
    // be space for null-termination of the resulting C string.
    key.SetLength((CFStringGetLength(name) + 1) * 3);
  }
  if (!name || !CFStringGetCString(name, key.BeginWriting(), key.Length(),
                                   kCFStringEncodingUTF8)) {
    // This shouldn't ever happen, but if it does we just bail.
    NS_WARNING("Failed to get family name?");
    key.Truncate(0);
  }
  if (key.IsEmpty()) {
    return nullptr;
  }
  // Reset our string length to match the actual C string we got, which will
  // usually be much shorter than the maximal buffer we allocated.
  key.Truncate(strlen(key.get()));
  ToLowerCase(key);
  // If the family can't be looked up, this font is not available for use.
  FontFamily family = FindFamily(aPresContext, key);
  if (family.IsNull()) {
    return nullptr;
  }

  return new CTFontEntry(aFontName, fontRef, aWeightForEntry, aStretchForEntry,
                         aStyleForEntry, false, true);
}

static void ReleaseData(void* info, const void* data, size_t size) {
  free((void*)data);
}

gfxFontEntry* CoreTextFontList::MakePlatformFont(const nsACString& aFontName,
                                                 WeightRange aWeightForEntry,
                                                 StretchRange aStretchForEntry,
                                                 SlantStyleRange aStyleForEntry,
                                                 const uint8_t* aFontData,
                                                 uint32_t aLength) {
  NS_ASSERTION(aFontData, "MakePlatformFont called with null data");

  // create the font entry
  nsAutoString uniqueName;

  nsresult rv = gfxFontUtils::MakeUniqueUserFontName(uniqueName);
  if (NS_FAILED(rv)) {
    return nullptr;
  }

  CrashReporter::AutoRecordAnnotation autoFontName(
      CrashReporter::Annotation::FontName, aFontName);

  AutoCFTypeRef<CGDataProviderRef> provider(
      ::CGDataProviderCreateWithData(nullptr, aFontData, aLength, &ReleaseData));
  AutoCFTypeRef<CGFontRef> fontRef(::CGFontCreateWithDataProvider(provider));
  if (!fontRef) {
    return nullptr;
  }

  auto newFontEntry = MakeUnique<CTFontEntry>(
      NS_ConvertUTF16toUTF8(uniqueName), fontRef, aWeightForEntry,
      aStretchForEntry, aStyleForEntry, true, false);
  return newFontEntry.release();
}

// Webkit code uses a system font meta name, so mimic that here
// WebCore/platform/graphics/mac/FontCacheMac.mm
static const char kSystemFont_system[] = "-apple-system";

// System fonts under OSX 10.11 use a combination of two families, one
// for text sizes and another for larger, display sizes. Each has a
// different number of weights. There aren't efficient API's for looking
// this information up, so hard code the logic here but confirm via
// debug assertions that the logic is correct.

const CGFloat kTextDisplayCrossover = 20.0;  // use text family below this size
                                              //
bool CoreTextFontList::FindAndAddFamiliesLocked(
    nsPresContext* aPresContext, StyleGenericFontFamily aGeneric,
    const nsACString& aFamily, nsTArray<FamilyAndGeneric>* aOutput,
    FindFamiliesFlags aFlags, gfxFontStyle* aStyle, nsAtom* aLanguage,
    gfxFloat aDevToCssSize) {
  if (aFamily.EqualsLiteral(kSystemFont_system)) {
    // Search for special system font name, -apple-system. This is not done via
    // the shared fontlist because the hidden system font may not be included
    // there; we create a separate gfxFontFamily to manage this family.
     const nsCString& systemFontFamilyName =
         mUseSizeSensitiveSystemFont && aStyle &&
                 (aStyle->size * aDevToCssSize) >= kTextDisplayCrossover
             ? mSystemDisplayFontFamilyName
             : mSystemFontFamilyName;
    if (SharedFontList() && !nsCocoaFeatures::OnCatalinaOrLater()) {
      FindFamiliesFlags flags =
          aFlags | FindFamiliesFlags::eSearchHiddenFamilies;
      return gfxPlatformFontList::FindAndAddFamiliesLocked(
          aPresContext, aGeneric, systemFontFamilyName, aOutput, flags, aStyle,
          aLanguage, aDevToCssSize);
    } else {
      if (auto* fam = FindSystemFontFamily(systemFontFamilyName)) {
        aOutput->AppendElement(fam);
        return true;
      }
    }
    return false;
  }

  return gfxPlatformFontList::FindAndAddFamiliesLocked(
      aPresContext, aGeneric, aFamily, aOutput, aFlags, aStyle, aLanguage,
      aDevToCssSize);
}

// used to load system-wide font info on off-main thread
class CTFontInfo final : public FontInfoData {
 public:
  CTFontInfo(bool aLoadOtherNames, bool aLoadFaceNames, bool aLoadCmaps,
             RecursiveMutex& aLock)
      : FontInfoData(aLoadOtherNames, aLoadFaceNames, aLoadCmaps),
        mLock(aLock) {}

  virtual ~CTFontInfo() = default;

  virtual void Load() { if(nsCocoaFeatures::OnLionOrLater()) FontInfoData::Load(); }

  // loads font data for all members of a given family
  virtual void LoadFontFamilyData(const nsACString& aFamilyName);

  RecursiveMutex& mLock;
};

void CTFontInfo::LoadFontFamilyData(const nsACString& aFamilyName) {
  CrashReporter::AutoRecordAnnotation autoFontName(
      CrashReporter::Annotation::FontName, aFamilyName);
  // Prevent this from running concurrently with CGFont operations on the main
  // thread, because the macOS font cache is fragile with concurrent access.
  // This appears to be a vulnerability within CoreText in versions of macOS
  // before macOS 13. In time, we can remove this lock.
  RecursiveMutexAutoLock lock(mLock);

  // family name ==> CTFontDescriptor
  AutoCFTypeRef<CFStringRef> family(CreateCFStringForString(aFamilyName));

  AutoCFTypeRef<CFMutableDictionaryRef> attr(
      CFDictionaryCreateMutable(NULL, 0, &kCFTypeDictionaryKeyCallBacks,
                                &kCFTypeDictionaryValueCallBacks));
  CFDictionaryAddValue(attr, kCTFontFamilyNameAttribute, family);
  AutoCFTypeRef<CTFontDescriptorRef> fd(
      CTFontDescriptorCreateWithAttributes(attr));
  AutoCFTypeRef<CFArrayRef> matchingFonts(
      CTFontDescriptorCreateMatchingFontDescriptors(fd, NULL));
  if (!matchingFonts) {
    return;
  }

  nsTArray<nsCString> otherFamilyNames;
  bool hasOtherFamilyNames = true;

  // iterate over faces in the family
  int f, numFaces = (int)CFArrayGetCount(matchingFonts);
  CTFontDescriptorRef prevFace = nullptr;
  for (f = 0; f < numFaces; f++) {
    mLoadStats.fonts++;

    CTFontDescriptorRef faceDesc =
        (CTFontDescriptorRef)CFArrayGetValueAtIndex(matchingFonts, f);
    if (!faceDesc) {
      continue;
    }

    if (faceDesc == prevFace) {
      continue;
    }
    prevFace = faceDesc;

    AutoCFTypeRef<CTFontRef> fontRef(
        CTFontCreateWithFontDescriptor(faceDesc, 0.0, nullptr));
    if (!fontRef) {
      NS_WARNING("failed to create a CTFontRef");
      continue;
    }

    if (mLoadCmaps) {
      // face name
      AutoCFTypeRef<CFStringRef> faceName(
          (CFStringRef)CTFontDescriptorCopyAttribute(faceDesc,
                                                     kCTFontNameAttribute));

      AutoTArray<UniChar, 1024> buffer;
      CFIndex len = CFStringGetLength(faceName);
      buffer.SetLength(len + 1);
      CFStringGetCharacters(faceName, CFRangeMake(0, len), buffer.Elements());
      buffer[len] = 0;
      NS_ConvertUTF16toUTF8 fontName(
          reinterpret_cast<char16_t*>(buffer.Elements()), len);

      // load the cmap data
      FontFaceData fontData;
      AutoCFTypeRef<CFDataRef> cmapTable(CTFontCopyTable(
          fontRef, kCTFontTableCmap, kCTFontTableOptionNoOptions));

      if (cmapTable) {
        const uint8_t* cmapData = (const uint8_t*)CFDataGetBytePtr(cmapTable);
        uint32_t cmapLen = CFDataGetLength(cmapTable);
        RefPtr<gfxCharacterMap> charmap = new gfxCharacterMap();
        uint32_t offset;
        nsresult rv;

        rv = gfxFontUtils::ReadCMAP(cmapData, cmapLen, *charmap, offset);
        if (NS_SUCCEEDED(rv)) {
          fontData.mCharacterMap = charmap;
          fontData.mUVSOffset = offset;
          mLoadStats.cmaps++;
        }
      }

      mFontFaceData.InsertOrUpdate(fontName, fontData);
    }

    if (mLoadOtherNames && hasOtherFamilyNames) {
      AutoCFTypeRef<CFDataRef> nameTable(CTFontCopyTable(
          fontRef, kCTFontTableName, kCTFontTableOptionNoOptions));

      if (nameTable) {
        const char* nameData = (const char*)CFDataGetBytePtr(nameTable);
        uint32_t nameLen = CFDataGetLength(nameTable);
        gfxFontUtils::ReadOtherFamilyNamesForFace(
            aFamilyName, nameData, nameLen, otherFamilyNames, false);
        hasOtherFamilyNames = otherFamilyNames.Length() != 0;
      }
    }
  }

  // if found other names, insert them in the hash table
  if (otherFamilyNames.Length() != 0) {
    mOtherFamilyNames.InsertOrUpdate(aFamilyName, otherFamilyNames);
    mLoadStats.othernames += otherFamilyNames.Length();
  }
}

already_AddRefed<FontInfoData> CoreTextFontList::CreateFontInfoData() {
  bool loadCmaps = !UsesSystemFallback() ||
                   gfxPlatform::GetPlatform()->UseCmapsDuringSystemFallback();

  mLock.AssertCurrentThreadIn();
  RefPtr<CTFontInfo> fi =
      new CTFontInfo(true, NeedFullnamePostscriptNames(), loadCmaps, mLock);
  return fi.forget();
}

gfxFontFamily* CoreTextFontList::CreateFontFamily(
    const nsACString& aName, FontVisibility aVisibility) const {
  return new CTFontFamily(aName, aVisibility);
}

gfxFontEntry* CoreTextFontList::CreateFontEntry(
    fontlist::Face* aFace, const fontlist::Family* aFamily) {
  CTFontEntry* fe = new CTFontEntry(
      aFace->mDescriptor.AsString(SharedFontList()), aFace->mWeight, false,
      0.0);  // XXX standardFace, sizeHint
  fe->InitializeFrom(aFace, aFamily);
  return fe;
}

void CoreTextFontList::AddFaceInitData(
    CTFontDescriptorRef aFontDesc, nsTArray<fontlist::Face::InitData>& aFaces,
    bool aLoadCmaps) {
  AutoCFTypeRef<CFStringRef> psname(
      (CFStringRef)CTFontDescriptorCopyAttribute(aFontDesc,
                                                 kCTFontNameAttribute));
  AutoCFTypeRef<CFStringRef> facename(
      (CFStringRef)CTFontDescriptorCopyAttribute(aFontDesc,
                                                 kCTFontStyleNameAttribute));
  AutoCFTypeRef<CFDictionaryRef> traitsDict(
      (CFDictionaryRef)CTFontDescriptorCopyAttribute(aFontDesc,
                                                     kCTFontTraitsAttribute));

  CFNumberRef weight =
      (CFNumberRef)CFDictionaryGetValue(traitsDict, kCTFontWeightTrait);
  CFNumberRef width =
      (CFNumberRef)CFDictionaryGetValue(traitsDict, kCTFontWidthTrait);
  CFNumberRef symbolicTraits =
      (CFNumberRef)CFDictionaryGetValue(traitsDict, kCTFontSymbolicTrait);

  // make a nsString
  nsAutoString postscriptFontName;
  GetStringForCFString(psname, postscriptFontName);

  int32_t cssWeight = PR_GetCurrentThread() == sInitFontListThread
                          ? 0
                          : GetWeightOverride(postscriptFontName);
  if (cssWeight) {
    // scale down and clamp, to get a value from 1..9
    cssWeight = ((cssWeight + 50) / 100);
    cssWeight = std::clamp(cssWeight, 1, 9);
    cssWeight *= 100;  // scale up to CSS values
  } else {
    CGFloat weightValue;
    CFNumberGetValue(weight, kCFNumberCGFloatType, &weightValue);
    cssWeight = CoreTextWeightToCSSWeight(weightValue);
  }

  CGFloat widthValue;
  CFNumberGetValue(width, kCFNumberCGFloatType, &widthValue);
  StretchRange stretch(CoreTextWidthToCSSStretch(widthValue));

  SlantStyleRange slantStyle(FontSlantStyle::NORMAL);
  SInt32 traitsValue;
  CFNumberGetValue(symbolicTraits, kCFNumberSInt32Type, &traitsValue);
  if (traitsValue & kCTFontItalicTrait) {
    slantStyle = SlantStyleRange(FontSlantStyle::ITALIC);
  }

  bool fixedPitch = traitsValue & kCTFontMonoSpaceTrait;

  RefPtr<gfxCharacterMap> charmap;
  if (aLoadCmaps) {
    AutoCFTypeRef<CGFontRef> font(
        CGFontCreateWithFontName(CFStringRef(psname)));
    if (font) {
      uint32_t kCMAP = TRUETYPE_TAG('c', 'm', 'a', 'p');
      AutoCFTypeRef<CFDataRef> data(CGFontCopyTableForTag(font, kCMAP));
      if (data) {
        uint32_t offset;
        charmap = new gfxCharacterMap();
        gfxFontUtils::ReadCMAP(CFDataGetBytePtr(data), CFDataGetLength(data),
                               *charmap, offset);
      }
    }
  }

  // Ensure that a face named "Regular" goes to the front of the list, so it
  // will take precedence over other faces with the same style attributes but
  // a different name (such as "Outline").
  auto data = fontlist::Face::InitData{
      NS_ConvertUTF16toUTF8(postscriptFontName),
      0,
      fixedPitch,
      WeightRange(FontWeight::FromInt(cssWeight)),
      stretch,
      slantStyle,
      charmap,
  };
  if (kCFCompareEqualTo == CFStringCompare(facename, CFSTR("Regular"), 0)) {
    aFaces.InsertElementAt(0, std::move(data));
  } else {
    aFaces.AppendElement(std::move(data));
  }
}

void CoreTextFontList::GetFacesInitDataForFamily(
    const fontlist::Family* aFamily, nsTArray<fontlist::Face::InitData>& aFaces,
    bool aLoadCmaps) const {
  auto name = aFamily->Key().AsString(SharedFontList());
  CrashReporter::AutoRecordAnnotation autoFontName(
      CrashReporter::Annotation::FontName, name);

  struct Context {
    nsTArray<fontlist::Face::InitData>& mFaces;
    bool mLoadCmaps;
    const void* prevValue = nullptr;
  };
  auto addFaceFunc = [](const void* aValue, void* aContext) -> void {
    Context* context = (Context*)aContext;
    if (aValue == context->prevValue) {
      return;
    }
    context->prevValue = aValue;
    CTFontDescriptorRef fontDesc = (CTFontDescriptorRef)aValue;
    CoreTextFontList::AddFaceInitData(fontDesc, context->mFaces,
                                      context->mLoadCmaps);
  };

  AutoCFTypeRef<CTFontDescriptorRef> descriptor(
      CreateDescriptorForFamily(name, false));
  AutoCFTypeRef<CFArrayRef> faces(
      CTFontDescriptorCreateMatchingFontDescriptors(descriptor, nullptr));

  if (faces) {
    Context context{aFaces, aLoadCmaps};
    CFArrayApplyFunction(faces, CFRangeMake(0, CFArrayGetCount(faces)),
                         addFaceFunc, &context);
  }
}

void CoreTextFontList::ReadFaceNamesForFamily(
    fontlist::Family* aFamily, bool aNeedFullnamePostscriptNames) {
  if (!aFamily->IsInitialized()) {
    if (!InitializeFamily(aFamily)) {
      return;
    }
  }
  const uint32_t kNAME = TRUETYPE_TAG('n', 'a', 'm', 'e');
  fontlist::FontList* list = SharedFontList();
  nsAutoCString canonicalName(aFamily->DisplayName().AsString(list));
  const auto* facePtrs = aFamily->Faces(list);
  for (uint32_t i = 0, n = aFamily->NumFaces(); i < n; i++) {
    auto* face = facePtrs[i].ToPtr<const fontlist::Face>(list);
    if (!face) {
      continue;
    }
    nsAutoCString name(face->mDescriptor.AsString(list));
    // We create a temporary CTFontEntry just to read family names from the
    // 'name' table in the font resource. The style attributes here are ignored
    // as this entry is not used for font style matching.
    // The size hint might be used to select which face is accessed in the case
    // of the macOS UI font; see CTFontEntry::GetFontRef(). We pass 16.0 in
    // order to get a standard text-size face in this case, although it's
    // unlikely to matter for the purpose of just reading family names.
    auto fe = MakeUnique<CTFontEntry>(name, WeightRange(FontWeight::NORMAL),
                                      false, 16.0);
    if (!fe) {
      continue;
    }
    gfxFontEntry::AutoTable nameTable(fe.get(), kNAME);
    if (!nameTable) {
      continue;
    }
    uint32_t dataLength;
    const char* nameData = hb_blob_get_data(nameTable, &dataLength);
    AutoTArray<nsCString, 4> otherFamilyNames;
    gfxFontUtils::ReadOtherFamilyNamesForFace(
        canonicalName, nameData, dataLength, otherFamilyNames, false);
    for (const auto& alias : otherFamilyNames) {
      nsAutoCString key;
      GenerateFontListKey(alias, key);
      auto aliasData = mAliasTable.GetOrInsertNew(key);
      aliasData->InitFromFamily(aFamily, canonicalName);
      aliasData->mFaces.AppendElement(facePtrs[i]);
    }
  }
}

FontFamily CoreTextFontList::GetDefaultFontForPlatform(
    nsPresContext* aPresContext, const gfxFontStyle* aStyle,
    nsAtom* aLanguage) {
  AutoCFTypeRef<CTFontRef> font(CTFontCreateUIFontForLanguage(
      kCTFontUIFontUser, 0.0, nullptr));  // TODO: language
  AutoCFTypeRef<CFStringRef> name(CTFontCopyFamilyName(font));

  nsAutoString familyName;
  GetStringForCFString(name, familyName);

  return FindFamily(aPresContext, NS_ConvertUTF16toUTF8(familyName));
}

#ifdef MOZ_BUNDLED_FONTS
void CoreTextFontList::ActivateBundledFonts() {
  nsCOMPtr<nsIFile> localDir;
  if (NS_FAILED(NS_GetSpecialDirectory(NS_GRE_DIR, getter_AddRefs(localDir)))) {
    return;
  }
  if (NS_FAILED(localDir->Append(u"fonts"_ns))) {
    return;
  }
  nsAutoCString path;
  if (NS_FAILED(localDir->GetNativePath(path))) {
    return;
  }
  ActivateFontsFromDir(path, &mBundledFamilies);
}
#endif
