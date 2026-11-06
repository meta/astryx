// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/** Contract self-tests for Link DOM expectations and completeness. */

import {afterEach, describe, expect, it} from 'vitest';
import {
  citeSource,
  describeExpectation,
  requiredLayers,
  unansweredDimensions,
} from '../contract';
import {checkAccessibilitySpec, type ExpectationResult} from '../check';
import {JSDOM_OBSERVES, createJsdomHarness} from '../harness/jsdom';
import {LINK_PATTERN} from './link';
import {
  CONFORMING_LINK_FIXTURES,
  LINK_MUTATIONS,
  LINK_SUBJECT_SELECTOR,
  linkFixture,
  type LinkFixture,
} from './link.fixtures';

afterEach(() => document.body.replaceChildren());

async function resultsFor(target: LinkFixture) {
  const container = document.createElement('div');
  document.body.append(container);
  const run = await checkAccessibilitySpec({
    spec: LINK_PATTERN,
    binding: 'fixture',
    state: target.id,
    facts: target.facts,
    mount: async () => {
      container.innerHTML = target.html;
      const subject = container.querySelector(LINK_SUBJECT_SELECTOR);
      if (subject == null) {
        throw new Error(`fixture "${target.id}" is missing its link subject`);
      }
      return createJsdomHarness({subject});
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

const observableHere = LINK_PATTERN.expectations.filter(expectation =>
  requiredLayers(expectation).every(layer => JSDOM_OBSERVES.includes(layer)),
);

describe('Link contract — completeness', () => {
  it('answers every completeness dimension', () => {
    expect(unansweredDimensions(LINK_PATTERN)).toEqual([]);
  });

  it('gives every expectation at least one deliberately violating fixture', () => {
    expect(
      LINK_PATTERN.expectations
        .filter(
          expectation => (LINK_MUTATIONS[expectation.id] ?? []).length === 0,
        )
        .map(expectation => expectation.id),
    ).toEqual([]);
  });

  it('has an expectation for every mutation it records', () => {
    const ids = new Set(
      LINK_PATTERN.expectations.map(expectation => expectation.id),
    );
    expect(Object.keys(LINK_MUTATIONS).filter(id => !ids.has(id))).toEqual([]);
  });

  it('gates only on WCAG 2.2 outcomes', () => {
    for (const expectation of LINK_PATTERN.expectations) {
      expect(expectation.enforcement, expectation.id).toBe('required');
      expect(expectation.sources[0].standard, expectation.id).toBe('wcag');
    }
  });
});

describe('Link contract — the jsdom harness stays within its evidence boundary', () => {
  it('runs DOM expectations and reports tree and browser expectations as unrun', async () => {
    const results = await resultsFor(linkFixture('conforming-current'));
    expect(results.some(result => result.status === 'pass')).toBe(true);
    const unrun = results.filter(result => result.status === 'unrun');
    expect(unrun.length).toBeGreaterThan(0);
    for (const result of unrun) {
      expect(
        result.missingLayers?.some(layer =>
          ['accessibility-tree', 'real-browser'].includes(layer),
        ),
        result.expectation,
      ).toBe(true);
    }
  });
});

describe.each(observableHere.map(expectation => [expectation.id] as const))(
  '%s',
  id => {
    const expectation = LINK_PATTERN.expectations.find(
      candidate => candidate.id === id,
    )!;

    it.each(CONFORMING_LINK_FIXTURES.map(name => [name] as const))(
      'passes against %s (or does not apply to it)',
      async name => {
        const result = resultFor(await resultsFor(linkFixture(name)), id);
        expect(
          ['pass', 'not-applicable'],
          `${id} against ${name}: ${result.detail ?? ''}`,
        ).toContain(result.status);
      },
    );

    it.each((LINK_MUTATIONS[id] ?? []).map(name => [name] as const))(
      'fails against %s, which removes its outcome',
      async name => {
        const result = resultFor(await resultsFor(linkFixture(name)), id);
        expect(result.status, `${id} against ${name}`).toBe('fail');
        expect(result.detail ?? '').not.toBe('');
      },
    );

    it('carries its id and primary source into every result description', async () => {
      const target = linkFixture(
        LINK_MUTATIONS[id]?.[0] ?? CONFORMING_LINK_FIXTURES[0]!,
      );
      const result = resultFor(await resultsFor(target), id);
      expect(result.description).toContain(id);
      expect(result.description).toContain(citeSource(expectation.sources[0]));
      expect(describeExpectation(expectation)).toBe(result.description);
    });
  },
);
