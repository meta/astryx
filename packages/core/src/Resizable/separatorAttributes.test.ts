// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file separatorAttributes.test.ts
 * @input vitest, separatorAttributes
 * @output Checks the separator's ARIA attributes and tab stop for an open,
 *   collapsed, disabled and unbounded region, and for no region
 * @position Unit tests for separatorAttributes.ts
 */

import {describe, expect, it} from 'vitest';
import {separatorAttributes} from './separatorAttributes';

const value = {
  size: 240,
  minPx: 100,
  maxPx: 400,
  isCollapsed: false,
  collapsedText: 'Collapsed',
};

describe('separatorAttributes', () => {
  it('announces an open region: its orientation, value, bounds and a tab stop', () => {
    expect(
      separatorAttributes({direction: 'horizontal', isDisabled: false, value}),
    ).toEqual({
      'aria-orientation': 'vertical',
      'aria-valuenow': 240,
      'aria-valuemin': 100,
      'aria-valuemax': 400,
      'aria-valuetext': undefined,
      'aria-disabled': undefined,
      tabIndex: 0,
    });
  });

  it('announces a collapsed region at its minimum, with its collapsed text', () => {
    const aria = separatorAttributes({
      direction: 'vertical',
      isDisabled: false,
      value: {...value, size: 0, isCollapsed: true},
    });
    expect(aria['aria-orientation']).toBe('horizontal');
    expect(aria['aria-valuenow']).toBe(100);
    expect(aria['aria-valuetext']).toBe('Collapsed');
  });

  it('takes a disabled separator out of the tab order and says it is disabled', () => {
    const aria = separatorAttributes({
      direction: 'horizontal',
      isDisabled: true,
      value,
    });
    expect(aria.tabIndex).toBe(-1);
    expect(aria['aria-disabled']).toBe(true);
  });

  it('announces no maximum for an unbounded region, and no value without a region', () => {
    expect(
      separatorAttributes({
        direction: 'horizontal',
        isDisabled: false,
        value: {...value, maxPx: Infinity},
      })['aria-valuemax'],
    ).toBeUndefined();
    const bare = separatorAttributes({
      direction: 'horizontal',
      isDisabled: false,
    });
    expect(bare['aria-valuenow']).toBeUndefined();
    expect(bare['aria-valuemin']).toBeUndefined();
    expect(bare['aria-valuemax']).toBeUndefined();
    expect(bare.tabIndex).toBe(0);
  });
});
