// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MobileNavRootScrollClaim.test.tsx
 * @input Uses vitest, @testing-library/react, MobileNav, useScrollLock and
 *   the primary-pointer test helper
 * @output Unit tests for MobileNav's scroll lock: its claims, its one-finger
 *   hold, and another overlay's lock left in place
 * @position Testing; guards MobileNav.tsx's use of useScrollLock
 *
 * SYNC: When MobileNav.tsx changes, update tests to match new behavior
 */

import {afterEach, beforeAll, describe, expect, it} from 'vitest';
import {cleanup, render, renderHook} from '@testing-library/react';
import {MobileNav} from './MobileNav';
import {useScrollLock} from '../hooks/useScrollLock';
import {coarsePrimaryPointer} from '../gestures/__tests__/pointerQuery';

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
  document.body.style.cssText = '';
});

const rootOverflow = () => document.documentElement.style.overflow;

/** One finger's touch event at (100, y) on `target`. */
function touch(
  target: EventTarget,
  type: 'touchstart' | 'touchmove' | 'touchend',
  y: number,
): Event {
  if (type === 'touchstart') {
    // A browser sends a contact's pointerdown before its touchstart.
    const down = new Event('pointerdown', {bubbles: true, composed: true});
    Object.assign(down, {
      pointerType: 'touch',
      pointerId: 1,
      isPrimary: true,
      clientX: 100,
      clientY: y,
    });
    target.dispatchEvent(down);
  }
  const event = new Event(type, {bubbles: true, cancelable: true});
  const point = {clientX: 100, clientY: y, identifier: 0, target};
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' ? [] : [point],
  });
  Object.defineProperty(event, 'changedTouches', {value: [point]});
  target.dispatchEvent(event);
  return event;
}

/** A one-finger pan from y0 to y1, returning whether its move was cancelled. */
function pan(target: EventTarget, y0: number, y1: number): boolean {
  touch(target, 'touchstart', y0);
  const move = touch(target, 'touchmove', y1);
  touch(target, 'touchend', y1);
  return move.defaultPrevented;
}

describe('MobileNav root scroll claim', () => {
  it("hides the page's overflow while open and gives it back on close", () => {
    const nav = render(
      <MobileNav isOpen onOpenChange={() => {}}>
        Nav
      </MobileNav>,
    );
    expect(rootOverflow()).toBe('hidden');

    nav.rerender(
      <MobileNav isOpen={false} onOpenChange={() => {}}>
        Nav
      </MobileNav>,
    );
    expect(rootOverflow()).toBe('');
  });

  it("stops the page's pull-to-refresh and bounce while open and gives them back on close", () => {
    const nav = render(
      <MobileNav isOpen onOpenChange={() => {}}>
        Nav
      </MobileNav>,
    );
    expect(document.documentElement.style.overscrollBehaviorY).toBe('none');
    expect(document.body.style.overscrollBehaviorY).toBe('none');

    nav.rerender(
      <MobileNav isOpen={false} onOpenChange={() => {}}>
        Nav
      </MobileNav>,
    );
    expect(document.documentElement.style.overscrollBehaviorY).toBe('');
    expect(document.body.style.overscrollBehaviorY).toBe('');
  });

  it('holds a one-finger pan on the page beside the open drawer, where the primary pointer is coarse', () => {
    const restorePointer = coarsePrimaryPointer();
    const strip = document.createElement('div');
    document.body.append(strip);
    try {
      const nav = render(
        <MobileNav isOpen onOpenChange={() => {}}>
          Nav
        </MobileNav>,
      );
      expect(pan(strip, 300, 200)).toBe(true);

      nav.rerender(
        <MobileNav isOpen={false} onOpenChange={() => {}}>
          Nav
        </MobileNav>,
      );
      expect(pan(strip, 300, 200)).toBe(false);
    } finally {
      strip.remove();
      restorePointer();
    }
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
