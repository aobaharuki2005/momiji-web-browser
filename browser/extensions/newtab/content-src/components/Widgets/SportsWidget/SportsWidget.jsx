/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// eslint-disable-next-line no-unused-vars
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSelector, batch } from "react-redux";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import { useIntersectionObserver, useSizeSubmenu } from "../../../lib/utils";
import { SportsMatchRow } from "./SportsMatchRow";
import { LivePagination } from "./LivePagination";
import { MoveSubmenu } from "../MoveSubmenu";
import { WatchLiveModal } from "./WatchLiveModal";
import { WIDGET_REGISTRY, resolveWidgetSize } from "common/WidgetsRegistry.mjs";
import { useLocalizedTeamNames } from "./useLocalizedTeamNames.jsx";
import {
  getMatchSectionL10nId,
  groupMatchesBySection,
} from "./stageLabels.mjs";

const WIDGET_STATES = {
  INTRO: "sports-intro",
  FOLLOW_TEAMS: "sports-follow-state",
  MATCHES: "sports-matches",
  KEY_DATES: "sports-key-dates",
};

const MATCHES_TABS = {
  RESULTS: "results",
  NOW: "now",
  UPCOMING: "upcoming",
};

function getVisibleMatchesTabs(hasLiveGames, hasPreviousResults) {
  return (
    Object.values(MATCHES_TABS)
      // Only show the Now tab when there are live games.
      .filter(id => id !== MATCHES_TABS.NOW || hasLiveGames)
      .map(id => ({
        id,
        // Disable the Results tab until previous match data is available.
        disabled: id === MATCHES_TABS.RESULTS && !hasPreviousResults,
      }))
  );
}

const USER_ACTION_TYPES = {
  FOLLOW_TEAMS: "follow_teams",
  SAVE_TEAMS: "save_teams",
  VIEW_UPCOMING: "view_upcoming",
  VIEW_RESULTS: "view_results",
  VIEW_MATCHES: "view_matches",
  VIEW_KEY_DATES: "view_key_dates",
  CHANGE_SIZE: "change_size",
  CHANGE_TAB: "change_tab",
  LEARN_MORE: "learn_more",
  TOGGLE_FOLLOWED_ONLY: "toggle_followed_only",
};

const PREF_NOVA_ENABLED = "nova.enabled";
const PREF_SPORTS_WIDGET_SIZE = "widgets.sportsWidget.size";
const PREF_SPORTS_WIDGET_LIVE_ENABLED = "widgets.sportsWidget.live.enabled";
const PREF_FORCE_LIVE_DATA_TRUSTABLE = "widgets.sports.forceLiveDataTrustable";

// World Cup 2026 kickoff: June 11, 2026 at 19:00 UTC. Used as a temporary
// guard to ignore /live data while the endpoint still serves mock matches
// pre-kickoff. Remove this once the backend returns empty pre-kickoff.
const WORLD_CUP_KICKOFF_MS = Date.UTC(2026, 5, 11, 19, 0, 0);

const SPORTS_WIDGET_REGISTRY_ENTRY = WIDGET_REGISTRY.find(
  widget => widget.id === "sportsWidget"
);

// Stable sort that bubbles matches involving a followed team to the front
// while preserving the original chronological order otherwise.
function sortFollowedFirst(matches, selectedTeamsSet) {
  if (!selectedTeamsSet.size) {
    return matches;
  }
  const involvesFollowed = match =>
    selectedTeamsSet.has(match.home_team.key) ||
    selectedTeamsSet.has(match.away_team.key);
  return [...matches]
    .map((match, index) => ({ match, index }))
    .sort((a, b) => {
      const aFollowed = involvesFollowed(a.match) ? 1 : 0;
      const bFollowed = involvesFollowed(b.match) ? 1 : 0;
      if (aFollowed !== bFollowed) {
        return bFollowed - aFollowed;
      }
      return a.index - b.index;
    })
    .map(entry => entry.match);
}

// Returns the match shown in the highlight view for the active tab, or null
// when the user has expanded a list view (no highlight is visible then).
function getHighlightMatch({
  widgetState,
  activeTab,
  showResultsList,
  showUpcomingList,
  sortedPrevious,
  sortedCurrent,
  sortedNext,
  liveIndex,
}) {
  if (widgetState !== WIDGET_STATES.MATCHES) {
    return null;
  }
  if (activeTab === MATCHES_TABS.RESULTS && !showResultsList) {
    return sortedPrevious[0] || null;
  }
  if (activeTab === MATCHES_TABS.NOW) {
    return sortedCurrent[liveIndex] || sortedCurrent[0] || null;
  }
  if (activeTab === MATCHES_TABS.UPCOMING && !showUpcomingList) {
    return sortedNext[0] || null;
  }
  return null;
}

// Builds a CSS gradient string from the followed team's `colors` palette in
// the highlight state. The gradient doesn't show when both teams in the match
// are followed or when neither team is followed.
function getFollowedGradient(match, selectedTeamsSet, teamColorsByKey) {
  if (!match) {
    return null;
  }
  const homeFollowed = selectedTeamsSet.has(match.home_team.key);
  const awayFollowed = selectedTeamsSet.has(match.away_team.key);
  if (homeFollowed === awayFollowed) {
    return null;
  }
  const followedKey = homeFollowed ? match.home_team.key : match.away_team.key;
  const colors = teamColorsByKey.get(followedKey);
  if (!colors || colors.length < 2) {
    return null;
  }
  return `linear-gradient(to right, ${colors.join(", ")})`;
}

// When the Now tab has 2+ live games, the widget root is labelled by the
// visible "Now" tab so screen readers can name the live-matches region.
function getCarouselArticleAttrs(active) {
  return active ? { "aria-labelledby": "sports-now-tab" } : null;
}

// eslint-disable-next-line max-statements, complexity
function SportsWidget({ dispatch, handleUserInteraction, widgetEnabledMap }) {
  const prefs = useSelector(state => state.Prefs.values);
  const sportsWidgetData = useSelector(state => state.SportsWidget);

  const widgetSize = resolveWidgetSize(SPORTS_WIDGET_REGISTRY_ENTRY, prefs);
  // Mirror SportsFeed.liveEnabled — raw pref OR the trainhop override. The
  // canonical key is trainhopConfig.widgets.sportsWidgetLiveEnabled (the flat
  // sportsWidget-prefixed convention shared by every widget); the legacy
  // trainhopConfig.sports.liveEnabled is still honored for in-flight rollouts.
  // Reading the raw pref alone would leave a Nimbus-only rollout in a
  // permanently-paused state: the feed would start polling, but tick()
  // bails on empty visibleTabs and we'd never attach the observer to dispatch
  // WIDGETS_SPORTS_LIVE_VISIBLE.
  const liveEnabled =
    prefs[PREF_SPORTS_WIDGET_LIVE_ENABLED] ||
    prefs.trainhopConfig?.widgets?.sportsWidgetLiveEnabled ||
    prefs.trainhopConfig?.sports?.liveEnabled;
  const widgetsMayBeMaximized = prefs["widgets.system.maximized"];
  // /live currently serves mock data pre-kickoff, so ignore its contents
  // until the kickoff timestamp. Drop this guard once the backend returns
  // empty pre-kickoff.
  const liveDataTrustable =
    Date.now() >= WORLD_CUP_KICKOFF_MS || prefs[PREF_FORCE_LIVE_DATA_TRUSTABLE];
  const hasLiveGames =
    liveDataTrustable && sportsWidgetData?.data?.live?.length > 0;
  const hasPreviousResults =
    sportsWidgetData?.data?.matches?.previous?.length > 0;
  // Upcoming matches alone don't mean the tournament has started — the backend
  // surfaces them within a +/-21 day window around kickoff, so they appear
  // pre-kickoff. Only live games or previous results are deterministic signals
  // that the tournament is underway.
  const tournamentStarted = hasLiveGames || hasPreviousResults;
  const savedWidgetState = sportsWidgetData.widgetState || WIDGET_STATES.INTRO;
  // Once the backend has any match data (live or completed), skip
  // the intro and open on the match schedule.
  const widgetState =
    tournamentStarted && savedWidgetState === WIDGET_STATES.INTRO
      ? WIDGET_STATES.MATCHES
      : savedWidgetState;
  const rawSelectedTeams = sportsWidgetData.selectedTeams;
  const rawTeams = sportsWidgetData?.data?.teams;
  const rawMatches = sportsWidgetData?.data?.matches;
  const rawLive = liveDataTrustable ? sportsWidgetData?.data?.live : null;
  const selectedTeams = useMemo(
    () => rawSelectedTeams || [],
    [rawSelectedTeams]
  );
  const teams = useMemo(() => rawTeams ?? [], [rawTeams]);
  const { matchesTab } = sportsWidgetData;
  const hasUserSelectedTab = useRef(false);
  const activeTab =
    hasLiveGames && !hasUserSelectedTab.current ? MATCHES_TABS.NOW : matchesTab;

  // Defensive clamp on the persisted live-pager index. The feed re-clamps
  // after every fetch, but the restored cached index may briefly exceed the
  // current live list (e.g. mid-flight between a fetch and the matching
  // SET_LIVE_INDEX broadcast). When the live list is empty, the inner
  // `Math.max((length ?? 0) - 1, 0)` collapses to 0, pinning liveIndex to 0.
  const liveIndex = Math.min(
    Math.max(sportsWidgetData.liveIndex ?? 0, 0),
    Math.max((rawLive?.length ?? 0) - 1, 0)
  );

  // Set of followed team keys that are still in the tournament. Eliminated
  // teams drop out so the rest of the UI (toggle, bubble-to-front sort,
  // gradient border, per-row check/bold) behaves as if the user weren't
  // following them anymore. The raw `selectedTeams` array is kept intact for
  // the Follow Teams editor so users still see their original selection when
  // re-opening it.
  const selectedTeamsSet = useMemo(() => {
    const eliminated = new Set();
    for (const team of teams) {
      if (team.eliminated) {
        eliminated.add(team.key);
      }
    }
    return new Set(selectedTeams.filter(key => !eliminated.has(key)));
  }, [selectedTeams, teams]);
  // Map of team key -> colors[] for looking up the gradient palette of a
  // followed team in the currently-highlighted match.
  const teamColorsByKey = useMemo(() => {
    const map = new Map();
    for (const team of teams) {
      if (Array.isArray(team.colors) && team.colors.length) {
        map.set(team.key, team.colors);
      }
    }
    return map;
  }, [teams]);

  // Bubble followed teams to the front for the highlight view and list view
  // when the followed-only toggle is on; with it off, matches stay chronological.
  const resultsFollowedOnly = sportsWidgetData.followedOnly?.results ?? true;
  const upcomingFollowedOnly = sportsWidgetData.followedOnly?.upcoming ?? true;
  const { sortedPrevious, sortedCurrent, sortedNext } = useMemo(() => {
    const previous = rawMatches?.previous ?? [];
    const next = rawMatches?.next ?? [];
    return {
      sortedPrevious: resultsFollowedOnly
        ? sortFollowedFirst(previous, selectedTeamsSet)
        : previous,
      sortedCurrent: sortFollowedFirst(rawLive ?? [], selectedTeamsSet),
      sortedNext: upcomingFollowedOnly
        ? sortFollowedFirst(next, selectedTeamsSet)
        : next,
    };
  }, [
    rawMatches,
    rawLive,
    selectedTeamsSet,
    resultsFollowedOnly,
    upcomingFollowedOnly,
  ]);

  // List-view toggle states for the Results and Upcoming tabs are lifted up
  // here so we can tell whether a highlight match is currently visible (for
  // applying the followed-team gradient on the article wrapper) and so we
  // can force the widget into the large size while the list view is open.
  const [showResultsList, setShowResultsList] = useState(false);
  const [showUpcomingList, setShowUpcomingList] = useState(false);

  // Expand the widget to the large size when the user opens the match list
  // view ("View all") on either the Results or Upcoming tab, and restore the
  // user's chosen size when they collapse back to the highlight view. The
  // size pref itself is left untouched — this is purely a visual override.
  const isMatchesListView =
    widgetState === WIDGET_STATES.MATCHES &&
    ((activeTab === MATCHES_TABS.RESULTS && showResultsList) ||
      (activeTab === MATCHES_TABS.UPCOMING && showUpcomingList));
  const displaySize =
    widgetState === WIDGET_STATES.FOLLOW_TEAMS || isMatchesListView
      ? "large"
      : widgetSize;

  const highlightMatch = getHighlightMatch({
    widgetState,
    activeTab,
    showResultsList,
    showUpcomingList,
    sortedPrevious,
    sortedCurrent,
    sortedNext,
    liveIndex,
  });
  const followedGradient = getFollowedGradient(
    highlightMatch,
    selectedTeamsSet,
    teamColorsByKey
  );
  const fetchError = sportsWidgetData?.data?.fetchError ?? null;
  const impressionFired = useRef(false);
  const errorFired = useRef(false);
  const introVideoRef = useRef(null);
  const playIntroVideo = useMemo(() => {
    const prefersReducedMotion =
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
      false;
    return () => {
      if (prefersReducedMotion) {
        return;
      }
      const video = introVideoRef.current;
      if (!video || !video.paused) {
        return;
      }
      video.currentTime = 0;
      video.play().catch(() => {});
    };
  }, []);
  const [watchLiveOpen, setWatchLiveOpen] = useState(false);

  const handleIntersection = useCallback(() => {
    if (impressionFired.current) {
      return;
    }
    impressionFired.current = true;
    dispatch(
      ac.AlsoToMain({
        type: at.WIDGETS_IMPRESSION,
        data: {
          widget_name: "sports",
          widget_size: widgetSize,
        },
      })
    );
  }, [dispatch, widgetSize]);

  const widgetRef = useIntersectionObserver(handleIntersection);
  // Track the article element via state so the live-visibility effect below
  // re-runs whenever React mounts a new node (e.g. after an early-return
  // gate flips and the article appears for the first time). widgetRef is a
  // stable useRef and can't drive re-runs on its own.
  const [liveEl, setLiveEl] = useState(null);

  // Live polling visibility gate. Separate from the one-shot impression
  // observer above (which unobserves after the first intersect) — this one
  // fires on every enter/leave so the feed can pause polling when no tab
  // has the widget on-screen. Also listens for tab visibility changes:
  // IntersectionObserver only reports viewport intersection, so a
  // backgrounded tab would otherwise keep reporting VISIBLE forever.
  useEffect(() => {
    if (!liveEnabled || !liveEl) {
      return undefined;
    }
    let isIntersecting = false;
    const dispatchState = visible => {
      dispatch(
        ac.OnlyToMain({
          type: visible
            ? at.WIDGETS_SPORTS_LIVE_VISIBLE
            : at.WIDGETS_SPORTS_LIVE_HIDDEN,
        })
      );
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        isIntersecting = entry.isIntersecting;
        dispatchState(isIntersecting && !document.hidden);
      },
      // Match the impression observer's threshold so "visible enough to
      // count" means the same thing for both.
      { threshold: 0.3 }
    );
    observer.observe(liveEl);
    const onVisibilityChange = () =>
      dispatchState(isIntersecting && !document.hidden);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [liveEnabled, dispatch, liveEl]);

  const handleErrorIntersection = useCallback(() => {
    if (!fetchError || errorFired.current) {
      return;
    }
    errorFired.current = true;
    // Fire from the content side so telemetry can tie the event to a tab
    // session. Events dispatched from the main process lack that link and get dropped.
    dispatch(
      ac.AlsoToMain({
        type: at.WIDGETS_ERROR,
        data: {
          widget_name: "sports",
          widget_size: widgetSize,
          error_type: fetchError.error_type,
        },
      })
    );
  }, [dispatch, fetchError, widgetSize]);

  const errorRef = useIntersectionObserver(handleErrorIntersection);

  const handleInteraction = useCallback(
    () => handleUserInteraction("sportsWidget"),
    [handleUserInteraction]
  );

  function handleFollowTeams(widgetSource) {
    dispatch(
      ac.OnlyToMain({
        type: at.WIDGETS_USER_EVENT,
        data: {
          widget_name: "sports",
          widget_source: widgetSource,
          user_action: USER_ACTION_TYPES.FOLLOW_TEAMS,
          widget_size: widgetSize,
        },
      })
    );
    // Tell the backend the widget state changed — it will save it and update the UI.
    dispatch(
      ac.AlsoToMain({
        type: at.WIDGETS_SPORTS_CHANGE_WIDGET_STATE,
        data: WIDGET_STATES.FOLLOW_TEAMS,
      })
    );
    handleInteraction();
  }

  function handleViewUpcoming() {
    // Mark this as an explicit tab choice so the live-games auto-override
    // doesn't pin activeTab back to NOW.
    hasUserSelectedTab.current = true;
    batch(() => {
      dispatch(
        ac.OnlyToMain({
          type: at.WIDGETS_USER_EVENT,
          data: {
            widget_name: "sports",
            widget_source: "context_menu",
            user_action: USER_ACTION_TYPES.VIEW_UPCOMING,
            widget_size: widgetSize,
          },
        })
      );
      dispatch(
        ac.AlsoToMain({
          type: at.WIDGETS_SPORTS_CHANGE_WIDGET_STATE,
          data: WIDGET_STATES.MATCHES,
        })
      );
      dispatch(
        ac.AlsoToMain({
          type: at.WIDGETS_SPORTS_CHANGE_MATCHES_TAB,
          data: MATCHES_TABS.UPCOMING,
        })
      );
    });
    handleInteraction();
  }

  function handleViewResults() {
    // Mark this as an explicit tab choice so the live-games auto-override
    // doesn't pin activeTab back to NOW.
    hasUserSelectedTab.current = true;
    batch(() => {
      dispatch(
        ac.OnlyToMain({
          type: at.WIDGETS_USER_EVENT,
          data: {
            widget_name: "sports",
            widget_source: "context_menu",
            user_action: USER_ACTION_TYPES.VIEW_RESULTS,
            widget_size: widgetSize,
          },
        })
      );
      dispatch(
        ac.AlsoToMain({
          type: at.WIDGETS_SPORTS_CHANGE_WIDGET_STATE,
          data: WIDGET_STATES.MATCHES,
        })
      );
      dispatch(
        ac.AlsoToMain({
          type: at.WIDGETS_SPORTS_CHANGE_MATCHES_TAB,
          data: MATCHES_TABS.RESULTS,
        })
      );
    });
    handleInteraction();
  }

  function handleViewKeyDates(widgetSource) {
    batch(() => {
      dispatch(
        ac.OnlyToMain({
          type: at.WIDGETS_USER_EVENT,
          data: {
            widget_name: "sports",
            widget_source: widgetSource,
            user_action: USER_ACTION_TYPES.VIEW_KEY_DATES,
            widget_size: widgetSize,
          },
        })
      );
      dispatch(
        ac.AlsoToMain({
          type: at.WIDGETS_SPORTS_CHANGE_WIDGET_STATE,
          data: WIDGET_STATES.KEY_DATES,
        })
      );
    });
    handleInteraction();
  }

  function handleSportsWidgetHide() {
    batch(() => {
      dispatch(
        ac.OnlyToMain({
          type: at.SET_PREF,
          data: { name: "widgets.sportsWidget.enabled", value: false },
        })
      );
      dispatch(
        ac.OnlyToMain({
          type: at.WIDGETS_ENABLED,
          data: {
            widget_name: "sports",
            widget_source: "context_menu",
            enabled: false,
            widget_size: widgetSize,
          },
        })
      );
    });
  }

  const handleChangeSize = useCallback(
    size => {
      batch(() => {
        dispatch(
          ac.OnlyToMain({
            type: at.SET_PREF,
            data: { name: PREF_SPORTS_WIDGET_SIZE, value: size },
          })
        );
        dispatch(
          ac.OnlyToMain({
            type: at.WIDGETS_USER_EVENT,
            data: {
              widget_name: "sports",
              widget_source: "context_menu",
              user_action: USER_ACTION_TYPES.CHANGE_SIZE,
              action_value: size,
              widget_size: size,
            },
          })
        );
      });
    },
    [dispatch]
  );

  const sizeSubmenuRef = useSizeSubmenu(handleChangeSize);

  function handleViewMatches(widgetSource) {
    batch(() => {
      dispatch(
        ac.OnlyToMain({
          type: at.WIDGETS_USER_EVENT,
          data: {
            widget_name: "sports",
            widget_source: widgetSource,
            user_action: USER_ACTION_TYPES.VIEW_MATCHES,
            widget_size: widgetSize,
          },
        })
      );
      dispatch(
        ac.AlsoToMain({
          type: at.WIDGETS_SPORTS_CHANGE_WIDGET_STATE,
          data: WIDGET_STATES.MATCHES,
        })
      );
    });
    handleInteraction();
  }

  function handleLearnMore() {
    batch(() => {
      dispatch(
        ac.OnlyToMain({
          type: at.OPEN_LINK,
          data: {
            url: "https://support.mozilla.org/kb/firefox-new-tab-widgets",
          },
        })
      );
      const telemetryData = {
        widget_name: "sports",
        widget_source: "context_menu",
        user_action: USER_ACTION_TYPES.LEARN_MORE,
        widget_size: widgetSize,
      };
      dispatch(
        ac.OnlyToMain({
          type: at.WIDGETS_USER_EVENT,
          data: telemetryData,
        })
      );
    });
    handleInteraction();
  }

  // Discard any team changes and go back to the intro state.
  const handleCancelSelection = useCallback(
    () =>
      dispatch(
        ac.AlsoToMain({
          type: at.WIDGETS_SPORTS_CHANGE_WIDGET_STATE,
          data: WIDGET_STATES.INTRO,
        })
      ),
    [dispatch]
  );

  const handleSaveSelection = useCallback(
    newSelectedTeams => {
      if (newSelectedTeams.length) {
        dispatch(
          ac.OnlyToMain({
            type: at.WIDGETS_USER_EVENT,
            data: {
              widget_name: "sports",
              widget_source: "widget",
              user_action: USER_ACTION_TYPES.SAVE_TEAMS,
              action_value: newSelectedTeams.length,
              widget_size: widgetSize,
            },
          })
        );
      }
      dispatch(
        ac.AlsoToMain({
          type: at.WIDGETS_SPORTS_CHANGE_SELECTED_TEAMS,
          data: newSelectedTeams,
        })
      );
      handleCancelSelection();
    },
    [dispatch, widgetSize, handleCancelSelection]
  );

  const handleViewIntro = useCallback(
    () =>
      dispatch(
        ac.AlsoToMain({
          type: at.WIDGETS_SPORTS_CHANGE_WIDGET_STATE,
          data: WIDGET_STATES.INTRO,
        })
      ),
    [dispatch]
  );

  const handleMatchesTabChange = useCallback(
    tab => {
      if (tab === activeTab) {
        return;
      }
      hasUserSelectedTab.current = true;
      batch(() => {
        dispatch(
          ac.OnlyToMain({
            type: at.WIDGETS_USER_EVENT,
            data: {
              widget_name: "sports",
              widget_source: "widget",
              user_action: USER_ACTION_TYPES.CHANGE_TAB,
              action_value: tab,
              widget_size: widgetSize,
            },
          })
        );
        dispatch(
          ac.AlsoToMain({
            type: at.WIDGETS_SPORTS_CHANGE_MATCHES_TAB,
            data: tab,
          })
        );
      });
    },
    [dispatch, widgetSize, activeTab]
  );

  // @nova-cleanup(remove-gate): Remove this guard and PREF_NOVA_ENABLED after Nova ships
  if (!prefs[PREF_NOVA_ENABLED]) {
    return null;
  }

  return (
    <article
      className={`sports widget col-4 ${displaySize}-widget ${widgetState}${
        followedGradient ? " is-followed-highlight" : ""
      }`}
      style={
        followedGradient
          ? { "--sports-followed-gradient": followedGradient }
          : undefined
      }
      ref={el => {
        widgetRef.current = [el];
        setLiveEl(el);
        // Only attach the error observer when there's something to report —
        // otherwise the first intersect with no fetchError adds the target to
        // the hook's internal WeakSet and a fetchError arriving later never fires.
        errorRef.current = fetchError ? [el] : [];
      }}
      onMouseEnter={playIntroVideo}
      onFocus={e => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          playIntroVideo();
        }
      }}
      {...getCarouselArticleAttrs(
        activeTab === MATCHES_TABS.NOW && (rawLive?.length ?? 0) >= 2
      )}
    >
      {widgetState === WIDGET_STATES.INTRO && (
        <video
          ref={introVideoRef}
          className="sports-intro-video"
          muted={true}
          playsInline={true}
          preload="auto"
          aria-hidden="true"
          tabIndex={-1}
          poster={`chrome://newtab/content/data/content/assets/worldcup-${displaySize}.png`}
          src={`chrome://newtab/content/data/content/assets/worldcup-${displaySize}.webm`}
        />
      )}
      <div className="sports-title-wrapper">
        {/* The empty self-closing div here is used to help center the title, since the context menu also takes up space. */}
        {widgetState === WIDGET_STATES.INTRO && <div />}
        {widgetState === WIDGET_STATES.FOLLOW_TEAMS && (
          <span
            className="sports-follow-teams-title"
            data-l10n-id="newtab-sports-widget-follow-teams-title"
            // If changing this number, also update isMaxSelected in SportsWidgetFollowTeams.
            data-l10n-args={JSON.stringify({ number: 3 })}
          />
        )}
        {widgetState === WIDGET_STATES.MATCHES && (
          <moz-button
            className="sports-back-button"
            type="icon ghost"
            iconsrc="chrome://global/skin/icons/arrow-left.svg"
            data-l10n-id="newtab-sports-widget-back-button"
            onClick={handleViewIntro}
            style={{ visibility: tournamentStarted ? "hidden" : "visible" }}
            aria-hidden={tournamentStarted}
          />
        )}
        {widgetState === WIDGET_STATES.MATCHES && (
          <div className="sports-matches-tabs" role="tablist">
            {getVisibleMatchesTabs(hasLiveGames, hasPreviousResults).map(
              ({ id, disabled }) => (
                <button
                  key={id}
                  id={`sports-${id}-tab`}
                  role="tab"
                  aria-selected={activeTab === id}
                  disabled={disabled}
                  className={`sports-matches-tab${activeTab === id ? " is-active" : ""}${disabled ? " is-disabled" : ""}`}
                  onClick={() => handleMatchesTabChange(id)}
                  data-l10n-id={`newtab-sports-widget-${id}`}
                />
              )
            )}
          </div>
        )}
        {widgetState === WIDGET_STATES.KEY_DATES && (
          <>
            <moz-button
              className="sports-back-button"
              type="icon ghost"
              iconsrc="chrome://global/skin/icons/arrow-left.svg"
              data-l10n-id="newtab-sports-widget-back-button"
              onClick={handleViewIntro}
            />
            <h3 data-l10n-id="newtab-sports-widget-key-dates"></h3>
          </>
        )}
        {widgetState === WIDGET_STATES.INTRO && (
          <div className="sports-intro-wrapper">
            <h2
              className="sports-intro-title"
              data-l10n-id="newtab-sports-widget-keep-tabs"
            />
            {displaySize === "large" && (
              <p
                className="sports-intro-lede"
                data-l10n-id="newtab-sports-widget-get-updates"
              ></p>
            )}
          </div>
        )}
        {widgetState === WIDGET_STATES.FOLLOW_TEAMS ? (
          <button
            className="sports-cancel-button"
            data-l10n-id="newtab-sports-widget-cancel"
            onClick={handleCancelSelection}
          />
        ) : (
          <div className="sports-context-menu-wrapper">
            <moz-button
              className="sports-context-menu-button"
              iconSrc="chrome://global/skin/icons/more.svg"
              menuId="sports-context-menu"
              type="ghost"
            />
            <panel-list id="sports-context-menu">
              <panel-item
                data-l10n-id="newtab-sports-widget-menu-follow-teams"
                onClick={() => handleFollowTeams("context_menu")}
              />
              <panel-item
                data-l10n-id="newtab-sports-widget-menu-view-schedule"
                onClick={() => handleViewKeyDates("context_menu")}
              />
              <panel-item
                data-l10n-id="newtab-sports-widget-menu-view-upcoming"
                onClick={handleViewUpcoming}
              />
              <panel-item
                data-l10n-id="newtab-sports-widget-menu-view-results"
                onClick={handleViewResults}
                disabled={!hasPreviousResults}
              />
              {widgetsMayBeMaximized && (
                <panel-item submenu="sports-size-submenu">
                  <span data-l10n-id="newtab-widget-menu-change-size"></span>
                  <panel-list
                    ref={sizeSubmenuRef}
                    slot="submenu"
                    id="sports-size-submenu"
                  >
                    {["medium", "large"].map(size => (
                      <panel-item
                        key={size}
                        type="checkbox"
                        checked={widgetSize === size || undefined}
                        data-size={size}
                        data-l10n-id={`newtab-widget-size-${size}`}
                      />
                    ))}
                  </panel-list>
                </panel-item>
              )}
              <MoveSubmenu
                widgetId="sportsWidget"
                widgetEnabledMap={widgetEnabledMap}
              />
              <panel-item
                data-l10n-id="newtab-widget-menu-hide"
                onClick={handleSportsWidgetHide}
              />
              <panel-item
                data-l10n-id="newtab-sports-widget-menu-learn-more"
                onClick={handleLearnMore}
              />
            </panel-list>
          </div>
        )}
      </div>

      <div className="sports-body">
        {widgetState === WIDGET_STATES.FOLLOW_TEAMS && (
          <SportsWidgetFollowTeams
            teams={teams}
            initialSelectedTeams={selectedTeams}
            onSave={handleSaveSelection}
          />
        )}
        {widgetState === WIDGET_STATES.MATCHES && (
          <SportsMatchesView
            dispatch={dispatch}
            matchesTab={activeTab}
            hasLiveGames={hasLiveGames}
            hasLivePagination={
              activeTab === MATCHES_TABS.NOW && (rawLive?.length ?? 0) >= 2
            }
            size={displaySize}
            widgetSize={widgetSize}
            previous={sortedPrevious}
            current={sortedCurrent}
            next={sortedNext}
            liveIndex={liveIndex}
            handleInteraction={handleInteraction}
            selectedTeamsSet={selectedTeamsSet}
            followedOnly={sportsWidgetData.followedOnly}
            showResultsList={showResultsList}
            setShowResultsList={setShowResultsList}
            showUpcomingList={showUpcomingList}
            setShowUpcomingList={setShowUpcomingList}
            onWatchClick={() => setWatchLiveOpen(true)}
          />
        )}
        {widgetState === WIDGET_STATES.KEY_DATES && (
          <SportsWidgetKeyDates handleViewMatches={handleViewMatches} />
        )}
        {widgetState === WIDGET_STATES.INTRO && (
          <>
            <div className="sports-buttons-wrapper">
              <moz-button
                type="primary"
                size={widgetSize === "medium" ? "small" : undefined}
                data-l10n-id="newtab-sports-widget-view-matches"
                className="sports-view-matches"
                onClick={() => handleViewMatches("widget")}
              />
              <moz-button
                type="secondary"
                size={widgetSize === "medium" ? "small" : undefined}
                data-l10n-id="newtab-sports-widget-follow-teams"
                className="sports-follow-teams-btn"
                onClick={() => handleFollowTeams("widget")}
              />
            </div>
            {liveEnabled && sportsWidgetData?.initialized && (
              <div className="sports-live-scores">
                {/* Live scores content */}
              </div>
            )}
          </>
        )}
      </div>
      {watchLiveOpen && (
        <WatchLiveModal
          onClose={() => setWatchLiveOpen(false)}
          dispatch={dispatch}
          widgetSize={widgetSize}
        />
      )}
    </article>
  );
}

function SportsWidgetFollowTeams({ teams, initialSelectedTeams, onSave }) {
  const [selectedTeams, setSelectedTeams] = useState(initialSelectedTeams);
  const [searchQuery, setSearchQuery] = useState("");
  const localizedNames = useLocalizedTeamNames(teams);
  // Eliminated teams stay in the list (shown disabled with an "(eliminated)"
  // badge) but don't count toward the 3-team cap and aren't persisted on save
  // — otherwise the user could be stuck following a team they can no longer
  // toggle off, or blocked from picking a replacement.
  const eliminatedKeys = new Set(
    teams.filter(team => team.eliminated).map(team => team.key)
  );
  const activeSelectedTeams = selectedTeams.filter(
    key => !eliminatedKeys.has(key)
  );
  const isMaxSelected = activeSelectedTeams.length >= 3;

  function handleTeamToggle(teamKey, isChecked) {
    setSelectedTeams(prev =>
      isChecked ? [...prev, teamKey] : prev.filter(key => key !== teamKey)
    );
  }

  const sortedTeams = localizedNames
    ? [...teams].sort((a, b) =>
        localizedNames[a.key].localeCompare(localizedNames[b.key])
      )
    : [];
  const filteredTeams = searchQuery
    ? sortedTeams.filter(team =>
        localizedNames[team.key]
          .toLocaleLowerCase()
          .includes(searchQuery.toLocaleLowerCase())
      )
    : sortedTeams;

  return (
    <div className="sports-follow-teams">
      <moz-input-search
        data-l10n-id="newtab-sports-widget-search-country"
        className="sports-country-search"
        onInput={e => setSearchQuery(e.target.value)}
      />
      <div className="sports-follow-teams-list">
        {/* Wait until names are localized so users in other locales don't see a flicker of content in English. */}
        {localizedNames &&
          filteredTeams.map(team => {
            const isSelected = selectedTeams.includes(team.key);
            const isEliminated = eliminatedKeys.has(team.key);
            const isRowDisabled =
              isEliminated || (!isSelected && isMaxSelected);
            const localizedName = localizedNames[team.key];
            return (
              <div
                key={team.key}
                className={`sports-follow-teams-row${isRowDisabled ? " is-disabled" : ""}`}
                onClick={e => {
                  // The checkbox already handles its own toggle; skip here so we don't toggle twice.
                  if (e.target.localName === "moz-checkbox") {
                    return;
                  }
                  if (isRowDisabled) {
                    return;
                  }
                  handleTeamToggle(team.key, !isSelected);
                }}
              >
                <moz-checkbox
                  checked={isSelected || undefined}
                  disabled={isRowDisabled ? true : undefined}
                  onChange={e => handleTeamToggle(team.key, e.target.checked)}
                  aria-label={localizedName}
                />
                <img
                  className="sports-team-flag"
                  src={team.icon_url}
                  alt=""
                  title={localizedName}
                />
                {isEliminated ? (
                  <span
                    className="sports-team-name"
                    data-l10n-id="newtab-sports-widget-team-name-eliminated"
                    data-l10n-args={JSON.stringify({
                      teamName: localizedName,
                    })}
                  />
                ) : (
                  <span className="sports-team-name">{localizedName}</span>
                )}
              </div>
            );
          })}
      </div>
      <moz-button
        className="sports-done-button"
        data-l10n-id="newtab-sports-widget-done-button"
        type="primary"
        size="small"
        onClick={() => onSave(activeSelectedTeams)}
      />
    </div>
  );
}

function SportsSectionLabel({ match, withLiveBadge = false }) {
  const l10nId = getMatchSectionL10nId(match);
  const stageContent = l10nId ? (
    <span data-l10n-id={l10nId} />
  ) : (
    <span>{match.stage}</span>
  );
  if (!withLiveBadge) {
    return <span className="sports-section-label">{stageContent}</span>;
  }
  return (
    <span className="sports-section-label">
      {stageContent}{" "}
      <span className="sports-section-label-live">
        <span aria-hidden="true">{"• "}</span>
        <span data-l10n-id="newtab-sports-widget-live" />
      </span>
    </span>
  );
}

function SportsMatchesView({
  dispatch,
  matchesTab,
  hasLiveGames,
  hasLivePagination,
  // `size` is the *effective* display size — it may be forced to "large"
  // when the user has expanded the match list view, even if the user's
  // chosen pref is "medium". Use it for layout decisions inside the view.
  size,
  // `widgetSize` is the user's chosen size pref, used for telemetry only so
  // events keep reporting the user's actual chosen size regardless of any
  // temporary list-view expansion.
  widgetSize,
  previous,
  current,
  next,
  liveIndex,
  handleInteraction,
  selectedTeamsSet,
  followedOnly,
  showResultsList,
  setShowResultsList,
  showUpcomingList,
  setShowUpcomingList,
  onWatchClick,
}) {
  const resultsPanelRef = useRef(null);
  const upcomingPanelRef = useRef(null);
  const hasFollowedTeams = selectedTeamsSet.size > 0;
  // Read the persisted per-tab toggle state from redux. Defaults to true so
  // users with followed teams see the filtered list right away.
  const resultsFollowedOnly = followedOnly?.results ?? true;
  const upcomingFollowedOnly = followedOnly?.upcoming ?? true;

  const setFollowedOnly = (tab, value) =>
    batch(() => {
      dispatch(
        ac.OnlyToMain({
          type: at.WIDGETS_USER_EVENT,
          data: {
            widget_name: "sports",
            // `widget_source` carries the originating tab (results/upcoming)
            // since the toggle is rendered per-tab. `action_value` carries
            // the new pressed state.
            widget_source: tab,
            user_action: USER_ACTION_TYPES.TOGGLE_FOLLOWED_ONLY,
            action_value: value,
            widget_size: widgetSize,
          },
        })
      );
      dispatch(
        ac.AlsoToMain({
          type: at.WIDGETS_SPORTS_CHANGE_FOLLOWED_ONLY,
          data: { [tab]: value },
        })
      );
    });

  const filterFollowed = matches =>
    matches.filter(
      match =>
        selectedTeamsSet.has(match.home_team.key) ||
        selectedTeamsSet.has(match.away_team.key)
    );
  // Filtering is only meaningful when the user has followed at least one
  // team — otherwise we'd hide every match.
  const displayedPrevious =
    hasFollowedTeams && resultsFollowedOnly
      ? filterFollowed(previous)
      : previous;
  const displayedNext =
    hasFollowedTeams && upcomingFollowedOnly ? filterFollowed(next) : next;

  // When the user expands a tab into list mode, move keyboard focus to the
  // first match row in the just-revealed list. Without this, focus stays on
  // the "View all" button, which sits at the bottom of the widget — pressing
  // Tab from there moves focus *out* of the widget instead of into the new
  // content, creating a keyboard trap for screen reader / keyboard users.
  // We don't move focus when collapsing back to highlight view: focus
  // naturally remains on the "Show less" button the user just activated,
  // which is the expected behavior.
  useEffect(() => {
    if (showResultsList) {
      resultsPanelRef.current?.querySelector(".sports-match-row")?.focus();
    }
  }, [showResultsList]);
  useEffect(() => {
    if (showUpcomingList) {
      upcomingPanelRef.current?.querySelector(".sports-match-row")?.focus();
    }
  }, [showUpcomingList]);

  return (
    <div className="sports-matches-view">
      <div
        className="sports-matches-tab-panel"
        hidden={matchesTab !== MATCHES_TABS.RESULTS}
        ref={resultsPanelRef}
      >
        {showResultsList ? (
          <>
            {hasFollowedTeams && (
              /** @backward-compat { version 150 } React 16 (cached page) uses ontoggle; React 19 uses onToggle. Remove onToggle once Firefox 150 reaches Release. */
              <moz-toggle
                className="sports-followed-only-toggle"
                pressed={resultsFollowedOnly || null}
                data-l10n-id="newtab-sports-widget-followed-only-toggle"
                ontoggle={e => setFollowedOnly("results", !!e.target.pressed)}
                onToggle={e => setFollowedOnly("results", !!e.target.pressed)}
              ></moz-toggle>
            )}
            <div className="sports-matches-list">
              {groupMatchesBySection(displayedPrevious).map((section, idx) => (
                <div
                  key={`${section.key}-${idx}`}
                  className="sports-matches-list-section"
                >
                  <SportsSectionLabel match={section.matches[0]} />
                  <ul>
                    {section.matches.map(match => (
                      <li
                        key={`${match.home_team.key}-${match.away_team.key}-${match.date}`}
                      >
                        <SportsMatchRow
                          match={match}
                          variant="results"
                          size="list"
                          handleInteraction={handleInteraction}
                          followedTeams={selectedTeamsSet}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        ) : (
          previous[0] && (
            <>
              {size === "large" && <SportsSectionLabel match={previous[0]} />}
              <div className="match-highlight-view">
                <SportsMatchRow
                  match={previous[0]}
                  variant="results"
                  size={size}
                  handleInteraction={handleInteraction}
                  followedTeams={selectedTeamsSet}
                />
              </div>
            </>
          )
        )}
        {!!previous.length && (
          <moz-button
            type="secondary"
            size={size === "medium" ? "small" : undefined}
            data-l10n-id={
              showResultsList
                ? "newtab-sports-widget-show-less"
                : "newtab-sports-widget-view-all"
            }
            onClick={() => setShowResultsList(v => !v)}
          ></moz-button>
        )}
      </div>
      {hasLiveGames && (
        <div
          className="sports-matches-tab-panel"
          hidden={matchesTab !== MATCHES_TABS.NOW}
        >
          {current[liveIndex] && (
            <>
              {size === "large" && (
                <SportsSectionLabel
                  match={current[liveIndex]}
                  withLiveBadge={true}
                />
              )}
              <div
                className="match-highlight-view"
                {...(hasLivePagination && {
                  "aria-live": "polite",
                  "aria-atomic": "false",
                })}
              >
                <SportsMatchRow
                  match={current[liveIndex]}
                  variant="now"
                  size={size}
                  handleInteraction={handleInteraction}
                  followedTeams={selectedTeamsSet}
                />
              </div>
              {/* TODO: Replace play icon when finalized */}
              <moz-button
                className="sports-watch-live-button"
                type={size === "medium" ? "icon" : "default"}
                size={size === "medium" ? "small" : undefined}
                iconSrc="chrome://browser/skin/device-tv.svg"
                data-l10n-id={
                  size === "medium"
                    ? "newtab-sports-widget-watch-icon"
                    : "newtab-sports-widget-watch"
                }
                onClick={onWatchClick}
              ></moz-button>
              {current.length >= 2 && (
                <LivePagination
                  dispatch={dispatch}
                  liveIndex={liveIndex}
                  liveCount={current.length}
                  size={size}
                  handleInteraction={handleInteraction}
                />
              )}
            </>
          )}
        </div>
      )}
      <div
        className="sports-matches-tab-panel"
        hidden={matchesTab !== MATCHES_TABS.UPCOMING}
        ref={upcomingPanelRef}
      >
        {showUpcomingList ? (
          <>
            {hasFollowedTeams && (
              /** @backward-compat { version 150 } React 16 (cached page) uses ontoggle; React 19 uses onToggle. Remove onToggle once Firefox 150 reaches Release. */
              <moz-toggle
                className="sports-followed-only-toggle"
                pressed={upcomingFollowedOnly || null}
                data-l10n-id="newtab-sports-widget-followed-only-toggle"
                ontoggle={e => setFollowedOnly("upcoming", !!e.target.pressed)}
                onToggle={e => setFollowedOnly("upcoming", !!e.target.pressed)}
              ></moz-toggle>
            )}
            <div className="sports-matches-list">
              {groupMatchesBySection(displayedNext).map((section, idx) => (
                <div
                  key={`${section.key}-${idx}`}
                  className="sports-matches-list-section"
                >
                  <SportsSectionLabel match={section.matches[0]} />
                  <ul>
                    {section.matches.map(match => (
                      <li
                        key={`${match.home_team.key}-${match.away_team.key}-${match.date}`}
                      >
                        <SportsMatchRow
                          match={match}
                          variant="upcoming"
                          size="list"
                          handleInteraction={handleInteraction}
                          followedTeams={selectedTeamsSet}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        ) : (
          next[0] && (
            <>
              {size === "large" && <SportsSectionLabel match={next[0]} />}
              <div className="match-highlight-view">
                <SportsMatchRow
                  match={next[0]}
                  variant="upcoming"
                  size={size}
                  handleInteraction={handleInteraction}
                  followedTeams={selectedTeamsSet}
                />
              </div>
            </>
          )
        )}
        {!!next.length && (
          <moz-button
            type="secondary"
            size={size === "medium" ? "small" : undefined}
            data-l10n-id={
              showUpcomingList
                ? "newtab-sports-widget-show-less"
                : "newtab-sports-widget-view-all"
            }
            onClick={() => setShowUpcomingList(v => !v)}
          ></moz-button>
        )}
      </div>
    </div>
  );
}

const keyDatesList = [
  {
    stageL10nId: "newtab-sports-widget-group-stage",
    start: "2026-06-11",
    end: "2026-06-27",
  },
  {
    stageL10nId: "newtab-sports-widget-round-32",
    start: "2026-06-28",
    end: "2026-07-03",
  },
  {
    stageL10nId: "newtab-sports-widget-round-16",
    start: "2026-07-04",
    end: "2026-07-07",
  },
  {
    stageL10nId: "newtab-sports-widget-quarter-finals",
    start: "2026-07-09",
    end: "2026-07-11",
  },
  {
    stageL10nId: "newtab-sports-widget-semi-finals",
    start: "2026-07-14",
    end: "2026-07-15",
  },
  {
    stageL10nId: "newtab-sports-widget-bronze-finals",
    date: "2026-07-18",
  },
  {
    stageL10nId: "newtab-sports-widget-final",
    date: "2026-07-19",
  },
];

function SportsWidgetKeyDates({ handleViewMatches }) {
  return (
    <div className="sports-key-dates">
      <ul className="sports-key-dates-list">
        {keyDatesList.map(({ stageL10nId, start, end, date }) => (
          <li key={stageL10nId} className="sports-key-dates-item">
            <span data-l10n-id={stageL10nId} />
            <span
              data-l10n-id={
                date
                  ? "newtab-sports-widget-key-date"
                  : "newtab-sports-widget-key-date-range"
              }
              data-l10n-args={JSON.stringify(
                date
                  ? { date: new Date(date).getTime() }
                  : {
                      start: new Date(start).getTime(),
                      end: new Date(end).getTime(),
                    }
              )}
            />
          </li>
        ))}
      </ul>
      <moz-button
        type="secondary"
        size="small"
        data-l10n-id="newtab-sports-widget-view-matches"
        onClick={() => handleViewMatches("key_dates_state")}
      />
    </div>
  );
}

export { SportsWidget };
