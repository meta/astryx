// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file Tabs.a11y.test.tsx
 * @input Uses the shared Tabs contract and complete explicit-Tabs binding inventory
 * @output DOM-layer binding evidence; browser-owned outcomes remain explicitly unrun
 * @position Fast migration lane for TabList, Tab, and caller-authored panel composition.
 */

import {cleanup, render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {
  TABS_PATTERN,
  checkAccessibilitySpec,
  createJsdomHarness,
  expectAccessibilitySpec,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {TABS_KNOWN_FAILURES} from './Tabs.a11y.known-failures';
import {TABS_STATE_RENDERS} from './Tabs.a11y.renders';
import {
  TABS_BINDING_STATES,
  TABS_EXCLUSIONS,
  type TabsBindingRow,
} from './Tabs.a11y.states';

function subjectFor(state: TabsBindingRow): Element {
  if ('selector' in state.subject) {
    const element = document.querySelector(state.subject.selector);
    if (element == null) {
      throw new Error(`no subject for ${state.id}`);
    }
    return element;
  }
  return screen.getByRole(state.subject.role, {
    name: state.subject.name,
    hidden: true,
  });
}

function relatedFor(state: TabsBindingRow): Readonly<Record<string, Element>> {
  return Object.fromEntries(
    Object.entries(state.relations ?? {}).map(([name, relation]) => {
      const element = document.querySelector(relation.selector);
      if (element == null) {
        throw new Error(`no related subject "${name}" for ${state.id}`);
      }
      return [name, element];
    }),
  );
}

async function expectState(state: TabsBindingRow): Promise<void> {
  await expectAccessibilitySpec({
    spec: TABS_PATTERN,
    binding: state.binding,
    state: state.id,
    facts: state.facts,
    knownFailures: TABS_KNOWN_FAILURES,
    render: () => {
      render(TABS_STATE_RENDERS[state.id]());
    },
    subject: () => subjectFor(state),
    related: () => relatedFor(state),
    cleanup,
  });
}

async function checkState(state: TabsBindingRow): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: TABS_PATTERN,
    binding: state.binding,
    state: state.id,
    facts: state.facts,
    knownFailures: TABS_KNOWN_FAILURES,
    mount: async () => {
      render(TABS_STATE_RENDERS[state.id]());
      return createJsdomHarness({
        subject: subjectFor(state),
        related: relatedFor(state),
      });
    },
    unmount: cleanup,
  });
}

describe('the shared Tabs pattern, jsdom lane', () => {
  it.each(
    TABS_BINDING_STATES.map(
      state =>
        [`${state.binding} [${state.id}]`, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectState(state);
  });

  it('runs the DOM layer and reports higher layers as unrun', async () => {
    const results: BindingResult[] = [];
    for (const state of TABS_BINDING_STATES) {
      results.push(await checkState(state));
    }
    const report = summarize(TABS_PATTERN, results);
    expect(report.counts.pass).toBeGreaterThan(0);
    expect(report.unrunLayers).toEqual(['accessibility-tree', 'real-browser']);
    expect(report.counts.unexpectedPass).toBe(0);
  });
});

describe('the explicit Tabs binding inventory', () => {
  it('names a distinct checked-in story for every state', () => {
    const ids = TABS_BINDING_STATES.map(state => state.storyId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('binds TabList, Tab, and caller-authored panel composition', () => {
    expect(
      [...new Set(TABS_BINDING_STATES.map(state => state.binding))].sort(),
    ).toEqual(['Tab', 'TabList', 'TabsComposition']);
  });

  it('records excluded and unsettled surfaces explicitly', () => {
    expect(TABS_EXCLUSIONS.map(row => row.classification)).toEqual([
      'out-of-scope',
      'out-of-scope',
      'out-of-scope',
      'preserved',
      'needs-human',
      'needs-human',
      'needs-human',
    ]);
    expect(TABS_EXCLUSIONS.every(row => row.reason.length > 0)).toBe(true);
  });

  it('binds only explicit horizontal manual-activation Tabs', () => {
    const wrong = TABS_BINDING_STATES.filter(state => {
      if (state.facts.part !== 'tablist') {
        return false;
      }
      return !state.facts.manualActivation;
    });
    expect(wrong).toEqual([]);
  });

  it('renders exactly one subject for every state', () => {
    for (const state of TABS_BINDING_STATES) {
      render(TABS_STATE_RENDERS[state.id]());
      expect(subjectFor(state), state.id).toBeTruthy();
      cleanup();
    }
  });
});
