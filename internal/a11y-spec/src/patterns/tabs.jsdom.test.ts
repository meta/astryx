// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file tabs.jsdom.test.ts
 * @input Uses the Tabs contract, plain fixtures, jsdom harness, and checker
 * @output DOM-layer positive/negative proof and honest unrun results
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
import {TABS_PATTERN} from './tabs';
import {
  CONFORMING_TABS_FIXTURES,
  TABS_MUTATIONS,
  TABS_SUBJECT_SELECTOR,
  tabsFixture,
  type TabsFixture,
} from './tabs.fixtures';

const observableHere = TABS_PATTERN.expectations.filter(expectation =>
  requiredLayers(expectation).every(layer => JSDOM_OBSERVES.includes(layer)),
);

const EXPECTED_DOM_FAILURES: Readonly<Record<string, string>> = {
  'tabs.relationship.controls-resolves:violating-controls-missing':
    'this tab declares a controlled panel, but it has no aria-controls relationship',
  'tabs.relationship.controls-resolves:violating-controls-dangling':
    'aria-controls points at "missing-panel", which resolves to nothing',
  'tabs.relationship.controls-resolves:violating-controls-wrong-existing':
    'aria-controls identifies "panel-second" instead of the binding’s associated panel "panel-first"',
  'tabs.relationship.controls-resolves:violating-controls-duplicate-id':
    'aria-controls resolves to a different element than the binding’s associated panel "panel-first"',
  'tabs.relationship.panel-labelledby-resolves:violating-panel-labelledby-missing':
    'this tabpanel declares a tab label, but it has no aria-labelledby relationship',
  'tabs.relationship.panel-labelledby-resolves:violating-panel-labelledby-dangling':
    'aria-labelledby points at "missing-tab", which resolves to nothing',
  'tabs.relationship.panel-labelledby-resolves:violating-panel-labelledby-wrong-existing':
    'aria-labelledby identifies "tab-second" instead of the binding’s associated tab "tab-first"',
  'tabs.relationship.panel-labelledby-resolves:violating-panel-labelledby-duplicate-id':
    'aria-labelledby resolves to a different element than the binding’s associated tab "tab-first"',
};

afterEach(() => {
  document.body.replaceChildren();
});

async function resultsFor(target: TabsFixture) {
  const container = document.createElement('div');
  document.body.append(container);
  const result = await checkAccessibilitySpec({
    spec: TABS_PATTERN,
    binding: 'fixture',
    state: target.id,
    facts: target.facts,
    mount: async () => {
      container.innerHTML = target.html;
      const subject = container.querySelector(TABS_SUBJECT_SELECTOR);
      if (subject == null) {
        throw new Error(`fixture "${target.id}" marks no subject element`);
      }
      const relationNames = [
        ...target.facts.tabRelations,
        ...target.facts.panelRelations,
        target.facts.controlledPanel,
        target.facts.labellingTab,
      ].filter((name): name is string => name != null);
      const related = Object.fromEntries(
        relationNames.map(name => {
          const element = container.querySelector(
            `[data-a11y-related="${name}"]`,
          );
          if (element == null) {
            throw new Error(
              `fixture "${target.id}" marks no related subject "${name}"`,
            );
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

describe('Tabs contract — completeness', () => {
  it('answers every checklist dimension', () => {
    expect(unansweredDimensions(TABS_PATTERN)).toEqual([]);
  });

  it('gives every expectation a deliberately violating fixture', () => {
    expect(
      TABS_PATTERN.expectations
        .filter(
          expectation => (TABS_MUTATIONS[expectation.id] ?? []).length === 0,
        )
        .map(expectation => expectation.id),
    ).toEqual([]);
  });

  it('has an expectation for every mutation entry', () => {
    const ids = new Set(
      TABS_PATTERN.expectations.map(expectation => expectation.id),
    );
    expect(Object.keys(TABS_MUTATIONS).filter(id => !ids.has(id))).toEqual([]);
  });

  it('names every fixture recorded as a mutation', () => {
    for (const fixtures of Object.values(TABS_MUTATIONS)) {
      for (const id of fixtures) {
        expect(() => tabsFixture(id)).not.toThrow();
      }
    }
  });
});

describe('Tabs contract — jsdom evidence boundary', () => {
  it('runs DOM expectations and reports higher layers as unrun', async () => {
    const results = await resultsFor(tabsFixture('conforming-tab-selected'));
    expect(results.some(result => result.status === 'unrun')).toBe(true);
    expect(results.filter(result => result.status === 'fail')).toEqual([]);
  });
});

describe.each(observableHere.map(expectation => [expectation.id] as const))(
  '%s',
  id => {
    const expectation = TABS_PATTERN.expectations.find(
      candidate => candidate.id === id,
    )!;

    it.each(CONFORMING_TABS_FIXTURES.map(name => [name] as const))(
      'passes against %s (or does not apply)',
      async name => {
        const result = resultFor(await resultsFor(tabsFixture(name)), id);
        expect(
          ['pass', 'not-applicable'],
          `${id} against ${name}: ${result.detail ?? ''}`,
        ).toContain(result.status);
      },
    );

    it.each((TABS_MUTATIONS[id] ?? []).map(name => [name] as const))(
      'fails against %s, which removes its outcome',
      async name => {
        const result = resultFor(await resultsFor(tabsFixture(name)), id);
        expect(result.status, `${id} against ${name}`).toBe('fail');
        expect(result.detail ?? '').toBe(
          EXPECTED_DOM_FAILURES[`${id}:${name}`],
        );
      },
    );

    it('carries its id and primary source into failure output', async () => {
      const [fixtureId] = TABS_MUTATIONS[id] ?? [];
      if (fixtureId == null) {
        throw new Error(`no mutation fixture for ${id}`);
      }
      const result = resultFor(await resultsFor(tabsFixture(fixtureId)), id);
      expect(result.description).toContain(id);
      expect(result.description).toContain(citeSource(expectation.sources[0]));
      expect(result.description).toBe(describeExpectation(expectation));
    });
  },
);
