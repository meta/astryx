// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/** Contract self-tests for Combobox DOM expectations and completeness. */

import {afterEach, describe, expect, it} from 'vitest';
import {
  citeSource,
  describeExpectation,
  requiredLayers,
  unansweredDimensions,
} from '../contract';
import {checkAccessibilitySpec, type ExpectationResult} from '../check';
import {JSDOM_OBSERVES, createJsdomHarness} from '../harness/jsdom';
import {COMBOBOX_PATTERN} from './combobox';
import {
  COMBOBOX_ACTIVE_SELECTOR,
  COMBOBOX_MUTATIONS,
  COMBOBOX_POPUP_SELECTOR,
  COMBOBOX_SUBJECT_SELECTOR,
  CONFORMING_COMBOBOX_FIXTURES,
  comboboxFixture,
  type ComboboxFixture,
} from './combobox.fixtures';

afterEach(() => document.body.replaceChildren());

async function resultsFor(target: ComboboxFixture) {
  const container = document.createElement('div');
  document.body.append(container);
  const run = await checkAccessibilitySpec({
    spec: COMBOBOX_PATTERN,
    binding: 'fixture',
    state: target.id,
    facts: target.facts,
    mount: async () => {
      container.innerHTML = target.html;
      const subject = container.querySelector(COMBOBOX_SUBJECT_SELECTOR);
      if (subject == null) {
        throw new Error(`fixture "${target.id}" is missing its combobox`);
      }
      const related: Record<string, Element> = {};
      const popup = container.querySelector(COMBOBOX_POPUP_SELECTOR);
      if (popup != null) {
        related.popup = popup;
      }
      const active = container.querySelector(COMBOBOX_ACTIVE_SELECTOR);
      if (active != null) {
        related['active-descendant'] = active;
      }
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
  const found = results.find(result => result.expectation === id);
  if (found == null) {
    throw new Error(`no result for ${id}`);
  }
  return found;
}

const observableHere = COMBOBOX_PATTERN.expectations.filter(expectation =>
  requiredLayers(expectation).every(layer => JSDOM_OBSERVES.includes(layer)),
);

describe('Combobox contract — completeness', () => {
  it('answers every completeness dimension', () => {
    expect(unansweredDimensions(COMBOBOX_PATTERN)).toEqual([]);
  });

  it('gives every expectation at least one deliberately violating fixture', () => {
    expect(
      COMBOBOX_PATTERN.expectations
        .filter(
          expectation =>
            (COMBOBOX_MUTATIONS[expectation.id] ?? []).length === 0,
        )
        .map(expectation => expectation.id),
    ).toEqual([]);
  });

  it('has an expectation for every mutation it records', () => {
    const ids = new Set(
      COMBOBOX_PATTERN.expectations.map(expectation => expectation.id),
    );
    expect(Object.keys(COMBOBOX_MUTATIONS).filter(id => !ids.has(id))).toEqual(
      [],
    );
  });
});

describe('Combobox contract — identity applicability under a modal popup', () => {
  it('skips identity only while its own modal dialog popup makes the combobox inert', async () => {
    const modal = resultFor(
      await resultsFor(comboboxFixture('conforming-modal-sheet-button')),
      'combobox.identity.named',
    );
    expect(modal.status).toBe('not-applicable');

    const claimWithoutModal = resultFor(
      await resultsFor(comboboxFixture('inert-claim-without-modal-dialog')),
      'combobox.identity.named',
    );
    expect(claimWithoutModal.status).not.toBe('not-applicable');
  });
});

describe('Combobox contract — the jsdom harness stays within its evidence boundary', () => {
  it('runs DOM expectations and reports accessibility-tree expectations as unrun', async () => {
    const results = await resultsFor(comboboxFixture('conforming-open-input'));
    expect(results.some(result => result.status === 'pass')).toBe(true);
    const unrun = results.filter(result => result.status === 'unrun');
    expect(unrun).toHaveLength(1);
    expect(unrun[0]?.missingLayers).toContain('accessibility-tree');
  });
});

describe.each(observableHere.map(expectation => [expectation.id] as const))(
  '%s',
  id => {
    const expectation = COMBOBOX_PATTERN.expectations.find(
      candidate => candidate.id === id,
    )!;

    it.each(CONFORMING_COMBOBOX_FIXTURES.map(name => [name] as const))(
      'passes against %s (or does not apply to it)',
      async name => {
        const result = resultFor(await resultsFor(comboboxFixture(name)), id);
        expect(
          ['pass', 'not-applicable'],
          `${id} against ${name}: ${result.detail ?? ''}`,
        ).toContain(result.status);
      },
    );

    it.each((COMBOBOX_MUTATIONS[id] ?? []).map(name => [name] as const))(
      'fails against %s, which removes its outcome',
      async name => {
        const result = resultFor(await resultsFor(comboboxFixture(name)), id);
        expect(result.status, `${id} against ${name}`).toBe('fail');
        expect(result.detail ?? '').not.toBe('');
      },
    );

    it('carries its id and primary source into every result description', async () => {
      const target = comboboxFixture(
        COMBOBOX_MUTATIONS[id]?.[0] ?? CONFORMING_COMBOBOX_FIXTURES[0],
      );
      const result = resultFor(await resultsFor(target), id);
      expect(result.description).toContain(id);
      expect(result.description).toContain(citeSource(expectation.sources[0]));
      expect(describeExpectation(expectation)).toBe(result.description);
    });
  },
);
