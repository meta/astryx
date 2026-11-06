// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file CollapsibleGroup.a11y.test.tsx
 * @input ACCORDION_PATTERN bound to CollapsibleGroup's representative states
 * @output jsdom-lane proof of the DOM expectations and an honest "unrun" report for the browser layers
 * @position Binding test for component:CollapsibleGroup AR4 (the Chromium spec covers the rest)
 */

import {cleanup, render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {
  ACCORDION_PATTERN,
  checkAccessibilitySpec,
  createJsdomHarness,
  expectAccessibilitySpec,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {renderAccordionState} from './CollapsibleGroup.a11y.renders';
import {
  COLLAPSIBLE_GROUP_ACCORDION_EXCLUSIONS,
  COLLAPSIBLE_GROUP_ACCORDION_STATES,
  type CollapsibleGroupAccordionState,
} from './CollapsibleGroup.a11y.states';

function header(label: string): HTMLElement {
  return screen.getByRole('button', {name: label});
}

function panelFor(subject: HTMLElement, id: string): HTMLElement {
  const controls = subject.getAttribute('aria-controls');
  const panel = controls == null ? null : document.getElementById(controls);
  if (panel == null) {
    throw new Error(`CollapsibleGroup state "${id}" has no controlled panel`);
  }
  return panel;
}

function relatedFor(
  state: CollapsibleGroupAccordionState,
): Readonly<Record<string, Element>> {
  const subject = header(state.label);
  const related: Record<string, Element> = {
    panel: panelFor(subject, state.id),
  };
  if (state.nextLabel != null) {
    related['next-header'] = header(state.nextLabel);
  }
  if (state.openSiblingLabel != null) {
    related['open-sibling'] = header(state.openSiblingLabel);
  }
  return related;
}

async function checkState(
  state: CollapsibleGroupAccordionState,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: ACCORDION_PATTERN,
    binding: 'CollapsibleGroup.header',
    state: state.id,
    facts: state.facts,
    mount: async () => {
      render(renderAccordionState(state));
      return createJsdomHarness({
        subject: header(state.label),
        related: relatedFor(state),
      });
    },
    unmount: cleanup,
  });
}

describe('CollapsibleGroup.header — accordion pattern, jsdom lane', () => {
  it.each(
    COLLAPSIBLE_GROUP_ACCORDION_STATES.map(
      state => [state.id, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectAccessibilitySpec({
      spec: ACCORDION_PATTERN,
      binding: 'CollapsibleGroup.header',
      state: state.id,
      facts: state.facts,
      render: () => {
        render(renderAccordionState(state));
      },
      subject: () => header(state.label),
      related: () => relatedFor(state),
      cleanup,
    });
  });

  it('runs the DOM layer and reports the browser-owned outcomes as unrun', async () => {
    const results: BindingResult[] = [];
    for (const state of COLLAPSIBLE_GROUP_ACCORDION_STATES) {
      results.push(await checkState(state));
    }
    const report = summarize(ACCORDION_PATTERN, results);
    expect(report.counts.pass).toBeGreaterThan(0);
    expect(report.unrunLayers).toEqual(['accessibility-tree', 'real-browser']);
    expect(report.counts.unexpectedPass).toBe(0);
  });
});

describe('CollapsibleGroup accordion binding inventory', () => {
  it('gives every representative state a distinct checked-in story', () => {
    const stories = COLLAPSIBLE_GROUP_ACCORDION_STATES.map(
      state => state.storyId,
    );
    expect(new Set(stories).size).toBe(stories.length);
  });

  it('keeps disclosure and page ownership explicit', () => {
    expect(COLLAPSIBLE_GROUP_ACCORDION_EXCLUSIONS.map(row => row.id)).toEqual([
      'collapsible-disclosure-semantics',
      'heading-wrapper-and-region-panels',
    ]);
    for (const exclusion of COLLAPSIBLE_GROUP_ACCORDION_EXCLUSIONS) {
      expect(exclusion.owner.length, exclusion.id).toBeGreaterThan(20);
      expect(exclusion.reason.length, exclusion.id).toBeGreaterThan(80);
    }
  });

  it('renders exactly one subject header and its relations for every state', () => {
    for (const state of COLLAPSIBLE_GROUP_ACCORDION_STATES) {
      render(renderAccordionState(state));
      expect(header(state.label), state.id).toBeTruthy();
      expect(Object.keys(relatedFor(state)), state.id).toContain('panel');
      cleanup();
    }
  });
});
