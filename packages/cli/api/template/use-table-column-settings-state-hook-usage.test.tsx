// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useTableColumnSettingsState example pairs the headless state with a
 * checkbox Columns menu: unchecking Email hides the column from the table,
 * the always-visible Name checkbox is checked and disabled, and Reset to
 * default restores the saved column set (bringing Department back after it
 * was hidden).
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseTableColumnSettingsStateHookUsage from '../../assets/templates/blocks/components/Table/useTableColumnSettingsStateHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

const headers = () =>
  Array.from(container.querySelectorAll('th')).map(th => th.textContent ?? '');

const checkbox = (label: string) => {
  const forId = Array.from(container.querySelectorAll('label'))
    .find(l => l.textContent === label)
    ?.getAttribute('for');
  if (!forId) return null;
  const input = Array.from(container.querySelectorAll('input')).find(
    candidate => candidate.id === forId,
  );
  return input ?? null;
};

const openMenu = () => {
  const button = Array.from(container.querySelectorAll('button')).find(
    b => b.textContent === 'Columns',
  );
  act(() => button?.click());
};

const toggle = (label: string) => {
  const input = checkbox(label);
  act(() => input?.click());
};

const reset = () => {
  const button = Array.from(container.querySelectorAll('button')).find(
    b => b.textContent === 'Reset to default',
  );
  act(() => button?.click());
};

describe('useTableColumnSettingsStateHookUsage example', () => {
  it('hides a column on uncheck and keeps the locked column locked', () => {
    root = createRoot(container);
    act(() => root!.render(<UseTableColumnSettingsStateHookUsage />));
    // Default set: Department hidden.
    expect(headers()).toEqual(['Name', 'Email', 'Role']);

    openMenu();
    // Name is always visible: checked and disabled.
    const nameInput = checkbox('Name') as HTMLInputElement;
    // A disabled checkbox stays focusable via aria-disabled, not the native
    // attribute (see CheckboxInput).
    expect(nameInput?.getAttribute('aria-disabled')).toBe('true');
    expect(nameInput?.checked).toBe(true);

    // Uncheck Email: the column disappears from the table.
    toggle('Email');
    expect(headers()).toEqual(['Name', 'Role']);

    // Check Department: it appears at the end (appended by toggleColumn).
    toggle('Department');
    expect(headers()).toEqual(['Name', 'Role', 'Department']);
  });

  it('resetToDefault restores the saved column set', () => {
    root = createRoot(container);
    act(() => root!.render(<UseTableColumnSettingsStateHookUsage />));

    openMenu();
    toggle('Department'); // on
    toggle('Email'); // off
    expect(headers()).toEqual(['Name', 'Role', 'Department']);

    reset();
    expect(headers()).toEqual(['Name', 'Email', 'Role']);
  });
});
