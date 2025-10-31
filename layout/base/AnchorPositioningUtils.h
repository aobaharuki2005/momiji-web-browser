/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef AnchorPositioningUtils_h__
#define AnchorPositioningUtils_h__

#include "mozilla/Maybe.h"
#include "nsRect.h"
#include "nsTHashMap.h"

class nsAtom;
class nsIFrame;

template <class T>
class nsTArray;

template <class T>
class CopyableTArray;

namespace mozilla {

struct AnchorPosInfo {
  // Border-box of the anchor frame, offset against `mContainingBlock`'s padding
  // box.
  nsRect mRect;
  const nsIFrame* mContainingBlock;
};

// Resolved anchor positioning data.
struct AnchorPosResolutionData {
  // Size of the referenced anchor.
  nsSize mSize;
  // Origin of the referenced anchor, w.r.t. containing block at the time of
  // resolution. Includes scroll offsets, for now.
  // Nothing if the anchor did not resolve, or if the anchor was only referred
  // to by its size.
  mozilla::Maybe<nsPoint> mOrigin;
};

// Data required for an anchor positioned frame, including:
// * If valid anchors are found,
// * Cached offset/size resolution, if resolution was valid,
// * TODO(dshin, bug 1968745): Compensating for scroll [1]
// * TODO(dshin, bug 1987962): Default scroll shift [2]
//
// [1]: https://drafts.csswg.org/css-anchor-position-1/#compensate-for-scroll
// [2]: https://drafts.csswg.org/css-anchor-position-1/#default-scroll-shift
class AnchorPosReferenceData {
 private:
  using Map =
      nsTHashMap<RefPtr<const nsAtom>, mozilla::Maybe<AnchorPosResolutionData>>;

 public:
  using Value = mozilla::Maybe<AnchorPosResolutionData>;

  AnchorPosReferenceData() = default;
  AnchorPosReferenceData(const AnchorPosReferenceData&) = delete;
  AnchorPosReferenceData(AnchorPosReferenceData&&) = default;

  AnchorPosReferenceData& operator=(const AnchorPosReferenceData&) = delete;
  AnchorPosReferenceData& operator=(AnchorPosReferenceData&&) = default;

  struct Result {
    bool mAlreadyResolved;
    Value* mEntry;
  };

  Result InsertOrModify(const nsAtom* aAnchorName, bool aNeedOffset);
  const Value* Lookup(const nsAtom* aAnchorName) const;

  bool IsEmpty() const { return mMap.IsEmpty(); }

  Map::const_iterator begin() const { return mMap.cbegin(); }
  Map::const_iterator end() const { return mMap.cend(); }

 private:
  Map mMap;
};

struct StylePositionArea;
class WritingMode;

enum class StylePositionTryFallbacksTryTacticKeyword : uint8_t;
using StylePositionTryFallbacksTryTactic =
    CopyableTArray<StylePositionTryFallbacksTryTacticKeyword>;

/**
 * AnchorPositioningUtils is a namespace class used for various anchor
 * positioning helper functions that are useful in multiple places.
 * The goal is to avoid code duplication and to avoid having too
 * many helpers in nsLayoutUtils.
 */
struct AnchorPositioningUtils {
  /**
   * Finds the first acceptable frame from the list of possible anchor frames
   * following https://drafts.csswg.org/css-anchor-position-1/#target
   */
  static nsIFrame* FindFirstAcceptableAnchor(
      const nsAtom* aName, const nsIFrame* aPositionedFrame,
      const nsTArray<nsIFrame*>& aPossibleAnchorFrames);

  static Maybe<AnchorPosInfo> GetAnchorPosRect(
      const nsIFrame* aAbsoluteContainingBlock, const nsIFrame* aAnchor,
      bool aCBRectIsvalid,
      Maybe<AnchorPosResolutionData>* aReferencedAnchorsEntry);

  /**
   * Adjust the containing block rect for the 'position-area' property.
   * https://drafts.csswg.org/css-anchor-position-1/#position-area
   */
  static nsRect AdjustAbsoluteContainingBlockRectForPositionArea(
      const nsRect& aAnchorRect, const nsRect& aCBRect,
      WritingMode aPositionedWM, WritingMode aCBWM,
      const StylePositionArea& aPosArea, StylePositionArea* aOutResolvedArea);

  /**
   * Gets the used anchor name for an anchor positioned frame.
   *
   * @param aPositioned The anchor positioned frame.
   * @param aAnchorName The anchor name specified in the anchor function,
   *   or nullptr if not specified.
   *
   * If `aAnchorName` is not specified, then this function will return the
   * default anchor name, if the `position-anchor` property specified one.
   * Otherwise it will return `nsGkAtoms::AnchorPosImplicitAnchor` if the
   * element has an implicit anchor, or a nullptr.
   */
  static const nsAtom* GetUsedAnchorName(const nsIFrame* aPositioned,
                                         const nsAtom* aAnchorName);

  /**
   * Get the implicit anchor of the frame.
   *
   * @param aFrame The anchor positioned frame.
   *
   * For pseudo-elements, this returns the parent frame of the originating
   * element. For popovers, this returns the primary frame of the invoker. In
   * all other cases, returns null.
   */
  static const nsIFrame* GetAnchorPosImplicitAnchor(const nsIFrame* aFrame);

  struct DefaultAnchorInfo {
    const nsAtom* mName = nullptr;
    Maybe<nsRect> mRect;
  };

  /**
   * Resolve the default anchor's rect, if the default anchor exists and is
   * valid.
   *
   * @param aFrame The anchor positioned frame.
   * @param aCBRectIsValid Whether or not the containing block's `GetRect`
   * returns a valid result. This will be not be the case during the abspos
   * frame's reflow.
   * @param aAnchorPosReferenceData Anchor pos references to attempt to reuse &
   * cache lookups to.
   */
  static DefaultAnchorInfo GetDefaultAnchor(
      const nsIFrame* aPositioned, bool aCBRectIsValid,
      AnchorPosReferenceData* aAnchorPosReferenceData);
};

}  // namespace mozilla

#endif  // AnchorPositioningUtils_h__
