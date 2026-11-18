// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The header row contains every slot and takes no negative margin: the most
 * negative block offset its slots need goes to the LayoutHeader, whose
 * padding gives way by it, and each slot takes the difference, which is never
 * negative. A theme that paints the row sees its title inside it, and a
 * theme's padding on the row sets its height.
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import {DialogHeader} from './DialogHeader';
import {DrawerHeader} from '../Drawer/DrawerHeader';
import {Dialog} from './Dialog';
import {Drawer} from '../Drawer/Drawer';
import {Layout, LayoutContent} from '../Layout';

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
    // The row's margin is the part of the reach its header's padding cannot
    // give: none where the padding covers the reach.
    expect(squeezed(getComputedStyle(row).getPropertyValue('margin-top'))).toBe(
      squeezed(
        'min(0px, calc(var(--container-padding-block-start, 0px) - var(--_layout-header-block-bleed, 0px)))',
      ),
    );
    const header = row.parentElement?.parentElement as HTMLElement;
    expect(
      squeezed(
        getComputedStyle(header).getPropertyValue(
          '--_layout-header-block-bleed',
        ),
      ),
    ).toBe(squeezed(`calc(0px - ${offset})`));
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

/**
 * A header whose padding is smaller than its reach keeps its released size:
 * its padding gives way to zero and the row takes the rest of the reach as a
 * negative margin (`<Dialog padding={0}>` stays 16px tall around a 32px
 * close action).
 */
describe('a header with padding below its reach', () => {
  // A modal Drawer opens with showModal and closes with close, which jsdom
  // lacks.
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.removeAttribute('open');
    });
  });

  const rowOf = (title: string) =>
    screen.getByRole('heading', {name: title}).parentElement
      ?.parentElement as HTMLElement;

  it('in a Dialog with padding 0 takes the reach its padding cannot give', () => {
    render(
      <Dialog isInline isOpen onOpenChange={() => {}} padding={0}>
        <Layout
          header={<DialogHeader title="Zero" onOpenChange={() => {}} />}
          content={<LayoutContent>Body</LayoutContent>}
        />
      </Dialog>,
    );
    const row = rowOf('Zero');
    for (const edge of ['start', 'end'])
      expect(
        squeezed(
          getComputedStyle(row).getPropertyValue(
            edge === 'start' ? 'margin-top' : 'margin-bottom',
          ),
        ),
      ).toBe(
        squeezed(
          `min(0px, calc(var(--container-padding-block-${edge}, 0px) - var(--_layout-header-block-bleed, 0px)))`,
        ),
      );
  });

  it('in a Drawer with padding 1 takes the reach its padding cannot give', () => {
    render(
      <Drawer isOpen onOpenChange={() => {}} label="Panel" padding={1}>
        <Layout
          header={<DrawerHeader title="Small" onOpenChange={() => {}} />}
          content={<LayoutContent>Body</LayoutContent>}
        />
      </Drawer>,
    );
    const row = rowOf('Small');
    expect(squeezed(getComputedStyle(row).getPropertyValue('margin-top'))).toBe(
      squeezed(
        'min(0px, calc(var(--container-padding-block-start, 0px) - var(--_layout-header-block-bleed, 0px)))',
      ),
    );
  });
});
