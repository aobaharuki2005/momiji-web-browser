/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Lists } from "./Lists/Lists";
import { FocusTimer } from "./FocusTimer/FocusTimer";
import { MessageWrapper } from "content-src/components/MessageWrapper/MessageWrapper";
import { WidgetsFeatureHighlight } from "../DiscoveryStreamComponents/FeatureHighlight/WidgetsFeatureHighlight";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";

const PREF_WIDGETS_LISTS_ENABLED = "widgets.lists.enabled";
const PREF_WIDGETS_SYSTEM_LISTS_ENABLED = "widgets.system.lists.enabled";
const PREF_WIDGETS_TIMER_ENABLED = "widgets.focusTimer.enabled";
const PREF_WIDGETS_SYSTEM_TIMER_ENABLED = "widgets.system.focusTimer.enabled";
const PREF_FEEDS_SECTION_TOPSTORIES = "feeds.section.topstories";

function Widgets() {
  const prefs = useSelector(state => state.Prefs.values);
  const { messageData } = useSelector(state => state.Messages);
  const timerType = useSelector(state => state.TimerWidget.timerType);
  const timerData = useSelector(state => state.TimerWidget);
  const dispatch = useDispatch();

  const nimbusListsEnabled = prefs.widgetsConfig?.listsEnabled;
  const nimbusTimerEnabled = prefs.widgetsConfig?.timerEnabled;
  const nimbusListsTrainhopEnabled =
    prefs.trainhopConfig?.widgets?.listsEnabled;
  const nimbusTimerTrainhopEnabled =
    prefs.trainhopConfig?.widgets?.timerEnabled;

  const listsEnabled =
    (nimbusListsTrainhopEnabled ||
      nimbusListsEnabled ||
      prefs[PREF_WIDGETS_SYSTEM_LISTS_ENABLED]) &&
    prefs[PREF_WIDGETS_LISTS_ENABLED];

  const timerEnabled =
    (nimbusTimerTrainhopEnabled ||
      nimbusTimerEnabled ||
      prefs[PREF_WIDGETS_SYSTEM_TIMER_ENABLED]) &&
    prefs[PREF_WIDGETS_TIMER_ENABLED];

  const recommendedStoriesEnabled = prefs[PREF_FEEDS_SECTION_TOPSTORIES];

  // track previous timerEnabled state to detect when it becomes disabled
  const prevTimerEnabledRef = useRef(timerEnabled);

  // Reset timer when it becomes disabled
  useEffect(() => {
    const wasTimerEnabled = prevTimerEnabledRef.current;
    const isTimerEnabled = timerEnabled;
    const originalTime = timerType === "focus" ? 1500 : 300;

    // Only reset if timer was enabled and is now disabled
    if (wasTimerEnabled && !isTimerEnabled && timerData) {
      // Reset both focus and break timers to their initial durations
      dispatch(
        ac.AlsoToMain({
          type: at.WIDGETS_TIMER_RESET,
          data: {
            timerType,
            duration: originalTime,
            initialDuration: originalTime,
          },
        })
      );

      // Set the timer type back to "focus"
      dispatch(
        ac.AlsoToMain({
          type: at.WIDGETS_TIMER_SET_TYPE,
          data: {
            timerType: "focus",
          },
        })
      );
    }

    // Update the ref to track current state
    prevTimerEnabledRef.current = isTimerEnabled;
  }, [timerEnabled, timerData, dispatch, timerType]);

  function handleUserInteraction(widgetName) {
    const prefName = `widgets.${widgetName}.interaction`;
    const hasInteracted = prefs[prefName];
    // we want to make sure that the value is a strict false (and that the property exists)
    if (hasInteracted === false) {
      dispatch(ac.SetPref(prefName, true));
    }
  }

  if (!(listsEnabled || timerEnabled)) {
    return null;
  }

  return (
    <div className="widgets-wrapper">
      <div className="widgets-container">
        {listsEnabled && (
          <Lists
            dispatch={dispatch}
            handleUserInteraction={handleUserInteraction}
          />
        )}
        {timerEnabled && (
          <FocusTimer
            dispatch={dispatch}
            handleUserInteraction={handleUserInteraction}
          />
        )}
      </div>
      {recommendedStoriesEnabled && (
        <div className="widgets-scroll-message fade-in" aria-live="polite">
          <p data-l10n-id="newtab-widget-keep-scrolling"></p>
        </div>
      )}
      {messageData?.content?.messageType === "WidgetMessage" && (
        <MessageWrapper dispatch={dispatch}>
          <WidgetsFeatureHighlight dispatch={dispatch} />
        </MessageWrapper>
      )}
    </div>
  );
}

export { Widgets };
