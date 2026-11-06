// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file RadioGroup.a11y.test.tsx
 * @input Uses the shared radio-group contract and complete binding inventory
 * @output DOM-layer binding evidence for direct and menu radio-group parts
 * @position Fast migration lane; browser-owned outcomes remain explicitly unrun.
 */

import {cleanup, render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {
  RADIO_GROUP_PATTERN,
  expectAccessibilitySpec,
  summarize,
  unmatchedKnownFailures,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {RADIO_GROUP_KNOWN_FAILURES} from './RadioGroup.a11y.known-failures';
import {RADIO_GROUP_STATE_RENDERS} from './RadioGroup.a11y.renders';
import {
  RADIO_GROUP_BINDING_STATES,
  RADIO_GROUP_EXCLUSIONS,
  type RadioGroupBindingRow,
} from './RadioGroup.a11y.states';

function subjectFor(state: RadioGroupBindingRow): Element {
  return screen.getByRole(state.facts.role, {
    name: state.subjectName,
    hidden: true,
  });
}

async function expectState(
  state: RadioGroupBindingRow,
): Promise<BindingResult> {
  return expectAccessibilitySpec({
    spec: RADIO_GROUP_PATTERN,
    binding: state.binding,
    state: state.id,
    facts: state.facts,
    knownFailures: RADIO_GROUP_KNOWN_FAILURES,
    render: () => {
      render(RADIO_GROUP_STATE_RENDERS[state.id]());
    },
    subject: () => subjectFor(state),
    cleanup,
  });
}

describe('the shared radio-group pattern, jsdom lane', () => {
  // Each state renders and checks once. The summary reads these results, so
  // the suite does not check every state a second time in one long test.
  const results: BindingResult[] = [];

  it.each(
    RADIO_GROUP_BINDING_STATES.map(
      state =>
        [`${state.binding} [${state.id}]`, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    results.push(await expectState(state));
  });

  it('runs the DOM layer and reports higher layers as unrun', () => {
    expect(results.map(result => result.state)).toEqual(
      RADIO_GROUP_BINDING_STATES.map(state => state.id),
    );
    const report = summarize(RADIO_GROUP_PATTERN, results);
    expect(report.counts.pass).toBeGreaterThan(0);
    expect(report.unrunLayers).toEqual(['accessibility-tree', 'real-browser']);
    expect(report.counts.unexpectedPass).toBe(0);
    expect(unmatchedKnownFailures(RADIO_GROUP_KNOWN_FAILURES, results)).toEqual(
      [],
    );
  });
});

describe('the radio-group binding inventory', () => {
  it('names a distinct checked-in story for every state', () => {
    const ids = RADIO_GROUP_BINDING_STATES.map(state => state.storyId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('binds every current direct and menu radio-group part', () => {
    const bound = new Set(
      RADIO_GROUP_BINDING_STATES.map(state => state.binding),
    );
    expect([...bound].sort()).toEqual([
      'DropdownMenuRadioGroup',
      'DropdownMenuRadioItem',
      'Pagination dot',
      'Pagination dots',
      'RadioList',
      'RadioListItem',
      'SegmentedControl',
      'SegmentedControlItem',
    ]);
  });

  it('records role-conditional and delegated surfaces explicitly', () => {
    expect(
      RADIO_GROUP_EXCLUSIONS.map(({owner, classification}) => ({
        owner,
        classification,
      })),
    ).toEqual([
      {
        owner: 'SelectableCard in independent or multi-select composition',
        classification: 'preserved',
      },
      {
        owner: 'SelectableCard in caller-managed single-select composition',
        classification: 'needs-human',
      },
      {
        owner: 'DropdownMenu and ContextMenu radio-item movement',
        classification: 'out-of-scope',
      },
      {
        owner: 'TabMenu overflow choices',
        classification: 'out-of-scope',
      },
      {
        owner: 'Home and End keyboard shortcuts',
        classification: 'out-of-scope',
      },
    ]);
    expect(RADIO_GROUP_EXCLUSIONS.every(row => row.reason.length > 0)).toBe(
      true,
    );
  });

  it('locks interaction ownership instead of letting bindings opt out', () => {
    const wrong: string[] = [];
    for (const state of RADIO_GROUP_BINDING_STATES) {
      const facts = state.facts;
      if (facts.part === 'group' && facts.role === 'radiogroup') {
        for (const fact of [
          'spaceSelection',
          'pointerSelection',
          'arrowSelection',
        ] as const) {
          if (facts[fact] !== facts.operable) {
            wrong.push(
              `${state.id}: direct-group ${fact}=${facts[fact]} but operable=${facts.operable}`,
            );
          }
        }
        if (facts.arrowSelection && facts.movement === 'none') {
          wrong.push(`${state.id}: owns arrows without a movement model`);
        }
      } else if (facts.part === 'group') {
        if (
          facts.spaceSelection ||
          facts.arrowSelection ||
          facts.movement !== 'none'
        ) {
          wrong.push(`${state.id}: menu-owned keyboard behavior leaked in`);
        }
        if (facts.pointerSelection !== facts.operable) {
          wrong.push(
            `${state.id}: menu pointerSelection=${facts.pointerSelection} but operable=${facts.operable}`,
          );
        }
      } else {
        if (
          facts.spaceSelection ||
          facts.pointerSelection ||
          facts.arrowSelection
        ) {
          wrong.push(`${state.id}: option row claims group-level interaction`);
        }
        if (facts.pointerCancellation !== facts.operable) {
          wrong.push(
            `${state.id}: pointerCancellation=${facts.pointerCancellation} but operable=${facts.operable}`,
          );
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('locks which bindings expose a visible label for the bound subject', () => {
    const wrong = RADIO_GROUP_BINDING_STATES.filter(state => {
      const expected =
        state.binding !== 'SegmentedControl' &&
        state.binding !== 'DropdownMenuRadioGroup' &&
        state.binding !== 'Pagination dots' &&
        state.binding !== 'Pagination dot' &&
        state.id !== 'segmented-option-selected-hidden-label';
      return state.facts.visibleLabel !== expected;
    }).map(state => state.id);
    expect(wrong).toEqual([]);
  });

  it('renders exactly one named subject for every state', () => {
    for (const state of RADIO_GROUP_BINDING_STATES) {
      render(RADIO_GROUP_STATE_RENDERS[state.id]());
      expect(subjectFor(state), state.id).toBeTruthy();
      cleanup();
    }
  });
});
