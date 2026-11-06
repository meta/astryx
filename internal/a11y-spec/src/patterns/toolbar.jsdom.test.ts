// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file toolbar.jsdom.test.ts
 * @input TOOLBAR_PATTERN and its conforming and violating fixtures
 * @output Proof that the contract is complete, that every DOM-layer expectation passes conforming fixtures and fails its mutation, and that jsdom reports browser layers as unrun
 * @position Contract self-test, jsdom lane
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
import {TOOLBAR_PATTERN} from './toolbar';
import {
  TOOLBAR_MUTATIONS,
  CONFORMING_FIXTURES,
  SUBJECT_SELECTOR,
  fixture,
  type ToolbarFixture,
} from './toolbar.fixtures';

const observableHere = TOOLBAR_PATTERN.expectations.filter(expectation =>
  requiredLayers(expectation).every(layer => JSDOM_OBSERVES.includes(layer)),
);

afterEach(() => document.body.replaceChildren());

async function resultsFor(target: ToolbarFixture) {
  const container = document.createElement('div');
  document.body.append(container);
  const result = await checkAccessibilitySpec({
    spec: TOOLBAR_PATTERN,
    binding: 'fixture',
    state: target.id,
    facts: target.facts,
    mount: async () => {
      container.innerHTML = target.html;
      const subject = container.querySelector(SUBJECT_SELECTOR);
      if (subject == null) {
        throw new Error(`fixture "${target.id}" is missing its toolbar`);
      }
      const related: Record<string, Element> = {};
      for (const [name, selector] of Object.entries(target.relations)) {
        const element = container.querySelector(selector);
        if (element == null) {
          throw new Error(`fixture "${target.id}" is missing ${name}`);
        }
        related[name] = element;
      }
      return createJsdomHarness({subject, related});
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

describe('toolbar contract — completeness', () => {
  it('answers every completeness dimension', () => {
    expect(unansweredDimensions(TOOLBAR_PATTERN)).toEqual([]);
  });

  it('gives every expectation at least one deliberately violating fixture', () => {
    const missing = TOOLBAR_PATTERN.expectations
      .filter(
        expectation => (TOOLBAR_MUTATIONS[expectation.id] ?? []).length === 0,
      )
      .map(expectation => expectation.id);
    expect(missing).toEqual([]);
  });

  it('has an expectation for every mutation it records', () => {
    const ids = new Set(
      TOOLBAR_PATTERN.expectations.map(expectation => expectation.id),
    );
    expect(Object.keys(TOOLBAR_MUTATIONS).filter(id => !ids.has(id))).toEqual(
      [],
    );
  });

  it('names every fixture it records a mutation against', () => {
    for (const fixtures of Object.values(TOOLBAR_MUTATIONS)) {
      for (const id of fixtures) {
        expect(() => fixture(id)).not.toThrow();
      }
    }
  });
});

describe('toolbar contract — the jsdom harness stays within its evidence boundary', () => {
  it('runs DOM expectations and reports browser expectations as unrun', async () => {
    const results = await resultsFor(fixture('conforming-horizontal'));
    expect(results.some(result => result.status === 'pass')).toBe(true);
    const above = results.filter(result => result.status === 'unrun');
    expect(above.length).toBeGreaterThan(0);
    for (const result of above) {
      expect(
        (result.missingLayers ?? []).some(
          layer => layer === 'real-browser' || layer === 'accessibility-tree',
        ),
      ).toBe(true);
    }
  });
});

describe.each(observableHere.map(expectation => [expectation.id] as const))(
  '%s',
  id => {
    const expectation = TOOLBAR_PATTERN.expectations.find(
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

    it.each((TOOLBAR_MUTATIONS[id] ?? []).map(name => [name] as const))(
      'fails against %s, which removes its outcome',
      async name => {
        const result = resultFor(await resultsFor(fixture(name)), id);
        expect(result.status, `${id} against ${name}`).toBe('fail');
        expect(result.detail ?? '').not.toBe('');
      },
    );

    it('carries its id and primary source into every result description', async () => {
      const target = fixture(
        TOOLBAR_MUTATIONS[id]?.[0] ?? CONFORMING_FIXTURES[0]!,
      );
      const result = resultFor(await resultsFor(target), id);
      expect(result.description).toContain(id);
      expect(result.description).toContain(citeSource(expectation.sources[0]));
      expect(describeExpectation(expectation)).toBe(result.description);
    });
  },
);
