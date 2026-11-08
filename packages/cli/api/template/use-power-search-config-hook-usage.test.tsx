// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The usePowerSearchConfig example demonstrates PowerSearch paired with Table
 * to search and filter people directory rows.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import UsePowerSearchConfigHookUsage from '../../assets/templates/blocks/components/PowerSearch/usePowerSearchConfigHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function rowNames(): string[] {
  return Array.from(container.querySelectorAll('tbody tr')).map(
    row => row.querySelector('td')?.textContent?.trim() ?? '',
  );
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UsePowerSearchConfigHookUsage />);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('usePowerSearchConfig example', () => {
  it('renders all directory people rows initially', () => {
    expect(rowNames()).toEqual([
      'Alice Chen',
      'Bob Dylan',
      'Charlie Kim',
      'Dana Scully',
      'Evan Wright',
    ]);
  });

  it('renders PowerSearch input with placeholder', () => {
    const input = container.querySelector('input');
    expect(input).not.toBeNull();
    expect(input?.placeholder).toBe(
      'Filter directory by name, status, start date...',
    );
  });
});
