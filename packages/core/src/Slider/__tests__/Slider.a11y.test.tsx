// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file Slider.a11y.test.tsx
 * @input SLIDER_PATTERN bound to Slider's representative states
 * @output jsdom-lane proof of the DOM expectations and an honest "unrun" report for the browser layers
 * @position Binding test for component:Slider AR1 (the Chromium spec covers the rest)
 */

import {cleanup, render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {
  SLIDER_PATTERN,
  checkAccessibilitySpec,
  createJsdomHarness,
  expectAccessibilitySpec,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {SLIDER_KNOWN_FAILURES} from './Slider.a11y.known-failures';
import {renderSliderState} from './Slider.a11y.renders';
import {
  SLIDER_BINDING_STATES,
  SLIDER_EXCLUSIONS,
  type SliderBindingState,
} from './Slider.a11y.states';

function thumb(state: SliderBindingState): HTMLElement {
  return screen.getByRole('slider', {name: state.label});
}

async function checkState(state: SliderBindingState): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: SLIDER_PATTERN,
    binding: 'Slider',
    state: state.id,
    facts: state.facts,
    knownFailures: SLIDER_KNOWN_FAILURES,
    mount: async () => {
      render(renderSliderState(state));
      return createJsdomHarness({subject: thumb(state), related: {}});
    },
    unmount: cleanup,
  });
}

describe('Slider — slider pattern, jsdom lane', () => {
  it.each(
    SLIDER_BINDING_STATES.map(
      state => [state.id, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectAccessibilitySpec({
      spec: SLIDER_PATTERN,
      binding: 'Slider',
      state: state.id,
      facts: state.facts,
      knownFailures: SLIDER_KNOWN_FAILURES,
      render: () => {
        render(renderSliderState(state));
      },
      subject: () => thumb(state),
      related: () => ({}),
      cleanup,
    });
  });

  it('runs the DOM layer and reports the browser-owned outcomes as unrun', async () => {
    const results: BindingResult[] = [];
    for (const state of SLIDER_BINDING_STATES) {
      results.push(await checkState(state));
    }
    const report = summarize(SLIDER_PATTERN, results);
    expect(report.counts.pass).toBeGreaterThan(0);
    expect(report.unrunLayers).toEqual(['accessibility-tree', 'real-browser']);
    expect(report.counts.unexpectedPass).toBe(0);
  });
});

describe('Slider binding inventory', () => {
  it('gives every representative state a distinct checked-in story', () => {
    const stories = SLIDER_BINDING_STATES.map(state => state.storyId);
    expect(new Set(stories).size).toBe(stories.length);
  });

  it('keeps range coupling and pointer ownership explicit', () => {
    expect(SLIDER_EXCLUSIONS.map(exclusion => exclusion.id)).toEqual([
      'range-thumb-separation',
      'pointer-drag-model',
    ]);
    for (const exclusion of SLIDER_EXCLUSIONS) {
      expect(exclusion.owner.length, exclusion.id).toBeGreaterThan(20);
      expect(exclusion.reason.length, exclusion.id).toBeGreaterThan(80);
    }
  });

  it('renders exactly one named thumb for every state', () => {
    for (const state of SLIDER_BINDING_STATES) {
      render(renderSliderState(state));
      expect(thumb(state), state.id).toBeTruthy();
      cleanup();
    }
  });
});
