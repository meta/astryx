// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file toggle-button.jsdom.test.ts
 * @input Uses the toggle-button contract, its independent fixtures, and jsdom harness
 * @output DOM-layer positive/negative proof and honest unrun results for browser layers
 * @position Contract self-test; no Astryx component is rendered here.
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
import {TOGGLE_BUTTON_PATTERN} from './toggle-button';
import {
  CONFORMING_FIXTURES,
  SUBJECT_SELECTOR,
  TOGGLE_BUTTON_MUTATIONS,
  fixture,
  type ToggleButtonFixture,
} from './toggle-button.fixtures';

const observableHere = TOGGLE_BUTTON_PATTERN.expectations.filter(expectation =>
  requiredLayers(expectation).every(layer => JSDOM_OBSERVES.includes(layer)),
);

afterEach(() => document.body.replaceChildren());

async function resultsFor(target: ToggleButtonFixture) {
  const container = document.createElement('div');
  document.body.append(container);
  const result = await checkAccessibilitySpec({
    spec: TOGGLE_BUTTON_PATTERN,
    binding: 'fixture',
    state: target.id,
    facts: target.facts,
    mount: async () => {
      container.innerHTML = target.html;
      const subject = container.querySelector(SUBJECT_SELECTOR);
      if (subject == null) {
        throw new Error(`fixture "${target.id}" marks no subject element`);
      }
      return createJsdomHarness({subject});
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

describe('toggle-button contract — completeness', () => {
  it('answers every completeness dimension', () => {
    expect(unansweredDimensions(TOGGLE_BUTTON_PATTERN)).toEqual([]);
  });

  it('gives every expectation at least one deliberately violating fixture', () => {
    expect(
      TOGGLE_BUTTON_PATTERN.expectations
        .filter(
          expectation =>
            (TOGGLE_BUTTON_MUTATIONS[expectation.id] ?? []).length === 0,
        )
        .map(expectation => expectation.id),
    ).toEqual([]);
  });

  it('has no mutation without an expectation', () => {
    const ids = new Set(
      TOGGLE_BUTTON_PATTERN.expectations.map(expectation => expectation.id),
    );
    expect(
      Object.keys(TOGGLE_BUTTON_MUTATIONS).filter(id => !ids.has(id)),
    ).toEqual([]);
  });

  it('names every fixture it records a mutation against', () => {
    for (const fixtures of Object.values(TOGGLE_BUTTON_MUTATIONS)) {
      for (const id of fixtures) {
        expect(() => fixture(id)).not.toThrow();
      }
    }
  });
});

describe('toggle-button contract — jsdom evidence boundary', () => {
  it('reports higher-layer expectations as unrun', async () => {
    const results = await resultsFor(fixture('conforming-unpressed'));
    expect(results.some(result => result.status === 'unrun')).toBe(true);
  });
});

describe.each(observableHere.map(expectation => [expectation.id] as const))(
  '%s',
  id => {
    const expectation = TOGGLE_BUTTON_PATTERN.expectations.find(
      candidate => candidate.id === id,
    )!;

    it.each(CONFORMING_FIXTURES.map(name => [name] as const))(
      'passes against %s when applicable',
      async name => {
        const result = resultFor(await resultsFor(fixture(name)), id);
        expect(
          ['pass', 'not-applicable'],
          `${id} against ${name}: ${result.detail ?? ''}`,
        ).toContain(result.status);
      },
    );

    it.each((TOGGLE_BUTTON_MUTATIONS[id] ?? []).map(name => [name] as const))(
      'fails against %s',
      async name => {
        const result = resultFor(await resultsFor(fixture(name)), id);
        expect(result.status, `${id} against ${name}`).toBe('fail');
        expect(result.detail ?? '').not.toBe('');
      },
    );

    it('carries its id and normative source into failures', async () => {
      const [violating] = TOGGLE_BUTTON_MUTATIONS[id] ?? [];
      const result = resultFor(
        await resultsFor(fixture(violating ?? CONFORMING_FIXTURES[0]!)),
        id,
      );
      expect(result.description).toContain(id);
      expect(result.description).toContain(citeSource(expectation.sources[0]));
      expect(describeExpectation(expectation)).toBe(result.description);
    });
  },
);
