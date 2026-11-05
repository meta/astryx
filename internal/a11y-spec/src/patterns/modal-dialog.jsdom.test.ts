// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file modal-dialog.jsdom.test.ts
 * @input Uses the modal-dialog contract, its plain-HTML fixtures, the jsdom
 *   harness, and checkAccessibilitySpec
 * @output Positive and negative proof for every DOM-observable expectation
 * @position Fast self-test of the contract, not a component binding.
 */

import {afterEach, describe, expect, it} from 'vitest';
import {checkAccessibilitySpec, type ExpectationResult} from '../check';
import {requiredLayers, unansweredDimensions} from '../contract';
import {JSDOM_OBSERVES, createJsdomHarness} from '../harness/jsdom';
import {MODAL_DIALOG_PATTERN} from './modal-dialog';
import {
  MODAL_DIALOG_CONFORMING_FIXTURES,
  MODAL_DIALOG_MUTATIONS,
  MODAL_DIALOG_SUBJECT_SELECTOR,
  modalDialogFixture,
  type ModalDialogFixture,
} from './modal-dialog.fixtures';

const observableHere = MODAL_DIALOG_PATTERN.expectations.filter(expectation =>
  requiredLayers(expectation).every(layer => JSDOM_OBSERVES.includes(layer)),
);

afterEach(() => {
  document.body.replaceChildren();
});

async function resultsFor(target: ModalDialogFixture) {
  const container = document.createElement('div');
  document.body.append(container);
  const result = await checkAccessibilitySpec({
    spec: MODAL_DIALOG_PATTERN,
    binding: 'fixture',
    state: target.id,
    facts: target.facts,
    mount: async () => {
      container.innerHTML = target.html;
      const subject = container.querySelector(MODAL_DIALOG_SUBJECT_SELECTOR);
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

describe('modal-dialog contract — completeness', () => {
  it('answers every completeness dimension', () => {
    expect(unansweredDimensions(MODAL_DIALOG_PATTERN)).toEqual([]);
  });

  it('gives every expectation at least one deliberately violating fixture', () => {
    expect(
      MODAL_DIALOG_PATTERN.expectations
        .filter(
          expectation =>
            (MODAL_DIALOG_MUTATIONS[expectation.id] ?? []).length === 0,
        )
        .map(expectation => expectation.id),
    ).toEqual([]);
  });

  it('has no orphaned mutation ids or fixture ids', () => {
    const expectationIds = new Set(
      MODAL_DIALOG_PATTERN.expectations.map(expectation => expectation.id),
    );
    expect(
      Object.keys(MODAL_DIALOG_MUTATIONS).filter(id => !expectationIds.has(id)),
    ).toEqual([]);
    for (const fixtures of Object.values(MODAL_DIALOG_MUTATIONS)) {
      for (const id of fixtures) {
        expect(() => modalDialogFixture(id)).not.toThrow();
      }
    }
  });
});

describe('modal-dialog contract — jsdom evidence boundary', () => {
  it('reports browser-owned outcomes as unrun, never as pass', async () => {
    const results = await resultsFor(
      modalDialogFixture('conforming-interactive'),
    );
    const browserOwned = results.filter(result =>
      ['accessibility-tree', 'real-browser'].includes(result.evidenceLayer),
    );
    expect(browserOwned.length).toBeGreaterThan(0);
    for (const result of browserOwned) {
      expect(['unrun', 'not-applicable']).toContain(result.status);
    }
  });
});

describe.each(observableHere.map(expectation => [expectation.id] as const))(
  '%s',
  id => {
    it.each(MODAL_DIALOG_CONFORMING_FIXTURES.map(name => [name] as const))(
      'passes against %s (or does not apply)',
      async name => {
        const result = resultFor(
          await resultsFor(modalDialogFixture(name)),
          id,
        );
        expect(
          ['pass', 'not-applicable'],
          `${id}: ${result.detail ?? ''}`,
        ).toContain(result.status);
      },
    );

    it.each((MODAL_DIALOG_MUTATIONS[id] ?? []).map(name => [name] as const))(
      'fails against %s, which removes its outcome',
      async name => {
        const result = resultFor(
          await resultsFor(modalDialogFixture(name)),
          id,
        );
        expect(result.status, `${id}: ${result.detail ?? ''}`).toBe('fail');
      },
    );
  },
);
