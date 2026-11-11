// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';

import {shouldSuppressRowPress} from './rowPressGuard';

function makeRow(): {row: HTMLTableRowElement; cell: HTMLTableCellElement} {
  const table = document.createElement('table');
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  row.appendChild(cell);
  table.appendChild(row);
  document.body.appendChild(table);
  return {row, cell};
}

describe('shouldSuppressRowPress portal handling', () => {
  it('suppresses a press whose target renders outside the row by default', () => {
    const {row} = makeRow();
    const outside = document.createElement('span');
    document.body.appendChild(outside);
    try {
      // Portalled content renders outside the row: the press belongs to
      // that content, so the row stays out of it.
      expect(shouldSuppressRowPress(row, outside)).toBe(true);
    } finally {
      outside.remove();
      row.closest('table')?.remove();
    }
  });

  it('keeps released caller behavior with portal: false', () => {
    const {row} = makeRow();
    const outside = document.createElement('span');
    document.body.appendChild(outside);
    try {
      // Expansion and tree pass `false` until their owners decide, so a
      // press from portalled cell content still toggles their rows.
      expect(shouldSuppressRowPress(row, outside, {portal: false})).toBe(false);
    } finally {
      outside.remove();
      row.closest('table')?.remove();
    }
  });

  it('still suppresses nested interactive content with portal: false', () => {
    const {row, cell} = makeRow();
    const button = document.createElement('button');
    cell.appendChild(button);
    try {
      // The option only covers the containment check: an interactive
      // descendant inside the row still owns the press.
      expect(shouldSuppressRowPress(row, button, {portal: false})).toBe(true);
      expect(shouldSuppressRowPress(row, cell, {portal: false})).toBe(false);
    } finally {
      row.closest('table')?.remove();
    }
  });
});
