// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/** Fast DOM binding for Breadcrumbs against the shared Breadcrumb contract. */

import {cleanup, render} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {
  BREADCRUMB_PATTERN,
  checkAccessibilitySpec,
  createJsdomHarness,
  expectAccessibilitySpec,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {BREADCRUMB_A11Y_RENDERS} from './Breadcrumbs.a11y.renders';
import {
  BREADCRUMB_A11Y_EXCLUSIONS,
  BREADCRUMB_A11Y_STATES,
  type BreadcrumbA11yRow,
} from './Breadcrumbs.a11y.states';

const SUBJECT_SELECTOR = '[data-a11y-breadcrumb]';
const SEPARATOR_SELECTOR = 'li > span:first-child';

function subjectFor(): HTMLElement {
  const subject = document.querySelector(SUBJECT_SELECTOR);
  if (!(subject instanceof HTMLElement)) {
    throw new Error('binding did not render one breadcrumb landmark');
  }
  return subject;
}

function relatedFor(state: BreadcrumbA11yRow): Record<string, Element> {
  const subject = subjectFor();
  const list = subject.querySelector('ol');
  if (list == null) {
    throw new Error(`Breadcrumbs state "${state.id}" has no ordered list`);
  }
  const related: Record<string, Element> = {list};
  const current = list.querySelector('[aria-current="page"]');
  if (current != null) {
    related.current = current;
  }
  const separators = list.querySelectorAll(SEPARATOR_SELECTOR);
  separators.forEach((separator, index) => {
    related[`separator-${index}`] = separator;
  });
  return related;
}

async function checkState(state: BreadcrumbA11yRow): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: BREADCRUMB_PATTERN,
    binding: 'Breadcrumbs',
    state: state.id,
    facts: state.facts,
    mount: async () => {
      render(BREADCRUMB_A11Y_RENDERS[state.id]());
      return createJsdomHarness({
        subject: subjectFor(),
        related: relatedFor(state),
      });
    },
    unmount: cleanup,
  });
}

describe('the shared Breadcrumb pattern, jsdom lane', () => {
  it.each(
    BREADCRUMB_A11Y_STATES.map(
      state => [`Breadcrumbs [${state.id}]`, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectAccessibilitySpec({
      spec: BREADCRUMB_PATTERN,
      binding: 'Breadcrumbs',
      state: state.id,
      facts: state.facts,
      render: () => {
        render(BREADCRUMB_A11Y_RENDERS[state.id]());
      },
      subject: subjectFor,
      related: () => relatedFor(state),
      cleanup,
    });
  });

  it('runs DOM expectations and reports accessibility-tree outcomes as unrun', async () => {
    const results: BindingResult[] = [];
    for (const state of BREADCRUMB_A11Y_STATES) {
      results.push(await checkState(state));
    }
    const report = summarize(BREADCRUMB_PATTERN, results);
    expect(report.counts.pass).toBeGreaterThan(0);
    expect(report.unrunLayers).toEqual(['accessibility-tree']);
    expect(report.counts.unexpectedPass).toBe(0);
  });
});

describe('the Breadcrumbs binding inventory', () => {
  it('names a distinct checked-in story for every state', () => {
    const ids = BREADCRUMB_A11Y_STATES.map(state => state.storyId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('records every adjacent exclusion with an owner and reason', () => {
    expect(
      BREADCRUMB_A11Y_EXCLUSIONS.every(row => row.owner && row.reason),
    ).toBe(true);
  });

  it('matches the declared separator and current-page inventory', () => {
    for (const state of BREADCRUMB_A11Y_STATES) {
      render(BREADCRUMB_A11Y_RENDERS[state.id]());
      const related = relatedFor(state);
      expect(
        Object.keys(related).filter(key => key.startsWith('separator-')),
        state.id,
      ).toHaveLength(state.facts.separatorCount);
      expect('current' in related, state.id).toBe(state.facts.currentPage);
      cleanup();
    }
  });
});
