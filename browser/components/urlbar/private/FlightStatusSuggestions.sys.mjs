/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { RealtimeSuggestProvider } from "moz-src:///browser/components/urlbar/private/RealtimeSuggestProvider.sys.mjs";

/**
 * A feature that supports flight status suggestions.
 */
export class FlightStatusSuggestions extends RealtimeSuggestProvider {
  get realtimeType() {
    return "flightStatus";
  }

  get isSponsored() {
    return false;
  }

  get merinoProvider() {
    return "flightaware";
  }

  get baseTelemetryType() {
    return "flights";
  }

  getViewTemplateForDescriptionTop(index) {
    return [
      {
        name: `departure_time_${index}`,
        tag: "span",
        classList: ["urlbarView-flightStatus-time"],
      },
      {
        name: `origin_airport_${index}`,
        tag: "span",
        classList: ["urlbarView-flightStatus-airport"],
      },
      {
        tag: "span",
        classList: ["urlbarView-realtime-description-separator-dash"],
      },
      {
        name: `arrival_time_${index}`,
        tag: "span",
        classList: ["urlbarView-flightStatus-time"],
      },
      {
        name: `destination_airport_${index}`,
        tag: "span",
        classList: ["urlbarView-flightStatus-airport"],
      },
    ];
  }

  getViewTemplateForDescriptionBottom(index) {
    return [
      {
        name: `departure_date_${index}`,
        tag: "span",
        classList: ["urlbarView-flightStatus-departure-date"],
      },
      {
        tag: "span",
        classList: ["urlbarView-realtime-description-separator-dot"],
      },
      {
        name: `flight_number_${index}`,
        tag: "span",
        classList: ["urlbarView-flightStatus-flight-number"],
      },
      {
        tag: "span",
        classList: ["urlbarView-realtime-description-separator-dot"],
      },
      {
        name: `status_${index}`,
        tag: "span",
        classList: ["urlbarView-flightStatus-status"],
      },
      {
        tag: "span",
        classList: ["urlbarView-realtime-description-separator-dot"],
      },
      {
        name: `time_left_${index}`,
        tag: "span",
        classList: ["urlbarView-flightStatus-time-left"],
      },
    ];
  }

  getViewUpdateForValue(i, v) {
    let status;
    switch (v.status) {
      case "Scheduled": {
        status = "ontime";
        break;
      }
      case "En Route": {
        status = "inflight";
        break;
      }
      case "Arrived": {
        status = "arrived";
        break;
      }
      case "Cancelled": {
        status = "cancelled";
        break;
      }
      case "Delayed": {
        status = "delayed";
        break;
      }
    }

    let departureTime;
    let departureTimeZone;
    let arrivalTime;
    let arrivalTimeZone;
    if (status == "delayed" || !v.delayed) {
      departureTime = new Date(v.departure.scheduled_time);
      departureTimeZone = getTimeZone(v.departure.scheduled_time);
      arrivalTime = new Date(v.arrival.scheduled_time);
      arrivalTimeZone = getTimeZone(v.arrival.scheduled_time);
    } else {
      departureTime = new Date(v.departure.estimated_time);
      departureTimeZone = getTimeZone(v.departure.estimated_time);
      arrivalTime = new Date(v.arrival.estimated_time);
      arrivalTimeZone = getTimeZone(v.arrival.estimated_time);
    }

    let statusL10nId = `urlbar-result-flight-status-status-${status}`;
    let statusL10nArgs;
    if (status == "delayed") {
      statusL10nArgs = {
        departureEstimatedTime: new Intl.DateTimeFormat(undefined, {
          hour: "numeric",
          minute: "numeric",
          timeZone: getTimeZone(v.departure.estimated_time),
        }).format(new Date(v.departure.estimated_time)),
      };
    }

    let foregroundImage;
    let backgroundImage;
    if (status == "inflight") {
      let backgroundImageId =
        v.progress_percent == 100 ? 4 : Math.floor(v.progress_percent / 20);
      backgroundImage = {
        style: {
          "--airline-color": v.airline.color,
        },
        attributes: {
          backgroundImageId,
          hasForegroundImage: !!v.airline.icon,
        },
      };
      foregroundImage = {
        attributes: {
          src: v.airline.icon,
        },
      };
    } else {
      foregroundImage = {
        attributes: {
          src:
            v.airline.icon ?? "chrome://browser/skin/urlbar/flight-airline.svg",
          fallback: !v.airline.icon,
        },
      };
    }

    let timeLeft;
    if (typeof v.time_left_minutes == "number") {
      let hours = Math.floor(v.time_left_minutes / 60);
      let minutes = v.time_left_minutes % 60;
      // TODO Bug 1997547: TypeScript support for `Intl.DurationFormat`
      // @ts-ignore
      timeLeft = new Intl.DurationFormat(undefined, {
        style: "short",
      }).format({
        // If hours is zero, pass `undefined` to not show it at all.
        hours: hours || undefined,
        minutes,
      });
    }

    return {
      [`item_${i}`]: {
        attributes: {
          status,
        },
      },
      [`image_container_${i}`]: backgroundImage,
      [`image_${i}`]: foregroundImage,
      [`departure_time_${i}`]: {
        textContent: new Intl.DateTimeFormat(undefined, {
          hour: "numeric",
          minute: "numeric",
          timeZone: departureTimeZone,
        }).format(departureTime),
      },
      [`departure_date_${i}`]: {
        textContent: new Intl.DateTimeFormat(undefined, {
          month: "long",
          day: "numeric",
          weekday: "short",
          timeZone: departureTimeZone,
        }).format(departureTime),
      },
      [`arrival_time_${i}`]: {
        textContent: new Intl.DateTimeFormat(undefined, {
          hour: "numeric",
          minute: "numeric",
          timeZone: arrivalTimeZone,
        }).format(arrivalTime),
      },
      [`origin_airport_${i}`]: {
        l10n: {
          id: "urlbar-result-flight-status-airport",
          args: {
            city: v.origin.city,
            code: v.origin.code,
          },
          cacheable: true,
          excludeArgsFromCacheKey: true,
        },
      },
      [`destination_airport_${i}`]: {
        l10n: {
          id: "urlbar-result-flight-status-airport",
          args: {
            city: v.destination.city,
            code: v.destination.code,
          },
          cacheable: true,
          excludeArgsFromCacheKey: true,
        },
      },
      [`flight_number_${i}`]: v.airline.name
        ? {
            l10n: {
              id: "urlbar-result-flight-status-flight-number-with-airline",
              args: {
                flightNumber: v.flight_number,
                airlineName: v.airline.name,
              },
              cacheable: true,
              excludeArgsFromCacheKey: !!statusL10nArgs,
            },
          }
        : {
            textContent: v.flight_number,
          },
      [`status_${i}`]: {
        l10n: {
          id: statusL10nId,
          args: statusL10nArgs,
          cacheable: true,
          excludeArgsFromCacheKey: !!statusL10nArgs,
        },
      },
      [`time_left_${i}`]: timeLeft
        ? {
            l10n: {
              id: "urlbar-result-flight-status-time-left",
              args: {
                timeLeft,
              },
              cacheable: true,
              excludeArgsFromCacheKey: !!statusL10nArgs,
            },
          }
        : null,
    };
  }
}

function getTimeZone(isoTimeString) {
  let match = isoTimeString.match(/([+-]\d{2}:?\d{2}|Z)$/);
  if (!match) {
    return undefined;
  }

  let timeZone = match[1];
  return timeZone == "Z" ? "UTC" : timeZone;
}
