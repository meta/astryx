// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file carousel.jsdom.test.ts
 * @input Uses the Carousel contract, plain fixtures, jsdom harness, and checker
 * @output DOM-layer positive/negative proof and honest higher-layer results
 * @position Contract self-test; proves the contract rather than Astryx components.
 */

import {afterEach, describe, expect, it} from 'vitest';
import {checkAccessibilitySpec, type ExpectationResult} from '../check';
import {
  citeSource,
  describeExpectation,
  requiredLayers,
  unansweredDimensions,
} from '../contract';
import {createJsdomHarness, JSDOM_OBSERVES} from '../harness/jsdom';
import {CAROUSEL_PATTERN} from './carousel';
import {
  CAROUSEL_MUTATIONS,
  CAROUSEL_SUBJECT_SELECTOR,
  CONFORMING_CAROUSEL_FIXTURES,
  carouselFixture,
  expectedCarouselMutationFailure,
  type CarouselFixture,
} from './carousel.fixtures';

const observableHere = CAROUSEL_PATTERN.expectations.filter(expectation =>
  requiredLayers(expectation).every(layer => JSDOM_OBSERVES.includes(layer)),
);

afterEach(() => document.body.replaceChildren());

async function resultsFor(target: CarouselFixture) {
  const container = document.createElement('div');
  document.body.append(container);
  const run = await checkAccessibilitySpec({
    spec: CAROUSEL_PATTERN,
    binding: 'fixture',
    state: target.id,
    facts: target.facts,
    mount: async () => {
      container.innerHTML = target.html;
      const subject = container.querySelector(CAROUSEL_SUBJECT_SELECTOR);
      if (subject == null) {
        throw new Error(`fixture "${target.id}" marks no subject`);
      }
      const related = Object.fromEntries(
        target.facts.slideRelations.map(name => {
          const element = container.querySelector(
            `[data-a11y-related="${name}"]`,
          );
          if (element == null) {
            throw new Error(`fixture "${target.id}" has no relation "${name}"`);
          }
          return [name, element];
        }),
      );
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
  const result = results.find(candidate => candidate.expectation === id);
  if (result == null) {
    throw new Error(`no result for ${id}`);
  }
  return result;
}

describe('Carousel contract — completeness', () => {
  it('answers every checklist dimension', () => {
    expect(unansweredDimensions(CAROUSEL_PATTERN)).toEqual([]);
  });

  it('gives every expectation a deliberately violating fixture', () => {
    expect(
      CAROUSEL_PATTERN.expectations
        .filter(
          expectation =>
            (CAROUSEL_MUTATIONS[expectation.id] ?? []).length === 0,
        )
        .map(expectation => expectation.id),
    ).toEqual([]);
  });

  it('has an expectation for every mutation entry', () => {
    const ids = new Set(
      CAROUSEL_PATTERN.expectations.map(expectation => expectation.id),
    );
    expect(Object.keys(CAROUSEL_MUTATIONS).filter(id => !ids.has(id))).toEqual(
      [],
    );
  });
});

describe('Carousel contract — jsdom evidence boundary', () => {
  it('runs DOM expectations and reports browser-owned layers as unrun', async () => {
    const results = await resultsFor(carouselFixture('conforming-container'));
    expect(results.some(result => result.status === 'pass')).toBe(true);
    expect(results.some(result => result.status === 'unrun')).toBe(true);
    expect(results.filter(result => result.status === 'fail')).toEqual([]);
  });
});

describe.each(observableHere.map(expectation => [expectation.id] as const))(
  '%s',
  id => {
    const expectation = CAROUSEL_PATTERN.expectations.find(
      candidate => candidate.id === id,
    )!;

    it.each(CONFORMING_CAROUSEL_FIXTURES.map(name => [name] as const))(
      'passes against %s (or does not apply)',
      async name => {
        const result = resultFor(await resultsFor(carouselFixture(name)), id);
        expect(
          ['pass', 'not-applicable'],
          `${id} against ${name}: ${result.detail ?? ''}`,
        ).toContain(result.status);
      },
    );

    it.each((CAROUSEL_MUTATIONS[id] ?? []).map(name => [name] as const))(
      'fails against %s, which removes its outcome',
      async name => {
        const result = resultFor(await resultsFor(carouselFixture(name)), id);
        expect(result.status, `${id} against ${name}`).toBe('fail');
        expect(result.detail).toBe(expectedCarouselMutationFailure(id, name));
        expect(result.description).toContain(id);
        expect(result.description).toContain(
          citeSource(expectation.sources[0]),
        );
        expect(result.description).toBe(describeExpectation(expectation));
      },
    );
  },
);
