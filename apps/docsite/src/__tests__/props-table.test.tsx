// Copyright (c) Meta Platforms, Inc. and affiliates.

// @vitest-environment jsdom

/**
 * @file The static props table keeps every column readable on a narrow
 * screen: the Description column has a width floor, so the table scrolls
 * sideways instead of squeezing descriptions into a sliver.
 */

import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {PropsTable} from '../components/component-detail/PropsTable';

vi.mock('@stylexjs/stylex', () => ({
  create: <T,>(styles: T) => styles,
  props: () => ({}),
  defineVars: <T,>(vars: T) => vars,
  defineConsts: <T,>(consts: T) => consts,
}));

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

  it('makes the table at least as wide as all three column floors', () => {
    render(<PropsTable props={props} heading="Props" />);
    // Prop (180) + Type (240) + Description floor (240).
    expect(screen.getByRole('table').style.minWidth).toBe('660px');
  });
});
