// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file Collapsible.a11y.test.tsx
 * @input Uses Collapsible, its binding inventory, and the disclosure contract
 * @output DOM evidence for every standalone Collapsible disclosure state
 * @position Component binding. Group coordination and generic button outcomes remain separate.
 */

import {useState} from 'react';
import {cleanup, render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {
  DISCLOSURE_PATTERN,
  checkAccessibilitySpec,
  createJsdomHarness,
  expectAccessibilitySpec,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {Collapsible} from '../Collapsible';
import {
  COLLAPSIBLE_DISCLOSURE_EXCLUSIONS,
  COLLAPSIBLE_DISCLOSURE_STATES,
  type CollapsibleDisclosureState,
} from './Collapsible.a11y.states';

function BoundCollapsible({state}: {state: CollapsibleDisclosureState}) {
  const [open, setOpen] = useState(state.facts.expanded);
  const component = state.controlled ? (
    <Collapsible
      {...state.props}
      trigger={state.label}
      isOpen={open}
      onOpenChange={setOpen}>
      Disclosure content
    </Collapsible>
  ) : (
    <Collapsible {...state.props} trigger={state.label}>
      Disclosure content
    </Collapsible>
  );
  return (
    <div dir={state.direction ?? 'ltr'}>
      {component}
      <button type="button">After disclosure</button>
    </div>
  );
}

function subjectFor(state: CollapsibleDisclosureState): HTMLElement {
  return screen.getByRole('button', {name: state.label});
}

function contentFor(state: CollapsibleDisclosureState): HTMLElement {
  const id = subjectFor(state).getAttribute('aria-controls');
  const content = id == null ? null : document.getElementById(id);
  if (content == null) {
    throw new Error(
      `Collapsible state "${state.id}" has no controlled content`,
    );
  }
  return content;
}

function renderState(state: CollapsibleDisclosureState): void {
  render(<BoundCollapsible state={state} />);
}

async function expectState(state: CollapsibleDisclosureState): Promise<void> {
  await expectAccessibilitySpec({
    spec: DISCLOSURE_PATTERN,
    binding: 'Collapsible.trigger',
    state: state.id,
    facts: state.facts,
    render: () => renderState(state),
    subject: () => subjectFor(state),
    related: () => ({content: contentFor(state)}),
    cleanup,
  });
}

async function checkState(
  state: CollapsibleDisclosureState,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: DISCLOSURE_PATTERN,
    binding: 'Collapsible.trigger',
    state: state.id,
    facts: state.facts,
    mount: async () => {
      renderState(state);
      return createJsdomHarness({
        subject: subjectFor(state),
        related: {content: contentFor(state)},
      });
    },
    unmount: cleanup,
  });
}

describe('Collapsible.trigger — disclosure pattern, jsdom lane', () => {
  it.each(
    COLLAPSIBLE_DISCLOSURE_STATES.map(
      state => [state.id, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectState(state);
  });

  it('runs the DOM layer and reports browser-owned outcomes as unrun', async () => {
    const results: BindingResult[] = [];
    for (const state of COLLAPSIBLE_DISCLOSURE_STATES) {
      results.push(await checkState(state));
    }
    const report = summarize(DISCLOSURE_PATTERN, results);
    expect(report.counts.pass).toBeGreaterThan(0);
    expect(report.unrunLayers).toEqual(['real-browser']);
    expect(report.counts.unexpectedPass).toBe(0);
  });
});

describe('Collapsible disclosure binding inventory', () => {
  it('gives every representative state a distinct checked-in story', () => {
    const stories = COLLAPSIBLE_DISCLOSURE_STATES.map(state => state.storyId);
    expect(new Set(stories).size).toBe(stories.length);
  });

  it('keeps group and generic button ownership explicit', () => {
    expect(COLLAPSIBLE_DISCLOSURE_EXCLUSIONS.map(row => row.id)).toEqual([
      'collapsible-group-coordination',
      'collapsible-button-semantics',
    ]);
    for (const exclusion of COLLAPSIBLE_DISCLOSURE_EXCLUSIONS) {
      expect(exclusion.owner.length, exclusion.id).toBeGreaterThan(20);
      expect(exclusion.reason.length, exclusion.id).toBeGreaterThan(80);
    }
  });
});
