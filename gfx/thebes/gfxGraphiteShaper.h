/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef GFX_GRAPHITESHAPER_H
#define GFX_GRAPHITESHAPER_H

#include "gfxFont.h"

#include "nsTHashSet.h"

#include "ThebesRLBoxTypes.h"

struct gr_face;
struct gr_font;
struct gr_segment;
#if !defined(MAC_OS_X_VERSION_10_7) || \
    MAC_OS_X_VERSION_MIN_REQUIRED < MAC_OS_X_VERSION_10_7
//10.6 thread local stuff
#define GFX_FONT_USE_THREAD_LOCAL 0
static pthread_key_t lckey_shaper, lckey_fontEntry;
static pthread_once_t lckey_shaper_once = PTHREAD_ONCE_INIT; 
static pthread_once_t lckey_fontEntry_once = PTHREAD_ONCE_INIT; 
#else
#define GFX_FONT_USE_THREAD_LOCAL 1
#endif

class gfxGraphiteShaper : public gfxFontShaper {
 public:
  explicit gfxGraphiteShaper(gfxFont* aFont);
  virtual ~gfxGraphiteShaper();

  bool ShapeText(const char16_t* aText, uint32_t aOffset, uint32_t aLength,
                 Script aScript, nsAtom* aLanguage, bool aVertical,
                 RoundingFlags aRounding, gfxShapedText* aShapedText) override;

  static void Shutdown();

 protected:
  nsresult SetGlyphsFromSegment(gfxShapedText* aShapedText, uint32_t aOffset,
                                uint32_t aLength, const char16_t* aText,
                                tainted_opaque_gr<char16_t*> t_aText,
                                tainted_opaque_gr<gr_segment*> aSegment,
                                RoundingFlags aRounding);

  // Graphite is run in a rlbox sandbox. Callback GrGetAdvance must be
  // explicitly permitted. Since the sandbox is owned in gfxFontEntry class,
  // gfxFontEntry needs access to the protected callback.
  friend class gfxFontEntryCallbacks;
  static tainted_opaque_gr<float> GrGetAdvance(
      rlbox_sandbox_gr& sandbox, tainted_opaque_gr<const void*> appFontHandle,
      tainted_opaque_gr<uint16_t> glyphid);

  tainted_opaque_gr<gr_face*>
      mGrFace;  // owned by the font entry; shaper must call
                // gfxFontEntry::ReleaseGrFace when finished with it
  tainted_opaque_gr<gr_font*> mGrFont;  // owned by the shaper itself

  // All libGraphite functionality is sandboxed. This is the sandbox instance.
  rlbox_sandbox_gr* mSandbox;

  // Holds the handle to the permitted callback into Firefox for the sandboxed
  // libGraphite
  sandbox_callback_gr<float (*)(const void*, uint16_t)>* mCallback;

  struct CallbackData {
    // mFont is a pointer to the font that owns this shaper, so it will
    // remain valid throughout our lifetime
    gfxFont* MOZ_NON_OWNING_REF mFont;
  };
#ifndef GFX_FONT_USE_THREAD_LOCAL // 10.6
  static void make_key(void) {
      pthread_key_create(&lckey_shaper, NULL);
  }
  struct CallbackData* CallbackData();
  static struct CallbackData* tl_GrGetAdvanceData(void) {
      pthread_once(&lckey_shaper_once, make_key);
      struct CallbackData *config = (struct CallbackData *)pthread_getspecific(lckey_shaper);
      if (!config) {
          config = new struct CallbackData();
          pthread_setspecific(lckey_shaper, config);
      }
      return config;
  }
#else
  static thread_local CallbackData* tl_GrGetAdvanceData;
#endif
  struct CallbackData mCallbackData;

  bool mFallbackToSmallCaps;  // special fallback for the petite-caps case

  // Convert HTML 'lang' (BCP47) to Graphite language code
  static uint32_t GetGraphiteTagForLang(const nsCString& aLang);
  static nsTHashSet<uint32_t>* sLanguageTags;
};

#endif /* GFX_GRAPHITESHAPER_H */
