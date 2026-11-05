// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MobileNavNestedTouch.test.tsx
 * @input MobileNav, open
 * @output Tests for the scrim beside the drawer: a tap on it closes the nav
 * @position The scrim holds the touch-action block; jsdom drops
 *   `touch-action`, so `__tests__/MobileNavNestedTouch.a11y.chromium.spec.ts`
 *   checks the declarations in a real browser.
 */

import {beforeAll, describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import {MobileNav} from './MobileNav';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

describe('MobileNav scrim', () => {
  it('closes the nav on a tap beside the drawer', () => {
    const onOpenChange = vi.fn();
    render(
      <MobileNav isOpen onOpenChange={onOpenChange} header="Menu">
        <p>Links</p>
      </MobileNav>,
    );
    const dialog = screen.getByRole('dialog', {hidden: true});
    const scrim = dialog.lastElementChild;
    if (scrim == null) {
      throw new Error('no scrim');
    }
    expect(scrim).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(screen.getByText('Links'));
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.click(scrim);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
