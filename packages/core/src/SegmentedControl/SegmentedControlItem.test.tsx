// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SegmentedControlItem.test.tsx
 * @input Uses vitest, @testing-library/react, SegmentedControl components
 * @output Segment-level tests for the theming target, its state attributes,
 *   ref, and the attributes the segment owns
 * @position Component-owned regression tests for SegmentedControlItem; group
 *   behavior lives in SegmentedControl.test.tsx
 *
 * SYNC: When SegmentedControlItem changes, update tests to match new behavior
 */

import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {SegmentedControl} from './SegmentedControl';
import {SegmentedControlItem} from './SegmentedControlItem';

describe('SegmentedControlItem target and owned attributes (FR1, FR7)', () => {
  it('puts the segmented-control-item target with size, selected and disabled on each segment', () => {
    render(
      <SegmentedControl
        value="grid"
        onChange={() => {}}
        label="View mode"
        size="sm">
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" isDisabled />
      </SegmentedControl>,
    );
    const grid = screen.getByRole('radio', {name: 'Grid'});
    const list = screen.getByRole('radio', {name: 'List'});
    expect(grid.className).toContain('astryx-segmented-control-item');
    expect(grid).toHaveAttribute('data-size', 'sm');
    expect(grid).toHaveAttribute('data-selected');
    expect(grid).not.toHaveAttribute('data-disabled');
    expect(grid).toHaveAttribute('data-value', 'grid');
    expect(list).toHaveAttribute('data-disabled');
    expect(list).not.toHaveAttribute('data-selected');
  });

  it('connects ref to the segment button', () => {
    const ref = {current: null as HTMLButtonElement | null};
    render(
      <SegmentedControl value="grid" onChange={() => {}} label="View mode">
        <SegmentedControlItem ref={ref} value="grid" label="Grid" />
      </SegmentedControl>,
    );
    expect(ref.current).toBe(screen.getByRole('radio', {name: 'Grid'}));
  });

  it('keeps its role, checked state and Tab stop over caller values', () => {
    render(
      <SegmentedControl value="grid" onChange={() => {}} label="View mode">
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem
          value="list"
          label="List"
          role="tab"
          aria-checked
          tabIndex={0}
        />
      </SegmentedControl>,
    );
    const list = screen.getByRole('radio', {name: 'List'});
    expect(list).toHaveAttribute('aria-checked', 'false');
    expect(list).toHaveAttribute('tabindex', '-1');
  });
});
