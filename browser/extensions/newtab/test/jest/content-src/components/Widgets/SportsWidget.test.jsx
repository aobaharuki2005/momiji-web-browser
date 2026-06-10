/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { act, render, fireEvent } from "@testing-library/react";
import { INITIAL_STATE } from "common/Reducers.sys.mjs";
import { actionTypes as at } from "common/Actions.mjs";
import { WrapWithProvider } from "test/jest/test-utils";
import { SportsWidget } from "content-src/components/Widgets/SportsWidget/SportsWidget";

// Pin Date.now() to a post-kickoff timestamp for the entire suite so the
// kickoff-date guard on /live data does not zero out the mock live matches
// used by these tests.
const POST_KICKOFF_MS = Date.UTC(2026, 5, 12, 0, 0, 0);
let dateNowSpy;
beforeAll(() => {
  dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(POST_KICKOFF_MS);
});
afterAll(() => {
  dateNowSpy.mockRestore();
});

const mockTeams = [
  { key: "CAN", name: "Canada" },
  { key: "AUS", name: "Australia" },
  { key: "ALG", name: "Algeria" },
  { key: "IRQ", name: "Iraq" },
  { key: "ITA", name: "Italy" },
  { key: "ESP", name: "Spain" },
  { key: "NGA", name: "Nigeria" },
  { key: "MAR", name: "Morocco" },
  { key: "POR", name: "Portugal" },
  { key: "GER", name: "Germany" },
  { key: "SEN", name: "Senegal" },
];

const emptyMatches = { previous: [], current: [], next: [] };

const mockMatch = {
  home_team: { key: "ENG", name: "England" },
  away_team: { key: "USA", name: "United States" },
  date: "2026-05-08T14:00:00+00:00",
  status_type: "live",
  home_score: 1,
  away_score: 0,
  home_extra: null,
  away_extra: null,
  home_penalty: null,
  away_penalty: null,
  // `query` makes the row focusable (tabIndex=0) so the focus-on-expand
  // assertions below have something to receive focus.
  query: "ENG vs USA",
};

function makeGroupMatch(letter, overrides = {}) {
  return {
    ...mockMatch,
    stage: "Group Stage",
    home_team: { ...mockMatch.home_team, group: `Group ${letter}` },
    away_team: { ...mockMatch.away_team, group: `Group ${letter}` },
    ...overrides,
  };
}

function makeKnockoutMatch(stage, overrides = {}) {
  return {
    ...mockMatch,
    stage,
    home_team: { ...mockMatch.home_team, group: "Group A" },
    away_team: { ...mockMatch.away_team, group: "Group A" },
    ...overrides,
  };
}

function getVisibleTabPanel(container) {
  return [...container.querySelectorAll(".sports-matches-tab-panel")].find(
    panel => !panel.hasAttribute("hidden")
  );
}

const PREF_NOVA_ENABLED = "nova.enabled";
const PREF_SPORTS_WIDGET_SIZE = "widgets.sportsWidget.size";

const defaultProps = {
  dispatch: jest.fn(),
  handleUserInteraction: jest.fn(),
};

// Default Fluent mock returns the en-US `.label` value for each
// requested team name ID. Individual tests can override `formatMessages`.
function mockDocumentL10n() {
  const fluentLabels = {
    "newtab-sports-widget-team-name-label-bih": "Bosnia and Herzegovina",
    "newtab-sports-widget-team-name-label-civ": "Ivory Coast",
    "newtab-sports-widget-team-name-label-cod": "DR Congo",
    "newtab-sports-widget-team-name-label-eng": "England",
    "newtab-sports-widget-team-name-label-sco": "Scotland",
  };
  document.l10n = {
    formatMessages: jest.fn(async ids =>
      ids.map(({ id }) => ({
        value: null,
        attributes: [{ name: "label", value: fluentLabels[id] }],
      }))
    ),
  };
}

function makeTeams() {
  return [
    {
      key: "CAN",
      global_team_id: 90000966,
      name: "Canada",
      region: "CAN",
      colors: ["#FF0000", "#FFFFFF", "#D52B1E"],
      icon_url: "https://example.test/CAN.svg",
      eliminated: false,
    },
    {
      key: "AUS",
      global_team_id: 90001244,
      name: "Australia",
      region: "AUS",
      colors: ["#012169", "#FFFFFF", "#E4002B"],
      icon_url: "https://example.test/AUS.svg",
      eliminated: false,
    },
    {
      key: "ALG",
      global_team_id: 90001054,
      name: "Algeria",
      region: "ALG",
      colors: ["#006233", "#FFFFFF", "#D21034"],
      icon_url: "https://example.test/ALG.svg",
      eliminated: false,
    },
    {
      key: "ENG",
      global_team_id: 90000858,
      name: "England",
      region: "ENG",
      colors: ["#FFFFFF", "#CE1126"],
      icon_url: "https://example.test/ENG.svg",
      eliminated: false,
    },
  ];
}

function makeState(prefOverrides = {}, sportsWidgetOverrides = {}) {
  return {
    ...INITIAL_STATE,
    Prefs: {
      ...INITIAL_STATE.Prefs,
      values: {
        ...INITIAL_STATE.Prefs.values,
        [PREF_NOVA_ENABLED]: true,
        [PREF_SPORTS_WIDGET_SIZE]: "medium",
        ...prefOverrides,
      },
    },
    SportsWidget: { ...INITIAL_STATE.SportsWidget, ...sportsWidgetOverrides },
  };
}

describe("<SportsWidget>", () => {
  it("should render the sports widget", () => {
    const { container } = render(
      <WrapWithProvider state={makeState()}>
        <SportsWidget {...defaultProps} />
      </WrapWithProvider>
    );
    expect(container.querySelector(".sports")).toBeInTheDocument();
  });

  it("should return null when nova.enabled is false", () => {
    const { container } = render(
      <WrapWithProvider state={makeState({ [PREF_NOVA_ENABLED]: false })}>
        <SportsWidget {...defaultProps} />
      </WrapWithProvider>
    );
    expect(container.querySelector(".sports")).not.toBeInTheDocument();
  });

  it("should apply the medium-widget class by default", () => {
    const { container } = render(
      <WrapWithProvider state={makeState()}>
        <SportsWidget {...defaultProps} />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(".sports.medium-widget")
    ).toBeInTheDocument();
  });

  it("should apply the large-widget class when size pref is large", () => {
    const { container } = render(
      <WrapWithProvider
        state={makeState({ [PREF_SPORTS_WIDGET_SIZE]: "large" })}
      >
        <SportsWidget {...defaultProps} />
      </WrapWithProvider>
    );
    expect(container.querySelector(".sports.large-widget")).toBeInTheDocument();
  });

  it("falls back to the registry default size (medium) when no size pref is set", () => {
    const { container } = render(
      <WrapWithProvider state={makeState({ [PREF_SPORTS_WIDGET_SIZE]: "" })}>
        <SportsWidget {...defaultProps} />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(".sports.medium-widget")
    ).toBeInTheDocument();
    expect(
      container.querySelector(".sports.large-widget")
    ).not.toBeInTheDocument();
  });

  it("should always render the intro wrapper", () => {
    const { container } = render(
      <WrapWithProvider state={makeState()}>
        <SportsWidget {...defaultProps} />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(".sports-intro-wrapper")
    ).toBeInTheDocument();
  });

  it("renders the intro video pointing at the size-matched webm", () => {
    const mediumResult = render(
      <WrapWithProvider state={makeState()}>
        <SportsWidget {...defaultProps} />
      </WrapWithProvider>
    );
    expect(
      mediumResult.container.querySelector(".sports-intro-video")
    ).toHaveAttribute(
      "src",
      "chrome://newtab/content/data/content/assets/worldcup-medium.webm"
    );

    const largeResult = render(
      <WrapWithProvider
        state={makeState({ [PREF_SPORTS_WIDGET_SIZE]: "large" })}
      >
        <SportsWidget {...defaultProps} />
      </WrapWithProvider>
    );
    expect(
      largeResult.container.querySelector(".sports-intro-video")
    ).toHaveAttribute(
      "src",
      "chrome://newtab/content/data/content/assets/worldcup-large.webm"
    );
  });

  it("should show the keep-tabs title", () => {
    const { container } = render(
      <WrapWithProvider state={makeState()}>
        <SportsWidget {...defaultProps} />
      </WrapWithProvider>
    );
    expect(
      container.querySelector("[data-l10n-id='newtab-sports-widget-keep-tabs']")
    ).toBeInTheDocument();
  });

  it("hides the get-updates lede on medium size", () => {
    const { container } = render(
      <WrapWithProvider state={makeState()}>
        <SportsWidget {...defaultProps} />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(
        "[data-l10n-id='newtab-sports-widget-get-updates']"
      )
    ).not.toBeInTheDocument();
  });

  it("shows the get-updates lede on large size", () => {
    const { container } = render(
      <WrapWithProvider
        state={makeState({ [PREF_SPORTS_WIDGET_SIZE]: "large" })}
      >
        <SportsWidget {...defaultProps} />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(
        "[data-l10n-id='newtab-sports-widget-get-updates']"
      )
    ).toBeInTheDocument();
  });

  it("should render the view-matches button", () => {
    const { container } = render(
      <WrapWithProvider state={makeState()}>
        <SportsWidget {...defaultProps} />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(
        "[data-l10n-id='newtab-sports-widget-view-matches']"
      )
    ).toBeInTheDocument();
  });

  it("should apply size=small to buttons on medium size", () => {
    const { container } = render(
      <WrapWithProvider state={makeState()}>
        <SportsWidget {...defaultProps} />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(".sports-view-matches").getAttribute("size")
    ).toBe("small");
    expect(
      container.querySelector(".sports-follow-teams-btn").getAttribute("size")
    ).toBe("small");
  });

  it("should not apply size=small to buttons on large size", () => {
    const { container } = render(
      <WrapWithProvider
        state={makeState({ [PREF_SPORTS_WIDGET_SIZE]: "large" })}
      >
        <SportsWidget {...defaultProps} />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(".sports-view-matches").getAttribute("size")
    ).toBeNull();
    expect(
      container.querySelector(".sports-follow-teams-btn").getAttribute("size")
    ).toBeNull();
  });

  it("opens on match schedule when the tournament has started", () => {
    const { container } = render(
      <WrapWithProvider
        state={makeState(
          {},
          {
            data: {
              teams: [],
              matches: emptyMatches,
              live: [mockMatch],
            },
          }
        )}
      >
        <SportsWidget {...defaultProps} />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(".sports.sports-matches")
    ).toBeInTheDocument();
    expect(
      container.querySelector(".sports-intro-wrapper")
    ).not.toBeInTheDocument();
  });

  it("stays on intro when only upcoming matches are present (no live, no previous)", () => {
    // The backend surfaces upcoming matches within a +/-21 day window around
    // kickoff, so they appear pre-kickoff. Upcoming matches alone must not
    // flip the widget out of the intro view.
    const { container } = render(
      <WrapWithProvider
        state={makeState(
          {},
          {
            data: {
              teams: [],
              matches: { previous: [], current: [], next: [mockMatch] },
              live: [],
            },
          }
        )}
      >
        <SportsWidget {...defaultProps} />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(".sports.sports-matches")
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".sports-intro-wrapper")
    ).toBeInTheDocument();
  });
});

describe("pre-kickoff /live data guard", () => {
  // One second before WORLD_CUP_KICKOFF_MS (2026-06-11T19:00:00Z).
  const PRE_KICKOFF_MS = Date.UTC(2026, 5, 11, 18, 59, 59);

  beforeEach(() => {
    dateNowSpy.mockReturnValue(PRE_KICKOFF_MS);
  });

  afterEach(() => {
    dateNowSpy.mockReturnValue(POST_KICKOFF_MS);
  });

  it("ignores non-empty /live data and stays on the intro view", () => {
    const { container } = render(
      <WrapWithProvider
        state={makeState(
          {},
          {
            data: {
              teams: [],
              matches: emptyMatches,
              live: [mockMatch],
            },
          }
        )}
      >
        <SportsWidget {...defaultProps} />
      </WrapWithProvider>
    );
    // Guard fires: hasLiveGames is false despite non-empty data.live,
    // so tournamentStarted stays false and the widget stays on intro.
    expect(
      container.querySelector(".sports.sports-matches")
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".sports-intro-wrapper")
    ).toBeInTheDocument();
  });
});

describe("<SportsWidget> follow teams flow", () => {
  let dispatch;
  let handleUserInteraction;

  beforeEach(() => {
    dispatch = jest.fn();
    handleUserInteraction = jest.fn();
    mockDocumentL10n();
  });

  afterEach(() => {
    delete document.l10n;
  });

  async function renderInFollowState(selectedTeams = [], dataOverride) {
    const result = render(
      <WrapWithProvider
        state={makeState(
          {},
          {
            widgetState: "sports-follow-state",
            selectedTeams,
            data: dataOverride ?? { teams: makeTeams(), matches: [] },
          }
        )}
      >
        <SportsWidget
          dispatch={dispatch}
          handleUserInteraction={handleUserInteraction}
        />
      </WrapWithProvider>
    );
    // Flush the resolveNames effect so localizedNames is populated and
    // rows are rendered before the test queries the DOM.
    await act(async () => {});
    return result;
  }

  it("renders the follow teams title and hides the intro wrapper when in the follow state", async () => {
    const { container } = await renderInFollowState();
    expect(
      container.querySelector(".sports-follow-teams-title")
    ).toBeInTheDocument();
    expect(
      container.querySelector(".sports-intro-wrapper")
    ).not.toBeInTheDocument();
  });

  it("dispatches CHANGE_WIDGET_STATE with the follow state when Follow Teams is clicked", () => {
    const { container } = render(
      <WrapWithProvider state={makeState()}>
        <SportsWidget
          dispatch={dispatch}
          handleUserInteraction={handleUserInteraction}
        />
      </WrapWithProvider>
    );
    fireEvent.click(container.querySelector(".sports-follow-teams-btn"));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_SPORTS_CHANGE_WIDGET_STATE,
        data: "sports-follow-state",
      })
    );
  });

  it("hides the context menu and shows a cancel button in the follow state", async () => {
    const { container } = await renderInFollowState();
    expect(
      container.querySelector(".sports-context-menu-wrapper")
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".sports-cancel-button")
    ).toBeInTheDocument();
  });

  it("dispatches CHANGE_WIDGET_STATE back to intro when Cancel is clicked without saving teams", async () => {
    const { container } = await renderInFollowState();
    fireEvent.change(container.querySelector("moz-checkbox"), {
      target: { checked: true },
    });
    fireEvent.click(container.querySelector(".sports-cancel-button"));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_SPORTS_CHANGE_WIDGET_STATE,
        data: "sports-intro",
      })
    );
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: at.WIDGETS_SPORTS_CHANGE_SELECTED_TEAMS })
    );
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_USER_EVENT,
        data: expect.objectContaining({ user_action: "save_teams" }),
      })
    );
  });

  it("dispatches CHANGE_SELECTED_TEAMS and navigates to intro when Done is clicked", async () => {
    const { container } = await renderInFollowState([]);
    fireEvent.change(container.querySelector("moz-checkbox"), {
      target: { checked: true },
    });
    fireEvent.click(container.querySelector(".sports-done-button"));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_SPORTS_CHANGE_SELECTED_TEAMS,
        data: ["ALG"],
      })
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_SPORTS_CHANGE_WIDGET_STATE,
        data: "sports-intro",
      })
    );
  });

  it("does not dispatch CHANGE_SELECTED_TEAMS when a country is checked without clicking Done", async () => {
    const { container } = await renderInFollowState([]);
    fireEvent.change(container.querySelector("moz-checkbox"), {
      target: { checked: true },
    });
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: at.WIDGETS_SPORTS_CHANGE_SELECTED_TEAMS })
    );
  });

  it("saves the team removed from pre-selected teams when Done is clicked", async () => {
    const { container } = await renderInFollowState(["ALG"]);
    fireEvent.change(container.querySelector("moz-checkbox"), {
      target: { checked: false },
    });
    fireEvent.click(container.querySelector(".sports-done-button"));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_SPORTS_CHANGE_SELECTED_TEAMS,
        data: [],
      })
    );
  });

  it("marks pre-selected teams as checked", async () => {
    const { container } = await renderInFollowState(["ALG"]);
    const checkboxes = container.querySelectorAll("moz-checkbox");
    expect(checkboxes[0].getAttribute("checked")).not.toBeNull();
    expect(checkboxes[1].getAttribute("checked")).toBeNull();
  });

  it("disables unselected checkboxes when 3 teams are already selected", async () => {
    const { container } = await renderInFollowState(["CAN", "AUS", "ALG"]);
    const checkboxes = container.querySelectorAll("moz-checkbox");
    const disabled = Array.from(checkboxes).filter(
      c => c.getAttribute("disabled") !== null
    );
    // 4 teams in fixture, 3 selected -> remaining 1 should be disabled
    expect(disabled.length).toBe(1);
  });

  it("expands to large-widget when in follow state even if size pref is medium", async () => {
    const { container } = render(
      <WrapWithProvider
        state={makeState(
          { [PREF_SPORTS_WIDGET_SIZE]: "medium" },
          {
            widgetState: "sports-follow-state",
            data: { teams: mockTeams, matches: emptyMatches },
          }
        )}
      >
        <SportsWidget
          dispatch={dispatch}
          handleUserInteraction={handleUserInteraction}
        />
      </WrapWithProvider>
    );
    await act(async () => {});
    expect(container.querySelector(".sports.large-widget")).toBeInTheDocument();
    expect(
      container.querySelector(".sports.medium-widget")
    ).not.toBeInTheDocument();
  });

  it("filters the team list when a search query is entered", async () => {
    const { container } = await renderInFollowState();
    const searchInput = container.querySelector("moz-input-search");
    Object.defineProperty(searchInput, "value", {
      value: "can",
      configurable: true,
    });
    fireEvent.input(searchInput);
    const rows = container.querySelectorAll(".sports-follow-teams-row");
    expect(rows.length).toBe(1);
    expect(rows[0].querySelector(".sports-team-name").textContent).toBe(
      "Canada"
    );
  });

  it("shows all teams when the search query is cleared", async () => {
    const { container } = await renderInFollowState();
    const searchInput = container.querySelector("moz-input-search");
    Object.defineProperty(searchInput, "value", {
      value: "can",
      configurable: true,
    });
    fireEvent.input(searchInput);
    Object.defineProperty(searchInput, "value", {
      value: "",
      configurable: true,
    });
    fireEvent.input(searchInput);
    expect(container.querySelectorAll("moz-checkbox").length).toBe(4);
  });

  it("renders teams sorted alphabetically by name", async () => {
    const { container } = await renderInFollowState();
    const names = Array.from(
      container.querySelectorAll(".sports-team-name")
    ).map(el => el.textContent);
    expect(names).toEqual(["Algeria", "Australia", "Canada", "England"]);
  });

  it("shows eliminated teams as disabled rows with the eliminated l10n id", async () => {
    const teamsWithEliminated = makeTeams().map(team =>
      team.key === "AUS" || team.key === "ENG"
        ? { ...team, eliminated: true }
        : team
    );
    const { container } = await renderInFollowState([], {
      teams: teamsWithEliminated,
      matches: [],
    });
    const rows = Array.from(
      container.querySelectorAll(".sports-follow-teams-row")
    );
    const resolvedNames = rows.map(r => {
      const nameSpan = r.querySelector(".sports-team-name");
      const args = nameSpan.getAttribute("data-l10n-args");
      return args ? JSON.parse(args).teamName : nameSpan.textContent;
    });
    expect(resolvedNames).toEqual([
      "Algeria",
      "Australia",
      "Canada",
      "England",
    ]);
    const eliminatedRows = rows.filter(
      r =>
        r.querySelector(".sports-team-name").getAttribute("data-l10n-id") ===
        "newtab-sports-widget-team-name-eliminated"
    );
    expect(eliminatedRows.length).toBe(2);
    eliminatedRows.forEach(row => {
      expect(row.classList.contains("is-disabled")).toBe(true);
      expect(
        row.querySelector("moz-checkbox").getAttribute("disabled")
      ).not.toBeNull();
      const nameSpan = row.querySelector(".sports-team-name");
      expect(JSON.parse(nameSpan.getAttribute("data-l10n-args"))).toEqual({
        teamName: expect.any(String),
      });
    });
  });

  it("excludes eliminated teams from the saved selection when Done is clicked", async () => {
    // User previously followed CAN, AUS, ENG. AUS gets eliminated after the
    // fact — the saved selection should drop AUS so the user isn't stuck
    // following a team they can no longer toggle off.
    const teamsWithEliminated = makeTeams().map(team =>
      team.key === "AUS" ? { ...team, eliminated: true } : team
    );
    const { container } = await renderInFollowState(["CAN", "AUS", "ENG"], {
      teams: teamsWithEliminated,
      matches: [],
    });
    fireEvent.click(container.querySelector(".sports-done-button"));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_SPORTS_CHANGE_SELECTED_TEAMS,
        data: ["CAN", "ENG"],
      })
    );
  });

  it("does not count eliminated teams toward the 3-team selection cap", async () => {
    // User has 3 selected (ALG, AUS, CAN) but AUS is eliminated. Only 2 count
    // toward the cap, so ENG (the unselected, non-eliminated team) stays
    // enabled.
    const teamsWithEliminated = makeTeams().map(team =>
      team.key === "AUS" ? { ...team, eliminated: true } : team
    );
    const { container } = await renderInFollowState(["ALG", "AUS", "CAN"], {
      teams: teamsWithEliminated,
      matches: [],
    });
    const rows = Array.from(
      container.querySelectorAll(".sports-follow-teams-row")
    );
    const engRow = rows.find(
      r => r.querySelector(".sports-team-name").textContent === "England"
    );
    expect(engRow.classList.contains("is-disabled")).toBe(false);
  });

  it("sorts follow-teams rows by the resolved localized name, not the Merino source name", async () => {
    document.l10n.formatMessages = jest.fn(async ids =>
      ids.map(({ id }) => ({
        value: null,
        attributes: [
          {
            name: "label",
            value:
              id === "newtab-sports-widget-team-name-label-eng"
                ? "a-England"
                : "unused-fallback",
          },
        ],
      }))
    );
    const { container } = await renderInFollowState();
    const names = Array.from(
      container.querySelectorAll(".sports-team-name")
    ).map(el => el.textContent);
    expect(names).toEqual(["a-England", "Algeria", "Australia", "Canada"]);
  });

  it("renders a flag image for each team with src, empty alt, and a title tooltip", async () => {
    const { container } = await renderInFollowState();
    const flags = container.querySelectorAll(".sports-team-flag");
    expect(flags.length).toBe(4);
    expect(flags[0].getAttribute("src")).toBe("https://example.test/ALG.svg");
    expect(flags[0].getAttribute("alt")).toBe("");
    expect(flags[0].getAttribute("title")).toBe("Algeria");
  });

  it("sets aria-label on each checkbox to its team name", async () => {
    const { container } = await renderInFollowState();
    const checkboxes = container.querySelectorAll("moz-checkbox");
    expect(checkboxes[0].getAttribute("aria-label")).toBe("Algeria");
    expect(checkboxes[1].getAttribute("aria-label")).toBe("Australia");
    expect(checkboxes[2].getAttribute("aria-label")).toBe("Canada");
    expect(checkboxes[3].getAttribute("aria-label")).toBe("England");
  });

  it("toggles the checkbox when the flag image is clicked", async () => {
    const { container } = await renderInFollowState();
    fireEvent.click(container.querySelectorAll(".sports-team-flag")[0]);
    fireEvent.click(container.querySelector(".sports-done-button"));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_SPORTS_CHANGE_SELECTED_TEAMS,
        data: ["ALG"],
      })
    );
  });

  it("toggles the checkbox when the team name is clicked", async () => {
    const { container } = await renderInFollowState();
    fireEvent.click(container.querySelectorAll(".sports-team-name")[1]);
    fireEvent.click(container.querySelector(".sports-done-button"));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_SPORTS_CHANGE_SELECTED_TEAMS,
        data: ["AUS"],
      })
    );
  });

  it("does not toggle when clicking the flag on a row that is disabled by max-selection", async () => {
    // 3 teams selected (ALG, AUS, CAN), the 4th (ENG) row is disabled.
    const { container } = await renderInFollowState(["ALG", "AUS", "CAN"]);
    fireEvent.click(container.querySelectorAll(".sports-team-flag")[3]);
    fireEvent.click(container.querySelector(".sports-done-button"));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_SPORTS_CHANGE_SELECTED_TEAMS,
        data: ["ALG", "AUS", "CAN"],
      })
    );
  });

  it("does not toggle twice when the user clicks the checkbox itself", async () => {
    // Mimic a real checkbox click: both a change event AND a click event on the row fire.
    const { container } = await renderInFollowState();
    const checkbox = container.querySelector("moz-checkbox");
    fireEvent.change(checkbox, { target: { checked: true } });
    fireEvent.click(checkbox);
    fireEvent.click(container.querySelector(".sports-done-button"));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_SPORTS_CHANGE_SELECTED_TEAMS,
        data: ["ALG"],
      })
    );
  });

  it("sorts accented team names using locale-aware comparison", async () => {
    // Mock "Côte d'Ivoire" for CIV to verify the sort comparator is
    // locale-aware for accented characters.
    document.l10n.formatMessages = jest.fn(async ids =>
      ids.map(() => ({
        value: null,
        attributes: [{ name: "label", value: "Côte d'Ivoire" }],
      }))
    );
    const { container } = render(
      <WrapWithProvider
        state={makeState(
          {},
          {
            widgetState: "sports-follow-state",
            data: {
              teams: [
                { key: "CUW", name: "Curaçao" },
                { key: "CIV", name: "Côte d'Ivoire" },
                { key: "CAN", name: "Canada" },
              ],
              matches: [],
            },
          }
        )}
      >
        <SportsWidget {...defaultProps} />
      </WrapWithProvider>
    );
    await act(async () => {});
    const names = Array.from(
      container.querySelectorAll(".sports-team-name")
    ).map(el => el.textContent);
    expect(names).toEqual(["Canada", "Côte d'Ivoire", "Curaçao"]);
  });

  it("renders a row without crashing when icon_url is missing", async () => {
    const { container } = render(
      <WrapWithProvider
        state={makeState(
          {},
          {
            widgetState: "sports-follow-state",
            data: {
              teams: [{ key: "CAN", name: "Canada" }],
              matches: [],
            },
          }
        )}
      >
        <SportsWidget {...defaultProps} />
      </WrapWithProvider>
    );
    await act(async () => {});
    expect(container.querySelector(".sports-team-name").textContent).toBe(
      "Canada"
    );
    expect(container.querySelectorAll(".sports-team-flag").length).toBe(1);
  });

  it("renders no rows and does not crash when teams data is missing", async () => {
    const { container } = await renderInFollowState([], {
      teams: null,
      matches: [],
    });
    expect(container.querySelectorAll("moz-checkbox").length).toBe(0);
    expect(container.querySelector(".sports-follow-teams")).toBeInTheDocument();
  });

  it("renders no rows when teams is an empty array", async () => {
    const { container } = await renderInFollowState([], {
      teams: [],
      matches: [],
    });
    expect(container.querySelectorAll("moz-checkbox").length).toBe(0);
  });

  it("dispatches save_teams telemetry with the team count and widget size when Done is clicked", async () => {
    const { container } = await renderInFollowState([]);
    fireEvent.change(container.querySelector("moz-checkbox"), {
      target: { checked: true },
    });
    fireEvent.click(container.querySelector(".sports-done-button"));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_USER_EVENT,
        data: expect.objectContaining({
          widget_name: "sports",
          widget_source: "widget",
          user_action: "save_teams",
          action_value: 1,
          widget_size: "medium",
        }),
      })
    );
  });

  it("does not dispatch save_teams when the user checks then unchecks a team before Done", async () => {
    const { container } = await renderInFollowState([]);
    const firstCheckbox = container.querySelector("moz-checkbox");
    fireEvent.change(firstCheckbox, { target: { checked: true } });
    fireEvent.change(firstCheckbox, { target: { checked: false } });
    fireEvent.click(container.querySelector(".sports-done-button"));
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_USER_EVENT,
        data: expect.objectContaining({ user_action: "save_teams" }),
      })
    );
  });

  it("does not dispatch save_teams telemetry when Done is clicked with no teams selected", async () => {
    const { container } = await renderInFollowState([]);
    fireEvent.click(container.querySelector(".sports-done-button"));
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_USER_EVENT,
        data: expect.objectContaining({ user_action: "save_teams" }),
      })
    );
  });

  it("filters follow-teams rows by the resolved localized name via the search input", async () => {
    // Override ENG so the localized name differs from the Merino source.
    // Substring "ingl" matches the localized form but not "England".
    document.l10n.formatMessages = jest.fn(async ids =>
      ids.map(({ id }) => ({
        value: null,
        attributes: [
          {
            name: "label",
            value:
              id === "newtab-sports-widget-team-name-label-eng"
                ? "Inglaterra"
                : "unused-fallback",
          },
        ],
      }))
    );
    const { container } = await renderInFollowState();
    const search = container.querySelector("moz-input-search");

    Object.defineProperty(search, "value", {
      value: "ingl",
      configurable: true,
    });
    fireEvent.input(search);
    let names = Array.from(container.querySelectorAll(".sports-team-name")).map(
      el => el.textContent
    );
    expect(names).toEqual(["Inglaterra"]);

    Object.defineProperty(search, "value", {
      value: "england",
      configurable: true,
    });
    fireEvent.input(search);
    names = Array.from(container.querySelectorAll(".sports-team-name")).map(
      el => el.textContent
    );
    expect(names).toEqual([]);
  });

  it("does not render rows until localizedNames is populated", async () => {
    let resolveFn;
    document.l10n = {
      formatMessages: jest.fn(
        () =>
          new Promise(r => {
            resolveFn = r;
          })
      ),
    };
    const { container } = render(
      <WrapWithProvider
        state={makeState(
          {},
          {
            widgetState: "sports-follow-state",
            data: { teams: makeTeams(), matches: [] },
          }
        )}
      >
        <SportsWidget {...defaultProps} />
      </WrapWithProvider>
    );

    expect(container.querySelectorAll(".sports-follow-teams-row")).toHaveLength(
      0
    );

    await act(async () => {
      resolveFn([
        { value: null, attributes: [{ name: "label", value: "England" }] },
      ]);
    });
    expect(
      container.querySelectorAll(".sports-follow-teams-row").length
    ).toBeGreaterThan(0);
  });
});

describe("<SportsWidget> matches view", () => {
  let dispatch;
  let handleUserInteraction;

  beforeEach(() => {
    dispatch = jest.fn();
    handleUserInteraction = jest.fn();
  });

  function renderInMatchesState(overrides = {}) {
    return render(
      <WrapWithProvider
        state={makeState(
          {},
          {
            widgetState: "sports-matches",
            data: { teams: [], matches: emptyMatches },
            ...overrides,
          }
        )}
      >
        <SportsWidget
          dispatch={dispatch}
          handleUserInteraction={handleUserInteraction}
        />
      </WrapWithProvider>
    );
  }

  it("applies sports-matches class, shows tab list, and hides the intro wrapper", () => {
    const { container } = renderInMatchesState();
    expect(
      container.querySelector(".sports.sports-matches")
    ).toBeInTheDocument();
    expect(container.querySelector(".sports-matches-tabs")).toBeInTheDocument();
    expect(
      container.querySelector(".sports-intro-wrapper")
    ).not.toBeInTheDocument();
  });

  it("shows the back button and dispatches CHANGE_WIDGET_STATE to intro when clicked", () => {
    const { container } = renderInMatchesState();
    const backButton = container.querySelector(".sports-back-button");
    expect(backButton.style.visibility).not.toBe("hidden");
    fireEvent.click(backButton);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_SPORTS_CHANGE_WIDGET_STATE,
        data: "sports-intro",
      })
    );
  });

  it("hides the back button once the tournament has started", () => {
    const { container } = renderInMatchesState({
      data: {
        teams: [],
        matches: emptyMatches,
        live: [mockMatch],
      },
    });
    expect(
      container.querySelector(".sports-back-button").style.visibility
    ).toBe("hidden");
  });

  it("shows the Now tab only when there are live games", () => {
    const { container: noLive } = renderInMatchesState();
    expect(
      noLive.querySelector("[data-l10n-id='newtab-sports-widget-now']")
    ).not.toBeInTheDocument();

    const { container: withLive } = renderInMatchesState({
      data: {
        teams: [],
        matches: emptyMatches,
        live: [mockMatch],
      },
    });
    expect(
      withLive.querySelector("[data-l10n-id='newtab-sports-widget-now']")
    ).toBeInTheDocument();
  });

  it("ignores matches.current when deciding whether to show the Now tab", () => {
    // Now-tab visibility must be driven by /live, not by /matches.current.
    // The /matches `current[]` bucket is calendar-date-bucketed by the
    // backend and includes live + final games for the requested day, so
    // it's not a valid signal for "currently in progress".
    const { container } = renderInMatchesState({
      data: {
        teams: [],
        matches: { current: [mockMatch], previous: [], next: [] },
        live: [],
      },
    });
    expect(
      container.querySelector("[data-l10n-id='newtab-sports-widget-now']")
    ).not.toBeInTheDocument();
  });

  it("renders the Now highlight from data.live, not from matches.current", () => {
    // Verifies the Now tab reads from data.live by giving each source a
    // distinguishable team key and asserting the live team renders.
    const liveOnly = {
      ...mockMatch,
      home_team: { ...mockMatch.home_team, key: "GER", name: "Germany" },
      away_team: { ...mockMatch.away_team, key: "FRA", name: "France" },
    };
    const matchesCurrentOnly = {
      ...mockMatch,
      home_team: { ...mockMatch.home_team, key: "BRA", name: "Brazil" },
      away_team: { ...mockMatch.away_team, key: "ARG", name: "Argentina" },
    };
    const { container } = renderInMatchesState({
      matchesTab: "now",
      data: {
        teams: [],
        matches: { current: [matchesCurrentOnly], previous: [], next: [] },
        live: [liveOnly],
      },
    });
    const panel = getVisibleTabPanel(container);
    const flags = panel.querySelectorAll(".sports-match-flag");
    const titles = [...flags].map(f => f.getAttribute("title"));
    expect(titles).toEqual(expect.arrayContaining(["Germany", "France"]));
    expect(titles).not.toEqual(expect.arrayContaining(["Brazil"]));
  });

  it("marks the active tab based on matchesTab state", () => {
    const { container } = renderInMatchesState({ matchesTab: "results" });
    const activeTab = container.querySelector(".sports-matches-tab.is-active");
    expect(activeTab.getAttribute("data-l10n-id")).toBe(
      "newtab-sports-widget-results"
    );
  });

  it("defaults to Now on load when there are live games", () => {
    const { container } = renderInMatchesState({
      matchesTab: "upcoming",
      data: {
        teams: [],
        matches: emptyMatches,
        live: [mockMatch],
      },
    });
    expect(
      container
        .querySelector(".sports-matches-tab.is-active")
        .getAttribute("data-l10n-id")
    ).toBe("newtab-sports-widget-now");
  });

  it("disables the results tab and prevents dispatch when there are no previous results", () => {
    const { container } = renderInMatchesState();
    const resultsTab = container.querySelector(
      "[data-l10n-id='newtab-sports-widget-results']"
    );
    expect(resultsTab.disabled).toBe(true);
    fireEvent.click(resultsTab);
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: at.WIDGETS_SPORTS_CHANGE_MATCHES_TAB })
    );
  });

  it("enables the results tab when there are previous results", () => {
    const { container } = renderInMatchesState({
      data: {
        teams: [],
        matches: { current: [], previous: [mockMatch], next: [] },
      },
    });
    expect(
      container.querySelector("[data-l10n-id='newtab-sports-widget-results']")
        .disabled
    ).toBe(false);
  });

  it("dispatches CHANGE_MATCHES_TAB when a tab is clicked", () => {
    const { container } = renderInMatchesState({ matchesTab: "results" });
    fireEvent.click(
      container.querySelector("[data-l10n-id='newtab-sports-widget-upcoming']")
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_SPORTS_CHANGE_MATCHES_TAB,
        data: "upcoming",
      })
    );
  });

  it("dispatches change_tab telemetry when the upcoming tab is clicked", () => {
    const { container } = renderInMatchesState({ matchesTab: "results" });
    fireEvent.click(
      container.querySelector("[data-l10n-id='newtab-sports-widget-upcoming']")
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_USER_EVENT,
        data: expect.objectContaining({
          widget_name: "sports",
          widget_source: "widget",
          user_action: "change_tab",
          action_value: "upcoming",
          widget_size: "medium",
        }),
      })
    );
  });

  it("dispatches change_tab telemetry when the results tab is clicked", () => {
    const { container } = renderInMatchesState({
      matchesTab: "upcoming",
      data: {
        teams: [],
        matches: { current: [], previous: [mockMatch], next: [] },
      },
    });
    fireEvent.click(
      container.querySelector("[data-l10n-id='newtab-sports-widget-results']")
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_USER_EVENT,
        data: expect.objectContaining({
          widget_name: "sports",
          widget_source: "widget",
          user_action: "change_tab",
          action_value: "results",
          widget_size: "medium",
        }),
      })
    );
  });

  it("does not dispatch change_tab telemetry when clicking the already-active tab", () => {
    const { container } = renderInMatchesState({
      matchesTab: "upcoming",
      data: {
        teams: [],
        matches: { current: [], previous: [mockMatch], next: [] },
      },
    });
    fireEvent.click(
      container.querySelector("[data-l10n-id='newtab-sports-widget-upcoming']")
    );
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_USER_EVENT,
        data: expect.objectContaining({ user_action: "change_tab" }),
      })
    );
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_SPORTS_CHANGE_MATCHES_TAB,
      })
    );
  });

  it("does not dispatch change_tab telemetry when clicking the auto-selected Now tab", () => {
    // When live games are present and the user hasn't picked a tab yet, the
    // widget auto-activates the Now tab regardless of the persisted matchesTab.
    // Clicking Now in this state should also be a no-op for telemetry.
    const { container } = renderInMatchesState({
      matchesTab: "upcoming",
      data: {
        teams: [],
        matches: emptyMatches,
        live: [mockMatch],
      },
    });
    fireEvent.click(
      container.querySelector("[data-l10n-id='newtab-sports-widget-now']")
    );
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_USER_EVENT,
        data: expect.objectContaining({ user_action: "change_tab" }),
      })
    );
  });

  it("dispatches CHANGE_WIDGET_STATE to matches when the View matches button is clicked", () => {
    const { container } = render(
      <WrapWithProvider state={makeState()}>
        <SportsWidget
          dispatch={dispatch}
          handleUserInteraction={handleUserInteraction}
        />
      </WrapWithProvider>
    );
    fireEvent.click(
      container.querySelector(
        "[data-l10n-id='newtab-sports-widget-view-matches']"
      )
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_SPORTS_CHANGE_WIDGET_STATE,
        data: "sports-matches",
      })
    );
  });
});

describe("<SportsWidget> keyboard accessibility", () => {
  // Without focus management, the "View all" button sits at the bottom of
  // the widget — pressing it leaves keyboard focus at the bottom edge, so a
  // Tab keypress moves focus *out* of the widget instead of into the newly-
  // revealed list. The widget moves focus to the first match row in the new
  // list to avoid this trap.
  function renderWithResults() {
    return render(
      <WrapWithProvider
        state={makeState(
          { [PREF_SPORTS_WIDGET_SIZE]: "large" },
          {
            widgetState: "sports-matches",
            matchesTab: "results",
            data: {
              teams: [],
              matches: {
                previous: [
                  mockMatch,
                  {
                    ...mockMatch,
                    date: "2026-05-09T14:00:00+00:00",
                    home_score: 2,
                  },
                ],
                current: [],
                next: [],
              },
            },
          }
        )}
      >
        <SportsWidget dispatch={jest.fn()} handleUserInteraction={jest.fn()} />
      </WrapWithProvider>
    );
  }

  function renderWithUpcoming() {
    return render(
      <WrapWithProvider
        state={makeState(
          { [PREF_SPORTS_WIDGET_SIZE]: "large" },
          {
            widgetState: "sports-matches",
            matchesTab: "upcoming",
            data: {
              teams: [],
              matches: {
                // A `previous` entry is needed to keep tournamentStarted
                // truthy so the widget stays in the matches view.
                previous: [mockMatch],
                current: [],
                next: [
                  { ...mockMatch, status_type: "scheduled" },
                  {
                    ...mockMatch,
                    date: "2026-05-10T14:00:00+00:00",
                    status_type: "scheduled",
                    home_score: null,
                  },
                ],
              },
            },
          }
        )}
      >
        <SportsWidget dispatch={jest.fn()} handleUserInteraction={jest.fn()} />
      </WrapWithProvider>
    );
  }

  it("moves keyboard focus to the first match row when expanding the Results list", () => {
    const { container } = renderWithResults();
    const resultsPanel = [
      ...container.querySelectorAll(".sports-matches-tab-panel"),
    ].find(p => !p.hasAttribute("hidden"));
    expect(resultsPanel).toBeTruthy();
    // Sanity: before expanding, only the highlight row is rendered.
    expect(resultsPanel.querySelectorAll(".sports-match-row")).toHaveLength(1);

    fireEvent.click(
      resultsPanel.querySelector(
        "[data-l10n-id='newtab-sports-widget-view-all']"
      )
    );

    const rows = resultsPanel.querySelectorAll(".sports-match-row");
    expect(rows).toHaveLength(2);
    expect(document.activeElement).toBe(rows[0]);
  });

  it("moves keyboard focus to the first match row when expanding the Upcoming list", () => {
    const { container } = renderWithUpcoming();
    const upcomingPanel = [
      ...container.querySelectorAll(".sports-matches-tab-panel"),
    ].find(p => !p.hasAttribute("hidden"));
    expect(upcomingPanel).toBeTruthy();

    fireEvent.click(
      upcomingPanel.querySelector(
        "[data-l10n-id='newtab-sports-widget-view-all']"
      )
    );

    const rows = upcomingPanel.querySelectorAll(".sports-match-row");
    expect(rows).toHaveLength(2);
    expect(document.activeElement).toBe(rows[0]);
  });

  it("does not steal focus on initial render when in highlight view", () => {
    // Regression guard: if the focus-on-expand effect ever drops its
    // `if (showResultsList)` guard, it would fire on mount too and yank
    // focus to a match row before any user input.
    const preMountFocus = document.activeElement;
    const { container } = renderWithResults();
    const firstRow = container.querySelector(".sports-match-row");
    expect(document.activeElement).not.toBe(firstRow);
    expect(document.activeElement).toBe(preMountFocus);
  });
});

describe("<SportsWidget> Results tab View all button", () => {
  function renderResultsAtSize(widgetSize, previous = [mockMatch]) {
    return render(
      <WrapWithProvider
        state={makeState(
          { [PREF_SPORTS_WIDGET_SIZE]: widgetSize },
          {
            widgetState: "sports-matches",
            matchesTab: "results",
            data: {
              teams: [],
              matches: { previous, current: [], next: [] },
            },
          }
        )}
      >
        <SportsWidget dispatch={jest.fn()} handleUserInteraction={jest.fn()} />
      </WrapWithProvider>
    );
  }

  function findResultsViewAllButton(container) {
    const resultsPanel = [
      ...container.querySelectorAll(".sports-matches-tab-panel"),
    ].find(panel => !panel.hasAttribute("hidden"));
    return resultsPanel?.querySelector(
      "[data-l10n-id='newtab-sports-widget-view-all']"
    );
  }

  it("renders the View all button on the results tab when widget size is large", () => {
    const { container } = renderResultsAtSize("large");
    const viewAllButton = findResultsViewAllButton(container);
    expect(viewAllButton).toBeInTheDocument();
    expect(viewAllButton.getAttribute("size")).toBeNull();
  });

  it("renders the View all button on the results tab when widget size is medium", () => {
    const { container } = renderResultsAtSize("medium");
    const viewAllButton = findResultsViewAllButton(container);
    expect(viewAllButton).toBeInTheDocument();
    expect(viewAllButton.getAttribute("size")).toBe("small");
  });

  it("does not render the View all button when there are no previous results", () => {
    const { container } = renderResultsAtSize("medium", []);
    expect(findResultsViewAllButton(container)).toBeNull();
  });
});

describe("<SportsWidget> match list view expands widget to large", () => {
  // When the user clicks "View all" on the Results or Upcoming tab, the
  // widget should switch to the large size — even if the user's chosen
  // size pref is "medium" — and revert back to medium when they collapse
  // the list. The pref itself must not change; this is a temporary visual
  // override, mirroring how the FOLLOW_TEAMS state already forces large.
  function renderResultsAtSize(widgetSize) {
    return render(
      <WrapWithProvider
        state={makeState(
          { [PREF_SPORTS_WIDGET_SIZE]: widgetSize },
          {
            widgetState: "sports-matches",
            matchesTab: "results",
            data: {
              teams: [],
              matches: {
                previous: [
                  mockMatch,
                  {
                    ...mockMatch,
                    date: "2026-05-09T14:00:00+00:00",
                    home_score: 2,
                  },
                ],
                current: [],
                next: [],
              },
            },
          }
        )}
      >
        <SportsWidget dispatch={jest.fn()} handleUserInteraction={jest.fn()} />
      </WrapWithProvider>
    );
  }

  function renderUpcomingAtSize(widgetSize) {
    return render(
      <WrapWithProvider
        state={makeState(
          { [PREF_SPORTS_WIDGET_SIZE]: widgetSize },
          {
            widgetState: "sports-matches",
            matchesTab: "upcoming",
            data: {
              teams: [],
              matches: {
                // A `previous` entry keeps tournamentStarted truthy so the
                // widget stays in the matches view.
                previous: [mockMatch],
                current: [],
                next: [
                  { ...mockMatch, status_type: "scheduled" },
                  {
                    ...mockMatch,
                    date: "2026-05-10T14:00:00+00:00",
                    status_type: "scheduled",
                    home_score: null,
                  },
                ],
              },
            },
          }
        )}
      >
        <SportsWidget dispatch={jest.fn()} handleUserInteraction={jest.fn()} />
      </WrapWithProvider>
    );
  }

  function getVisibleViewAllButton(container) {
    return getVisibleTabPanel(container)?.querySelector(
      "[data-l10n-id='newtab-sports-widget-view-all']"
    );
  }

  function getVisibleShowLessButton(container) {
    return getVisibleTabPanel(container)?.querySelector(
      "[data-l10n-id='newtab-sports-widget-show-less']"
    );
  }

  it("switches the medium widget to large when View all is clicked on Results", () => {
    const { container } = renderResultsAtSize("medium");
    // Sanity check: starts as medium.
    expect(
      container.querySelector(".sports.medium-widget")
    ).toBeInTheDocument();
    expect(
      container.querySelector(".sports.large-widget")
    ).not.toBeInTheDocument();

    fireEvent.click(getVisibleViewAllButton(container));

    expect(container.querySelector(".sports.large-widget")).toBeInTheDocument();
    expect(
      container.querySelector(".sports.medium-widget")
    ).not.toBeInTheDocument();
  });

  it("reverts back to medium when Show less is clicked on Results", () => {
    const { container } = renderResultsAtSize("medium");
    fireEvent.click(getVisibleViewAllButton(container));
    // Sanity check: now large after expanding.
    expect(container.querySelector(".sports.large-widget")).toBeInTheDocument();

    fireEvent.click(getVisibleShowLessButton(container));

    expect(
      container.querySelector(".sports.medium-widget")
    ).toBeInTheDocument();
    expect(
      container.querySelector(".sports.large-widget")
    ).not.toBeInTheDocument();
  });

  it("switches the medium widget to large when View all is clicked on Upcoming", () => {
    const { container } = renderUpcomingAtSize("medium");
    expect(
      container.querySelector(".sports.medium-widget")
    ).toBeInTheDocument();

    fireEvent.click(getVisibleViewAllButton(container));

    expect(container.querySelector(".sports.large-widget")).toBeInTheDocument();
    expect(
      container.querySelector(".sports.medium-widget")
    ).not.toBeInTheDocument();
  });

  it("reverts back to medium when Show less is clicked on Upcoming", () => {
    const { container } = renderUpcomingAtSize("medium");
    fireEvent.click(getVisibleViewAllButton(container));
    expect(container.querySelector(".sports.large-widget")).toBeInTheDocument();

    fireEvent.click(getVisibleShowLessButton(container));

    expect(
      container.querySelector(".sports.medium-widget")
    ).toBeInTheDocument();
    expect(
      container.querySelector(".sports.large-widget")
    ).not.toBeInTheDocument();
  });

  it("stays large when View all is clicked on Results and the widget is already large", () => {
    const { container } = renderResultsAtSize("large");
    expect(container.querySelector(".sports.large-widget")).toBeInTheDocument();

    fireEvent.click(getVisibleViewAllButton(container));

    expect(container.querySelector(".sports.large-widget")).toBeInTheDocument();
    expect(
      container.querySelector(".sports.medium-widget")
    ).not.toBeInTheDocument();
  });

  it("does not dispatch SET_PREF when expanding the list view", () => {
    // The widget size pref must be left untouched — the large size while
    // the list is open is a temporary visual override only.
    const dispatch = jest.fn();
    const { container } = render(
      <WrapWithProvider
        state={makeState(
          { [PREF_SPORTS_WIDGET_SIZE]: "medium" },
          {
            widgetState: "sports-matches",
            matchesTab: "results",
            data: {
              teams: [],
              matches: {
                previous: [mockMatch],
                current: [],
                next: [],
              },
            },
          }
        )}
      >
        <SportsWidget dispatch={dispatch} handleUserInteraction={jest.fn()} />
      </WrapWithProvider>
    );

    fireEvent.click(getVisibleViewAllButton(container));

    const setPrefCalls = dispatch.mock.calls.filter(
      ([action]) =>
        action?.type === at.SET_PREF &&
        action?.data?.name === PREF_SPORTS_WIDGET_SIZE
    );
    expect(setPrefCalls).toHaveLength(0);
  });

  it("keeps medium when Results list is expanded but the Upcoming tab is active", () => {
    // showResultsList persists across tab changes, but the widget should
    // only render large while the *active* tab's list is the one expanded.
    // The CHANGE_MATCHES_TAB action goes through the main process in real
    // code, so to simulate the post-round-trip state here we rerender with
    // a fresh store where matchesTab is "upcoming". React preserves the
    // SportsWidget component instance across rerenders, which means the
    // showResultsList local state remains true.
    const matchesData = {
      teams: [],
      matches: {
        previous: [mockMatch],
        current: [],
        next: [{ ...mockMatch, status_type: "scheduled" }],
      },
    };
    const { container, rerender } = render(
      <WrapWithProvider
        state={makeState(
          { [PREF_SPORTS_WIDGET_SIZE]: "medium" },
          {
            widgetState: "sports-matches",
            matchesTab: "results",
            data: matchesData,
          }
        )}
      >
        <SportsWidget dispatch={jest.fn()} handleUserInteraction={jest.fn()} />
      </WrapWithProvider>
    );

    // Expand Results -> widget becomes large.
    fireEvent.click(getVisibleViewAllButton(container));
    expect(container.querySelector(".sports.large-widget")).toBeInTheDocument();

    rerender(
      <WrapWithProvider
        state={makeState(
          { [PREF_SPORTS_WIDGET_SIZE]: "medium" },
          {
            widgetState: "sports-matches",
            matchesTab: "upcoming",
            data: matchesData,
          }
        )}
      >
        <SportsWidget dispatch={jest.fn()} handleUserInteraction={jest.fn()} />
      </WrapWithProvider>
    );

    expect(
      container.querySelector(".sports.medium-widget")
    ).toBeInTheDocument();
    expect(
      container.querySelector(".sports.large-widget")
    ).not.toBeInTheDocument();
  });
});

describe("<SportsWidget> Watch button (live tab)", () => {
  // The Watch button on the live tab swaps between an icon-only variant
  // (medium widget) and a labelled variant (large widget). The two cases
  // also use different Fluent ids because moz-button only renders icon-only
  // when no `.label` attribute is set — see _SportsWidget.scss notes and the
  // separate `newtab-sports-widget-watch-icon` message.
  function renderLive(size) {
    return render(
      <WrapWithProvider
        state={makeState(
          { [PREF_SPORTS_WIDGET_SIZE]: size },
          {
            widgetState: "sports-matches",
            matchesTab: "now",
            data: {
              teams: [],
              matches: emptyMatches,
              live: [mockMatch],
            },
          }
        )}
      >
        <SportsWidget dispatch={jest.fn()} handleUserInteraction={jest.fn()} />
      </WrapWithProvider>
    );
  }

  function findWatchButton(container) {
    return [...container.querySelectorAll("moz-button")].find(b => {
      const id = b.getAttribute("data-l10n-id");
      return (
        id === "newtab-sports-widget-watch" ||
        id === "newtab-sports-widget-watch-icon"
      );
    });
  }

  it("renders an icon-only Watch button when the widget is medium", () => {
    const { container } = renderLive("medium");
    const button = findWatchButton(container);
    expect(button).toBeTruthy();
    expect(button.getAttribute("type")).toBe("icon");
    // Uses the no-`.label` variant so moz-button doesn't add the .labelled
    // class — otherwise its CSS would render the visible "Watch" text.
    expect(button.getAttribute("data-l10n-id")).toBe(
      "newtab-sports-widget-watch-icon"
    );
    expect(button.getAttribute("iconSrc")).toBe(
      "chrome://browser/skin/device-tv.svg"
    );
  });

  it("renders a labelled Watch button when the widget is large", () => {
    const { container } = renderLive("large");
    const button = findWatchButton(container);
    expect(button).toBeTruthy();
    expect(button.getAttribute("type")).toBe("default");
    expect(button.getAttribute("data-l10n-id")).toBe(
      "newtab-sports-widget-watch"
    );
  });

  it("does not render the Watch button when there is no live match", () => {
    const { container } = render(
      <WrapWithProvider
        state={makeState(
          { [PREF_SPORTS_WIDGET_SIZE]: "medium" },
          {
            widgetState: "sports-matches",
            matchesTab: "upcoming",
            data: {
              teams: [],
              // Need a previous match so tournamentStarted stays truthy and
              // the widget renders the matches view at all, but no `current`
              // matches means the Now tab + Watch button shouldn't render.
              matches: { previous: [mockMatch], current: [], next: [] },
            },
          }
        )}
      >
        <SportsWidget dispatch={jest.fn()} handleUserInteraction={jest.fn()} />
      </WrapWithProvider>
    );
    expect(findWatchButton(container)).toBeUndefined();
  });
});

describe("<SportsWidget> followed teams matches view", () => {
  // Two distinct matches per bucket so we can verify which one bubbles to the
  // highlight position when a team is followed.
  const matchEngUsa = {
    ...mockMatch,
    home_team: { key: "ENG", name: "England" },
    away_team: { key: "USA", name: "United States" },
    date: "2026-05-08T14:00:00+00:00",
  };
  const matchCanAus = {
    ...mockMatch,
    home_team: { key: "CAN", name: "Canada" },
    away_team: { key: "AUS", name: "Australia" },
    date: "2026-05-09T14:00:00+00:00",
  };
  const matchAlgGer = {
    ...mockMatch,
    home_team: { key: "ALG", name: "Algeria" },
    away_team: { key: "GER", name: "Germany" },
    date: "2026-05-10T14:00:00+00:00",
  };
  const teamsWithColors = [
    {
      key: "CAN",
      name: "Canada",
      colors: ["#FF0000", "#FFFFFF"],
      icon_url: "https://example.test/CAN.svg",
    },
    {
      key: "ENG",
      name: "England",
      colors: ["#FFFFFF", "#CE1126"],
      icon_url: "https://example.test/ENG.svg",
    },
    {
      key: "USA",
      name: "United States",
      // single color — too few entries for a gradient
      colors: ["#3C3B6E"],
      icon_url: "https://example.test/USA.svg",
    },
    {
      key: "AUS",
      name: "Australia",
      // colors omitted — gradient lookup should fall back to null
      icon_url: "https://example.test/AUS.svg",
    },
  ];

  function renderMatchesWith({
    selectedTeams = [],
    matchesTab = "upcoming",
    previous = [],
    current = [],
    next = [],
    followedOnly,
    teams = teamsWithColors,
  } = {}) {
    return render(
      <WrapWithProvider
        state={makeState(
          { [PREF_SPORTS_WIDGET_SIZE]: "large" },
          {
            widgetState: "sports-matches",
            matchesTab,
            selectedTeams,
            followedOnly,
            data: { teams, matches: { previous, current, next } },
          }
        )}
      >
        <SportsWidget dispatch={jest.fn()} handleUserInteraction={jest.fn()} />
      </WrapWithProvider>
    );
  }

  function visiblePanel(container) {
    return [...container.querySelectorAll(".sports-matches-tab-panel")].find(
      panel => !panel.hasAttribute("hidden")
    );
  }

  function highlightMatchCodes(container) {
    // Both tab panels render their highlight view; the inactive one is just
    // `hidden`. Scope to the visible panel so we read the right one.
    const highlight = visiblePanel(container).querySelector(
      ".match-highlight-view"
    );
    return [...highlight.querySelectorAll(".sports-match-code")].map(
      el => el.textContent
    );
  }

  it("bubbles a followed team's upcoming match to the highlight position", () => {
    // Without a followed team, the original chronological order would put
    // ENG vs USA first. Following CAN should bring CAN vs AUS to the front.
    const { container } = renderMatchesWith({
      selectedTeams: ["CAN"],
      matchesTab: "upcoming",
      previous: [matchEngUsa],
      next: [matchEngUsa, matchCanAus, matchAlgGer],
    });
    expect(highlightMatchCodes(container)).toEqual(["CAN", "AUS"]);
  });

  it("preserves chronological order when none of the matches involve a followed team", () => {
    const { container } = renderMatchesWith({
      selectedTeams: ["IRQ"],
      matchesTab: "upcoming",
      previous: [matchEngUsa],
      next: [matchEngUsa, matchCanAus],
    });
    expect(highlightMatchCodes(container)).toEqual(["ENG", "USA"]);
  });

  it("does not show the followed-only toggle when no teams are followed", () => {
    const { container } = renderMatchesWith({
      selectedTeams: [],
      matchesTab: "upcoming",
      previous: [matchEngUsa],
      next: [matchEngUsa, matchCanAus],
    });
    fireEvent.click(
      visiblePanel(container).querySelector(
        "[data-l10n-id='newtab-sports-widget-view-all']"
      )
    );
    expect(
      visiblePanel(container).querySelector(".sports-followed-only-toggle")
    ).toBeNull();
  });

  it("shows the followed-only toggle in the expanded list when teams are followed", () => {
    const { container } = renderMatchesWith({
      selectedTeams: ["CAN"],
      matchesTab: "upcoming",
      previous: [matchEngUsa],
      next: [matchEngUsa, matchCanAus],
    });
    fireEvent.click(
      visiblePanel(container).querySelector(
        "[data-l10n-id='newtab-sports-widget-view-all']"
      )
    );
    const toggle = visiblePanel(container).querySelector(
      ".sports-followed-only-toggle"
    );
    expect(toggle).toBeInTheDocument();
    // Defaults to pressed (followed-only on) the first time.
    expect(toggle.getAttribute("pressed")).not.toBeNull();
  });

  it("filters the expanded Upcoming list to followed teams when the toggle is on", () => {
    const { container } = renderMatchesWith({
      selectedTeams: ["CAN"],
      matchesTab: "upcoming",
      previous: [matchEngUsa],
      next: [matchEngUsa, matchCanAus, matchAlgGer],
    });
    fireEvent.click(
      visiblePanel(container).querySelector(
        "[data-l10n-id='newtab-sports-widget-view-all']"
      )
    );
    const rows = visiblePanel(container).querySelectorAll(".sports-match-row");
    expect(rows).toHaveLength(1);
    const codes = [...rows[0].querySelectorAll(".sports-match-code")].map(
      el => el.textContent
    );
    expect(codes).toEqual(["CAN", "AUS"]);
  });

  it("shows every upcoming match when the persisted followedOnly toggle is off", () => {
    const { container } = renderMatchesWith({
      selectedTeams: ["CAN"],
      matchesTab: "upcoming",
      previous: [matchEngUsa],
      next: [matchEngUsa, matchCanAus, matchAlgGer],
      followedOnly: { results: true, upcoming: false },
    });
    fireEvent.click(
      visiblePanel(container).querySelector(
        "[data-l10n-id='newtab-sports-widget-view-all']"
      )
    );
    expect(
      visiblePanel(container).querySelectorAll(".sports-match-row")
    ).toHaveLength(3);
    const toggle = visiblePanel(container).querySelector(
      ".sports-followed-only-toggle"
    );
    expect(toggle.getAttribute("pressed")).toBeNull();
  });

  it("keeps the chronological-first match in the Upcoming highlight when the toggle is off", () => {
    // With the toggle on (default) CAN would bubble to the highlight; off, the
    // chronological-first match (ENG vs USA) should stay highlighted.
    const { container } = renderMatchesWith({
      selectedTeams: ["CAN"],
      matchesTab: "upcoming",
      next: [matchEngUsa, matchCanAus, matchAlgGer],
      followedOnly: { results: true, upcoming: false },
    });
    expect(highlightMatchCodes(container)).toEqual(["ENG", "USA"]);
  });

  it("renders the expanded Upcoming list in chronological order when the toggle is off", () => {
    const { container } = renderMatchesWith({
      selectedTeams: ["CAN"],
      matchesTab: "upcoming",
      next: [matchEngUsa, matchCanAus, matchAlgGer],
      followedOnly: { results: true, upcoming: false },
    });
    fireEvent.click(
      visiblePanel(container).querySelector(
        "[data-l10n-id='newtab-sports-widget-view-all']"
      )
    );
    const homeCodes = [
      ...visiblePanel(container).querySelectorAll(".sports-match-row"),
    ].map(row => row.querySelector(".sports-match-code").textContent);
    expect(homeCodes).toEqual(["ENG", "CAN", "ALG"]);
  });

  it("filters the expanded Results list to followed teams when the toggle is on", () => {
    const { container } = renderMatchesWith({
      selectedTeams: ["CAN"],
      matchesTab: "results",
      previous: [matchEngUsa, matchCanAus, matchAlgGer],
    });
    fireEvent.click(
      visiblePanel(container).querySelector(
        "[data-l10n-id='newtab-sports-widget-view-all']"
      )
    );
    const rows = visiblePanel(container).querySelectorAll(".sports-match-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector(".sports-match-code").textContent).toBe("CAN");
  });

  it("dispatches CHANGE_FOLLOWED_ONLY for the upcoming tab when the toggle is flipped", () => {
    const dispatch = jest.fn();
    const { container } = render(
      <WrapWithProvider
        state={makeState(
          { [PREF_SPORTS_WIDGET_SIZE]: "large" },
          {
            widgetState: "sports-matches",
            matchesTab: "upcoming",
            selectedTeams: ["CAN"],
            data: {
              teams: teamsWithColors,
              matches: {
                previous: [matchEngUsa],
                current: [],
                next: [matchEngUsa, matchCanAus],
              },
            },
          }
        )}
      >
        <SportsWidget dispatch={dispatch} handleUserInteraction={jest.fn()} />
      </WrapWithProvider>
    );
    fireEvent.click(
      visiblePanel(container).querySelector(
        "[data-l10n-id='newtab-sports-widget-view-all']"
      )
    );
    const toggle = visiblePanel(container).querySelector(
      ".sports-followed-only-toggle"
    );
    // Simulate moz-toggle flipping its `pressed` property and firing `toggle`.
    Object.defineProperty(toggle, "pressed", {
      value: false,
      configurable: true,
    });
    fireEvent(toggle, new CustomEvent("toggle", { bubbles: true }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_SPORTS_CHANGE_FOLLOWED_ONLY,
        data: { upcoming: false },
      })
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_USER_EVENT,
        data: expect.objectContaining({
          widget_name: "sports",
          widget_source: "upcoming",
          user_action: "toggle_followed_only",
          action_value: false,
          widget_size: "large",
        }),
      })
    );
  });

  it("dispatches CHANGE_FOLLOWED_ONLY for the results tab when the toggle is flipped", () => {
    const dispatch = jest.fn();
    const { container } = render(
      <WrapWithProvider
        state={makeState(
          { [PREF_SPORTS_WIDGET_SIZE]: "large" },
          {
            widgetState: "sports-matches",
            matchesTab: "results",
            selectedTeams: ["CAN"],
            followedOnly: { results: false, upcoming: true },
            data: {
              teams: teamsWithColors,
              matches: {
                previous: [matchEngUsa, matchCanAus],
                current: [],
                next: [],
              },
            },
          }
        )}
      >
        <SportsWidget dispatch={dispatch} handleUserInteraction={jest.fn()} />
      </WrapWithProvider>
    );
    fireEvent.click(
      visiblePanel(container).querySelector(
        "[data-l10n-id='newtab-sports-widget-view-all']"
      )
    );
    const toggle = visiblePanel(container).querySelector(
      ".sports-followed-only-toggle"
    );
    Object.defineProperty(toggle, "pressed", {
      value: true,
      configurable: true,
    });
    fireEvent(toggle, new CustomEvent("toggle", { bubbles: true }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_SPORTS_CHANGE_FOLLOWED_ONLY,
        data: { results: true },
      })
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_USER_EVENT,
        data: expect.objectContaining({
          widget_name: "sports",
          widget_source: "results",
          user_action: "toggle_followed_only",
          action_value: true,
          widget_size: "large",
        }),
      })
    );
  });

  it("applies the followed-team gradient to the widget when the highlight involves exactly one followed team", () => {
    const { container } = renderMatchesWith({
      selectedTeams: ["ENG"],
      matchesTab: "upcoming",
      previous: [matchEngUsa],
      next: [matchEngUsa],
    });
    const widget = container.querySelector(".sports");
    expect(widget.classList.contains("is-followed-highlight")).toBe(true);
    expect(widget.style.getPropertyValue("--sports-followed-gradient")).toBe(
      "linear-gradient(to right, #FFFFFF, #CE1126)"
    );
  });

  it("does not apply the gradient when both teams in the highlight are followed", () => {
    const { container } = renderMatchesWith({
      selectedTeams: ["ENG", "USA"],
      matchesTab: "upcoming",
      previous: [matchEngUsa],
      next: [matchEngUsa],
    });
    const widget = container.querySelector(".sports");
    expect(widget.classList.contains("is-followed-highlight")).toBe(false);
    expect(widget.style.getPropertyValue("--sports-followed-gradient")).toBe(
      ""
    );
  });

  it("does not apply the gradient when the followed team has fewer than two colors", () => {
    // USA in teamsWithColors has only one color entry.
    const { container } = renderMatchesWith({
      selectedTeams: ["USA"],
      matchesTab: "upcoming",
      previous: [matchEngUsa],
      next: [matchEngUsa],
    });
    expect(
      container
        .querySelector(".sports")
        .classList.contains("is-followed-highlight")
    ).toBe(false);
  });

  it("does not apply the gradient when the followed team has no colors entry at all", () => {
    // AUS in teamsWithColors has no `colors` property.
    const { container } = renderMatchesWith({
      selectedTeams: ["AUS"],
      matchesTab: "upcoming",
      previous: [matchEngUsa],
      next: [matchCanAus],
    });
    expect(
      container
        .querySelector(".sports")
        .classList.contains("is-followed-highlight")
    ).toBe(false);
  });

  it("does not apply the gradient once the user expands the list view", () => {
    const { container } = renderMatchesWith({
      selectedTeams: ["ENG"],
      matchesTab: "upcoming",
      previous: [matchEngUsa],
      next: [matchEngUsa],
    });
    fireEvent.click(
      visiblePanel(container).querySelector(
        "[data-l10n-id='newtab-sports-widget-view-all']"
      )
    );
    expect(
      container
        .querySelector(".sports")
        .classList.contains("is-followed-highlight")
    ).toBe(false);
  });

  it("passes followedTeams down to highlight rows so they render the followed treatment", () => {
    const { container } = renderMatchesWith({
      selectedTeams: ["ENG"],
      matchesTab: "upcoming",
      previous: [matchEngUsa],
      next: [matchEngUsa],
    });
    const highlight = visiblePanel(container).querySelector(
      ".match-highlight-view"
    );
    const followedWrapper = highlight.querySelector(
      ".sports-match-flag-wrapper.is-followed"
    );
    expect(followedWrapper).toBeTruthy();
    expect(
      highlight.querySelector(".sports-match-flag-check")
    ).toBeInTheDocument();
    expect(
      highlight.querySelector(".sports-match-code strong").textContent
    ).toBe("ENG");
  });

  describe("eliminated teams", () => {
    // Once a followed team is eliminated, the rest of the matches UI should
    // behave as if the user weren't following it: no bubble-to-front, no
    // gradient border, no per-row check/bold. If every followed team is
    // eliminated, the followed-only toggle goes away entirely.
    const teamsEngEliminated = teamsWithColors.map(team =>
      team.key === "ENG" ? { ...team, eliminated: true } : team
    );

    it("does not bubble an eliminated followed team's matches to the front", () => {
      const { container } = renderMatchesWith({
        selectedTeams: ["ENG"],
        matchesTab: "upcoming",
        previous: [matchCanAus],
        next: [matchCanAus, matchEngUsa, matchAlgGer],
        teams: teamsEngEliminated,
      });
      // ENG is eliminated, so chronological order wins: CAN vs AUS stays first.
      expect(highlightMatchCodes(container)).toEqual(["CAN", "AUS"]);
    });

    it("does not apply the gradient border when the only followed team is eliminated", () => {
      const { container } = renderMatchesWith({
        selectedTeams: ["ENG"],
        matchesTab: "upcoming",
        previous: [matchEngUsa],
        next: [matchEngUsa],
        teams: teamsEngEliminated,
      });
      expect(
        container
          .querySelector(".sports")
          .classList.contains("is-followed-highlight")
      ).toBe(false);
    });

    it("does not render the check/bold treatment on rows for eliminated followed teams", () => {
      const { container } = renderMatchesWith({
        selectedTeams: ["ENG"],
        matchesTab: "upcoming",
        previous: [matchEngUsa],
        next: [matchEngUsa],
        teams: teamsEngEliminated,
      });
      const highlight = visiblePanel(container).querySelector(
        ".match-highlight-view"
      );
      expect(
        highlight.querySelector(".sports-match-flag-wrapper.is-followed")
      ).toBeNull();
      expect(highlight.querySelector(".sports-match-flag-check")).toBeNull();
      expect(highlight.querySelector(".sports-match-code strong")).toBeNull();
    });

    it("hides the followed-only toggle when every followed team is eliminated", () => {
      const { container } = renderMatchesWith({
        selectedTeams: ["ENG"],
        matchesTab: "upcoming",
        previous: [matchEngUsa],
        next: [matchEngUsa, matchCanAus],
        teams: teamsEngEliminated,
      });
      fireEvent.click(
        visiblePanel(container).querySelector(
          "[data-l10n-id='newtab-sports-widget-view-all']"
        )
      );
      expect(
        visiblePanel(container).querySelector(".sports-followed-only-toggle")
      ).toBeNull();
    });

    it("shows the unfiltered list when every followed team is eliminated", () => {
      // followedOnly defaults to true, but with no active followed teams the
      // filter must be a no-op so the user still sees the schedule.
      const { container } = renderMatchesWith({
        selectedTeams: ["ENG"],
        matchesTab: "upcoming",
        previous: [matchEngUsa],
        next: [matchEngUsa, matchCanAus, matchAlgGer],
        teams: teamsEngEliminated,
      });
      fireEvent.click(
        visiblePanel(container).querySelector(
          "[data-l10n-id='newtab-sports-widget-view-all']"
        )
      );
      expect(
        visiblePanel(container).querySelectorAll(".sports-match-row")
      ).toHaveLength(3);
    });

    it("keeps the followed treatment for the still-active followed teams when only some are eliminated", () => {
      // Follow ENG (eliminated) and CAN (still active). CAN's match should
      // bubble and get the followed-team treatment; ENG should not.
      const { container } = renderMatchesWith({
        selectedTeams: ["ENG", "CAN"],
        matchesTab: "upcoming",
        previous: [matchEngUsa],
        next: [matchEngUsa, matchCanAus, matchAlgGer],
        teams: teamsEngEliminated,
      });
      expect(highlightMatchCodes(container)).toEqual(["CAN", "AUS"]);
      const highlight = visiblePanel(container).querySelector(
        ".match-highlight-view"
      );
      // CAN side gets the followed treatment; AUS side does not.
      const wrappers = highlight.querySelectorAll(".sports-match-flag-wrapper");
      expect(wrappers[0].classList.contains("is-followed")).toBe(true);
      expect(wrappers[1].classList.contains("is-followed")).toBe(false);
      // Toggle is still present because at least one followed team is active.
      fireEvent.click(
        visiblePanel(container).querySelector(
          "[data-l10n-id='newtab-sports-widget-view-all']"
        )
      );
      expect(
        visiblePanel(container).querySelector(".sports-followed-only-toggle")
      ).toBeInTheDocument();
    });
  });
});

describe("<SportsWidget> telemetry", () => {
  let dispatch;
  let handleUserInteraction;

  beforeEach(() => {
    dispatch = jest.fn();
    handleUserInteraction = jest.fn();
  });

  function renderWidget(size = "medium") {
    return render(
      <WrapWithProvider state={makeState({ [PREF_SPORTS_WIDGET_SIZE]: size })}>
        <SportsWidget
          dispatch={dispatch}
          handleUserInteraction={handleUserInteraction}
        />
      </WrapWithProvider>
    );
  }

  it("should dispatch view_matches telemetry when view-matches is clicked", () => {
    const { container } = renderWidget();
    fireEvent.click(
      container.querySelector(
        "[data-l10n-id='newtab-sports-widget-view-matches']"
      )
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_USER_EVENT,
        data: expect.objectContaining({
          widget_source: "widget",
          user_action: "view_matches",
        }),
      })
    );
    expect(handleUserInteraction).toHaveBeenCalledWith("sportsWidget");
  });

  it("disables the widget without recording an interaction when the Hide widget menu item is clicked", () => {
    const { container } = renderWidget();
    fireEvent.click(
      container.querySelector("[data-l10n-id='newtab-widget-menu-hide']")
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.SET_PREF,
        data: { name: "widgets.sportsWidget.enabled", value: false },
      })
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_ENABLED,
        data: expect.objectContaining({
          widget_name: "sports",
          widget_source: "context_menu",
          enabled: false,
        }),
      })
    );
    expect(handleUserInteraction).not.toHaveBeenCalled();
  });

  it("opens the support link and records an interaction when the Learn more menu item is clicked", () => {
    const { container } = renderWidget();
    fireEvent.click(
      container.querySelector(
        "[data-l10n-id='newtab-sports-widget-menu-learn-more']"
      )
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.OPEN_LINK,
        data: expect.objectContaining({
          url: "https://support.mozilla.org/kb/firefox-new-tab-widgets",
        }),
      })
    );
    expect(handleUserInteraction).toHaveBeenCalledWith("sportsWidget");
  });

  it("should dispatch view_key_dates telemetry with context_menu source when the View schedule menu item is clicked", () => {
    const { container } = renderWidget();
    fireEvent.click(
      container.querySelector(
        "[data-l10n-id='newtab-sports-widget-menu-view-schedule']"
      )
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_USER_EVENT,
        data: expect.objectContaining({
          widget_source: "context_menu",
          user_action: "view_key_dates",
        }),
      })
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_SPORTS_CHANGE_WIDGET_STATE,
        data: "sports-key-dates",
      })
    );
  });

  it("switches to upcoming when the View upcoming context menu item is clicked even with live games present", () => {
    const sportsWithLive = {
      widgetState: "sports-matches",
      matchesTab: "results",
      data: {
        teams: [],
        matches: { current: [], previous: [mockMatch], next: [] },
        live: [mockMatch],
      },
    };
    const { container, rerender } = render(
      <WrapWithProvider state={makeState({}, sportsWithLive)}>
        <SportsWidget
          dispatch={dispatch}
          handleUserInteraction={handleUserInteraction}
        />
      </WrapWithProvider>
    );

    // While live games are present, the widget auto-activates Now regardless
    // of the persisted matchesTab.
    expect(
      container
        .querySelector(".sports-matches-tab.is-active")
        .getAttribute("data-l10n-id")
    ).toBe("newtab-sports-widget-now");

    fireEvent.click(
      container.querySelector(
        "[data-l10n-id='newtab-sports-widget-menu-view-upcoming']"
      )
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_SPORTS_CHANGE_MATCHES_TAB,
        data: "upcoming",
      })
    );

    // Simulate the dispatch reaching redux. Without the auto-override being
    // suppressed by the user's explicit menu choice, the active tab would
    // remain pinned to Now here.
    rerender(
      <WrapWithProvider
        state={makeState({}, { ...sportsWithLive, matchesTab: "upcoming" })}
      >
        <SportsWidget
          dispatch={dispatch}
          handleUserInteraction={handleUserInteraction}
        />
      </WrapWithProvider>
    );
    expect(
      container
        .querySelector(".sports-matches-tab.is-active")
        .getAttribute("data-l10n-id")
    ).toBe("newtab-sports-widget-upcoming");
  });

  it("switches to results when the View results context menu item is clicked even with live games present", () => {
    const sportsWithLive = {
      widgetState: "sports-matches",
      matchesTab: "upcoming",
      data: {
        teams: [],
        matches: { current: [], previous: [mockMatch], next: [] },
        live: [mockMatch],
      },
    };
    const { container, rerender } = render(
      <WrapWithProvider state={makeState({}, sportsWithLive)}>
        <SportsWidget
          dispatch={dispatch}
          handleUserInteraction={handleUserInteraction}
        />
      </WrapWithProvider>
    );

    expect(
      container
        .querySelector(".sports-matches-tab.is-active")
        .getAttribute("data-l10n-id")
    ).toBe("newtab-sports-widget-now");

    fireEvent.click(
      container.querySelector(
        "[data-l10n-id='newtab-sports-widget-menu-view-results']"
      )
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_SPORTS_CHANGE_MATCHES_TAB,
        data: "results",
      })
    );

    rerender(
      <WrapWithProvider
        state={makeState({}, { ...sportsWithLive, matchesTab: "results" })}
      >
        <SportsWidget
          dispatch={dispatch}
          handleUserInteraction={handleUserInteraction}
        />
      </WrapWithProvider>
    );
    expect(
      container
        .querySelector(".sports-matches-tab.is-active")
        .getAttribute("data-l10n-id")
    ).toBe("newtab-sports-widget-results");
  });

  it("should dispatch view_matches telemetry with key_dates_state source when View matches is clicked from key dates", () => {
    const { container } = render(
      <WrapWithProvider
        state={makeState({}, { widgetState: "sports-key-dates" })}
      >
        <SportsWidget
          dispatch={dispatch}
          handleUserInteraction={handleUserInteraction}
        />
      </WrapWithProvider>
    );
    fireEvent.click(
      container.querySelector(
        ".sports-key-dates [data-l10n-id='newtab-sports-widget-view-matches']"
      )
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_USER_EVENT,
        data: expect.objectContaining({
          widget_source: "key_dates_state",
          user_action: "view_matches",
        }),
      })
    );
    expect(handleUserInteraction).toHaveBeenCalledWith("sportsWidget");
  });

  it("should dispatch follow_teams telemetry when the follow-teams button is clicked", () => {
    const { container } = renderWidget();
    fireEvent.click(container.querySelector(".sports-follow-teams-btn"));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_USER_EVENT,
        data: expect.objectContaining({
          widget_source: "widget",
          user_action: "follow_teams",
        }),
      })
    );
    expect(handleUserInteraction).toHaveBeenCalledWith("sportsWidget");
  });
});

describe("<SportsWidget> stage section labels in highlight views", () => {
  // `current` here is the conceptual "live" bucket — it's wired into
  // `data.live` so the Now-tab section label tests below exercise the live
  // feed instead of the /matches `current[]` bucket (which no longer drives
  // the Now tab in production).
  function renderInMatchesState({
    matchesTab,
    size = "large",
    previous = [],
    current = [],
    next = [],
  }) {
    return render(
      <WrapWithProvider
        state={makeState(
          { [PREF_SPORTS_WIDGET_SIZE]: size },
          {
            widgetState: "sports-matches",
            matchesTab,
            data: {
              teams: [],
              matches: { previous, current: [], next },
              live: current,
            },
          }
        )}
      >
        <SportsWidget dispatch={jest.fn()} handleUserInteraction={jest.fn()} />
      </WrapWithProvider>
    );
  }

  it("renders the per-group Fluent ID above the Results highlight at large size", () => {
    const { container } = renderInMatchesState({
      matchesTab: "results",
      previous: [makeGroupMatch("D")],
    });
    const label = getVisibleTabPanel(container).querySelector(
      ".sports-section-label"
    );
    expect(label).not.toBeNull();
    expect(
      label.querySelector("[data-l10n-id]").getAttribute("data-l10n-id")
    ).toBe("newtab-sports-widget-group-d");
  });

  it("renders the per-group Fluent ID above the Now highlight at large size", () => {
    const { container } = renderInMatchesState({
      matchesTab: "now",
      current: [makeGroupMatch("F")],
    });
    const label = getVisibleTabPanel(container).querySelector(
      ".sports-section-label"
    );
    expect(label).not.toBeNull();
    const stageEl = label.querySelector(
      "[data-l10n-id='newtab-sports-widget-group-f']"
    );
    expect(stageEl).not.toBeNull();
  });

  it("appends the LIVE badge to the Now highlight section label", () => {
    const { container } = renderInMatchesState({
      matchesTab: "now",
      current: [makeGroupMatch("F")],
    });
    const panel = getVisibleTabPanel(container);
    const liveBadge = panel.querySelector(".sports-section-label-live");
    expect(liveBadge).not.toBeNull();
    expect(
      liveBadge.querySelector("[data-l10n-id='newtab-sports-widget-live']")
    ).not.toBeNull();
  });

  it("appends the LIVE badge when the Now match is in a knockout stage", () => {
    const { container } = renderInMatchesState({
      matchesTab: "now",
      current: [makeKnockoutMatch("Quarter-finals")],
    });
    const panel = getVisibleTabPanel(container);
    expect(
      panel.querySelector(
        ".sports-section-label [data-l10n-id='newtab-sports-widget-quarter-finals']"
      )
    ).not.toBeNull();
    expect(panel.querySelector(".sports-section-label-live")).not.toBeNull();
  });

  it("does NOT show the LIVE badge on Results or Upcoming highlights", () => {
    const resultsRender = renderInMatchesState({
      matchesTab: "results",
      previous: [makeGroupMatch("A")],
    });
    expect(
      getVisibleTabPanel(resultsRender.container).querySelector(
        ".sports-section-label-live"
      )
    ).toBeNull();

    const upcomingRender = renderInMatchesState({
      matchesTab: "upcoming",
      next: [makeGroupMatch("A")],
    });
    expect(
      getVisibleTabPanel(upcomingRender.container).querySelector(
        ".sports-section-label-live"
      )
    ).toBeNull();
  });

  it("renders the per-group Fluent ID above the Upcoming highlight at large size", () => {
    const { container } = renderInMatchesState({
      matchesTab: "upcoming",
      next: [makeGroupMatch("L")],
    });
    const stageEl = getVisibleTabPanel(container).querySelector(
      ".sports-section-label [data-l10n-id='newtab-sports-widget-group-l']"
    );
    expect(stageEl).not.toBeNull();
  });

  it("renders the knockout-stage Fluent ID for a Round of 16 match", () => {
    const { container } = renderInMatchesState({
      matchesTab: "upcoming",
      next: [makeKnockoutMatch("Round of 16")],
    });
    const stageEl = getVisibleTabPanel(container).querySelector(
      ".sports-section-label [data-l10n-id='newtab-sports-widget-round-16']"
    );
    expect(stageEl).not.toBeNull();
  });

  it("falls back to raw match.stage text when stage is unmapped", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { container } = renderInMatchesState({
      matchesTab: "upcoming",
      next: [makeKnockoutMatch("Mystery Stage")],
    });
    const label = getVisibleTabPanel(container).querySelector(
      ".sports-section-label"
    );
    expect(label.textContent).toContain("Mystery Stage");
    expect(label.querySelector("[data-l10n-id]")).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Mystery Stage")
    );
    warnSpy.mockRestore();
  });

  it("does NOT render a section label at medium widget size", () => {
    const { container } = renderInMatchesState({
      matchesTab: "results",
      size: "medium",
      previous: [makeGroupMatch("D")],
    });
    expect(
      getVisibleTabPanel(container).querySelector(".sports-section-label")
    ).toBeNull();
  });
});

describe("<SportsWidget> list-view grouped sections", () => {
  function renderListState({ matchesTab, previous = [], next = [] }) {
    return render(
      <WrapWithProvider
        state={makeState(
          {},
          {
            widgetState: "sports-matches",
            matchesTab,
            data: {
              teams: [],
              matches: { previous, current: [], next },
            },
          }
        )}
      >
        <SportsWidget dispatch={jest.fn()} handleUserInteraction={jest.fn()} />
      </WrapWithProvider>
    );
  }

  function expandList(panel) {
    fireEvent.click(
      panel.querySelector("[data-l10n-id='newtab-sports-widget-view-all']")
    );
  }

  it("renders one section per group with the right Fluent ID and match count", () => {
    const previous = [
      makeGroupMatch("A", { date: "2026-05-08T14:00:00+00:00" }),
      makeGroupMatch("A", { date: "2026-05-08T16:00:00+00:00" }),
      makeGroupMatch("B", { date: "2026-05-09T14:00:00+00:00" }),
    ];
    const { container } = renderListState({ matchesTab: "results", previous });
    const panel = getVisibleTabPanel(container);
    expandList(panel);
    const sections = panel.querySelectorAll(".sports-matches-list-section");
    expect(sections.length).toBe(2);
    expect(
      sections[0]
        .querySelector(".sports-section-label [data-l10n-id]")
        .getAttribute("data-l10n-id")
    ).toBe("newtab-sports-widget-group-a");
    expect(sections[0].querySelectorAll("li").length).toBe(2);
    expect(
      sections[1]
        .querySelector(".sports-section-label [data-l10n-id]")
        .getAttribute("data-l10n-id")
    ).toBe("newtab-sports-widget-group-b");
    expect(sections[1].querySelectorAll("li").length).toBe(1);
  });

  it("preserves Merino's order when the same key reappears later", () => {
    const previous = [
      makeGroupMatch("A", { date: "2026-05-08T14:00:00+00:00" }),
      makeGroupMatch("B", { date: "2026-05-09T14:00:00+00:00" }),
      makeGroupMatch("A", { date: "2026-05-10T14:00:00+00:00" }),
    ];
    const { container } = renderListState({ matchesTab: "results", previous });
    const panel = getVisibleTabPanel(container);
    expandList(panel);
    const ids = [
      ...panel.querySelectorAll(
        ".sports-matches-list-section .sports-section-label [data-l10n-id]"
      ),
    ].map(el => el.getAttribute("data-l10n-id"));
    expect(ids).toEqual([
      "newtab-sports-widget-group-a",
      "newtab-sports-widget-group-b",
      "newtab-sports-widget-group-a",
    ]);
  });

  it("groups Upcoming list-view matches the same way", () => {
    const next = [
      makeGroupMatch("C", { date: "2026-06-11T14:00:00+00:00" }),
      makeKnockoutMatch("Round of 16", { date: "2026-07-04T14:00:00+00:00" }),
      makeKnockoutMatch("Round of 16", { date: "2026-07-04T18:00:00+00:00" }),
    ];
    const { container } = renderListState({ matchesTab: "upcoming", next });
    const panel = getVisibleTabPanel(container);
    expandList(panel);
    const sections = panel.querySelectorAll(".sports-matches-list-section");
    expect(sections.length).toBe(2);
    expect(
      sections[0]
        .querySelector(".sports-section-label [data-l10n-id]")
        .getAttribute("data-l10n-id")
    ).toBe("newtab-sports-widget-group-c");
    expect(
      sections[1]
        .querySelector(".sports-section-label [data-l10n-id]")
        .getAttribute("data-l10n-id")
    ).toBe("newtab-sports-widget-round-16");
    expect(sections[1].querySelectorAll("li").length).toBe(2);
  });

  it("does NOT add the LIVE badge to list-view section headers", () => {
    const previous = [makeGroupMatch("A")];
    const { container } = renderListState({ matchesTab: "results", previous });
    const panel = getVisibleTabPanel(container);
    expandList(panel);
    expect(panel.querySelector(".sports-section-label-live")).toBeNull();
  });
});

describe("<SportsWidget> live polling visibility", () => {
  const PREF_SPORTS_WIDGET_LIVE_ENABLED = "widgets.sportsWidget.live.enabled";

  // The IntersectionObserver we wire up records every constructed instance so
  // tests can grab its callback and simulate enter/leave from JSDOM, which
  // doesn't actually fire intersection events.
  let observerInstances;
  let originalIntersectionObserver;

  beforeEach(() => {
    observerInstances = [];
    originalIntersectionObserver = global.IntersectionObserver;
    global.IntersectionObserver = class MockIntersectionObserver {
      constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        this.observed = [];
        this.disconnected = false;
        observerInstances.push(this);
      }
      observe(el) {
        this.observed.push(el);
      }
      unobserve(el) {
        this.observed = this.observed.filter(e => e !== el);
      }
      disconnect() {
        this.disconnected = true;
      }
    };
  });

  // Construction order is: [0] impression hook (mount), [1] error hook
  // (mount, even with no fetchError), [2] live polling observer (created
  // after setLiveEl triggers a re-render, only when liveEnabled).
  function findLiveObserver() {
    return observerInstances[2];
  }

  afterEach(() => {
    global.IntersectionObserver = originalIntersectionObserver;
  });

  function renderWithLive(liveEnabled, dispatch = jest.fn()) {
    const state = makeState({
      [PREF_SPORTS_WIDGET_LIVE_ENABLED]: liveEnabled,
    });
    const result = render(
      <WrapWithProvider state={state}>
        <SportsWidget dispatch={dispatch} handleUserInteraction={jest.fn()} />
      </WrapWithProvider>
    );
    return { ...result, dispatch };
  }

  it("does not attach a live visibility observer when liveEnabled is false", () => {
    renderWithLive(false);
    // The impression observer is always attached; the live observer
    // (constructed second by useEffect order) should be absent here.
    expect(findLiveObserver()).toBeUndefined();
  });

  // Regression: SportsFeed.liveEnabled accepts the trainhopConfig live override
  // as a Nimbus rollout signal. Until this fix the component only read the
  // raw pref, so a Nimbus-only enable started the feed's polling but never
  // attached the IntersectionObserver — visibleTabs stayed empty and tick()
  // bailed forever.
  it("attaches the live visibility observer when only legacy trainhopConfig.sports enables live", () => {
    const state = makeState({
      [PREF_SPORTS_WIDGET_LIVE_ENABLED]: false,
      trainhopConfig: { sports: { liveEnabled: true } },
    });
    render(
      <WrapWithProvider state={state}>
        <SportsWidget dispatch={jest.fn()} handleUserInteraction={jest.fn()} />
      </WrapWithProvider>
    );
    expect(findLiveObserver()).toBeDefined();
  });

  it("attaches the live visibility observer when canonical trainhopConfig.widgets.sportsWidgetLiveEnabled enables live", () => {
    const state = makeState({
      [PREF_SPORTS_WIDGET_LIVE_ENABLED]: false,
      trainhopConfig: { widgets: { sportsWidgetLiveEnabled: true } },
    });
    render(
      <WrapWithProvider state={state}>
        <SportsWidget dispatch={jest.fn()} handleUserInteraction={jest.fn()} />
      </WrapWithProvider>
    );
    expect(findLiveObserver()).toBeDefined();
  });

  it("dispatches WIDGETS_SPORTS_LIVE_VISIBLE on intersect when liveEnabled", () => {
    const { dispatch } = renderWithLive(true);
    // Find the observer attached to the widget article (the live one — it
    // observes the same element the impression observer observes).
    const liveObserver = findLiveObserver();
    expect(liveObserver).toBeDefined();
    act(() => {
      liveObserver.callback([{ isIntersecting: true }]);
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_SPORTS_LIVE_VISIBLE,
      })
    );
  });

  it("dispatches WIDGETS_SPORTS_LIVE_HIDDEN on un-intersect when liveEnabled", () => {
    const { dispatch } = renderWithLive(true);
    const liveObserver = findLiveObserver();
    expect(liveObserver).toBeDefined();
    act(() => {
      liveObserver.callback([{ isIntersecting: false }]);
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WIDGETS_SPORTS_LIVE_HIDDEN,
      })
    );
  });

  it("disconnects the live observer on unmount", () => {
    const { unmount } = renderWithLive(true);
    const liveObserver = findLiveObserver();
    expect(liveObserver).toBeDefined();
    expect(liveObserver.disconnected).toBe(false);
    unmount();
    expect(liveObserver.disconnected).toBe(true);
  });

  // Tab-visibility tests. IntersectionObserver only tracks viewport
  // intersection; a backgrounded tab keeps reporting isIntersecting=true.
  // The component also listens for document visibilitychange so the feed
  // can pause polling for background tabs.
  describe("tab visibility", () => {
    let hiddenValue;
    let originalHiddenDescriptor;

    beforeEach(() => {
      hiddenValue = false;
      originalHiddenDescriptor = Object.getOwnPropertyDescriptor(
        Document.prototype,
        "hidden"
      );
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => hiddenValue,
      });
    });

    afterEach(() => {
      if (originalHiddenDescriptor) {
        Object.defineProperty(
          Document.prototype,
          "hidden",
          originalHiddenDescriptor
        );
      } else {
        delete document.hidden;
      }
    });

    function fireVisibilityChange() {
      document.dispatchEvent(new Event("visibilitychange"));
    }

    it("dispatches HIDDEN when the tab is backgrounded while intersecting", () => {
      const { dispatch } = renderWithLive(true);
      const liveObserver = findLiveObserver();
      act(() => {
        liveObserver.callback([{ isIntersecting: true }]);
      });
      dispatch.mockClear();
      hiddenValue = true;
      act(() => {
        fireVisibilityChange();
      });
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: at.WIDGETS_SPORTS_LIVE_HIDDEN,
        })
      );
    });

    it("dispatches VISIBLE when the tab is foregrounded while intersecting", () => {
      const { dispatch } = renderWithLive(true);
      const liveObserver = findLiveObserver();
      act(() => {
        liveObserver.callback([{ isIntersecting: true }]);
      });
      hiddenValue = true;
      act(() => {
        fireVisibilityChange();
      });
      dispatch.mockClear();
      hiddenValue = false;
      act(() => {
        fireVisibilityChange();
      });
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: at.WIDGETS_SPORTS_LIVE_VISIBLE,
        })
      );
    });

    it("stays HIDDEN on foreground when widget is not intersecting", () => {
      const { dispatch } = renderWithLive(true);
      const liveObserver = findLiveObserver();
      act(() => {
        liveObserver.callback([{ isIntersecting: false }]);
      });
      dispatch.mockClear();
      hiddenValue = true;
      act(() => {
        fireVisibilityChange();
      });
      hiddenValue = false;
      act(() => {
        fireVisibilityChange();
      });
      // Every dispatch should be HIDDEN — no VISIBLE leaks through.
      for (const call of dispatch.mock.calls) {
        expect(call[0]).toEqual(
          expect.objectContaining({
            type: at.WIDGETS_SPORTS_LIVE_HIDDEN,
          })
        );
      }
    });

    it("clamps intersect dispatch when the tab is already hidden", () => {
      hiddenValue = true;
      const { dispatch } = renderWithLive(true);
      const liveObserver = findLiveObserver();
      act(() => {
        liveObserver.callback([{ isIntersecting: true }]);
      });
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: at.WIDGETS_SPORTS_LIVE_HIDDEN,
        })
      );
      expect(dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({
          type: at.WIDGETS_SPORTS_LIVE_VISIBLE,
        })
      );
    });

    it("removes the visibilitychange listener on unmount", () => {
      const removeSpy = jest.spyOn(document, "removeEventListener");
      const { unmount } = renderWithLive(true);
      unmount();
      expect(removeSpy).toHaveBeenCalledWith(
        "visibilitychange",
        expect.any(Function)
      );
      removeSpy.mockRestore();
    });
  });

  // Regression: when the component initially renders without an <article>
  // (e.g. PREF_NOVA_ENABLED is off so SportsWidget early-returns null),
  // the live-visibility useEffect previously captured widgetRef.current[0]
  // as undefined at mount and never re-ran because its deps included a
  // stable useRef. Tracking the article via setState lets the effect re-run
  // when the article actually mounts on a later render.
  it("attaches the live observer when the article appears on a later render", () => {
    // First render: Nova disabled → SportsWidget renders null → no article.
    // The impression observer hook still constructs an observer (it runs
    // before the early return), but the live-visibility effect should bail
    // because there's no article element yet.
    const dispatch = jest.fn();
    const { rerender } = render(
      <WrapWithProvider
        state={makeState({
          [PREF_SPORTS_WIDGET_LIVE_ENABLED]: true,
          [PREF_NOVA_ENABLED]: false,
        })}
      >
        <SportsWidget dispatch={dispatch} handleUserInteraction={jest.fn()} />
      </WrapWithProvider>
    );
    expect(findLiveObserver()).toBeUndefined();

    // Second render: Nova flips on. The article mounts; the live observer
    // should now attach because setLiveEl(el) caused the effect to re-run.
    rerender(
      <WrapWithProvider
        state={makeState({
          [PREF_SPORTS_WIDGET_LIVE_ENABLED]: true,
          [PREF_NOVA_ENABLED]: true,
        })}
      >
        <SportsWidget dispatch={dispatch} handleUserInteraction={jest.fn()} />
      </WrapWithProvider>
    );
    expect(findLiveObserver()).toBeDefined();
  });
});

describe("<SportsWidget> live games pagination (Now tab)", () => {
  // Two distinct live matches so the pagination has something to step through.
  const matchEngUsa = {
    ...mockMatch,
    home_team: { key: "ENG", name: "England" },
    away_team: { key: "USA", name: "United States" },
    query: "ENG vs USA",
  };
  const matchCanAus = {
    ...mockMatch,
    home_team: { key: "CAN", name: "Canada" },
    away_team: { key: "AUS", name: "Australia" },
    query: "CAN vs AUS",
  };

  function renderPagination({
    live = [],
    liveIndex = 0,
    dispatch = jest.fn(),
    size = "large",
  } = {}) {
    return {
      dispatch,
      ...render(
        <WrapWithProvider
          state={makeState(
            { [PREF_SPORTS_WIDGET_SIZE]: size },
            {
              widgetState: "sports-matches",
              matchesTab: "now",
              liveIndex,
              data: { teams: [], matches: emptyMatches, live },
            }
          )}
        >
          <SportsWidget dispatch={dispatch} handleUserInteraction={jest.fn()} />
        </WrapWithProvider>
      ),
    };
  }

  function findPagination(container) {
    return container.querySelector(".sports-live-pagination");
  }

  it("does NOT render the pagination when only one live match exists", () => {
    const { container } = renderPagination({ live: [matchEngUsa] });
    expect(findPagination(container)).toBeNull();
  });

  it("renders the pagination in medium size when 2+ live matches exist", () => {
    const { container } = renderPagination({
      size: "medium",
      live: [matchEngUsa, matchCanAus],
    });
    expect(findPagination(container)).toBeTruthy();
  });

  it("renders chevrons and one dot per live match when 2+ are live", () => {
    const { container } = renderPagination({
      live: [matchEngUsa, matchCanAus],
      liveIndex: 0,
    });
    const pagination = findPagination(container);
    expect(pagination).toBeTruthy();
    expect(
      pagination.querySelector(".sports-live-pagination-prev")
    ).toBeTruthy();
    expect(
      pagination.querySelector(".sports-live-pagination-next")
    ).toBeTruthy();
    const dots = pagination.querySelectorAll(".sports-live-pagination-dot");
    expect(dots.length).toBe(2);
    expect(dots[0].classList.contains("is-active")).toBe(true);
    expect(dots[1].classList.contains("is-active")).toBe(false);
  });

  it("dispatches CHANGE_LIVE_INDEX with the next index when the next chevron is clicked", () => {
    const { container, dispatch } = renderPagination({
      live: [matchEngUsa, matchCanAus],
      liveIndex: 0,
    });
    const nextButton = findPagination(container).querySelector(
      ".sports-live-pagination-next"
    );
    act(() => {
      fireEvent.click(nextButton);
    });
    const changeCall = dispatch.mock.calls.find(
      ([action]) => action?.type === at.WIDGETS_SPORTS_CHANGE_LIVE_INDEX
    );
    expect(changeCall).toBeTruthy();
    expect(changeCall[0].data).toBe(1);
  });

  it("wraps to the last match when the prev chevron is clicked from index 0", () => {
    const { container, dispatch } = renderPagination({
      live: [matchEngUsa, matchCanAus],
      liveIndex: 0,
    });
    const prevButton = findPagination(container).querySelector(
      ".sports-live-pagination-prev"
    );
    act(() => {
      fireEvent.click(prevButton);
    });
    const changeCall = dispatch.mock.calls.find(
      ([action]) => action?.type === at.WIDGETS_SPORTS_CHANGE_LIVE_INDEX
    );
    expect(changeCall[0].data).toBe(1);
  });

  it("dispatches CHANGE_LIVE_INDEX with the dot's index when a dot is clicked", () => {
    const { container, dispatch } = renderPagination({
      live: [matchEngUsa, matchCanAus],
      liveIndex: 0,
    });
    const dots = findPagination(container).querySelectorAll(
      ".sports-live-pagination-dot"
    );
    act(() => {
      fireEvent.click(dots[1]);
    });
    const changeCall = dispatch.mock.calls.find(
      ([action]) => action?.type === at.WIDGETS_SPORTS_CHANGE_LIVE_INDEX
    );
    expect(changeCall[0].data).toBe(1);
  });

  it("uses size='small' chevrons in the medium widget", () => {
    const { container } = renderPagination({
      size: "medium",
      live: [matchEngUsa, matchCanAus],
    });
    const pagination = findPagination(container);
    expect(
      pagination
        .querySelector(".sports-live-pagination-prev")
        .getAttribute("size")
    ).toBe("small");
    expect(
      pagination
        .querySelector(".sports-live-pagination-next")
        .getAttribute("size")
    ).toBe("small");
  });

  it("uses default-size chevrons in the large widget", () => {
    const { container } = renderPagination({
      size: "large",
      live: [matchEngUsa, matchCanAus],
    });
    const pagination = findPagination(container);
    // `size={undefined}` on a moz-button leaves the attribute off entirely.
    expect(
      pagination
        .querySelector(".sports-live-pagination-prev")
        .hasAttribute("size")
    ).toBe(false);
    expect(
      pagination
        .querySelector(".sports-live-pagination-next")
        .hasAttribute("size")
    ).toBe(false);
  });

  it("labels the widget root via the Now tab when pagination is visible", () => {
    const { container } = renderPagination({
      live: [matchEngUsa, matchCanAus],
    });
    const article = container.querySelector("article.sports");
    expect(article.getAttribute("aria-labelledby")).toBe("sports-now-tab");
    // The accessible name is the visible Now tab, so the referenced id must
    // actually exist in the document.
    expect(container.querySelector("#sports-now-tab")).toBeTruthy();
  });

  it("does NOT set aria-labelledby on the widget root when only one live match exists", () => {
    const { container } = renderPagination({ live: [matchEngUsa] });
    const article = container.querySelector("article.sports");
    expect(article.hasAttribute("aria-labelledby")).toBe(false);
  });

  it("adds aria-live='polite' and aria-atomic='false' to the slides container when pagination is active", () => {
    const { container } = renderPagination({
      live: [matchEngUsa, matchCanAus],
    });
    const nowPanel = [
      ...container.querySelectorAll(".sports-matches-tab-panel"),
    ].find(panel => !panel.hasAttribute("hidden"));
    const slides = nowPanel.querySelector(".match-highlight-view");
    expect(slides.getAttribute("aria-live")).toBe("polite");
    expect(slides.getAttribute("aria-atomic")).toBe("false");
  });

  it("does NOT add aria-live to the slides container when only one live match exists", () => {
    const { container } = renderPagination({ live: [matchEngUsa] });
    const nowPanel = [
      ...container.querySelectorAll(".sports-matches-tab-panel"),
    ].find(panel => !panel.hasAttribute("hidden"));
    const slides = nowPanel.querySelector(".match-highlight-view");
    expect(slides.hasAttribute("aria-live")).toBe(false);
  });

  it("renders the match at liveIndex (not always index 0)", () => {
    const { container } = renderPagination({
      live: [matchEngUsa, matchCanAus],
      liveIndex: 1,
    });
    const panel = getVisibleTabPanel(container);
    const row = panel.querySelector(".match-highlight-view .sports-match-row");
    expect(row).toBeTruthy();
    // Verify the visible match is the second one by checking the team
    // identifiers rendered in the row.
    expect(row.textContent).toMatch(/CAN|AUS|Canada|Australia/);
  });
});

describe("<SportsWidget> WIDGETS_ERROR telemetry", () => {
  let dispatch;
  let observerCallbacks;
  let observerInstances;
  // Stable target so the hook's WeakSet idempotency check fires correctly
  // across repeated intersection callbacks within a single test.
  const mockTarget = {};

  beforeEach(() => {
    dispatch = jest.fn();
    observerCallbacks = [];
    observerInstances = [];
    jest.spyOn(global, "IntersectionObserver").mockImplementation(cb => {
      const instance = {
        observe: jest.fn(),
        unobserve: jest.fn(),
        disconnect: jest.fn(),
      };
      observerCallbacks.push(cb);
      observerInstances.push(instance);
      return instance;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function renderWithFetchError(fetchError) {
    return render(
      <WrapWithProvider state={makeState({}, { data: { fetchError } })}>
        <SportsWidget dispatch={dispatch} handleUserInteraction={jest.fn()} />
      </WrapWithProvider>
    );
  }

  function fireErrorIntersection() {
    const errorCb = observerCallbacks[observerCallbacks.length - 1];
    act(() => {
      errorCb([{ isIntersecting: true, target: mockTarget }]);
    });
  }

  it("fires WIDGETS_ERROR once when fetchError is set and the widget becomes visible", () => {
    renderWithFetchError({ error_type: "teams_load_error" });
    expect(observerCallbacks.length).toBeGreaterThanOrEqual(2);
    fireErrorIntersection();
    const errorCalls = dispatch.mock.calls.filter(
      ([action]) => action?.type === at.WIDGETS_ERROR
    );
    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0][0]).toMatchObject({
      type: at.WIDGETS_ERROR,
      data: {
        widget_name: "sports",
        error_type: "teams_load_error",
      },
      meta: expect.objectContaining({ to: "ActivityStream:Main" }),
    });
    expect(errorCalls[0][0].data.widget_size).toBeDefined();
  });

  it("does not fire WIDGETS_ERROR when fetchError is null", () => {
    renderWithFetchError(null);
    fireErrorIntersection();
    expect(
      dispatch.mock.calls.filter(
        ([action]) => action?.type === at.WIDGETS_ERROR
      )
    ).toHaveLength(0);
  });

  it("fires WIDGETS_ERROR at most once across multiple intersection callbacks", () => {
    renderWithFetchError({ error_type: "teams_load_error" });
    fireErrorIntersection();
    fireErrorIntersection();
    expect(
      dispatch.mock.calls.filter(
        ([action]) => action?.type === at.WIDGETS_ERROR
      )
    ).toHaveLength(1);
  });

  // Guards the conditional `errorRef.current = fetchError ? [el] : []`
  // pattern in SportsWidget.jsx. Without it, the hook would add the article
  // to its WeakSet on the first intersect even when no error has happened
  // yet, and a fetchError arriving later would never fire WIDGETS_ERROR.
  it("only attaches the error observer once fetchError appears", () => {
    const { rerender } = renderWithFetchError(null);

    // Construction order is [0] impression, [1] error. With fetchError null,
    // the error hook's elementsRef is empty so the article is not observed.
    expect(observerInstances[1].observe).not.toHaveBeenCalled();

    rerender(
      <WrapWithProvider
        state={makeState(
          {},
          { data: { fetchError: { error_type: "teams_load_error" } } }
        )}
      >
        <SportsWidget dispatch={dispatch} handleUserInteraction={jest.fn()} />
      </WrapWithProvider>
    );

    // The error callback's identity changed (fetchError dep), so the hook
    // tore down the old observer and constructed a new one that now sees
    // the article via the conditional ref population.
    const latestErrorObserver = observerInstances[observerInstances.length - 1];
    expect(latestErrorObserver.observe).toHaveBeenCalledTimes(1);

    fireErrorIntersection();

    const errorCalls = dispatch.mock.calls.filter(
      ([action]) => action?.type === at.WIDGETS_ERROR
    );
    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0][0].data.error_type).toBe("teams_load_error");
  });
});
