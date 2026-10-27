// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file clickGuard.test.ts
 * @input Uses vitest and jsdom
 * @output An armed guard swallows the browser's next click before any page
 *   listener and is spent; a click whose detail is 0, one dispatched inside
 *   withoutClickGuard and the haptic switch's click pass; the next
 *   pointerdown and the window disarm it; it hears pointerdown only while
 *   armed and keeps one click listener per window, ahead of later ones; the
 *   menu press model and the gesture host arm this one guard
 * @position Unit tests of packages/core/src/utils/clickGuard.ts
 */

import {afterEach, describe, expect, it, vi} from 'vitest';

import {GestureHost} from '../gestures/GestureHost';
import {coarsePrimaryPointer} from '../gestures/__tests__/pointerQuery';
import {HAPTIC_SWITCH_ATTRIBUTE} from './hapticSwitch';
import {TapGestureRecognizer} from '../gestures/TapGestureRecognizer';
import {MENU_PRESS_STRAY_CLICK_MS} from '../hooks/useMenuPress';
import {
  __resetClickGuardForTest,
  armClickGuard,
  CLICK_GUARD_WINDOW_MS,
  disarmClickGuard,
  isClickGuardArmed,
  withoutClickGuard,
} from './clickGuard';

afterEach(() => {
  __resetClickGuardForTest();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function click(target: EventTarget, detail = 1): MouseEvent {
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    detail,
  });
  target.dispatchEvent(event);
  return event;
}

function button(): HTMLButtonElement {
  const element = document.createElement('button');
  document.body.append(element);
  return element;
}

describe('clickGuard', () => {
  it("swallows the browser's next click before any page listener, once", () => {
    const target = button();
    const heard = vi.fn();
    document.addEventListener('click', heard, {capture: true});
    armClickGuard(document);
    expect(click(target).defaultPrevented).toBe(true);
    expect(heard).not.toHaveBeenCalled();
    expect(isClickGuardArmed(document)).toBe(false);
    expect(click(target).defaultPrevented).toBe(false);
    expect(heard).toHaveBeenCalledTimes(1);
    document.removeEventListener('click', heard, {capture: true});
  });

  it('keeps its place ahead of a window listener the page adds after the first gesture: installed once per window', () => {
    const target = button();
    armClickGuard(document);
    disarmClickGuard(document);
    const heard = vi.fn();
    window.addEventListener('click', heard, {capture: true});
    try {
      armClickGuard(document);
      expect(click(target).defaultPrevented).toBe(true);
      expect(heard).not.toHaveBeenCalled();
      // Disarmed, every click passes, the page's listener included.
      expect(click(target).defaultPrevented).toBe(false);
      expect(heard).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('click', heard, {capture: true});
    }
  });

  it("lets through a keyboard's or a screen reader's click, a click the caller dispatches, and the haptic switch's", () => {
    const target = button();
    armClickGuard(document);
    expect(click(target, 0).defaultPrevented).toBe(false);
    expect(withoutClickGuard(() => click(target)).defaultPrevented).toBe(false);
    const haptic = document.createElement('input');
    haptic.setAttribute(HAPTIC_SWITCH_ATTRIBUTE, '');
    document.body.append(haptic);
    expect(click(haptic).defaultPrevented).toBe(false);
    // Still armed for the browser's own click.
    expect(isClickGuardArmed(document)).toBe(true);
    expect(click(target).defaultPrevented).toBe(true);
  });

  it('disarms at the next pointerdown, and after its window', () => {
    vi.useFakeTimers();
    const target = button();
    armClickGuard(document);
    target.dispatchEvent(new Event('pointerdown', {bubbles: true}));
    expect(isClickGuardArmed(document)).toBe(false);
    expect(click(target).defaultPrevented).toBe(false);

    armClickGuard(document);
    vi.advanceTimersByTime(CLICK_GUARD_WINDOW_MS - 1);
    expect(isClickGuardArmed(document)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isClickGuardArmed(document)).toBe(false);
    expect(click(target).defaultPrevented).toBe(false);
  });

  it('hears pointerdown only while armed, and keeps its one click listener', () => {
    armClickGuard(document);
    disarmClickGuard(document);
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    armClickGuard(document);
    expect(add.mock.calls.map(call => call[0])).toEqual(['pointerdown']);
    disarmClickGuard(document);
    expect(remove.mock.calls.map(call => call[0])).toEqual(['pointerdown']);
  });

  it('is the one guard the menu press model and the gesture host arm', () => {
    // A phone: the host attaches only where the primary pointer is coarse.
    const restorePointer = coarsePrimaryPointer();
    try {
      expect(MENU_PRESS_STRAY_CLICK_MS).toBe(CLICK_GUARD_WINDOW_MS);
      // A tap the host's recognizer claims arms the shared guard for the
      // browser's click.
      const host = new GestureHost(document);
      const target = button();
      const tap = new TapGestureRecognizer({name: 'tap'});
      const detach = host.attach(target, tap);
      const contact = {identifier: 1, clientX: 5, clientY: 5, target};
      for (const type of ['touchstart', 'touchend'] as const) {
        const event = new Event(type, {bubbles: true, cancelable: true});
        Object.defineProperty(event, 'changedTouches', {value: [contact]});
        Object.defineProperty(event, 'touches', {
          value: type === 'touchend' ? [] : [contact],
        });
        target.dispatchEvent(event);
      }
      expect(isClickGuardArmed(document)).toBe(true);
      expect(click(target).defaultPrevented).toBe(true);
      detach();
    } finally {
      restorePointer();
    }
  });
});

describe('a guard whose view goes away', () => {
  it('lets its window run out without touching the view it no longer has: a torn-down window takes its listeners with it', () => {
    vi.useFakeTimers();
    try {
      const listeners: string[] = [];
      const view = {
        addEventListener: (type: string) => listeners.push(type),
        removeEventListener: (type: string) => {
          listeners.splice(listeners.indexOf(type), 1);
        },
      } as unknown as Window & {removeEventListener?: unknown};
      const doc = {defaultView: view} as unknown as Document & {
        defaultView: Window | null;
      };
      (view as unknown as {document: Document}).document = doc;
      armClickGuard(doc);
      expect(isClickGuardArmed(doc)).toBe(true);
      // The window goes away before the guard's window runs out, as a test
      // environment's does between files, or a closed frame's.
      delete (view as {removeEventListener?: unknown}).removeEventListener;
      doc.defaultView = null;
      expect(() => vi.advanceTimersByTime(CLICK_GUARD_WINDOW_MS)).not.toThrow();
      expect(isClickGuardArmed(doc)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
