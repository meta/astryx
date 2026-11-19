// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file menu-button.jsdom.test.ts
 * @input MENU_BUTTON_PATTERN and its conforming and violating fixtures
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
import {MENU_BUTTON_PATTERN} from './menu-button';
import {
  MENU_BUTTON_MUTATIONS,
  CONFORMING_FIXTURES,
  FIRST_ITEM_SELECTOR,
  LAST_ITEM_SELECTOR,
  MENU_SELECTOR,
  SUBJECT_SELECTOR,
  fixture,
  type MenuButtonFixture,
} from './menu-button.fixtures';

const observableHere = MENU_BUTTON_PATTERN.expectations.filter(expectation =>
  requiredLayers(expectation).every(layer => JSDOM_OBSERVES.includes(layer)),
);

afterEach(() => document.body.replaceChildren());

async function resultsFor(target: MenuButtonFixture) {
  const container = document.createElement('div');
  document.body.append(container);
  const result = await checkAccessibilitySpec({
    spec: MENU_BUTTON_PATTERN,
    binding: 'fixture',
    state: target.id,
    facts: target.facts,
    mount: async () => {
      container.innerHTML = target.html;
      const subject = container.querySelector(SUBJECT_SELECTOR);
      const menu = container.querySelector(MENU_SELECTOR);
      const firstItem = container.querySelector(FIRST_ITEM_SELECTOR);
      const lastItem = container.querySelector(LAST_ITEM_SELECTOR);
      if (
        subject == null ||
        menu == null ||
        firstItem == null ||
        lastItem == null
      ) {
        throw new Error(
          `fixture "${target.id}" is missing its subject or a relation`,
        );
      }
      return createJsdomHarness({
        subject,
        related: {menu, 'first-item': firstItem, 'last-item': lastItem},
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

describe('menu-button contract — completeness', () => {
  it('answers every completeness dimension', () => {
    expect(unansweredDimensions(MENU_BUTTON_PATTERN)).toEqual([]);
  });

  it('gives every expectation at least one deliberately violating fixture', () => {
    const missing = MENU_BUTTON_PATTERN.expectations
      .filter(
        expectation =>
          (MENU_BUTTON_MUTATIONS[expectation.id] ?? []).length === 0,
      )
      .map(expectation => expectation.id);
    expect(missing).toEqual([]);
  });

  it('has an expectation for every mutation it records', () => {
    const ids = new Set(
      MENU_BUTTON_PATTERN.expectations.map(expectation => expectation.id),
    );
    expect(
      Object.keys(MENU_BUTTON_MUTATIONS).filter(id => !ids.has(id)),
    ).toEqual([]);
  });

  it('names every fixture it records a mutation against', () => {
    for (const fixtures of Object.values(MENU_BUTTON_MUTATIONS)) {
      for (const id of fixtures) {
        expect(() => fixture(id)).not.toThrow();
      }
    }
  });
});

describe('menu-button contract — the jsdom harness stays within its evidence boundary', () => {
  it('runs DOM expectations and reports browser expectations as unrun', async () => {
    const results = await resultsFor(fixture('conforming-closed'));
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
    const expectation = MENU_BUTTON_PATTERN.expectations.find(
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

    it.each((MENU_BUTTON_MUTATIONS[id] ?? []).map(name => [name] as const))(
      'fails against %s, which removes its outcome',
      async name => {
        const result = resultFor(await resultsFor(fixture(name)), id);
        expect(result.status, `${id} against ${name}`).toBe('fail');
        expect(result.detail ?? '').not.toBe('');
      },
    );

    it('carries its id and primary source into every result description', async () => {
      const target = fixture(
        MENU_BUTTON_MUTATIONS[id]?.[0] ?? CONFORMING_FIXTURES[0]!,
      );
      const result = resultFor(await resultsFor(target), id);
      expect(result.description).toContain(id);
      expect(result.description).toContain(citeSource(expectation.sources[0]));
      expect(describeExpectation(expectation)).toBe(result.description);
    });
  },
);
