// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file disclosure.jsdom.test.ts
 * @input Uses the disclosure contract, shared fixtures, jsdom harness, and checker
 * @output Completeness plus positive and negative DOM proof
 * @position Contract self-tests; browser-only outcomes remain explicitly unrun.
 */

import {afterEach, describe, expect, it} from 'vitest';
import {
  citeSource,
  describeExpectation,
  requiredLayers,
  unansweredDimensions,
} from '../contract';
import {checkAccessibilitySpec, type ExpectationResult} from '../check';
import {JSDOM_OBSERVES, createJsdomHarness} from '../harness/jsdom';
import {DISCLOSURE_PATTERN} from './disclosure';
import {
  CONFORMING_FIXTURES,
  CONTENT_SELECTOR,
  DISCLOSURE_MUTATIONS,
  SUBJECT_SELECTOR,
  fixture,
  type DisclosureFixture,
} from './disclosure.fixtures';

const observableHere = DISCLOSURE_PATTERN.expectations.filter(expectation =>
  requiredLayers(expectation).every(layer => JSDOM_OBSERVES.includes(layer)),
);

afterEach(() => document.body.replaceChildren());

async function resultsFor(target: DisclosureFixture) {
  const container = document.createElement('div');
  document.body.append(container);
  const result = await checkAccessibilitySpec({
    spec: DISCLOSURE_PATTERN,
    binding: 'fixture',
    state: target.id,
    facts: target.facts,
    mount: async () => {
      container.innerHTML = target.html;
      const subject = container.querySelector(SUBJECT_SELECTOR);
      const content = container.querySelector(CONTENT_SELECTOR);
      if (subject == null || content == null) {
        throw new Error(
          `fixture "${target.id}" is missing its subject or content`,
        );
      }
      return createJsdomHarness({subject, related: {content}});
    },
    unmount: () => {
      container.innerHTML = '';
    },
  });
  return result.results;
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

describe('disclosure contract — completeness', () => {
  it('answers every completeness dimension', () => {
    expect(unansweredDimensions(DISCLOSURE_PATTERN)).toEqual([]);
  });

  it('gives every expectation at least one deliberately violating fixture', () => {
    const missing = DISCLOSURE_PATTERN.expectations
      .filter(
        expectation =>
          (DISCLOSURE_MUTATIONS[expectation.id] ?? []).length === 0,
      )
      .map(expectation => expectation.id);
    expect(missing).toEqual([]);
  });

  it('has an expectation for every mutation it records', () => {
    const ids = new Set(
      DISCLOSURE_PATTERN.expectations.map(expectation => expectation.id),
    );
    expect(
      Object.keys(DISCLOSURE_MUTATIONS).filter(id => !ids.has(id)),
    ).toEqual([]);
  });

  it('names every fixture it records a mutation against', () => {
    for (const fixtures of Object.values(DISCLOSURE_MUTATIONS)) {
      for (const id of fixtures) {
        expect(() => fixture(id)).not.toThrow();
      }
    }
  });
});

describe('disclosure contract — the jsdom harness stays within its evidence boundary', () => {
  it('runs DOM expectations and reports browser expectations as unrun', async () => {
    const results = await resultsFor(fixture('conforming-closed'));
    expect(results.some(result => result.status === 'pass')).toBe(true);
    const above = results.filter(result => result.status === 'unrun');
    expect(above.length).toBeGreaterThan(0);
    for (const result of above) {
      expect(result.missingLayers).toContain('real-browser');
    }
  });
});

describe.each(observableHere.map(expectation => [expectation.id] as const))(
  '%s',
  id => {
    const expectation = DISCLOSURE_PATTERN.expectations.find(
      candidate => candidate.id === id,
    )!;

    it.each(CONFORMING_FIXTURES.map(name => [name] as const))(
      'passes against %s (or does not apply to it)',
      async name => {
        const result = resultFor(await resultsFor(fixture(name)), id);
        expect(
          ['pass', 'not-applicable'],
          `${id} against ${name}: ${result.detail ?? ''}`,
        ).toContain(result.status);
      },
    );

    it.each((DISCLOSURE_MUTATIONS[id] ?? []).map(name => [name] as const))(
      'fails against %s, which removes its outcome',
      async name => {
        const result = resultFor(await resultsFor(fixture(name)), id);
        expect(result.status, `${id} against ${name}`).toBe('fail');
        expect(result.detail ?? '').not.toBe('');
      },
    );

    it('carries its id and primary source into every result description', async () => {
      const target = fixture(
        DISCLOSURE_MUTATIONS[id]?.[0] ?? CONFORMING_FIXTURES[0]!,
      );
      const result = resultFor(await resultsFor(target), id);
      expect(result.description).toContain(id);
      expect(result.description).toContain(citeSource(expectation.sources[0]));
      expect(describeExpectation(expectation)).toBe(result.description);
    });
  },
);
