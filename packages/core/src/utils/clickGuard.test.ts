// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file clickGuard.test.ts
 * @input Uses vitest and jsdom
 * @output An armed guard swallows the browser's next click before any page
 *   listener and is spent; a click whose detail is 0, one dispatched inside
 *   withoutClickGuard and the haptic switch's click pass; the next
 *   pointerdown and the window disarm it; it hears pointerdown only while
 *   armed; the menu press model's click listener stays, one per document,
 *   ahead of later ones, while the gesture host's lasts only while armed;
 *   the menu press model and the gesture host arm this one guard; an arm at
 *   a claimed touch's lift also takes that touch's late mousedown and mouseup
 * @position Unit tests of packages/core/src/utils/clickGuard.ts
 */

import {afterEach, describe, expect, it, vi} from 'vitest';

import {GestureHost} from '../gestures/GestureHost';
import {coarsePrimaryPointer} from '../gestures/__tests__/pointerQuery';
import {markHapticSwitch} from '../privateAttributes/hapticSwitch.stylex';
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

function mouse(
  type: 'mousedown' | 'mouseup',
  target: EventTarget,
  detail = 1,
): MouseEvent {
  const event = new MouseEvent(type, {bubbles: true, cancelable: true, detail});
  target.dispatchEvent(event);
  return event;
}

/** A tap that a recognizer on `target` claims, by touch events. */
function claimedTap(target: HTMLElement) {
  const contact = {identifier: 1, clientX: 5, clientY: 5, target};
  for (const type of ['touchstart', 'touchend'] as const) {
    const event = new Event(type, {bubbles: true, cancelable: true});
    Object.defineProperty(event, 'changedTouches', {value: [contact]});
    Object.defineProperty(event, 'touches', {
      value: type === 'touchend' ? [] : [contact],
    });
    target.dispatchEvent(event);
  }
}

/** A `touchend` at `target`, as a browser fires it after the touch's `pointerup`. */
function touchEnd(target: EventTarget, cancelable = true): Event {
  const event = new Event('touchend', {bubbles: true, cancelable});
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

  it("keeps its place ahead of a window listener the page adds after the menu press model's first gesture: installed once per document (module:DropdownMenu/useMenuPress PR2)", () => {
    const target = button();
    armClickGuard(document, {staysInstalled: true});
    disarmClickGuard(document);
    const heard = vi.fn();
    window.addEventListener('click', heard, {capture: true});
    try {
      // A later arm, the gesture host's included, uses the staying listener.
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

  it('armed by the gesture host, keeps its click listener only while armed: it goes at the click, at the next pointerdown and after its window (spec:AST-094 FR24)', () => {
    vi.useFakeTimers();
    const target = button();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const clicks = (spy: typeof add) =>
      spy.mock.calls.filter(call => call[0] === 'click').length;
    armClickGuard(document);
    expect(clicks(add)).toBe(1);
    expect(click(target).defaultPrevented).toBe(true);
    expect(clicks(remove)).toBe(1);
    armClickGuard(document);
    target.dispatchEvent(new Event('pointerdown', {bubbles: true}));
    expect(clicks(remove)).toBe(2);
    armClickGuard(document);
    vi.advanceTimersByTime(CLICK_GUARD_WINDOW_MS);
    expect(clicks(remove)).toBe(3);
    expect(clicks(add)).toBe(3);
  });

  it("armed at a claimed touch's lift, also takes that touch's late mousedown and mouseup, until its click (spec:AST-094 FR21)", () => {
    const target = button();
    const heard = vi.fn();
    const types = ['mousedown', 'mouseup', 'click'] as const;
    for (const type of types) {
      document.addEventListener(type, heard, {capture: true});
    }
    try {
      armClickGuard(document, {takesLateMouse: true});
      expect(mouse('mousedown', target).defaultPrevented).toBe(true);
      expect(mouse('mouseup', target).defaultPrevented).toBe(true);
      expect(click(target).defaultPrevented).toBe(true);
      expect(heard).not.toHaveBeenCalled();
      // Spent at the click: the next press is the page's.
      expect(mouse('mousedown', target).defaultPrevented).toBe(false);
      expect(heard).toHaveBeenCalledTimes(1);
    } finally {
      for (const type of types) {
        document.removeEventListener(type, heard, {capture: true});
      }
    }
  });

  it("leaves mousedown and mouseup to the page on any other arm, and always lets a keyboard's or the caller's through", () => {
    const target = button();
    armClickGuard(document);
    expect(mouse('mousedown', target).defaultPrevented).toBe(false);
    expect(mouse('mouseup', target).defaultPrevented).toBe(false);
    armClickGuard(document, {takesLateMouse: true});
    expect(mouse('mousedown', target, 0).defaultPrevented).toBe(false);
    expect(
      withoutClickGuard(() => mouse('mouseup', target)).defaultPrevented,
    ).toBe(false);
    expect(isClickGuardArmed(document)).toBe(true);
  });

  it('hears mousedown and mouseup only while armed at a claimed touch, and drops them when it disarms (spec:AST-094 FR24)', () => {
    vi.useFakeTimers();
    const target = button();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const late = (spy: typeof add) =>
      spy.mock.calls
        .map(call => call[0])
        .filter(type => type === 'mousedown' || type === 'mouseup');
    armClickGuard(document);
    expect(late(add)).toEqual([]);
    armClickGuard(document, {takesLateMouse: true});
    expect(late(add)).toEqual(['mousedown', 'mouseup']);
    target.dispatchEvent(new Event('pointerdown', {bubbles: true}));
    expect(late(remove)).toEqual(['mousedown', 'mouseup']);
    armClickGuard(document, {takesLateMouse: true});
    vi.advanceTimersByTime(CLICK_GUARD_WINDOW_MS);
    expect(late(remove)).toEqual([
      'mousedown',
      'mouseup',
      'mousedown',
      'mouseup',
    ]);
  });

  it("lets through a keyboard's or a screen reader's click, a click the caller dispatches, and the haptic switch's", () => {
    const target = button();
    armClickGuard(document);
    expect(click(target, 0).defaultPrevented).toBe(false);
    expect(withoutClickGuard(() => click(target)).defaultPrevented).toBe(false);
    const haptic = document.createElement('input');
    markHapticSwitch(haptic);
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

  it("hears pointerdown only while armed, and keeps the menu press model's one click listener", () => {
    armClickGuard(document, {staysInstalled: true});
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
      claimedTap(target);
      expect(isClickGuardArmed(document)).toBe(true);
      expect(click(target).defaultPrevented).toBe(true);
      detach();
    } finally {
      restorePointer();
    }
  });

  it("takes a claimed tap's late mousedown and mouseup with its click: WebKit sends them after the cancelled touchend of a held tap (spec:AST-094 FR21)", () => {
    const restorePointer = coarsePrimaryPointer();
    try {
      const host = new GestureHost(document);
      const target = button();
      const tap = new TapGestureRecognizer({name: 'tap'});
      const detach = host.attach(target, tap);
      claimedTap(target);
      expect(mouse('mousedown', target).defaultPrevented).toBe(true);
      expect(mouse('mouseup', target).defaultPrevented).toBe(true);
      expect(click(target).defaultPrevented).toBe(true);
      // The next press is the page's.
      expect(mouse('mousedown', target).defaultPrevented).toBe(false);
      detach();
    } finally {
      restorePointer();
    }
  });

  it("armed at a finger's release, cancels that touch's touchend and disarms: no click follows it", () => {
    const target = button();
    armClickGuard(document, {staysInstalled: true, cancelsTouchEnd: true});
    expect(touchEnd(target).defaultPrevented).toBe(true);
    expect(isClickGuardArmed(document)).toBe(false);
    // The next touch's touchend, and a click with no press behind it, are the page's.
    expect(touchEnd(target).defaultPrevented).toBe(false);
    expect(click(target).defaultPrevented).toBe(false);
  });

  it('leaves an uncancelable touchend alone, and stays armed for a click that may follow it', () => {
    const target = button();
    armClickGuard(document, {cancelsTouchEnd: true});
    expect(touchEnd(target, false).defaultPrevented).toBe(false);
    expect(isClickGuardArmed(document)).toBe(true);
    // Only that touch's touchend is its: a later one is the page's.
    expect(touchEnd(target).defaultPrevented).toBe(false);
    expect(click(target).defaultPrevented).toBe(true);
  });

  it('cancels no touchend on any other arm', () => {
    const target = button();
    armClickGuard(document, {staysInstalled: true});
    expect(touchEnd(target).defaultPrevented).toBe(false);
    armClickGuard(document, {takesLateMouse: true});
    expect(touchEnd(target).defaultPrevented).toBe(false);
    expect(isClickGuardArmed(document)).toBe(true);
  });

  it('hears touchend only while armed with it, and drops it at the next pointerdown and after its window', () => {
    vi.useFakeTimers();
    const target = button();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const touchEnds = (spy: typeof add) =>
      spy.mock.calls.map(call => call[0]).filter(type => type === 'touchend');
    armClickGuard(document);
    expect(touchEnds(add)).toEqual([]);
    armClickGuard(document, {cancelsTouchEnd: true});
    expect(touchEnds(add)).toEqual(['touchend']);
    target.dispatchEvent(new Event('pointerdown', {bubbles: true}));
    expect(touchEnds(remove)).toEqual(['touchend']);
    expect(touchEnd(target).defaultPrevented).toBe(false);
    armClickGuard(document, {cancelsTouchEnd: true});
    vi.advanceTimersByTime(CLICK_GUARD_WINDOW_MS);
    expect(isClickGuardArmed(document)).toBe(false);
    expect(touchEnds(remove)).toEqual(['touchend', 'touchend']);
  });
});
