// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file Checkbox.a11y.test.tsx
 * @input Uses the shared checkbox contract, the jsdom harness, and the complete
 *   binding inventory and render map.
 * @output DOM-layer binding evidence for CheckboxInput, CheckboxListItem,
 *   DropdownMenuCheckboxItem, and SelectableCard.
 * @position Fast migration lane. Browser-owned outcomes remain explicitly unrun.
 */

import {describe, expect, it} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';
import {
  CHECKBOX_PATTERN,
  checkAccessibilitySpec,
  createJsdomHarness,
  expectAccessibilitySpec,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {CHECKBOX_KNOWN_FAILURES} from './Checkbox.a11y.known-failures';
import {CHECKBOX_STATE_RENDERS} from './Checkbox.a11y.renders';
import {
  CHECKBOX_BINDING_STATES,
  CHECKBOX_CALLEE_EXCLUSIONS,
  type CheckboxBindingRow,
} from './Checkbox.a11y.states';

function subjectFor(state: CheckboxBindingRow): Element {
  return screen.getByRole(state.facts.role, {hidden: true});
}

async function expectState(state: CheckboxBindingRow): Promise<void> {
  await expectAccessibilitySpec({
    spec: CHECKBOX_PATTERN,
    binding: state.binding,
    state: state.id,
    facts: state.facts,
    knownFailures: CHECKBOX_KNOWN_FAILURES,
    render: () => {
      render(CHECKBOX_STATE_RENDERS[state.id]());
    },
    subject: () => subjectFor(state),
    cleanup,
  });
}

async function checkState(state: CheckboxBindingRow): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: CHECKBOX_PATTERN,
    binding: state.binding,
    state: state.id,
    facts: state.facts,
    knownFailures: CHECKBOX_KNOWN_FAILURES,
    mount: async () => {
      render(CHECKBOX_STATE_RENDERS[state.id]());
      return createJsdomHarness({subject: subjectFor(state)});
    },
    unmount: cleanup,
  });
}

describe('the shared checkbox pattern, jsdom lane', () => {
  it.each(
    CHECKBOX_BINDING_STATES.map(
      state =>
        [`${state.binding} [${state.id}]`, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectState(state);
  });

  it('runs the DOM layer here and reports higher layers as unrun', async () => {
    const results: BindingResult[] = [];
    for (const state of CHECKBOX_BINDING_STATES) {
      results.push(await checkState(state));
    }
    const report = summarize(CHECKBOX_PATTERN, results);
    expect(report.counts.pass).toBeGreaterThan(0);
    expect(report.unrunLayers).toEqual(['accessibility-tree', 'real-browser']);
    expect(report.counts.unexpectedPass).toBe(0);
  });
});

describe('the checkbox binding inventory', () => {
  it('names a distinct checked-in story for every state', () => {
    const ids = CHECKBOX_BINDING_STATES.map(state => state.storyId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('binds every checkbox-bearing public part with its own semantics', () => {
    const bound = new Set(CHECKBOX_BINDING_STATES.map(state => state.binding));
    expect([...bound].sort()).toEqual([
      'CheckboxInput',
      'CheckboxListItem',
      'DropdownMenuCheckboxItem',
      'SelectableCard',
    ]);
  });

  it('records composed and decorative CheckboxInput callsites explicitly', () => {
    expect(CHECKBOX_CALLEE_EXCLUSIONS).toEqual([
      expect.objectContaining({
        owner: 'Table selection',
        part: 'CheckboxInput',
      }),
      expect.objectContaining({
        owner: 'MultiSelector option decoration',
        part: 'CheckboxInput',
      }),
    ]);
    expect(
      CHECKBOX_CALLEE_EXCLUSIONS.every(
        exclusion => exclusion.reason.length > 0,
      ),
    ).toBe(true);
  });

  it('renders exactly one role-bearing subject for every state', () => {
    for (const state of CHECKBOX_BINDING_STATES) {
      render(CHECKBOX_STATE_RENDERS[state.id]());
      expect(subjectFor(state), state.id).toBeTruthy();
      cleanup();
    }
  });
});
