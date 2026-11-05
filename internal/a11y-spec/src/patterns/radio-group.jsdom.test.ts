// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file radio-group.jsdom.test.ts
 * @input Uses the radio-group contract, fixtures, jsdom harness, and checker
 * @output DOM-layer positive/negative proof and honest unrun results
 * @position Contract self-test; proves the contract rather than any component.
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
import {RADIO_GROUP_PATTERN} from './radio-group';
import {
  CONFORMING_RADIO_GROUP_FIXTURES,
  expectedRadioGroupMutationFailure,
  radioGroupFixture,
  RADIO_GROUP_MUTATIONS,
  RADIO_GROUP_SUBJECT_SELECTOR,
  type RadioGroupFixture,
} from './radio-group.fixtures';

const observableHere = RADIO_GROUP_PATTERN.expectations.filter(expectation =>
  requiredLayers(expectation).every(layer => JSDOM_OBSERVES.includes(layer)),
);

afterEach(() => {
  document.body.replaceChildren();
});

async function resultsFor(target: RadioGroupFixture) {
  const container = document.createElement('div');
  document.body.append(container);
  const result = await checkAccessibilitySpec({
    spec: RADIO_GROUP_PATTERN,
    binding: 'fixture',
    state: target.id,
    facts: target.facts,
    mount: async () => {
      container.innerHTML = target.html;
      const subject = container.querySelector(RADIO_GROUP_SUBJECT_SELECTOR);
      if (subject == null) {
        throw new Error(`fixture "${target.id}" marks no subject element`);
      }
      return createJsdomHarness({
        subject,
        related: Object.fromEntries(
          target.facts.optionRelations.map(name => {
            const related = container.querySelector(
              `[data-a11y-related="${name}"]`,
            );
            if (related == null) {
              throw new Error(
                `fixture "${target.id}" marks no related option "${name}"`,
              );
            }
            return [name, related];
          }),
        ),
      });
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

describe('radio-group contract — completeness', () => {
  it('answers every checklist dimension', () => {
    expect(unansweredDimensions(RADIO_GROUP_PATTERN)).toEqual([]);
  });

  it('gives every expectation a deliberately violating fixture', () => {
    const missing = RADIO_GROUP_PATTERN.expectations
      .filter(
        expectation =>
          (RADIO_GROUP_MUTATIONS[expectation.id] ?? []).length === 0,
      )
      .map(expectation => expectation.id);
    expect(missing).toEqual([]);
  });

  it('has an expectation for every mutation entry', () => {
    const ids = new Set(
      RADIO_GROUP_PATTERN.expectations.map(expectation => expectation.id),
    );
    expect(
      Object.keys(RADIO_GROUP_MUTATIONS).filter(id => !ids.has(id)),
    ).toEqual([]);
  });

  it('names every fixture recorded as a mutation', () => {
    for (const fixtures of Object.values(RADIO_GROUP_MUTATIONS)) {
      for (const id of fixtures) {
        expect(() => radioGroupFixture(id)).not.toThrow();
      }
    }
  });
});

describe('radio-group contract — jsdom evidence boundary', () => {
  it('runs DOM expectations and reports higher layers as unrun', async () => {
    const results = await resultsFor(radioGroupFixture('conforming-group'));
    expect(results.some(result => result.status === 'unrun')).toBe(true);
    expect(results.filter(result => result.status === 'fail')).toEqual([]);
  });
});

describe.each(observableHere.map(expectation => [expectation.id] as const))(
  '%s',
  id => {
    const expectation = RADIO_GROUP_PATTERN.expectations.find(
      candidate => candidate.id === id,
    )!;

    it.each(CONFORMING_RADIO_GROUP_FIXTURES.map(name => [name] as const))(
      'passes against %s (or does not apply)',
      async name => {
        const result = resultFor(await resultsFor(radioGroupFixture(name)), id);
        expect(
          ['pass', 'not-applicable'],
          `${id} against ${name}: ${result.detail ?? ''}`,
        ).toContain(result.status);
      },
    );

    it.each((RADIO_GROUP_MUTATIONS[id] ?? []).map(name => [name] as const))(
      'fails against %s, which removes its outcome',
      async name => {
        const result = resultFor(await resultsFor(radioGroupFixture(name)), id);
        expect(result.status, `${id} against ${name}`).toBe('fail');
        expect(result.detail ?? '').toBe(
          expectedRadioGroupMutationFailure(id, name),
        );
      },
    );

    it('carries its id and primary source into failure output', async () => {
      const [fixtureId] = RADIO_GROUP_MUTATIONS[id] ?? [];
      if (fixtureId == null) {
        throw new Error(`no mutation fixture for ${id}`);
      }
      const result = resultFor(
        await resultsFor(radioGroupFixture(fixtureId)),
        id,
      );
      expect(result.description).toContain(id);
      expect(result.description).toContain(citeSource(expectation.sources[0]));
      expect(result.description).toBe(describeExpectation(expectation));
    });
  },
);
