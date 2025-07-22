/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import React, { useState, useEffect, useRef } from "react";
import { useSelector } from "react-redux";

function FocusTimer({ dispatch }) {
  const inputRef = useRef(null);
  const timerData = useSelector(state => state.TimerWidget);
  const { duration, startTime, isRunning } = timerData;
  const [timeLeft, setTimeLeft] = useState(0);

  const calculateTimeRemaining = (dur, start) => {
    const currentTime = Math.floor(Date.now() / 1000);

    // Subtract the elapsed time from initial duration to get time remaining in the timer
    return Math.max(dur - (currentTime - start), 0);
  };

  useEffect(() => {
    let interval;
    if (isRunning && duration > 0) {
      interval = setInterval(() => {
        const remaining = calculateTimeRemaining(duration, startTime);

        if (remaining <= 0) {
          clearInterval(interval);
          dispatch(
            ac.AlsoToMain({
              type: at.WIDGETS_TIMER_END,
            })
          );
        }

        // using setTimeNow to trigger a re-render of the component to show live countdown each second
        setTimeLeft(remaining);
      }, 1000);
    }

    // Shows the correct live time in the UI whenever the timer state changes
    const newTime = isRunning
      ? calculateTimeRemaining(duration, startTime)
      : duration;

    setTimeLeft(newTime);

    return () => clearInterval(interval);
  }, [isRunning, startTime, duration, dispatch, timeLeft]);

  // set timer function
  const setTimerMinutes = e => {
    e.preventDefault();
    const minutes = parseInt(inputRef.current.value, 10);
    const seconds = minutes * 60;

    if (minutes > 0) {
      dispatch(
        ac.AlsoToMain({
          type: at.WIDGETS_TIMER_SET_DURATION,
          data: seconds,
        })
      );
    }
  };

  // Pause timer function
  const toggleTimer = () => {
    if (!isRunning && duration > 0) {
      dispatch(
        ac.AlsoToMain({
          type: at.WIDGETS_TIMER_PLAY,
        })
      );
    } else if (isRunning) {
      // calculated to get the new baseline of the timer when it starts or resumes
      const remaining = calculateTimeRemaining(duration, startTime);

      dispatch(
        ac.AlsoToMain({
          type: at.WIDGETS_TIMER_PAUSE,
          data: {
            duration: remaining,
          },
        })
      );
    }
  };

  // reset timer function
  const resetTimer = () => {
    dispatch(
      ac.AlsoToMain({
        type: at.WIDGETS_TIMER_RESET,
      })
    );
  };

  const formatTime = seconds => {
    const minutes = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const secs = (seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${secs}`;
  };

  return timerData ? (
    <article className="focus-timer-wrapper">
      <p>Focus timer widget</p>
      <form onSubmit={setTimerMinutes}>
        <label htmlFor="countdown"></label>
        <input type="number" id="countdown" ref={inputRef} />
        <button type="submit">Set minutes</button>
      </form>
      <div className="timer-buttons">
        <button onClick={toggleTimer}>{isRunning ? "Pause" : "Play"}</button>
        <button onClick={resetTimer}>Reset</button>
      </div>
      Time left: {formatTime(timeLeft)}
    </article>
  ) : null;
}

export { FocusTimer };
