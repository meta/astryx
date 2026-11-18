// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/slider|internal/a11y-spec/src/harness|packages/core/src/Slider/|apps/storybook/stories/SliderA11y)

/**
 * @file SliderRange.a11y.chromium.spec.ts
 * @input Built range Slider stories, SLIDER_MULTITHUMB_PATTERN, and SLIDER_PATTERN in real Chromium
 * @output Browser evidence for every multi-thumb expectation across the binding's states and for every slider expectation on each thumb, reconciled against the exact known failures
 * @position Chromium lane of the range Slider binding (component:Slider AR1)
 */

import {
  expect,
  test,
  type CDPSession,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  SLIDER_MULTITHUMB_PATTERN,
  SLIDER_PATTERN,
  UPPER_THUMB,
  blockingResults,
  checkAccessibilitySpec,
  formatFailures,
  neverExercised,
  summarize,
  unmatchedKnownFailures,
  type BindingResult,
  type PatternContract,
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
import {SLIDER_RANGE_KNOWN_FAILURES} from './SliderRange.a11y.known-failures';
import {
  LOWER_THUMB_NAME,
  SLIDER_RANGE_BINDING_STATES,
  UPPER_THUMB_NAME,
  thumbFacts,
  type SliderRangeBindingState,
  type SliderRangeThumb,
} from './SliderRange.a11y.states';

const BINDING = 'Slider (range)';

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

async function mountState(page: Page, state: SliderRangeBindingState) {
  await page.goto(storyUrl(state.storyId), {waitUntil: 'load'});
  await holdMotionStill(page);
  const root = page.locator('#storybook-root');
  const thumb = (which: SliderRangeThumb) =>
    root.getByRole('slider', {
      name: which === 'lower' ? LOWER_THUMB_NAME : UPPER_THUMB_NAME,
    });
  await thumb('upper').waitFor({state: 'attached'});
  return thumb;
}

async function runPair(
  page: Page,
  cdp: CDPSession,
  state: SliderRangeBindingState,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: SLIDER_MULTITHUMB_PATTERN,
    binding: BINDING,
    state: state.id,
    facts: state.facts,
    knownFailures: SLIDER_RANGE_KNOWN_FAILURES,
    mount: async () => {
      const thumb = await mountState(page, state);
      return createChromiumHarness({
        page,
        cdp,
        subject: thumb('lower'),
        related: {[UPPER_THUMB]: thumb('upper')},
      });
    },
  });
}

async function runThumb(
  page: Page,
  cdp: CDPSession,
  state: SliderRangeBindingState,
  which: SliderRangeThumb,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: SLIDER_PATTERN,
    binding: BINDING,
    state: `${state.id}:${which}`,
    facts: thumbFacts(state, which),
    knownFailures: SLIDER_RANGE_KNOWN_FAILURES,
    mount: async () => {
      const thumb = await mountState(page, state);
      return createChromiumHarness({
        page,
        cdp,
        subject: thumb(which),
        related: {},
      });
    },
  });
}

const PER_THUMB_RUNS = SLIDER_RANGE_BINDING_STATES.filter(
  state => state.perThumb,
).flatMap(state =>
  (['lower', 'upper'] as const).map(which => [state, which] as const),
);

function expectClean<Facts>(
  spec: PatternContract<Facts>,
  result: BindingResult,
) {
  const report = summarize(spec, [result]);
  // Required rows block (AST-020 FR9); advisory rows and exact known
  // failures report.
  expect(formatFailures(blockingResults([result]))).toBe('');
  expect(report.unrunLayers).toEqual([]);
  expect(report.counts.unexpectedPass).toBe(0);
}

// Each run mounts a story once per expectation, so the coverage check runs
// as one serial part per state, sharing their results, then one check over
// all of them.
test.describe('every expectation is exercised by a range Slider state', () => {
  test.describe.configure({mode: 'serial'});
  const pairs: BindingResult[] = [];
  const thumbs: BindingResult[] = [];

  for (const state of SLIDER_RANGE_BINDING_STATES) {
    test(`runs ${state.id}`, async ({page}) => {
      const cdp = await page.context().newCDPSession(page);
      const pair = await runPair(page, cdp, state);
      expectClean(SLIDER_MULTITHUMB_PATTERN, pair);
      pairs.push(pair);
      if (!state.perThumb) {
        return;
      }
      for (const which of ['lower', 'upper'] as const) {
        const result = await runThumb(page, cdp, state, which);
        expectClean(SLIDER_PATTERN, result);
        thumbs.push(result);
      }
    });
  }

  test('no expectation is left unexercised', () => {
    // Every part ran in this worker; this test alone proves nothing.
    expect(pairs.map(result => result.state).sort()).toEqual(
      SLIDER_RANGE_BINDING_STATES.map(state => state.id).sort(),
    );
    expect(thumbs.map(result => result.state).sort()).toEqual(
      PER_THUMB_RUNS.map(([state, which]) => `${state.id}:${which}`).sort(),
    );
    expect(neverExercised(pairs)).toEqual([]);
    // No range state is disabled (the `disabled-range` exclusion); the
    // single-thumb binding exercises an unavailable thumb.
    expect(neverExercised(thumbs)).toEqual([
      'slider.thumb.unavailable-keeps-value',
    ]);
    expect(
      unmatchedKnownFailures(SLIDER_RANGE_KNOWN_FAILURES, [
        ...pairs,
        ...thumbs,
      ]),
    ).toEqual([]);
  });
});
