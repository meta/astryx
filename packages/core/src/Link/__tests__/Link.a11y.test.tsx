// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/** Fast DOM binding for Link against the shared Link contract. */

import {cleanup, render} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {
  LINK_PATTERN,
  checkAccessibilitySpec,
  createJsdomHarness,
  expectAccessibilitySpec,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {LINK_A11Y_RENDERS} from './Link.a11y.renders';
import {
  LINK_A11Y_EXCLUSIONS,
  LINK_A11Y_STATES,
  type LinkA11yRow,
} from './Link.a11y.states';

const SUBJECT_SELECTOR = '[data-a11y-link]';

function subjectFor(): HTMLElement {
  const subjects = document.querySelectorAll(SUBJECT_SELECTOR);
  if (subjects.length !== 1 || !(subjects[0] instanceof HTMLElement)) {
    throw new Error(
      `binding rendered ${subjects.length} link subjects instead of one`,
    );
  }
  return subjects[0];
}

async function checkState(state: LinkA11yRow): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: LINK_PATTERN,
    binding: 'Link',
    state: state.id,
    facts: state.facts,
    mount: async () => {
      render(LINK_A11Y_RENDERS[state.id]());
      return createJsdomHarness({subject: subjectFor()});
    },
    unmount: cleanup,
  });
}

describe('the shared Link pattern, jsdom lane', () => {
  it.each(
    LINK_A11Y_STATES.map(
      state => [`Link [${state.id}]`, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectAccessibilitySpec({
      spec: LINK_PATTERN,
      binding: 'Link',
      state: state.id,
      facts: state.facts,
      render: () => {
        render(LINK_A11Y_RENDERS[state.id]());
      },
      subject: subjectFor,
      cleanup,
    });
  });

  it('runs DOM expectations and reports tree and browser outcomes as unrun', async () => {
    const results: BindingResult[] = [];
    for (const state of LINK_A11Y_STATES) {
      results.push(await checkState(state));
    }
    const report = summarize(LINK_PATTERN, results);
    expect(report.counts.pass).toBeGreaterThan(0);
    expect([...report.unrunLayers].sort()).toEqual([
      'accessibility-tree',
      'real-browser',
    ]);
    expect(report.counts.unexpectedPass).toBe(0);
  });
});

describe('the Link binding inventory', () => {
  it('names a distinct checked-in story for every state', () => {
    const ids = LINK_A11Y_STATES.map(state => state.storyId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('records every adjacent exclusion with an owner and reason', () => {
    expect(LINK_A11Y_EXCLUSIONS.every(row => row.owner && row.reason)).toBe(
      true,
    );
  });

  it('renders an anchor with a destination for every state', () => {
    for (const state of LINK_A11Y_STATES) {
      render(LINK_A11Y_RENDERS[state.id]());
      const subject = subjectFor();
      expect(subject.tagName, state.id).toBe('A');
      expect(subject.getAttribute('href'), state.id).not.toBeNull();
      cleanup();
    }
  });

  it('renders both custom-router seams through the router component', () => {
    for (const id of ['provider-router', 'as-router'] as const) {
      render(LINK_A11Y_RENDERS[id]());
      expect(subjectFor().hasAttribute('data-a11y-link-router'), id).toBe(true);
      cleanup();
    }
    for (const state of LINK_A11Y_STATES.filter(
      row => row.id !== 'provider-router' && row.id !== 'as-router',
    )) {
      render(LINK_A11Y_RENDERS[state.id]());
      expect(subjectFor().hasAttribute('data-a11y-link-router'), state.id).toBe(
        false,
      );
      cleanup();
    }
  });

  it('opens the external state in a new tab', () => {
    render(LINK_A11Y_RENDERS['external-new-tab']());
    expect(subjectFor().getAttribute('target')).toBe('_blank');
    cleanup();
  });
});
