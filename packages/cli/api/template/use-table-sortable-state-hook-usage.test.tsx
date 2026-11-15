// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useTableSortableState example is an orders Table with no sort code of
 * its own. Clicking Customer and then Shift-clicking Total sorts by customer,
 * then by total within each customer.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import UseTableSortableStateHookUsage from '../../assets/templates/blocks/components/Table/useTableSortableStateHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function orderIds(): string[] {
  return Array.from(container.querySelectorAll('tbody tr')).map(
    row => row.querySelector('td')?.textContent ?? '',
  );
}

function sortedBy(): string {
  return (
    Array.from(container.querySelectorAll('span'))
      .find(span => span.textContent?.startsWith('Sorted by:'))
      ?.textContent?.replace('Sorted by: ', '') ?? ''
  );
}

function clickHeader(label: string, shiftKey = false): void {
  const button = Array.from(container.querySelectorAll('th button')).find(
    candidate => candidate.textContent?.startsWith(label),
  );
  if (button == null) {
    throw new Error(`no sortable header "${label}"`);
  }
  act(() => {
    button.dispatchEvent(
      new MouseEvent('click', {bubbles: true, cancelable: true, shiftKey}),
    );
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseTableSortableStateHookUsage />);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('useTableSortableState example', () => {
  it('starts unsorted, in data order', () => {
    expect(sortedBy()).toBe('none');
    expect(orderIds()).toEqual([
      '1042',
      '1043',
      '1044',
      '1045',
      '1046',
      '1047',
      '1048',
    ]);
  });

  it('sorts by customer on a click, keeping data order within a customer', () => {
    clickHeader('Customer');
    expect(sortedBy()).toBe('customer ascending');
    expect(orderIds()).toEqual([
      '1043',
      '1045',
      '1048',
      '1044',
      '1047',
      '1042',
      '1046',
    ]);
  });

  it('adds total as the tiebreaker on a Shift-click', () => {
    clickHeader('Customer');
    clickHeader('Total', true);
    expect(sortedBy()).toBe('customer ascending, then total ascending');
    expect(orderIds()).toEqual([
      '1045',
      '1048',
      '1043',
      '1044',
      '1047',
      '1046',
      '1042',
    ]);
  });
});
