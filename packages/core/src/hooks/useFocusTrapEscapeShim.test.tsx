// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useFocusTrapEscapeShim.test.tsx
 * @input Uses vitest, @testing-library/react, useFocusTrap, Dialog, Lightbox,
 *   MobileNav, Tooltip, Popover
 * @output Tests that hasActiveFocusTrapEscape still means what it meant in
 *   0.4.2 — an Escape-dismissible FOCUS TRAP is active, not "a layer is open"
 * @position Testing; guards the deprecated public shim in useFocusTrap.ts
 *
 * The shim is public API. Its answer must not change now that Escape moved to
 * the shared stack: existing consumers still observe whether an
 * Escape-participating focus trap is active. Families that never trapped focus
 * stay out of this count; BottomSheetSwitcher preserves its historical modal
 * signal without registering a second dismissal owner.
 *
 * SYNC: When useFocusTrap.ts changes, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render} from '@testing-library/react';

import {hasActiveFocusTrapEscape, useFocusTrap} from './useFocusTrap';
import {Dialog} from '../Dialog/Dialog';
import {Lightbox} from '../Lightbox/Lightbox';
import {MobileNav} from '../MobileNav/MobileNav';
import {Popover} from '../Popover/Popover';
import {Tooltip} from '../Tooltip/Tooltip';
import {resetLayerStackForTests} from '../Layer/layerStack';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

afterEach(() => {
  resetLayerStackForTests();
});

function Trap({
  isActive = true,
  hasEscape = true,
  children,
}: {
  isActive?: boolean;
  hasEscape?: boolean;
  children?: React.ReactNode;
}) {
  const {containerRef} = useFocusTrap<HTMLDivElement>({
    isActive,
    onEscape: hasEscape ? () => {} : undefined,
  });
  return <div ref={containerRef}>{children}</div>;
}

describe('hasActiveFocusTrapEscape', () => {
  it('is false with nothing mounted', () => {
    expect(hasActiveFocusTrapEscape()).toBe(false);
  });

  it('is true for an active trap with an Escape handler', () => {
    render(<Trap />);
    expect(hasActiveFocusTrapEscape()).toBe(true);
  });

  it('is false for a trap with no Escape handler', () => {
    render(<Trap hasEscape={false} />);
    expect(hasActiveFocusTrapEscape()).toBe(false);
  });

  it('is false for an inactive trap', () => {
    render(<Trap isActive={false} />);
    expect(hasActiveFocusTrapEscape()).toBe(false);
  });

  it('is true for nested traps, and false again once both unmount', () => {
    const {unmount} = render(
      <Trap>
        <Trap />
      </Trap>,
    );
    expect(hasActiveFocusTrapEscape()).toBe(true);
    unmount();
    expect(hasActiveFocusTrapEscape()).toBe(false);
  });

  it('is true for an open Popover, which traps focus', () => {
    render(
      <Popover
        isOpen={true}
        onOpenChange={() => {}}
        content="Popover body"
        label="Popover">
        <button type="button">Open</button>
      </Popover>,
    );
    expect(hasActiveFocusTrapEscape()).toBe(true);
  });

  // The families below are all on the shared dismissal stack and none of them
  // traps focus. Answering `true` for these is what broke the bottom sheet.
  it('is false for an open Dialog', () => {
    render(
      <Dialog isOpen={true} onOpenChange={() => {}} aria-label="Dialog">
        Body
      </Dialog>,
    );
    expect(hasActiveFocusTrapEscape()).toBe(false);
  });

  it('is false for an open Lightbox', () => {
    render(
      <Lightbox
        isOpen={true}
        onOpenChange={() => {}}
        media={{src: '/photo.jpg', alt: 'A photo'}}
      />,
    );
    expect(hasActiveFocusTrapEscape()).toBe(false);
  });

  it('is false for an open MobileNav', () => {
    render(
      <MobileNav isOpen={true} onOpenChange={() => {}} label="Drawer">
        <span>Nav</span>
      </MobileNav>,
    );
    expect(hasActiveFocusTrapEscape()).toBe(false);
  });

  it('is false for a showing Tooltip', () => {
    render(
      <Tooltip content="Tip" isDefaultOpen={true}>
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    expect(hasActiveFocusTrapEscape()).toBe(false);
  });

  it('is true for a Popover inside a Dialog, and false once the Popover closes', () => {
    function Scene({isPopoverOpen}: {isPopoverOpen: boolean}) {
      return (
        <Dialog isOpen={true} onOpenChange={() => {}} aria-label="Dialog">
          <Popover
            isOpen={isPopoverOpen}
            onOpenChange={() => {}}
            content="Popover body"
            label="Popover">
            <button type="button">Open</button>
          </Popover>
        </Dialog>
      );
    }
    const {rerender} = render(<Scene isPopoverOpen={true} />);
    expect(hasActiveFocusTrapEscape()).toBe(true);

    rerender(<Scene isPopoverOpen={false} />);
    expect(hasActiveFocusTrapEscape()).toBe(false);
  });
});
