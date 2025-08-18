/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SmoothScrollAnimation.h"
#include "AsyncPanZoomController.h"
#include "ScrollPositionUpdate.h"
#include "apz/src/GenericScrollAnimation.h"

namespace mozilla {
namespace layers {

/*static*/
already_AddRefed<SmoothScrollAnimation> SmoothScrollAnimation::Create(
    AsyncPanZoomController& aApzc, const nsPoint& aInitialPosition,
    ScrollOrigin aOrigin) {
  RefPtr<SmoothScrollAnimation> result = new SmoothScrollAnimation(
      ScrollAnimationKind::Smooth, aApzc, aInitialPosition, aOrigin);
  return result.forget();
}
/*static*/
already_AddRefed<SmoothScrollAnimation>
SmoothScrollAnimation::CreateForKeyboard(AsyncPanZoomController& aApzc,
                                         const nsPoint& aInitialPosition,
                                         ScrollOrigin aOrigin) {
  RefPtr<SmoothScrollAnimation> result = new SmoothScrollAnimation(
      ScrollAnimationKind::Keyboard, aApzc, aInitialPosition, aOrigin);
  return result.forget();
}

static ScrollOrigin OriginForDeltaType(
    ScrollWheelInput::ScrollDeltaType aDeltaType) {
  switch (aDeltaType) {
    case ScrollWheelInput::SCROLLDELTA_PAGE:
      return ScrollOrigin::Pages;
    case ScrollWheelInput::SCROLLDELTA_PIXEL:
      return ScrollOrigin::Pixels;
    case ScrollWheelInput::SCROLLDELTA_LINE:
      return ScrollOrigin::MouseWheel;
  }
  // Shouldn't happen, pick a default.
  return ScrollOrigin::MouseWheel;
}

/*static*/
already_AddRefed<SmoothScrollAnimation> SmoothScrollAnimation::CreateForWheel(
    AsyncPanZoomController& aApzc, const nsPoint& aInitialPosition,
    ScrollWheelInput::ScrollDeltaType aDeltaType) {
  RefPtr<SmoothScrollAnimation> result = new SmoothScrollAnimation(
      ScrollAnimationKind::Wheel, aApzc, aInitialPosition,
      OriginForDeltaType(aDeltaType));
  MOZ_ASSERT(nsLayoutUtils::IsSmoothScrollingEnabled(),
             "We shouldn't be creating a WheelScrollAnimation if smooth "
             "scrolling is disabled");
  result->mDirectionForcedToOverscroll =
      aApzc.mScrollMetadata.GetDisregardedDirection();
  return result.forget();
}

SmoothScrollAnimation::SmoothScrollAnimation(ScrollAnimationKind aKind,
                                             AsyncPanZoomController& aApzc,
                                             const nsPoint& aInitialPosition,
                                             ScrollOrigin aOrigin)
    : GenericScrollAnimation(aApzc, aInitialPosition, aOrigin),
      mKind(aKind),
      mOrigin(aOrigin),
      mTriggeredByScript(ScrollTriggeredByScript::No) {}

SmoothScrollAnimation* SmoothScrollAnimation::AsSmoothScrollAnimation() {
  return this;
}

void SmoothScrollAnimation::UpdateDestinationAndSnapTargets(
    TimeStamp aTime, const nsPoint& aDestination,
    const nsSize& aCurrentVelocity, ScrollSnapTargetIds&& aSnapTargetIds,
    ScrollTriggeredByScript aTriggeredByScript) {
  GenericScrollAnimation::UpdateDestination(aTime, aDestination,
                                            aCurrentVelocity);
  mSnapTargetIds = std::move(aSnapTargetIds);
  mTriggeredByScript = aTriggeredByScript;
}

ScrollOrigin SmoothScrollAnimation::GetScrollOrigin() const { return mOrigin; }

ScrollOrigin SmoothScrollAnimation::GetScrollOriginForAction(
    KeyboardScrollAction::KeyboardScrollActionType aAction) {
  switch (aAction) {
    case KeyboardScrollAction::eScrollCharacter:
    case KeyboardScrollAction::eScrollLine: {
      return ScrollOrigin::Lines;
    }
    case KeyboardScrollAction::eScrollPage:
      return ScrollOrigin::Pages;
    case KeyboardScrollAction::eScrollComplete:
      return ScrollOrigin::Other;
    default:
      MOZ_ASSERT(false, "Unknown keyboard scroll action type");
      return ScrollOrigin::Other;
  }
}

}  // namespace layers
}  // namespace mozilla
