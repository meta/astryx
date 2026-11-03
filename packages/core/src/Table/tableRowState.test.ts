// Copyright (c) Meta Platforms, Inc. and affiliates.
import {describe, it, expect} from 'vitest';
import {setRowActivation, setRowSelection} from './tableRowState';
describe('parent row state painting', () => {
  it('preserves activation while selection opts out, in either update order', () => {
    for (const reversed of [false, true]) {
      const row = document.createElement('tr');
      if (reversed) {
        setRowActivation(row, true);
        setRowSelection(row, true, false);
      } else {
        setRowSelection(row, true, false);
        setRowActivation(row, true);
      }
      expect(row.getAttribute('aria-current')).toBe('true');
      expect(row.getAttribute('aria-selected')).toBe('true');
      expect(row.style.getPropertyValue('--table-row-overlay')).not.toBe('');
      setRowActivation(row, false);
      expect(row.style.getPropertyValue('--table-row-overlay')).toBe('');
      expect(row.getAttribute('aria-selected')).toBe('true');
    }
  });
  it('restores selection wash when active state clears and removes all owned cue state on reset', () => {
    const row = document.createElement('tr');
    setRowSelection(row, true, true);
    const wash = row.style.backgroundColor;
    setRowActivation(row, true);
    setRowActivation(row, false);
    expect(row.style.backgroundColor).toBe(wash);
    expect(row.style.getPropertyValue('--table-row-active-cue-width')).toBe('');
    setRowSelection(row, false, true);
    expect(row.style.backgroundColor).toBe('');
  });
});
