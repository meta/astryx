// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/progressbar\.|packages/core/src/ProgressBar/|packages/lab/src/CircularProgress/|apps/storybook/stories/ProgressbarA11y)

/**
 * @file ProgressBar.a11y.chromium.spec.ts
 * @input Built ProgressBar stories and PROGRESSBAR_PATTERN in real Chromium
 * @output Browser evidence for every progressbar expectation across the binding's states, reconciled against the exact known failures
 * @position Chromium lane of the ProgressBar binding
 */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  PROGRESSBAR_PATTERN,
  blockingResults,
  checkAccessibilitySpec,
  formatFailures,
  neverExercised,
  summarize,
  unmatchedKnownFailures,
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
import {PROGRESSBAR_KNOWN_FAILURES} from './ProgressBar.a11y.known-failures';
import {
  PROGRESSBAR_BINDING_STATES,
  type ProgressBarBindingState,
} from './ProgressBar.a11y.states';

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
  state: ProgressBarBindingState,
): Promise<{subject: Locator; related: Record<string, Locator>}> {
  await page.goto(storyUrl(state.storyId), {waitUntil: 'load'});
  await holdMotionStill(page);
  const subject = page
    .locator('#storybook-root')
    .getByRole('progressbar', {name: state.facts.name});
  await subject.waitFor({state: 'attached'});
  return {subject, related: {}};
}

async function runState(
  page: Page,
  cdp: CDPSession,
  state: ProgressBarBindingState,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: PROGRESSBAR_PATTERN,
    binding: 'ProgressBar',
    state: state.id,
    facts: state.facts,
    knownFailures: PROGRESSBAR_KNOWN_FAILURES,
    mount: async () => {
      const {subject, related} = await mountState(page, state);
      return createChromiumHarness({page, cdp, subject, related});
    },
  });
}

test('ProgressBar marks have a name before the tooltip loads', async ({
  page,
}) => {
  let releaseTooltip!: () => void;
  const tooltipReady = new Promise<void>(resolve => {
    releaseTooltip = resolve;
  });
  const chunkPattern = /\/ProgressBarMarkTooltip-[^/]+\.js$/;
  const chunkRequested = page.waitForRequest(chunkPattern);
  await page.route(chunkPattern, async route => {
    await tooltipReady;
    await route.continue();
  });

  try {
    await page.goto(storyUrl('core-progressbar--with-target-mark'), {
      waitUntil: 'domcontentloaded',
    });
    await chunkRequested;
    const mark = page.locator('#storybook-root .astryx-progress-bar-mark');
    await expect(mark).toBeVisible();
    await expect(mark).not.toHaveAttribute('aria-describedby');
    const cdp = await page.context().newCDPSession(page);
    const subject = await createChromiumHarness({
      page,
      cdp,
      subject: mark,
    }).subject();
    expect(await subject.computed()).toMatchObject({
      role: 'image',
      name: 'Goal',
      description: '',
    });
    await page.keyboard.press('Tab');
    await expect(mark).toBeFocused();
    expect(await subject.computed()).toMatchObject({
      role: 'image',
      name: 'Goal',
    });
  } finally {
    releaseTooltip();
    await page.unrouteAll({behavior: 'wait'});
  }
});

test('ProgressBar marks keep their names when tabbed to or hovered', async ({
  page,
}) => {
  await page.goto(storyUrl('core-progressbar--with-multiple-marks'));
  const marks = page.locator('#storybook-root .astryx-progress-bar-mark');
  const labels = ['Q1 target', 'Q2 target', 'Stretch goal'];
  await expect(marks).toHaveCount(labels.length);
  const cdp = await page.context().newCDPSession(page);

  for (const [index, label] of labels.entries()) {
    const mark = marks.nth(index);
    await expect(mark).toHaveAttribute('aria-describedby', /.+/);
    const subject = await createChromiumHarness({
      page,
      cdp,
      subject: mark,
    }).subject();
    expect(await subject.computed()).toMatchObject({
      role: 'image',
      name: label,
    });
    await page.keyboard.press('Tab');
    await expect(mark).toBeFocused();
    const tooltip = page.getByRole('tooltip').filter({hasText: label});
    await expect(tooltip).toBeVisible();
    expect(await subject.computed()).toMatchObject({
      role: 'image',
      name: label,
    });
    await page.keyboard.press('Escape');
    await expect(tooltip).not.toBeVisible();
    await expect(mark).toBeFocused();
  }

  await page.getByText('Quarterly milestones', {exact: true}).click();
  await marks.first().hover();
  const tooltip = page.getByRole('tooltip').filter({hasText: labels[0]});
  await expect(tooltip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tooltip).not.toBeVisible();
});

// Checking coverage runs every state again, which on a loaded runner nears
// the per-test timeout as one test. It runs as one serial part per state,
// sharing their results, then one check over all of them.
test.describe('every progressbar expectation is exercised by a ProgressBar state', () => {
  test.describe.configure({mode: 'serial'});
  const results: BindingResult[] = [];

  for (const state of PROGRESSBAR_BINDING_STATES) {
    test(`runs ${state.id}`, async ({page}) => {
      const cdp = await page.context().newCDPSession(page);
      results.push(await runState(page, cdp, state));
    });
  }

  test('no expectation is left unexercised', () => {
    // Every part ran in this worker; this test alone proves nothing.
    expect(results.map(result => result.state).sort()).toEqual(
      PROGRESSBAR_BINDING_STATES.map(state => state.id).sort(),
    );
    expect(neverExercised(results)).toEqual([]);
    expect(unmatchedKnownFailures(PROGRESSBAR_KNOWN_FAILURES, results)).toEqual(
      [],
    );
  });
});

for (const state of PROGRESSBAR_BINDING_STATES) {
  test(`ProgressBar [${state.id}] — ${state.summary}`, async ({page}) => {
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    const report = summarize(PROGRESSBAR_PATTERN, [result]);
    // Required rows block (AST-020 FR9); advisory rows and exact known
    // failures report.
    expect(formatFailures(blockingResults([result]))).toBe('');
    expect(report.unrunLayers).toEqual([]);
    expect(report.counts.unexpectedPass).toBe(0);
  });
}
