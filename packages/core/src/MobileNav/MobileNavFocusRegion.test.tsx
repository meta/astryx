// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MobileNavFocusRegion.test.tsx
 * @input vitest, @testing-library/react, MobileNav
 * @output Tab and Shift+Tab wrap inside the open drawer
 * @position Testing; MobileNav applies the shared focus-region module
 */

import {describe, it, expect, beforeAll} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {MobileNav} from './MobileNav';
import {getFocusableElements} from '../hooks/useFocusTrap';

// jsdom doesn't implement showModal/close on <dialog>.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal =
    HTMLDialogElement.prototype.showModal ||
    function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  HTMLDialogElement.prototype.close =
    HTMLDialogElement.prototype.close ||
    function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
});

function Drawer() {
  return (
    <MobileNav isOpen onOpenChange={() => {}} header="Menu">
      <a href="#home">Home</a>
      <a href="#settings">Settings</a>
    </MobileNav>
  );
}

describe('MobileNav focus region', () => {
  it('wraps Tab from the last control to the first and back', () => {
    render(<Drawer />);
    const drawer = screen.getByRole('dialog');
    const tabbables = getFocusableElements(drawer);
    expect(tabbables.length).toBeGreaterThan(1);
    const first = tabbables[0];
    const last = tabbables[tabbables.length - 1];

    last.focus();
    expect(fireEvent.keyDown(last, {key: 'Tab'})).toBe(false);
    expect(first).toHaveFocus();

    expect(fireEvent.keyDown(first, {key: 'Tab', shiftKey: true})).toBe(false);
    expect(last).toHaveFocus();
  });

  it('wraps Shift+Tab from the focused drawer panel to the last control', () => {
    render(<Drawer />);
    const drawer = screen.getByRole('dialog');
    const tabbables = getFocusableElements(drawer);
    const last = tabbables[tabbables.length - 1];
    // Opening focuses the drawer panel itself, which is not a Tab stop.
    const panel = drawer.querySelector<HTMLElement>('[tabindex="-1"]');
    expect(panel).not.toBeNull();
    panel!.focus();

    expect(fireEvent.keyDown(panel!, {key: 'Tab', shiftKey: true})).toBe(false);
    expect(last).toHaveFocus();
  });

  it('leaves Tab alone once the drawer is closed', () => {
    const {rerender} = render(
      <>
        <button type="button">Page</button>
        <Drawer />
      </>,
    );
    rerender(
      <>
        <button type="button">Page</button>
        <MobileNav isOpen={false} onOpenChange={() => {}} header="Menu">
          <a href="#home">Home</a>
        </MobileNav>
      </>,
    );
    const page = screen.getByRole('button', {name: 'Page', hidden: true});
    page.focus();
    expect(fireEvent.keyDown(page, {key: 'Tab'})).toBe(true);
  });
});
