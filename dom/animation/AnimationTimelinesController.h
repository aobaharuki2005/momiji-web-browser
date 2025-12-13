/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_AnimationTimelinesController_h
#define mozilla_dom_AnimationTimelinesController_h

#include "mozilla/LinkedList.h"

namespace mozilla::dom {
class DocumentTimeline;

/**
 * The controller which keeps track of all timelines in a document. So basically
 * each document should have its own AnimationTimelinesController.
 */
class AnimationTimelinesController final {
 public:
  AnimationTimelinesController() = default;
  ~AnimationTimelinesController() {
    // We expect the timelines should remove themself from the controller
    // already.
    MOZ_ASSERT(mTimelines.isEmpty());
  }

  void AddDocumentTimeline(DocumentTimeline& aTimeline);

  void WillRefresh();
  void UpdateLastRefreshDriverTime();
  void TriggerAllPendingAnimationsNow();
  void UpdateHiddenByContentVisibility();

 private:
  LinkedList<DocumentTimeline> mTimelines;

  // TODO: add scroll timelines (and view timelines)
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_AnimationTimelinesController_h
