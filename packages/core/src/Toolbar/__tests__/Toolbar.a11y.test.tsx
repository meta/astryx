// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file Toolbar.a11y.test.tsx
 * @input TOOLBAR_PATTERN bound to Toolbar's representative states
 * @output jsdom-lane proof of the DOM expectations and an honest "unrun" report for the browser layers
 * @position Binding test for Toolbar (the Chromium spec covers the rest)
 */

import {cleanup, render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {
  TOOLBAR_PATTERN,
  checkAccessibilitySpec,
  createJsdomHarness,
  expectAccessibilitySpec,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {renderToolbarState} from './Toolbar.a11y.renders';
import {
  TOOLBAR_BINDING_STATES,
  TOOLBAR_EXCLUSIONS,
  type ToolbarBindingState,
} from './Toolbar.a11y.states';

function toolbarFor(state: ToolbarBindingState): HTMLElement {
  return screen.getByRole('toolbar', {name: state.label});
}

function relatedFor(
  state: ToolbarBindingState,
): Readonly<Record<string, Element>> {
  const related: Record<string, Element> = {
    before: screen.getByRole('button', {name: 'Before the toolbar'}),
    after: screen.getByRole('button', {name: 'After the toolbar'}),
  };
  for (const [relation, name] of Object.entries(state.controls)) {
    related[relation] = screen.getByRole('button', {name});
  }
  return related;
}

async function checkState(state: ToolbarBindingState): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: TOOLBAR_PATTERN,
    binding: 'Toolbar',
    state: state.id,
    facts: state.facts,
    mount: async () => {
      render(renderToolbarState(state));
      return createJsdomHarness({
        subject: toolbarFor(state),
        related: relatedFor(state),
      });
    },
    unmount: cleanup,
  });
}

describe('Toolbar — toolbar pattern, jsdom lane', () => {
  it.each(
    TOOLBAR_BINDING_STATES.map(
      state => [state.id, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectAccessibilitySpec({
      spec: TOOLBAR_PATTERN,
      binding: 'Toolbar',
      state: state.id,
      facts: state.facts,
      render: () => {
        render(renderToolbarState(state));
      },
      subject: () => toolbarFor(state),
      related: () => relatedFor(state),
      cleanup,
    });
  });

  it('runs the DOM layer and reports the browser-owned outcomes as unrun', async () => {
    const results: BindingResult[] = [];
    for (const state of TOOLBAR_BINDING_STATES) {
      results.push(await checkState(state));
    }
    const report = summarize(TOOLBAR_PATTERN, results);
    expect(report.counts.pass).toBeGreaterThan(0);
    expect(report.unrunLayers).toEqual(['accessibility-tree', 'real-browser']);
    expect(report.counts.unexpectedPass).toBe(0);
  });
});

describe('toolbar binding inventory', () => {
  it('gives every representative state a distinct checked-in story', () => {
    const stories = TOOLBAR_BINDING_STATES.map(state => state.storyId);
    expect(new Set(stories).size).toBe(stories.length);
  });

  it('keeps control semantics, editing and popover keys, the three-lane layout, and outer chrome explicit', () => {
    expect(TOOLBAR_EXCLUSIONS.map(row => row.id)).toEqual([
      'control-semantics',
      'caret-guard-and-nested-popovers',
      'three-lane-layout',
      'outer-chrome',
    ]);
    for (const exclusion of TOOLBAR_EXCLUSIONS) {
      expect(exclusion.owner.length, exclusion.id).toBeGreaterThan(20);
      expect(exclusion.reason.length, exclusion.id).toBeGreaterThan(80);
    }
  });

  it('renders the toolbar and every control relation it names for every state', () => {
    for (const state of TOOLBAR_BINDING_STATES) {
      render(renderToolbarState(state));
      const toolbar = toolbarFor(state);
      for (const name of Object.values(state.controls)) {
        expect(
          toolbar.contains(screen.getByRole('button', {name})),
          `${state.id}: ${name}`,
        ).toBe(true);
      }
      cleanup();
    }
  });
});
