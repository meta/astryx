// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file ProgressBar.a11y.test.tsx
 * @input PROGRESSBAR_PATTERN bound to ProgressBar's representative states
 * @output jsdom-lane proof of the DOM expectations and an honest "unrun" report for the browser layers
 * @position Binding test for the ProgressBar binding (the Chromium spec covers the rest)
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
import {PROGRESSBAR_KNOWN_FAILURES} from './ProgressBar.a11y.known-failures';
import {renderProgressBarState} from './ProgressBar.a11y.renders';
import {
  PROGRESSBAR_BINDING_STATES,
  PROGRESSBAR_EXCLUSIONS,
  type ProgressBarBindingState,
} from './ProgressBar.a11y.states';

function progressbar(state: ProgressBarBindingState): HTMLElement {
  return screen.getByRole('progressbar', {name: state.facts.name});
}

async function checkState(
  state: ProgressBarBindingState,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: PROGRESSBAR_PATTERN,
    binding: 'ProgressBar',
    state: state.id,
    facts: state.facts,
    knownFailures: PROGRESSBAR_KNOWN_FAILURES,
    mount: async () => {
      render(renderProgressBarState(state));
      return createJsdomHarness({subject: progressbar(state), related: {}});
    },
    unmount: cleanup,
  });
}

describe('ProgressBar — progressbar pattern, jsdom lane', () => {
  it.each(
    PROGRESSBAR_BINDING_STATES.map(
      state => [state.id, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectAccessibilitySpec({
      spec: PROGRESSBAR_PATTERN,
      binding: 'ProgressBar',
      state: state.id,
      facts: state.facts,
      knownFailures: PROGRESSBAR_KNOWN_FAILURES,
      render: () => {
        render(renderProgressBarState(state));
      },
      subject: () => progressbar(state),
      related: () => ({}),
      cleanup,
    });
  });

  it('runs the DOM layer and reports the browser-owned outcomes as unrun', async () => {
    const results: BindingResult[] = [];
    for (const state of PROGRESSBAR_BINDING_STATES) {
      results.push(await checkState(state));
    }
    const report = summarize(PROGRESSBAR_PATTERN, results);
    expect(report.counts.pass).toBeGreaterThan(0);
    expect(report.unrunLayers).toEqual(['accessibility-tree']);
    expect(report.counts.unexpectedPass).toBe(0);
  });
});

describe('ProgressBar binding inventory', () => {
  it('gives every representative state a distinct checked-in story', () => {
    const stories = PROGRESSBAR_BINDING_STATES.map(state => state.storyId);
    expect(new Set(stories).size).toBe(stories.length);
  });

  it('keeps clamping and mark-trigger ownership explicit', () => {
    expect(PROGRESSBAR_EXCLUSIONS.map(exclusion => exclusion.id)).toEqual([
      'value-clamping',
      'mark-trigger',
    ]);
    for (const exclusion of PROGRESSBAR_EXCLUSIONS) {
      expect(exclusion.owner.length, exclusion.id).toBeGreaterThan(20);
      expect(exclusion.reason.length, exclusion.id).toBeGreaterThan(80);
    }
  });

  it('renders exactly one named progress bar for every state', () => {
    for (const state of PROGRESSBAR_BINDING_STATES) {
      render(renderProgressBarState(state));
      expect(progressbar(state), state.id).toBeTruthy();
      cleanup();
    }
  });
});
