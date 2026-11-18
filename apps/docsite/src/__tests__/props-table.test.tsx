// Copyright (c) Meta Platforms, Inc. and affiliates.

// @vitest-environment jsdom

/**
 * @file The static props table keeps every column readable on a narrow
 * screen: the Description column has a width floor, so the table scrolls
 * sideways instead of squeezing descriptions into a sliver. Every cell
 * starts at the top of its row.
 */

import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type * as TableModule from '@astryxdesign/core/Table';
import {PropsTable} from '../components/component-detail/PropsTable';

vi.mock('@stylexjs/stylex', () => ({
  create: <T,>(styles: T) => styles,
  props: () => ({}),
  defineVars: <T,>(vars: T) => vars,
  defineConsts: <T,>(consts: T) => consts,
}));

// Records the props PropsTable passes to Table, around the real Table.
const tableProps = vi.hoisted(() => ({current: {} as Record<string, unknown>}));
vi.mock('@astryxdesign/core/Table', async importOriginal => {
  const actual = await importOriginal<typeof TableModule>();
  const RealTable = actual.Table as (props: Record<string, unknown>) => unknown;
  return {
    ...actual,
    Table: (props: Record<string, unknown>) => {
      tableProps.current = props;
      return RealTable(props);
    },
  };
});

afterEach(cleanup);

const props = [
  {
    name: 'calendar',
    type: "'gregory' | 'iso8601' | 'buddhist' | 'roc' | 'japanese' | 'persian'",
    required: false,
    description: 'Calendar system of the subtree.',
  },
  {
    name: 'children',
    type: 'ReactNode',
    required: true,
    description: 'Content to render.',
  },
];

describe('PropsTable', () => {
  it('gives the Description column a readable floor', () => {
    render(<PropsTable props={props} heading="Props" />);
    const description = screen.getByRole('columnheader', {
      name: 'Description',
    });
    expect(description.style.minWidth).toBe('240px');
  });

  it('starts every cell at the top of its row', () => {
    render(<PropsTable props={props} heading="Props" />);
    // A long description makes a row tall; the name and type stay level
    // with its first line instead of sinking to the middle.
    expect(tableProps.current.verticalAlign).toBe('top');
  });

  it('makes the table at least as wide as all three column floors', () => {
    render(<PropsTable props={props} heading="Props" />);
    // Prop (180) + Type (240) + Description floor (240).
    expect(screen.getByRole('table').style.minWidth).toBe('660px');
  });
});
