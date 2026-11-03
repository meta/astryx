// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useBackdropPress.test.tsx
 * @input Dialog, Drawer and CommandPalette with their backdrop dismissal on
 * @output Tests that a backdrop press dismisses only when it starts and ends
 *   on the backdrop, for a mouse and for a finger, and that a cancelled
 *   pointer ends the press
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
        function press(down: Element, up: Element) {
          fireEvent.pointerDown(down, {pointerType});
          fireEvent.pointerUp(up, {pointerType});
          // The browser sends the click to the common ancestor.
          fireEvent.click(down === up ? down : backdropOf());
        }

        it('dismisses when it starts and ends on the backdrop', () => {
          const onOpenChange = vi.fn();
          render(renderMember(onOpenChange));
          const backdrop = backdropOf();
          press(backdrop, backdrop);
          expect(onOpenChange).toHaveBeenCalledWith(false);
        });

        it('does not dismiss when it starts inside and ends on the backdrop', () => {
          const onOpenChange = vi.fn();
          render(renderMember(onOpenChange));
          const backdrop = backdropOf();
          // Selecting text in the field and releasing past the edge.
          press(insideOf(backdrop), backdrop);
          expect(onOpenChange).not.toHaveBeenCalled();
        });

        it('does not dismiss when it starts on the backdrop and ends inside', () => {
          const onOpenChange = vi.fn();
          render(renderMember(onOpenChange));
          const backdrop = backdropOf();
          press(backdrop, insideOf(backdrop));
          expect(onOpenChange).not.toHaveBeenCalled();
        });

        it('does not dismiss after the pointer is cancelled', () => {
          const onOpenChange = vi.fn();
          render(renderMember(onOpenChange));
          const backdrop = backdropOf();
          fireEvent.pointerDown(backdrop, {pointerType});
          fireEvent.pointerCancel(backdrop, {pointerType});
          fireEvent.click(backdrop);
          expect(onOpenChange).not.toHaveBeenCalled();
        });

        it('does not carry one press over to the next', () => {
          const onOpenChange = vi.fn();
          render(renderMember(onOpenChange));
          const backdrop = backdropOf();
          fireEvent.pointerDown(backdrop, {pointerType});
          press(insideOf(backdrop), backdrop);
          expect(onOpenChange).not.toHaveBeenCalled();
        });
      });
    }
  },
);

// A nested layer stops its presses at its own root in the React tree, as
// layerClickBoundary does. The backdrop press still sees them.
function NestedLayer() {
  return (
    <div
      data-testid="nested-layer"
      onPointerDown={event => event.stopPropagation()}
      onPointerUp={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}>
      <input aria-label="Nested field" />
    </div>
  );
}

describe.each([
  {
    name: 'Dialog (purpose="info")',
    render: (onOpenChange: (isOpen: boolean) => void) => (
      <Dialog isOpen onOpenChange={onOpenChange} aria-label="Note">
        <NestedLayer />
      </Dialog>
    ),
  },
  {
    name: 'Drawer (scrim)',
    render: (onOpenChange: (isOpen: boolean) => void) => (
      <Drawer isOpen onOpenChange={onOpenChange} label="Note">
        <NestedLayer />
      </Drawer>
    ),
  },
])('a press through a nested layer on $name', ({render: renderMember}) => {
  it('a drag from the backdrop into the nested layer, then from it to the backdrop, does not dismiss', () => {
    const onOpenChange = vi.fn();
    render(renderMember(onOpenChange));
    const backdrop = backdropOf();
    const nested = screen.getByTestId('nested-layer');

    fireEvent.pointerDown(backdrop);
    fireEvent.pointerUp(nested);
    fireEvent.click(backdrop.firstElementChild ?? backdrop);

    fireEvent.pointerDown(nested);
    fireEvent.pointerUp(backdrop);
    fireEvent.click(backdrop);

    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
