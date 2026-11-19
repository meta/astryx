// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Calendar.a11y.states.ts
 * @input Calendar's representative month-grid states and the facts GRID_PATTERN reads
 * @output CALENDAR_BINDING_STATES, the start-cell neighbourhood for each, and the explicit ownership exclusions for this binding
 * @position Binding inventory shared by the jsdom test, the Chromium spec, and the story (component:Calendar AR1)
 */

import type {GridStateFacts} from '@astryxdesign/a11y-spec';
import type {DateRange, ISODateString} from '../Calendar';

/**
 * Every state starts on a mid-month day with a full neighbourhood inside the
 * same month row: January 14, 2026 is a Wednesday, so its row runs January
 * 11 (Sunday) to January 17 (Saturday), with January 7 above and 21 below.
 */
export const START_ISO: ISODateString = '2026-01-14';
export const NEIGHBOURHOOD = {
  next: '2026-01-15',
  previous: '2026-01-13',
  below: '2026-01-21',
  above: '2026-01-07',
  rowStart: '2026-01-11',
  rowEnd: '2026-01-17',
} as const;

export interface CalendarBindingState {
  readonly id: string;
  readonly summary: string;
  readonly storyId: string;
  /** The grid's accessible name (its month label). */
  readonly gridName: string;
  readonly facts: GridStateFacts;
  readonly mode: 'single' | 'range';
  readonly value?: ISODateString | DateRange;
  readonly numberOfMonths?: 1 | 2;
  /** Render ISO week numbers in a leading column (`hasWeekNumbers`). */
  readonly hasWeekNumbers?: boolean;
  readonly rtl?: boolean;
}

const ALL = [
  'next',
  'previous',
  'below',
  'above',
  'rowStart',
  'rowEnd',
] as const;

function facts(overrides: Partial<GridStateFacts> = {}): GridStateFacts {
  return {
    hasColumnHeaders: true,
    rtl: false,
    multiselectable: false,
    selectedCount: 0,
    enterSelectsStart: true,
    neighbours: ALL,
    ...overrides,
  };
}

const story = (id: string) => `a11y-calendargrid--${id}`;

export const CALENDAR_BINDING_STATES = [
  {
    id: 'single-selected',
    summary:
      'a single-mode Calendar with January 20 selected; focus starts on January 14',
    storyId: story('single-selected'),
    gridName: 'January 2026',
    mode: 'single',
    value: '2026-01-20',
    facts: facts({selectedCount: 1}),
  },
  {
    id: 'single-rtl',
    summary:
      'the same Calendar on a right-to-left page: ArrowLeft moves to the next day',
    storyId: story('single-rtl'),
    gridName: 'January 2026',
    mode: 'single',
    value: '2026-01-20',
    rtl: true,
    facts: facts({rtl: true, selectedCount: 1}),
  },
  {
    id: 'single-week-numbers',
    summary:
      'a single-mode Calendar with week numbers: the header row gains a corner cell before the weekday headers',
    storyId: story('single-week-numbers'),
    gridName: 'January 2026',
    mode: 'single',
    value: '2026-01-20',
    hasWeekNumbers: true,
    facts: facts({selectedCount: 1}),
  },
  {
    id: 'range-two-months',
    summary:
      'a two-month range Calendar with January 20–22 selected; the first grid is the subject',
    storyId: story('range-two-months'),
    gridName: 'January 2026',
    mode: 'range',
    value: {start: '2026-01-20', end: '2026-01-22'},
    numberOfMonths: 2,
    // Enter on a range Calendar starts a new range rather than selecting the
    // day outright, so the activation row does not apply here.
    facts: facts({
      multiselectable: true,
      selectedCount: 3,
      enterSelectsStart: false,
    }),
  },
] as const satisfies ReadonlyArray<CalendarBindingState>;

export const CALENDAR_EXCLUSIONS = [
  {
    id: 'month-edge-crossing',
    owner: 'component:Calendar FR5 and Calendar.test.tsx (cross-month suites)',
    reason:
      'An arrow at the edge of a month crosses into the neighbouring month and focuses the real day there; the APG grid pattern stops at the edge, and the record defines the crossing. Every binding state therefore starts mid-month, and the crossing stays with the component tests.',
  },
  {
    id: 'disabled-day-arrows',
    owner:
      'Calendar.test.tsx (bounds and dateConstraints suites) and component:Calendar AR1',
    reason:
      "An arrow that meets a day disabled by `min`/`max` or a `dateConstraints` rule skips it and continues in the same direction, crossing the month edge when it must — a behaviour the Calendar record defines (AR1) beyond the APG grid's one-cell step, so this contract's arrow row keeps its states free of disabled days. Calendar.test.tsx proves the skip ('ArrowUp skips a disabled cell in the same column to the next enabled row (complex-2)', the weekdays-only and max-bound arrow cases) and owns it.",
  },
  {
    id: 'page-keys-and-pointer',
    owner:
      'Calendar.test.tsx: the Page-key cases ("moves the focused day by a month with PageDown and PageUp, into the month now shown", "a page into a month with no enabled day changes nothing and keeps focus", "a page onto a day disabled by a constraint moves the month and focuses its first enabled day", "a page whose target lies past max changes nothing and keeps focus", "in a two-month view PageDown from the second month moves both months and a later Next click selects no stale day") and the pointer selection suites',
    reason:
      'PageUp/PageDown move by a month (author-determined in the APG, defined by component:Calendar AR1) and pointer selection are outside this keyboard-and-structure contract; the component tests own them.',
  },
] as const;
