// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/** Contract self-tests for Breadcrumb DOM expectations and completeness. */

import {afterEach, describe, expect, it} from 'vitest';
import {
  citeSource,
  describeExpectation,
  requiredLayers,
  unansweredDimensions,
} from '../contract';
import {checkAccessibilitySpec, type ExpectationResult} from '../check';
import {JSDOM_OBSERVES, createJsdomHarness} from '../harness/jsdom';
import {BREADCRUMB_PATTERN} from './breadcrumb';
import {
  BREADCRUMB_CURRENT_SELECTOR,
  BREADCRUMB_LIST_SELECTOR,
  BREADCRUMB_MUTATIONS,
  BREADCRUMB_SEPARATOR_SELECTOR,
  BREADCRUMB_SUBJECT_SELECTOR,
  CONFORMING_BREADCRUMB_FIXTURES,
  breadcrumbFixture,
  type BreadcrumbFixture,
} from './breadcrumb.fixtures';

afterEach(() => document.body.replaceChildren());

async function resultsFor(target: BreadcrumbFixture) {
  const container = document.createElement('div');
  document.body.append(container);
  const run = await checkAccessibilitySpec({
    spec: BREADCRUMB_PATTERN,
    binding: 'fixture',
    state: target.id,
    facts: target.facts,
    mount: async () => {
      container.innerHTML = target.html;
      const subject = container.querySelector(BREADCRUMB_SUBJECT_SELECTOR);
      const list = container.querySelector(BREADCRUMB_LIST_SELECTOR);
      if (subject == null || list == null) {
        throw new Error(
          `fixture "${target.id}" is missing its landmark or list`,
        );
      }
      const related: Record<string, Element> = {list};
      const current = container.querySelector(BREADCRUMB_CURRENT_SELECTOR);
      if (current != null) {
        related.current = current;
      }
      container
        .querySelectorAll(BREADCRUMB_SEPARATOR_SELECTOR)
        .forEach((separator, index) => {
          related[`separator-${index}`] = separator;
        });
      return createJsdomHarness({subject, related});
    },
    unmount: () => {
      container.innerHTML = '';
    },
  });
  return run.results;
}

function resultFor(
  results: readonly ExpectationResult[],
  id: string,
): ExpectationResult {
  const found = results.find(result => result.expectation === id);
  if (found == null) {
    throw new Error(`no result for ${id}`);
  }
  return found;
}

const observableHere = BREADCRUMB_PATTERN.expectations.filter(expectation =>
  requiredLayers(expectation).every(layer => JSDOM_OBSERVES.includes(layer)),
);

describe('Breadcrumb contract — completeness', () => {
  it('answers every completeness dimension', () => {
    expect(unansweredDimensions(BREADCRUMB_PATTERN)).toEqual([]);
  });

  it('gives every expectation at least one deliberately violating fixture', () => {
    expect(
      BREADCRUMB_PATTERN.expectations
        .filter(
          expectation =>
            (BREADCRUMB_MUTATIONS[expectation.id] ?? []).length === 0,
        )
        .map(expectation => expectation.id),
    ).toEqual([]);
  });

  it('has an expectation for every mutation it records', () => {
    const ids = new Set(
      BREADCRUMB_PATTERN.expectations.map(expectation => expectation.id),
    );
    expect(
      Object.keys(BREADCRUMB_MUTATIONS).filter(id => !ids.has(id)),
    ).toEqual([]);
  });
});

describe('Breadcrumb contract — the jsdom harness stays within its evidence boundary', () => {
  it('runs DOM expectations and reports accessibility-tree expectations as unrun', async () => {
    const results = await resultsFor(
      breadcrumbFixture('conforming-current-page'),
    );
    expect(results.some(result => result.status === 'pass')).toBe(true);
    const unrun = results.filter(result => result.status === 'unrun');
    expect(unrun.length).toBeGreaterThan(0);
    for (const result of unrun) {
      expect(result.missingLayers).toContain('accessibility-tree');
    }
  });
});

describe.each(observableHere.map(expectation => [expectation.id] as const))(
  '%s',
  id => {
    const expectation = BREADCRUMB_PATTERN.expectations.find(
      candidate => candidate.id === id,
    )!;

    it.each(CONFORMING_BREADCRUMB_FIXTURES.map(name => [name] as const))(
      'passes against %s (or does not apply to it)',
      async name => {
        const result = resultFor(await resultsFor(breadcrumbFixture(name)), id);
        expect(
          ['pass', 'not-applicable'],
          `${id} against ${name}: ${result.detail ?? ''}`,
        ).toContain(result.status);
      },
    );

    it.each((BREADCRUMB_MUTATIONS[id] ?? []).map(name => [name] as const))(
      'fails against %s, which removes its outcome',
      async name => {
        const result = resultFor(await resultsFor(breadcrumbFixture(name)), id);
        expect(result.status, `${id} against ${name}`).toBe('fail');
        expect(result.detail ?? '').not.toBe('');
      },
    );

    it('carries its id and primary source into every result description', async () => {
      const target = breadcrumbFixture(
        BREADCRUMB_MUTATIONS[id]?.[0] ?? CONFORMING_BREADCRUMB_FIXTURES[0]!,
      );
      const result = resultFor(await resultsFor(target), id);
      expect(result.description).toContain(id);
      expect(result.description).toContain(citeSource(expectation.sources[0]));
      expect(describeExpectation(expectation)).toBe(result.description);
    });
  },
);
