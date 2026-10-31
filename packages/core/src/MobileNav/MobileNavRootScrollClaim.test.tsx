// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MobileNavRootScrollClaim.test.tsx
 * @input Uses vitest, @testing-library/react, MobileNav and useScrollLock
 * @output Unit tests for MobileNav sharing the page's scroll styles with the
 *   scroll lock of another overlay
 * @position Testing; guards MobileNav.tsx's root `overflow` claim
 *
 * SYNC: When MobileNav.tsx changes, update tests to match new behavior
 */

import {afterEach, beforeAll, describe, expect, it} from 'vitest';
import {cleanup, render, renderHook} from '@testing-library/react';
import {MobileNav} from './MobileNav';
import {useScrollLock} from '../hooks/useScrollLock';

beforeAll(() => {
  // jsdom doesn't implement showModal/close on <dialog>
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

afterEach(() => {
  cleanup();
  document.documentElement.style.cssText = '';
});

const rootOverflow = () => document.documentElement.style.overflow;

describe('MobileNav root scroll claim', () => {
  it('clips the page while open and gives it back on close', () => {
    const nav = render(
      <MobileNav isOpen onOpenChange={() => {}}>
        Nav
      </MobileNav>,
    );
    expect(rootOverflow()).toBe('clip');

    nav.rerender(
      <MobileNav isOpen={false} onOpenChange={() => {}}>
        Nav
      </MobileNav>,
    );
    expect(rootOverflow()).toBe('');
  });

  it('leaves the scroll lock of another overlay in place when it closes', () => {
    const nav = render(
      <MobileNav isOpen onOpenChange={() => {}}>
        Nav
      </MobileNav>,
    );
    const lock = renderHook(() => useScrollLock(true));
    expect(rootOverflow()).toBe('hidden');

    nav.rerender(
      <MobileNav isOpen={false} onOpenChange={() => {}}>
        Nav
      </MobileNav>,
    );
    expect(rootOverflow()).toBe('hidden');

    lock.unmount();
    expect(rootOverflow()).toBe('');
  });

  it('leaves the scroll lock of another overlay in place when it unmounts', () => {
    const nav = render(
      <MobileNav isOpen onOpenChange={() => {}}>
        Nav
      </MobileNav>,
    );
    const lock = renderHook(() => useScrollLock(true));

    nav.unmount();
    expect(rootOverflow()).toBe('hidden');

    lock.unmount();
    expect(rootOverflow()).toBe('');
  });
});
