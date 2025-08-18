/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_layers_SmoothScrollAnimation_h_
#define mozilla_layers_SmoothScrollAnimation_h_

#include "GenericScrollAnimation.h"
#include "InputData.h"
#include "ScrollPositionUpdate.h"
#include "mozilla/AlreadyAddRefed.h"
#include "mozilla/ScrollOrigin.h"
#include "mozilla/layers/KeyboardScrollAction.h"

namespace mozilla {
namespace layers {

class AsyncPanZoomController;

enum class ScrollAnimationKind : uint8_t {
  // Scroll animation in response to programmatic scrolling performed
  // by the page or otherwise triggered by the main thread (e.g. for
  // scroll-to-anchor, or certain scrollbar interactions)
  Smooth,
  // Scroll animation in response to user keyboard input
  Keyboard,
  // Scroll animation in response to user wheel input
  Wheel
};

class SmoothScrollAnimation : public GenericScrollAnimation {
 public:
  // Create a SmoothScrollAnimation of kind Smooth.
  static already_AddRefed<SmoothScrollAnimation> Create(
      AsyncPanZoomController& aApzc, const nsPoint& aInitialPosition,
      ScrollOrigin aOrigin);
  // Create a SmoothScrollAnimation of kind Keyboard.
  static already_AddRefed<SmoothScrollAnimation> CreateForKeyboard(
      AsyncPanZoomController& aApzc, const nsPoint& aInitialPosition,
      ScrollOrigin aOrigin);
  // Create a SmoothScrollAnimation of kind Wheel.
  static already_AddRefed<SmoothScrollAnimation> CreateForWheel(
      AsyncPanZoomController& aApzc, const nsPoint& aInitialPosition,
      ScrollWheelInput::ScrollDeltaType aDeltaType);

  void UpdateDestinationAndSnapTargets(
      TimeStamp aTime, const nsPoint& aDestination,
      const nsSize& aCurrentVelocity, ScrollSnapTargetIds&& aSnapTargetIds,
      ScrollTriggeredByScript aTriggeredByScript);

  SmoothScrollAnimation* AsSmoothScrollAnimation() override;
  bool WasTriggeredByScript() const override {
    return mTriggeredByScript == ScrollTriggeredByScript::Yes;
  }
  ScrollAnimationKind Kind() const { return mKind; }
  ScrollSnapTargetIds TakeSnapTargetIds() { return std::move(mSnapTargetIds); }
  ScrollOrigin GetScrollOrigin() const;
  static ScrollOrigin GetScrollOriginForAction(
      KeyboardScrollAction::KeyboardScrollActionType aAction);

 private:
  SmoothScrollAnimation(ScrollAnimationKind aKind,
                        AsyncPanZoomController& aApzc,
                        const nsPoint& aInitialPosition, ScrollOrigin aOrigin);

  ScrollAnimationKind mKind;
  ScrollOrigin mOrigin;

  // These fields are only used for animations of kind Smooth.
  ScrollSnapTargetIds mSnapTargetIds;
  ScrollTriggeredByScript mTriggeredByScript;
};

}  // namespace layers
}  // namespace mozilla

#endif  // mozilla_layers_SmoothScrollAnimation_h_
