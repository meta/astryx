// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/grid|internal/a11y-spec/src/harness|packages/core/src/Calendar/|packages/core/src/hooks/useGridFocus|apps/storybook/stories/CalendarGridA11y)

/**
 * @file Calendar.a11y.chromium.spec.ts
 * @input Built Calendar stories and GRID_PATTERN in real Chromium
 * @output Browser evidence for every grid expectation across the binding's states (role and name, arrows in reading order, Home/End, Enter)
 * @position Chromium lane of the Calendar grid binding (component:Calendar AR1)
 */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  GRID_PATTERN,
  blockingResults,
  checkAccessibilitySpec,
  formatFailures,
  neverExercised,
  unmatchedKnownFailures,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {
  createChromiumHarness,
  holdMotionStill,
} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {
  CALENDAR_BINDING_STATES,
  NEIGHBOURHOOD,
  START_ISO,
  type CalendarBindingState,
} from './Calendar.a11y.states';
import {CALENDAR_KNOWN_FAILURES} from './Calendar.a11y.known-failures';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

function storyUrl(storyId: string): string {
  return `${storybook.origin}/iframe.html?id=${storyId}&viewMode=story`;
}

async function mountState(
  page: Page,
  state: CalendarBindingState,
): Promise<{subject: Locator; related: Record<string, Locator>}> {
  await page.goto(storyUrl(state.storyId), {waitUntil: 'load'});
  await holdMotionStill(page);
  const root = page.locator('#storybook-root');
  const subject = root.getByRole('grid', {name: state.gridName});
  await subject.waitFor({state: 'attached'});
  const day = (iso: string) => root.locator(`button[data-date="${iso}"]`);
  const start = day(START_ISO);
  return {
    subject,
    related: {
      start,
      startCell: root.locator(
        `[role="gridcell"]:has(> button[data-date="${START_ISO}"])`,
      ),
      ...Object.fromEntries(
        Object.entries(NEIGHBOURHOOD).map(([name, iso]) => [name, day(iso)]),
      ),
    },
  };
}

async function runState(
  page: Page,
  cdp: CDPSession,
  state: CalendarBindingState,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: GRID_PATTERN,
    binding: 'Calendar',
    state: state.id,
    facts: state.facts,
    knownFailures: CALENDAR_KNOWN_FAILURES,
    mount: async () => {
      const {subject, related} = await mountState(page, state);
      return createChromiumHarness({page, cdp, subject, related});
    },
  });
}

test('every grid expectation is exercised by a Calendar state', async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  const results: BindingResult[] = [];
  for (const state of CALENDAR_BINDING_STATES) {
    results.push(await runState(page, cdp, state));
  }
  expect(neverExercised(results)).toEqual([]);
  expect(unmatchedKnownFailures(CALENDAR_KNOWN_FAILURES, results)).toEqual([]);
});

for (const state of CALENDAR_BINDING_STATES) {
  test(`Calendar [${state.id}] — ${state.summary}`, async ({page}) => {
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    const report = summarize(GRID_PATTERN, [result]);
    // Required rows block (AST-020 FR9); advisory rows and exact known
    // failures report.
    expect(formatFailures(blockingResults([result]))).toBe('');
    expect(report.unrunLayers).toEqual([]);
    expect(report.counts.unexpectedPass).toBe(0);
  });
}
