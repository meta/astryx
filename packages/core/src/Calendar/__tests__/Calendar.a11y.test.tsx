// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file Calendar.a11y.test.tsx
 * @input GRID_PATTERN bound to Calendar's representative month-grid states
 * @output jsdom-lane proof of the DOM expectations (structure, single Tab stop, selection) and an honest "unrun" report for the browser layers
 * @position Binding test for component:Calendar AR1 (the Chromium spec covers the rest)
 */

import {cleanup, render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {
  GRID_PATTERN,
  checkAccessibilitySpec,
  createJsdomHarness,
  expectAccessibilitySpec,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {renderCalendarState} from './Calendar.a11y.renders';
import {
  CALENDAR_BINDING_STATES,
  CALENDAR_EXCLUSIONS,
  NEIGHBOURHOOD,
  START_ISO,
  type CalendarBindingState,
} from './Calendar.a11y.states';
import {CALENDAR_KNOWN_FAILURES} from './Calendar.a11y.known-failures';

function grid(state: CalendarBindingState): HTMLElement {
  return screen.getByRole('grid', {name: state.gridName});
}

function dayButton(iso: string): HTMLElement {
  const button = document.querySelector<HTMLElement>(
    `button[data-date="${iso}"]`,
  );
  if (button == null) {
    throw new Error(`no day button for ${iso}`);
  }
  return button;
}

function related(): Record<string, HTMLElement> {
  const start = dayButton(START_ISO);
  const startCell = start.closest<HTMLElement>('[role="gridcell"]');
  if (startCell == null) {
    throw new Error('the start day is not inside a gridcell');
  }
  return {
    start,
    startCell,
    ...Object.fromEntries(
      Object.entries(NEIGHBOURHOOD).map(([name, iso]) => [
        name,
        dayButton(iso),
      ]),
    ),
  };
}

async function checkState(state: CalendarBindingState): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: GRID_PATTERN,
    binding: 'Calendar',
    state: state.id,
    facts: state.facts,
    knownFailures: CALENDAR_KNOWN_FAILURES,
    mount: async () => {
      render(renderCalendarState(state));
      return createJsdomHarness({subject: grid(state), related: related()});
    },
    unmount: cleanup,
  });
}

describe('Calendar — grid pattern, jsdom lane', () => {
  it.each(
    CALENDAR_BINDING_STATES.map(
      state => [state.id, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectAccessibilitySpec({
      spec: GRID_PATTERN,
      binding: 'Calendar',
      state: state.id,
      facts: state.facts,
      knownFailures: CALENDAR_KNOWN_FAILURES,
      render: () => {
        render(renderCalendarState(state));
      },
      subject: () => grid(state),
      related: () => related(),
      cleanup,
    });
  });

  it('runs the DOM layer and reports the browser-owned outcomes as unrun', async () => {
    const results: BindingResult[] = [];
    for (const state of CALENDAR_BINDING_STATES) {
      results.push(await checkState(state));
    }
    const report = summarize(GRID_PATTERN, results);
    expect(report.counts.pass).toBeGreaterThan(0);
    expect(report.unrunLayers).toEqual(['accessibility-tree', 'real-browser']);
    expect(report.counts.unexpectedPass).toBe(0);
  });
});

describe('Calendar binding inventory', () => {
  it('gives every representative state a distinct checked-in story', () => {
    const stories = CALENDAR_BINDING_STATES.map(state => state.storyId);
    expect(new Set(stories).size).toBe(stories.length);
  });

  it('keeps edge crossing, Page keys and pointer selection explicitly owned elsewhere', () => {
    expect(CALENDAR_EXCLUSIONS.map(exclusion => exclusion.id)).toEqual([
      'month-edge-crossing',
      'disabled-day-arrows',
      'page-keys-and-pointer',
    ]);
    for (const exclusion of CALENDAR_EXCLUSIONS) {
      expect(exclusion.owner.length, exclusion.id).toBeGreaterThan(20);
      expect(exclusion.reason.length, exclusion.id).toBeGreaterThan(80);
    }
  });

  it('renders the named grid and the whole start neighbourhood for every state', () => {
    for (const state of CALENDAR_BINDING_STATES) {
      render(renderCalendarState(state));
      expect(grid(state), state.id).toBeTruthy();
      expect(Object.keys(related()), state.id).toHaveLength(8);
      cleanup();
    }
  });
});
