// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file SliderRange.a11y.test.tsx
 * @input SLIDER_MULTITHUMB_PATTERN bound to range Slider's representative states, and SLIDER_PATTERN bound to each of their thumbs
 * @output jsdom-lane proof of the DOM expectations and an honest "unrun" report for the browser layers
 * @position Binding test for component:Slider AR1 in range mode (the Chromium spec covers the rest)
 */

import {cleanup, render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {
  SLIDER_MULTITHUMB_PATTERN,
  SLIDER_PATTERN,
  UPPER_THUMB,
  checkAccessibilitySpec,
  createJsdomHarness,
  expectAccessibilitySpec,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {SLIDER_RANGE_KNOWN_FAILURES} from './SliderRange.a11y.known-failures';
import {renderSliderRangeState} from './SliderRange.a11y.renders';
import {
  LOWER_THUMB_NAME,
  SLIDER_RANGE_BINDING_STATES,
  SLIDER_RANGE_EXCLUSIONS,
  UPPER_THUMB_NAME,
  thumbFacts,
  type SliderRangeBindingState,
  type SliderRangeThumb,
} from './SliderRange.a11y.states';

const BINDING = 'Slider (range)';

function thumb(which: SliderRangeThumb): HTMLElement {
  return screen.getByRole('slider', {
    name: which === 'lower' ? LOWER_THUMB_NAME : UPPER_THUMB_NAME,
  });
}

const PER_THUMB_RUNS = SLIDER_RANGE_BINDING_STATES.filter(
  state => state.perThumb,
).flatMap(state =>
  (['lower', 'upper'] as const).map(which => [state, which] as const),
);

async function checkPair(
  state: SliderRangeBindingState,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: SLIDER_MULTITHUMB_PATTERN,
    binding: BINDING,
    state: state.id,
    facts: state.facts,
    knownFailures: SLIDER_RANGE_KNOWN_FAILURES,
    mount: async () => {
      render(renderSliderRangeState(state));
      return createJsdomHarness({
        subject: thumb('lower'),
        related: {[UPPER_THUMB]: thumb('upper')},
      });
    },
    unmount: cleanup,
  });
}

describe('Slider (range) — multi-thumb slider pattern, jsdom lane', () => {
  it.each(
    SLIDER_RANGE_BINDING_STATES.map(
      state => [state.id, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectAccessibilitySpec({
      spec: SLIDER_MULTITHUMB_PATTERN,
      binding: BINDING,
      state: state.id,
      facts: state.facts,
      knownFailures: SLIDER_RANGE_KNOWN_FAILURES,
      render: () => {
        render(renderSliderRangeState(state));
      },
      subject: () => thumb('lower'),
      related: () => ({[UPPER_THUMB]: thumb('upper')}),
      cleanup,
    });
  });

  it('runs the DOM layer and reports the browser-owned outcomes as unrun', async () => {
    const results: BindingResult[] = [];
    for (const state of SLIDER_RANGE_BINDING_STATES) {
      results.push(await checkPair(state));
    }
    const report = summarize(SLIDER_MULTITHUMB_PATTERN, results);
    expect(report.counts.pass).toBeGreaterThan(0);
    expect(report.unrunLayers).toEqual(['accessibility-tree', 'real-browser']);
    expect(report.counts.unexpectedPass).toBe(0);
  });
});

describe('Slider (range) — slider pattern on each thumb, jsdom lane', () => {
  it.each(
    PER_THUMB_RUNS.map(
      ([state, which]) => [`${state.id}:${which}`, state, which] as const,
    ),
  )('%s', async (_id, state, which) => {
    await expectAccessibilitySpec({
      spec: SLIDER_PATTERN,
      binding: BINDING,
      state: `${state.id}:${which}`,
      facts: thumbFacts(state, which),
      knownFailures: SLIDER_RANGE_KNOWN_FAILURES,
      render: () => {
        render(renderSliderRangeState(state));
      },
      subject: () => thumb(which),
      related: () => ({}),
      cleanup,
    });
  });
});

describe('Slider (range) binding inventory', () => {
  it('gives every representative state a distinct checked-in story', () => {
    const stories = SLIDER_RANGE_BINDING_STATES.map(state => state.storyId);
    expect(new Set(stories).size).toBe(stories.length);
  });

  it('keeps group, disabled-range and pointer ownership explicit', () => {
    expect(SLIDER_RANGE_EXCLUSIONS.map(exclusion => exclusion.id)).toEqual([
      'group-semantics',
      'disabled-range',
      'pointer-drag-model',
    ]);
    for (const exclusion of SLIDER_RANGE_EXCLUSIONS) {
      expect(exclusion.owner.length, exclusion.id).toBeGreaterThan(20);
      expect(exclusion.reason.length, exclusion.id).toBeGreaterThan(80);
    }
  });

  it('declares a separation that matches minStepsBetweenThumbs', () => {
    for (const state of SLIDER_RANGE_BINDING_STATES) {
      expect(state.facts.separation, state.id).toBe(
        state.minStepsBetweenThumbs * state.facts.step,
      );
    }
  });

  it('renders exactly two named thumbs for every state', () => {
    for (const state of SLIDER_RANGE_BINDING_STATES) {
      render(renderSliderRangeState(state));
      expect(screen.getAllByRole('slider'), state.id).toHaveLength(2);
      expect(thumb('lower'), state.id).toBeTruthy();
      expect(thumb('upper'), state.id).toBeTruthy();
      cleanup();
    }
  });
});
