// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file ToggleButton.a11y.test.tsx
 * @input Uses ToggleButton renderings and the reusable toggle-button contract
 * @output DOM evidence for every ToggleButton binding state
 * @position Component binding; browser-owned outcomes run in the Chromium lane.
 */

import {cleanup, render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {
  TOGGLE_BUTTON_PATTERN,
  checkAccessibilitySpec,
  createJsdomHarness,
  expectAccessibilitySpec,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {TOGGLE_BUTTON_STATE_RENDERS} from './ToggleButton.a11y.renders';
import {
  TOGGLE_BUTTON_BINDING_STATES,
  TOGGLE_BUTTON_PATTERN_EXCLUSIONS,
  type ToggleButtonBindingRow,
} from './ToggleButton.a11y.states';

function subjectFor(): Element {
  return screen.getByRole('button', {hidden: true});
}

async function expectState(state: ToggleButtonBindingRow): Promise<void> {
  await expectAccessibilitySpec({
    spec: TOGGLE_BUTTON_PATTERN,
    binding: 'ToggleButton',
    state: state.id,
    facts: state.facts,
    render: () => {
      render(TOGGLE_BUTTON_STATE_RENDERS[state.id]());
    },
    subject: subjectFor,
    cleanup,
  });
}

async function checkState(
  state: ToggleButtonBindingRow,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: TOGGLE_BUTTON_PATTERN,
    binding: 'ToggleButton',
    state: state.id,
    facts: state.facts,
    mount: async () => {
      render(TOGGLE_BUTTON_STATE_RENDERS[state.id]());
      return createJsdomHarness({subject: subjectFor()});
    },
    unmount: cleanup,
  });
}

describe('ToggleButton — toggle-button pattern, jsdom lane', () => {
  it.each(
    TOGGLE_BUTTON_BINDING_STATES.map(
      state => [state.id, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => expectState(state));

  it('runs DOM evidence and reports browser-owned layers as unrun', async () => {
    const results: BindingResult[] = [];
    for (const state of TOGGLE_BUTTON_BINDING_STATES) {
      results.push(await checkState(state));
    }
    const report = summarize(TOGGLE_BUTTON_PATTERN, results);
    expect(report.counts.pass).toBeGreaterThan(0);
    expect(report.unrunLayers).toEqual(['accessibility-tree', 'real-browser']);
    expect(report.counts.unexpectedPass).toBe(0);
  });
});

describe('ToggleButton binding inventory', () => {
  it('retains disabled ownership through both member and group paths', () => {
    expect(TOGGLE_BUTTON_BINDING_STATES.map(state => state.id)).toEqual(
      expect.arrayContaining([
        'single-group-member-disabled',
        'single-group-disabled-member-silent',
      ]),
    );
  });

  it('gives every representative state a distinct story', () => {
    const stories = TOGGLE_BUTTON_BINDING_STATES.map(state => state.storyId);
    expect(new Set(stories).size).toBe(stories.length);
  });

  it('keeps adjacent owners explicit', () => {
    expect(TOGGLE_BUTTON_PATTERN_EXCLUSIONS.map(row => row.id)).toEqual([
      'group-semantics',
      'pending-action-semantics',
      'rendered-appearance',
    ]);
  });
});
