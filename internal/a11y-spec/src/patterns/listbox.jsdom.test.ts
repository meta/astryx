// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file listbox.jsdom.test.ts
 * @input Uses real DOM fixtures, the listbox contract, and the jsdom harness
 * @output Positive and deliberately violating proof through checkAccessibilitySpec
 * @position Contract self-tests, not component bindings.
 */

import {afterEach, describe, expect, it} from 'vitest';
import {checkAccessibilitySpec} from '../check';
import {createJsdomHarness} from '../harness/jsdom';
import {LISTBOX_PATTERN} from './listbox';

afterEach(() => document.body.replaceChildren());

async function checkMultiple(attribute: string, multiple = true) {
  return checkAccessibilitySpec({
    spec: LISTBOX_PATTERN,
    binding: 'fixture',
    state: 'multiple',
    facts: {part: 'listbox', multiple},
    only: ['listbox.state.multiselectable'],
    mount: async () => {
      document.body.innerHTML = `<div role="listbox" aria-label="Fruit" ${attribute}><div role="option" aria-selected="false">Apple</div></div>`;
      return createJsdomHarness({subject: document.body.firstElementChild!});
    },
    unmount: () => document.body.replaceChildren(),
  });
}

describe('listbox.state.multiselectable — WCAG 2.2 4.1.2', () => {
  it('accepts an exposed multiple-selection list', async () => {
    const result = await checkMultiple('aria-multiselectable="true"');
    expect(result.results[0]?.status).toBe('pass');
  });

  it('rejects a single-selection list advertised as multiple', async () => {
    const result = await checkMultiple('aria-multiselectable="true"', false);
    expect(result.results[0]?.status).toBe('fail');
    expect(result.results[0]?.detail).toBe(
      'the listbox permits only one selection but aria-multiselectable is not false or absent',
    );
  });

  it('accepts the implicit single-selection default', async () => {
    const result = await checkMultiple('', false);
    expect(result.results[0]?.status).toBe('pass');
  });

  it('detects a multiple-selection list that omits its state', async () => {
    const result = await checkMultiple('');
    expect(result.results[0]?.status).toBe('fail');
    expect(result.results[0]?.detail).toBe(
      'the listbox permits multiple selection but aria-multiselectable is not true',
    );
  });
});

async function checkOption(selected: boolean, attribute: string) {
  const facts = {part: 'option' as const, multiple: false, selected};
  return checkAccessibilitySpec({
    spec: LISTBOX_PATTERN,
    binding: 'fixture',
    state: 'option-selection',
    facts,
    only: ['listbox.option.selection-state'],
    mount: async () => {
      document.body.innerHTML = `<div role="listbox" aria-label="Fruit"><div data-subject role="option" ${attribute}>Apple</div></div>`;
      return createJsdomHarness({
        subject: document.querySelector('[data-subject]')!,
      });
    },
    unmount: () => document.body.replaceChildren(),
  });
}

describe('listbox.option.selection-state — WCAG 2.2 4.1.2', () => {
  it('accepts the explicit unselected state of an option', async () => {
    const result = await checkOption(false, 'aria-selected="false"');
    expect(result.results[0]?.status).toBe('pass');
  });

  it('detects an unselected option that omits its state', async () => {
    const result = await checkOption(false, '');
    expect(result.results[0]?.status).toBe('fail');
    expect(result.results[0]?.detail).toBe(
      'the option is unselected but aria-selected is absent',
    );
  });

  it('accepts the selected option', async () => {
    const result = await checkOption(true, 'aria-selected="true"');
    expect(result.results[0]?.status).toBe('pass');
  });

  it('detects a selected option exposed as unselected', async () => {
    const result = await checkOption(true, 'aria-selected="false"');
    expect(result.results[0]?.status).toBe('fail');
    expect(result.results[0]?.detail).toBe(
      'the option is selected but aria-selected is false',
    );
  });
});

async function checkDisabled(disabled: boolean, attribute: string) {
  const facts = {
    part: 'option' as const,
    multiple: false,
    selected: false,
    disabled,
  };
  return checkAccessibilitySpec({
    spec: LISTBOX_PATTERN,
    binding: 'fixture',
    state: 'option-disabled',
    facts,
    only: ['listbox.option.disabled-state'],
    mount: async () => {
      document.body.innerHTML = `<div role="listbox" aria-label="Fruit"><div data-subject role="option" aria-selected="false" ${attribute}>Apple</div></div>`;
      return createJsdomHarness({
        subject: document.querySelector('[data-subject]')!,
      });
    },
    unmount: () => document.body.replaceChildren(),
  });
}

describe('listbox.option.disabled-state — WCAG 2.2 4.1.2', () => {
  it('accepts a disabled option with its state exposed', async () => {
    const result = await checkDisabled(true, 'aria-disabled="true"');
    expect(result.results[0]?.status).toBe('pass');
  });

  it('detects disabled state omitted from an unavailable option', async () => {
    const result = await checkDisabled(true, '');
    expect(result.results[0]?.status).toBe('fail');
    expect(result.results[0]?.detail).toBe(
      'the option is disabled but aria-disabled is absent',
    );
  });
});

async function checkOwnership(owned: boolean) {
  return checkAccessibilitySpec({
    spec: LISTBOX_PATTERN,
    binding: 'fixture',
    state: 'option-owner',
    facts: {part: 'option', multiple: false, selected: false, disabled: false},
    only: ['listbox.relationship.owned'],
    mount: async () => {
      const option =
        '<div data-subject role="option" aria-selected="false">Apple</div>';
      document.body.innerHTML = `<div id="list" role="listbox" aria-label="Fruit">${owned ? option : ''}</div>${owned ? '' : option}`;
      return createJsdomHarness({
        subject: document.querySelector('[data-subject]')!,
        related: {listbox: document.getElementById('list')!},
      });
    },
    unmount: () => document.body.replaceChildren(),
  });
}

describe('listbox.relationship.owned — WCAG 2.2 1.3.1', () => {
  it.each([
    ['dom', 'owns'],
    ['owns', 'dom'],
    ['owns', 'owns'],
  ] as const)(
    'accepts an indirect %s → %s group relationship',
    async (outer, inner) => {
      const result = await checkAccessibilitySpec({
        spec: LISTBOX_PATTERN,
        binding: 'fixture',
        state: 'indirect-owned-option',
        facts: {part: 'option', multiple: false, ownerGroup: 'group'},
        only: ['listbox.relationship.owned'],
        mount: async () => {
          const option =
            '<div id="option" role="option" aria-selected="false">Orange</div>';
          const group = `<div id="group" role="group" aria-label="Citrus" ${inner === 'owns' ? 'aria-owns="option"' : ''}>${inner === 'dom' ? option : ''}</div>`;
          document.body.innerHTML = `<div id="list" role="listbox" aria-label="Fruit" ${outer === 'owns' ? 'aria-owns="group"' : ''}>${outer === 'dom' ? group : ''}</div>${outer === 'owns' ? group : ''}${inner === 'owns' ? option : ''}`;
          return createJsdomHarness({
            subject: document.getElementById('option')!,
            related: {
              listbox: document.getElementById('list')!,
              group: document.getElementById('group')!,
            },
          });
        },
        unmount: () => document.body.replaceChildren(),
      });
      expect(result.results[0]?.status).toBe('pass');
    },
  );

  it('accepts an option contained by its listbox', async () => {
    const result = await checkOwnership(true);
    expect(result.results[0]?.status).toBe('pass');
  });

  it('detects an option disconnected from its listbox', async () => {
    const result = await checkOwnership(false);
    expect(result.results[0]?.status).toBe('fail');
    expect(result.results[0]?.detail).toBe(
      'the option is neither contained nor owned by its listbox',
    );
  });
});
