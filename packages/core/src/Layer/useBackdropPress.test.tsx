// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useBackdropPress.test.tsx
 * @input Dialog, Drawer and CommandPalette with their backdrop dismissal on
 * @output Tests that a backdrop press dismisses only when it starts and ends
 *   on the backdrop, for a mouse and for a finger
 * @position The shared backdrop-press rule (useBackdropPress) through every
 *   member that uses it
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import type {ReactElement} from 'react';
import {Dialog} from '../Dialog/Dialog';
import {Drawer} from '../Drawer/Drawer';
import {CommandPalette} from '../CommandPalette/CommandPalette';
import {createStaticSource} from '../Typeahead/createStaticSource';
import {resetLayerStackForTests} from './layerStack';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
  // Closing releases the scroll lock, which restores the scroll position.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  resetLayerStackForTests();
});

type Member = {
  name: string;
  render: (onOpenChange: (isOpen: boolean) => void) => ReactElement;
};

const MEMBERS: Member[] = [
  {
    name: 'Dialog (purpose="info")',
    render: onOpenChange => (
      <Dialog isOpen onOpenChange={onOpenChange} aria-label="Note">
        <input aria-label="Field" defaultValue="A note to select" />
      </Dialog>
    ),
  },
  {
    name: 'Drawer (scrim)',
    render: onOpenChange => (
      <Drawer isOpen onOpenChange={onOpenChange} label="Note">
        <input aria-label="Field" defaultValue="A note to select" />
      </Drawer>
    ),
  },
  {
    name: 'CommandPalette',
    render: onOpenChange => (
      <CommandPalette
        isOpen
        onOpenChange={onOpenChange}
        aria-label="Note"
        searchSource={createStaticSource([])}
      />
    ),
  },
];

const backdropOf = () => screen.getAllByRole('dialog', {hidden: true})[0];
const insideOf = (backdrop: HTMLElement) =>
  backdrop.querySelector<HTMLElement>('input') ?? backdrop.firstElementChild!;

describe.each(MEMBERS)(
  'a backdrop press on $name',
  ({render: renderMember}) => {
    for (const pointerType of ['mouse', 'touch'] as const) {
      describe(`with a ${pointerType}`, () => {
        it('dismisses when it starts and ends on the backdrop', () => {
          const onOpenChange = vi.fn();
          render(renderMember(onOpenChange));
          const backdrop = backdropOf();
          fireEvent.pointerDown(backdrop, {pointerType});
          fireEvent.click(backdrop);
          expect(onOpenChange).toHaveBeenCalledWith(false);
        });

        it('does not dismiss when it starts inside and ends on the backdrop', () => {
          const onOpenChange = vi.fn();
          render(renderMember(onOpenChange));
          const backdrop = backdropOf();
          // Selecting text in the field and releasing past the edge: the
          // browser sends the click to the common ancestor, the <dialog>.
          fireEvent.pointerDown(insideOf(backdrop), {pointerType});
          fireEvent.click(backdrop);
          expect(onOpenChange).not.toHaveBeenCalled();
        });

        it('does not carry a backdrop start over to the next press', () => {
          const onOpenChange = vi.fn();
          render(renderMember(onOpenChange));
          const backdrop = backdropOf();
          fireEvent.pointerDown(backdrop, {pointerType});
          fireEvent.pointerDown(insideOf(backdrop), {pointerType});
          fireEvent.click(backdrop);
          expect(onOpenChange).not.toHaveBeenCalled();
        });
      });
    }
  },
);
