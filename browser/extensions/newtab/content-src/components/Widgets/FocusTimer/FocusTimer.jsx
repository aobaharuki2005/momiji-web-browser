/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSelector } from "react-redux";

/**
 * Calculates the remaining time (in seconds) by subtracting elapsed time from the original duration
 *
 * @param duration
 * @param start
 * @returns int
 */
export const calculateTimeRemaining = (duration, start) => {
  const currentTime = Math.floor(Date.now() / 1000);

  // Subtract the elapsed time from initial duration to get time remaining in the timer
  return Math.max(duration - (currentTime - start), 0);
};

/**
 * Converts a number of seconds into a zero-padded MM:SS time string
 *
 * @param seconds
 * @returns string
 */
export const formatTime = seconds => {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
};

/**
 * Converts a polar coordinate (angle on circle) into a percentage-based [x,y] position for clip-path
 *
 * @param cx
 * @param cy
 * @param radius
 * @param angle
 * @returns string
 */
export const polarToPercent = (cx, cy, radius, angle) => {
  const rad = ((angle - 90) * Math.PI) / 180;
  const x = cx + radius * Math.cos(rad);
  const y = cy + radius * Math.sin(rad);
  return `${x}% ${y}%`;
};

/**
 * Generates a clip-path polygon string that represents a pie slice from 0 degrees
 * to the current progress angle
 *
 * @returns string
 * @param progress
 */
export const getClipPath = progress => {
  const cx = 50;
  const cy = 50;
  const radius = 50;
  // Show some progress right at the start - 6 degrees is just enough to paint a dot once the timer is ticking
  const angle = progress > 0 ? Math.max(progress * 360, 6) : 0;
  const points = [`50% 50%`];

  for (let a = 0; a <= angle; a += 2) {
    points.push(polarToPercent(cx, cy, radius, a));
  }

  return `polygon(${points.join(", ")})`;
};

function FocusTimer({ dispatch }) {
  const inputRef = useRef(null);
  const arcRef = useRef(null);

  const timerData = useSelector(state => state.TimerWidget);
  const { duration, initialDuration, startTime, isRunning } = timerData;

  const [timeLeft, setTimeLeft] = useState(0);
  // calculated value for the progress circle; 1 = 100%
  const [progress, setProgress] = useState(0);

  const resetProgressCircle = useCallback(() => {
    if (arcRef?.current) {
      arcRef.current.style.clipPath = "polygon(50% 50%)";
      arcRef.current.style.webkitClipPath = "polygon(50% 50%)";
    }
    setProgress(0);
  }, [arcRef]);

  useEffect(() => {
    let interval;
    if (isRunning && duration > 0) {
      interval = setInterval(() => {
        const remaining = calculateTimeRemaining(duration, startTime);

        if (remaining <= 0) {
          clearInterval(interval);

          // circle is complete, this will trigger animation to a completed green circle
          setProgress(1);

          // Reset all styles to default after a delay to allow for the animation above
          setTimeout(() => {
            resetProgressCircle();
          }, 1500);

          dispatch(
            ac.AlsoToMain({
              type: at.WIDGETS_TIMER_END,
            })
          );
        }

        // using setTimeLeft to trigger a re-render of the component to show live countdown each second
        setTimeLeft(remaining);
        setProgress((initialDuration - remaining) / initialDuration);
      }, 1000);
    }

    // Shows the correct live time in the UI whenever the timer state changes
    const newTime = isRunning
      ? calculateTimeRemaining(duration, startTime)
      : duration;

    setTimeLeft(newTime);

    return () => clearInterval(interval);
  }, [
    isRunning,
    startTime,
    duration,
    initialDuration,
    dispatch,
    timeLeft,
    resetProgressCircle,
  ]);

  // Update the clip-path of the gradient circle to match the current progress value
  useEffect(() => {
    if (arcRef?.current) {
      arcRef.current.style.clipPath = getClipPath(progress);
    }
  }, [progress]);

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

    // Reset progress value and gradient arc on the progress circle
    resetProgressCircle();
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
      <div role="progress" className="progress-circle-wrapper">
        <div className="progress-circle-background" />
        <div className="progress-circle" ref={arcRef} />
        <div
          className={`progress-circle-complete ${progress === 1 ? "visible" : ""}`}
        />
        <div role="timer" className="progress-circle-label">
          <p>{formatTime(timeLeft)}</p>
        </div>
      </div>
    </article>
  ) : null;
}

export { FocusTimer };
