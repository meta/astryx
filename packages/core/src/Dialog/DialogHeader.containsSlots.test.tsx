// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The header row contains every slot: the row takes the most negative block
 * offset its slots need, and each slot the difference, which is never
 * negative, so a theme that paints the row sees its title inside it.
 */

import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import {DialogHeader} from './DialogHeader';
import {DrawerHeader} from '../Drawer/DrawerHeader';

const ROW_OFFSET = (prefix: string) =>
  `min(var(--_${prefix}-header-title-offset),var(--_${prefix}-header-end-offset),0px)`;

/** A declared value with its spaces dropped, as StyleX writes it. */
const squeezed = (value: string) => value.replace(/\s+/g, '');

describe.each([
  ['dialog', DialogHeader],
  ['drawer', DrawerHeader],
] as const)('a %s header row', (prefix, Header) => {
  it('takes the most negative offset, and each slot the difference', () => {
    render(
      <Header
        title="Title"
        onOpenChange={() => {}}
        startContent={<button type="button">Back</button>}
      />,
    );
    const title = screen.getByRole('heading', {name: 'Title'});
    const titleBlock = title.parentElement as HTMLElement;
    const row = titleBlock.parentElement as HTMLElement;
    const start = screen.getByRole('button', {name: 'Back'})
      .parentElement as HTMLElement;
    const end = screen.getByRole('button', {name: /close/i})
      .parentElement as HTMLElement;
    const offset = ROW_OFFSET(prefix);
    expect(
      squeezed(getComputedStyle(row).getPropertyValue('margin-block')),
    ).toBe(offset);
    expect(
      squeezed(getComputedStyle(titleBlock).getPropertyValue('margin-block')),
    ).toBe(squeezed(`calc(var(--_${prefix}-header-title-offset) - ${offset})`));
    expect(
      squeezed(getComputedStyle(start).getPropertyValue('margin-block')),
    ).toBe(squeezed(`calc(0px - ${offset})`));
    expect(
      squeezed(getComputedStyle(end).getPropertyValue('margin-block')),
    ).toBe(squeezed(`calc(var(--_${prefix}-header-end-offset) - ${offset})`));
  });
});
