// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file text-input.jsdom.test.ts
 * @input Uses the text-input contract, fixtures, jsdom harness, and checker
 * @output DOM-layer positive, negative, traceability, and completeness proof
 * @position Contract self-test. Chromium proves browser/tree expectations.
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
import {TEXT_INPUT_PATTERN} from './text-input';
import {
  CONFORMING_FIXTURES,
  SUBJECT_SELECTOR,
  TEXT_INPUT_MUTATIONS,
  fixture,
  type TextInputFixture,
} from './text-input.fixtures';

function mount(target: TextInputFixture) {
  document.body.innerHTML = target.html;
  const subject = document.querySelector(SUBJECT_SELECTOR);
  if (subject == null) {
    throw new Error(`fixture ${target.id} has no subject`);
  }
  return createJsdomHarness({subject});
}

async function resultsFor(
  target: TextInputFixture,
  only?: readonly string[],
): Promise<readonly ExpectationResult[]> {
  return (
    await checkAccessibilitySpec({
      spec: TEXT_INPUT_PATTERN,
      binding: 'fixture',
      state: target.id,
      facts: target.facts,
      mount: async () => mount(target),
      only,
    })
  ).results;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('text-input contract — completeness', () => {
  it('answers every completeness dimension', () => {
    expect(unansweredDimensions(TEXT_INPUT_PATTERN)).toEqual([]);
  });

  it('gives every expectation at least one deliberately violating fixture', () => {
    expect(
      TEXT_INPUT_PATTERN.expectations
        .filter(
          expectation =>
            (TEXT_INPUT_MUTATIONS[expectation.id] ?? []).length === 0,
        )
        .map(expectation => expectation.id),
    ).toEqual([]);
  });

  it('has an expectation for every violating fixture it records', () => {
    const ids = new Set(
      TEXT_INPUT_PATTERN.expectations.map(expectation => expectation.id),
    );
    expect(
      Object.keys(TEXT_INPUT_MUTATIONS).filter(id => !ids.has(id)),
    ).toEqual([]);
  });

  it('names every fixture it records a mutation against', () => {
    for (const fixtures of Object.values(TEXT_INPUT_MUTATIONS)) {
      for (const id of fixtures) {
        expect(() => fixture(id)).not.toThrow();
      }
    }
  });
});

describe('text-input contract — jsdom evidence boundary', () => {
  it('reports every higher-layer expectation as unrun, never as pass', async () => {
    for (const expectation of TEXT_INPUT_PATTERN.expectations) {
      if (
        requiredLayers(expectation).every(layer =>
          JSDOM_OBSERVES.includes(layer),
        )
      ) {
        continue;
      }
      const fixtureId = CONFORMING_FIXTURES.find(id =>
        expectation.appliesWhen.test(fixture(id).facts),
      );
      expect(
        fixtureId,
        `${expectation.id} has no applicable conforming fixture`,
      ).toBeDefined();
      const [result] = await resultsFor(fixture(fixtureId!), [expectation.id]);
      expect(result?.status, expectation.id).toBe('unrun');
    }
  });
});

describe('text-input contract — positive and negative proof', () => {
  it('passes each observable expectation on every applicable conforming fixture', async () => {
    for (const expectation of TEXT_INPUT_PATTERN.expectations) {
      if (
        !requiredLayers(expectation).every(layer =>
          JSDOM_OBSERVES.includes(layer),
        )
      ) {
        continue;
      }
      for (const fixtureId of CONFORMING_FIXTURES) {
        const result = (
          await resultsFor(fixture(fixtureId), [expectation.id])
        )[0];
        expect(['pass', 'not-applicable']).toContain(result?.status);
      }
    }
  });

  it('fails each observable expectation against every mapped mutation', async () => {
    for (const expectation of TEXT_INPUT_PATTERN.expectations) {
      if (
        !requiredLayers(expectation).every(layer =>
          JSDOM_OBSERVES.includes(layer),
        )
      ) {
        continue;
      }
      for (const fixtureId of TEXT_INPUT_MUTATIONS[expectation.id] ?? []) {
        const result = (
          await resultsFor(fixture(fixtureId), [expectation.id])
        )[0];
        expect(result?.status, `${expectation.id} against ${fixtureId}`).toBe(
          'fail',
        );
        expect(result?.detail).not.toBe('');
      }
    }
  });

  it('carries each expectation id and primary source into its result', async () => {
    for (const expectation of TEXT_INPUT_PATTERN.expectations) {
      const fixtureId =
        TEXT_INPUT_MUTATIONS[expectation.id]?.[0] ?? CONFORMING_FIXTURES[0];
      const result = (
        await resultsFor(fixture(fixtureId), [expectation.id])
      )[0];
      expect(result?.description).toContain(expectation.id);
      expect(result?.description).toContain(citeSource(expectation.sources[0]));
      expect(result?.description).toBe(describeExpectation(expectation));
    }
  });
});
