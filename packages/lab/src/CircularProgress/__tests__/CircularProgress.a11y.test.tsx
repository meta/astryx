// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file CircularProgress.a11y.test.tsx
 * @input PROGRESSBAR_PATTERN bound to CircularProgress's representative states
 * @output jsdom-lane proof of the DOM expectations and an honest "unrun" report for the browser layers
 * @position Binding test for the CircularProgress binding (the Chromium spec covers the rest)
 */

import {cleanup, render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {
  PROGRESSBAR_PATTERN,
  checkAccessibilitySpec,
  createJsdomHarness,
  expectAccessibilitySpec,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {CIRCULAR_PROGRESS_KNOWN_FAILURES} from './CircularProgress.a11y.known-failures';
import {renderCircularProgressState} from './CircularProgress.a11y.renders';
import {
  CIRCULAR_PROGRESS_BINDING_STATES,
  CIRCULAR_PROGRESS_EXCLUSIONS,
  type CircularProgressBindingState,
} from './CircularProgress.a11y.states';

function progressbar(state: CircularProgressBindingState): HTMLElement {
  return screen.getByRole('progressbar', {name: state.facts.name});
}

async function checkState(
  state: CircularProgressBindingState,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: PROGRESSBAR_PATTERN,
    binding: 'CircularProgress',
    state: state.id,
    facts: state.facts,
    knownFailures: CIRCULAR_PROGRESS_KNOWN_FAILURES,
    mount: async () => {
      render(renderCircularProgressState(state));
      return createJsdomHarness({subject: progressbar(state), related: {}});
    },
    unmount: cleanup,
  });
}

describe('CircularProgress — progressbar pattern, jsdom lane', () => {
  it.each(
    CIRCULAR_PROGRESS_BINDING_STATES.map(
      state => [state.id, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectAccessibilitySpec({
      spec: PROGRESSBAR_PATTERN,
      binding: 'CircularProgress',
      state: state.id,
      facts: state.facts,
      knownFailures: CIRCULAR_PROGRESS_KNOWN_FAILURES,
      render: () => {
        render(renderCircularProgressState(state));
      },
      subject: () => progressbar(state),
      related: () => ({}),
      cleanup,
    });
  });

  it('runs the DOM layer and reports the browser-owned outcomes as unrun', async () => {
    const results: BindingResult[] = [];
    for (const state of CIRCULAR_PROGRESS_BINDING_STATES) {
      results.push(await checkState(state));
    }
    const report = summarize(PROGRESSBAR_PATTERN, results);
    expect(report.counts.pass).toBeGreaterThan(0);
    expect(report.unrunLayers).toEqual(['accessibility-tree']);
    expect(report.counts.unexpectedPass).toBe(0);
  });
});

describe('CircularProgress binding inventory', () => {
  it('gives every representative state a distinct checked-in story', () => {
    const stories = CIRCULAR_PROGRESS_BINDING_STATES.map(
      state => state.storyId,
    );
    expect(new Set(stories).size).toBe(stories.length);
  });

  it('keeps clamping and ring-geometry ownership explicit', () => {
    expect(CIRCULAR_PROGRESS_EXCLUSIONS.map(exclusion => exclusion.id)).toEqual(
      ['value-clamping', 'ring-geometry'],
    );
    for (const exclusion of CIRCULAR_PROGRESS_EXCLUSIONS) {
      expect(exclusion.owner.length, exclusion.id).toBeGreaterThan(20);
      expect(exclusion.reason.length, exclusion.id).toBeGreaterThan(80);
    }
  });

  it('renders exactly one named progress bar for every state', () => {
    for (const state of CIRCULAR_PROGRESS_BINDING_STATES) {
      render(renderCircularProgressState(state));
      expect(progressbar(state), state.id).toBeTruthy();
      cleanup();
    }
  });
});
