// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file switch.jsdom.test.ts
 * @input Uses ./switch (the contract), ./switch.fixtures (conforming and
 *   violating fixtures), ../harness/jsdom, ../check
 * @output The contract's own proof at the DOM layer: every expectation passes
 *   against a conforming fixture, fails against a fixture that removes its
 *   outcome, and reports `unrun` when this harness cannot observe its layer.
 * @position Self-test. Proves the CONTRACT, not any component — the fixtures are
 *   hand-written HTML with no Astryx in them.
 *
 * `docs/specs/AST-020/spec.md` FR11: each expectation must pass against a
 * minimally conforming fixture and fail when its required outcome is
 * deliberately removed, and the suite must tell a real violation apart from an
 * unsupported harness operation.
 *
 * SYNC: The Chromium half of this proof is ./switch.chromium.spec.ts. Both read
 *   the same fixtures, so a new fixture is covered at whichever layers can see it.
 */

import {afterEach, describe, expect, it} from 'vitest';
import {
  citeSource,
  describeExpectation,
  requiredLayers,
  unansweredDimensions,
} from '../contract';
import {JSDOM_OBSERVES, createJsdomHarness} from '../harness/jsdom';
import {checkAccessibilitySpec, type ExpectationResult} from '../check';
import {SWITCH_PATTERN} from './switch';
import {
  CONFORMING_FIXTURES,
  SUBJECT_SELECTOR,
  SWITCH_MUTATIONS,
  fixture,
  type SwitchFixture,
} from './switch.fixtures';

const observableHere = SWITCH_PATTERN.expectations.filter(expectation =>
  requiredLayers(expectation).every(layer => JSDOM_OBSERVES.includes(layer)),
);

afterEach(() => {
  document.body.replaceChildren();
});

async function resultsFor(target: SwitchFixture) {
  const container = document.createElement('div');
  document.body.append(container);
  const result = await checkAccessibilitySpec({
    spec: SWITCH_PATTERN,
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

describe('switch contract — completeness', () => {
  it('answers every completeness dimension', () => {
    expect(unansweredDimensions(SWITCH_PATTERN)).toEqual([]);
  });

  it('gives every expectation at least one deliberately violating fixture', () => {
    const missing = SWITCH_PATTERN.expectations
      .filter(
        expectation => (SWITCH_MUTATIONS[expectation.id] ?? []).length === 0,
      )
      .map(expectation => expectation.id);
    expect(missing).toEqual([]);
  });

  it('has an expectation for every violating fixture it records', () => {
    const ids = new Set(
      SWITCH_PATTERN.expectations.map(expectation => expectation.id),
    );
    const orphans = Object.keys(SWITCH_MUTATIONS).filter(id => !ids.has(id));
    expect(orphans).toEqual([]);
  });

  it('names every fixture it records a mutation against', () => {
    for (const fixtures of Object.values(SWITCH_MUTATIONS)) {
      for (const id of fixtures) {
        expect(() => fixture(id)).not.toThrow();
      }
    }
  });
});

describe('switch contract — the jsdom harness reports what it cannot see', () => {
  it('reports an expectation above the DOM layer as unrun, never as a pass', async () => {
    const results = await resultsFor(fixture('conforming-off'));
    const above = results.filter(result => result.status === 'unrun');
    // There is at least one, or the contract would be provable without a browser.
    expect(above.length).toBeGreaterThan(0);
    for (const result of above) {
      expect(
        ['unrun', 'not-applicable'],
        `${result.expectation} in jsdom`,
      ).toContain(result.status);
    }
  });
});

describe.each(observableHere.map(expectation => [expectation.id] as const))(
  '%s',
  id => {
    const expectation = SWITCH_PATTERN.expectations.find(
      candidate => candidate.id === id,
    )!;

    it.each(CONFORMING_FIXTURES.map(name => [name] as const))(
      'passes against %s (or does not apply to it)',
      async name => {
        const target = fixture(name);
        const result = resultFor(await resultsFor(target), id);
        expect(
          ['pass', 'not-applicable'],
          `${id} against ${name}: ${result.detail ?? ''}`,
        ).toContain(result.status);
      },
    );

    it.each((SWITCH_MUTATIONS[id] ?? []).map(name => [name] as const))(
      'fails against %s, which removes its outcome',
      async name => {
        const target = fixture(name);
        const result = resultFor(await resultsFor(target), id);
        expect(result.status, `${id} against ${name}`).toBe('fail');
        expect(result.detail ?? '').not.toBe('');
      },
    );

    it('carries its id and its normative source into every failure it reports', async () => {
      const [violating] = SWITCH_MUTATIONS[id] ?? [];
      const target = fixture(violating ?? CONFORMING_FIXTURES[0]!);
      const result = resultFor(await resultsFor(target), id);
      // AST-020 FR4: a failure has to be understandable without opening the
      // runner, so the id and the citation travel with the result.
      expect(result.description).toContain(id);
      expect(result.description).toContain(citeSource(expectation.sources[0]));
      expect(describeExpectation(expectation)).toBe(result.description);
    });
  },
);
