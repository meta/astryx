// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file listbox-selection.jsdom.test.ts
 * @input Uses the Listbox contract, DOM harness, and explicit selection fixtures
 * @output Proof that multiple selections cannot masquerade as single selection
 * @position Contract self-tests; selection mechanics remain a separate owner.
 */

import {afterEach, describe, expect, it} from 'vitest';
import {checkAccessibilitySpec} from '../check';
import {createJsdomHarness} from '../harness/jsdom';
import {LISTBOX_PATTERN} from './listbox';

afterEach(() => document.body.replaceChildren());

async function checkSelection(
  count: number,
  selectionAttribute: 'aria-selected' | 'aria-checked' = 'aria-selected',
) {
  return checkAccessibilitySpec({
    spec: LISTBOX_PATTERN,
    binding: 'fixture',
    state: 'single-selection',
    facts: {
      part: 'listbox',
      multiple: false,
      optionRelations: ['one', 'two'],
      selectionAttribute,
    },
    only: ['listbox.selection.single'],
    mount: async () => {
      document.body.innerHTML = `<div id="list" role="listbox" aria-label="Fruit"><div id="one" role="option" ${selectionAttribute}="${count > 0}">Apple</div><div id="two" role="option" ${selectionAttribute}="${count > 1}">Banana</div></div>`;
      return createJsdomHarness({
        subject: document.getElementById('list')!,
        related: {
          one: document.getElementById('one')!,
          two: document.getElementById('two')!,
        },
      });
    },
    unmount: () => document.body.replaceChildren(),
  });
}

describe('listbox.selection.single — WCAG 2.2 4.1.2', () => {
  it.each([0, 1])('accepts %i selected options', async count => {
    const result = await checkSelection(count);
    expect(result.results[0]?.status).toBe('pass');
  });

  it.each(['aria-selected', 'aria-checked'] as const)(
    'rejects two selected options through %s',
    async channel => {
      const result = await checkSelection(2, channel);
      expect(result.results[0]?.status).toBe('fail');
      expect(result.results[0]?.detail).toBe(
        'the single-selection listbox exposes 2 selected options',
      );
    },
  );
});
