// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pressFeedback.test.ts
 * @input pressFeedback.ts, pressGesture.ts and interactionOverlay.stylex.ts
 * @output Unit tests for the DOM half of the touch press model: one delegated
 *   controller, one attribute, and the two properties a per-element hook
 *   would give away — that the paint belongs to the element the finger landed
 *   on and that a list pays nothing per row for it — plus the CSS arms the
 *   attribute drives: the release runs on the machine's own clock
 * @position Testing; validates pressFeedback.ts in jsdom
 */

import * as stylex from '@stylexjs/stylex';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {button} from '../motion/uikit/button';
import {
  durationToMs,
  hasReleaseFade,
  readsPressStrength,
  declaresPressPaint,
  rulesDeclaredFor,
  rulesWithSelector,
} from '../__tests__/pressState';
import {controlPressConsts} from './controlPressLayer.stylex';
import {
  interactionOverlayStyles,
  pressConsts,
} from './interactionOverlay.stylex';
import {
  cellPressableProps,
  installPressFeedback,
  paintPress,
  PRESS_PROFILES,
  PRESSABLE_ATTRIBUTE,
  PRESSED_ATTRIBUTE,
  PRESS_INPUT_ATTRIBUTE,
  pressableProps,
} from './pressFeedback';
import {
  PRESS_FADE_MS,
  PRESS_FLASH_MS,
  PRESS_ONSET_MS,
  PRESS_SCROLL_BRAKE_MS,
  PRESS_SLOP_PX,
} from './pressGesture';
import {pointerQuery} from '../gestures/__tests__/pointerQuery';

let release: () => void = () => undefined;
let scroller: HTMLElement;
let rows: HTMLElement[];

function press(
  element: Element,
  type: string,
  x: number,
  y: number,
  pointerType = 'touch',
): void {
  const event = new Event(type, {bubbles: true, cancelable: true});
  Object.assign(event, {
    button: 0,
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType,
  });
  element.dispatchEvent(event);
}

const pressedRow = (): number =>
  rows.findIndex(row => row.getAttribute(PRESSED_ATTRIBUTE) === 'on');

/** A pressable surface: a control unless the marker says `cell`. */
function pressable(tag = 'div', marker = ''): HTMLElement {
  const element = document.createElement(tag);
  element.setAttribute(PRESSABLE_ATTRIBUTE, marker);
  return element;
}

/**
 * The primary pointer is coarse (a phone, a tablet) until the returned
 * restore runs: jsdom's matchMedia models a desktop, where touch work stays
 * off (`spec:AST-094` FR19).
 */
function coarsePrimaryPointer(): () => void {
  const matchMedia = window.matchMedia;
  window.matchMedia = (query: string) => ({
    ...matchMedia(query),
    matches: query.includes('(pointer: coarse)') || matchMedia(query).matches,
  });
  const restore = (): void => {
    window.matchMedia = matchMedia;
  };
  matchMediaRestorers.push(restore);
  return restore;
}

/** Restores every pointer stub a test left, so none leaks into the next. */
const matchMediaRestorers: (() => void)[] = [];

/** The platform takes the touch away: a touchcancel that leaves no finger. */
function cancelTouch(): void {
  const event = new Event('touchcancel');
  Object.assign(event, {touches: []});
  window.dispatchEvent(event);
}

/** The last finger leaves the glass. */
function lift(element: Element): void {
  const event = new Event('touchend', {bubbles: true});
  Object.assign(event, {touches: []});
  element.dispatchEvent(event);
}

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom has no `scrollend`; the engines this targets fire it after a fling.
  Object.defineProperty(window, 'onscrollend', {
    configurable: true,
    writable: true,
    value: null,
  });
  document.body.innerHTML = '';
  scroller = document.createElement('div');
  // The rows sit in a scroll view, as a list's do.
  makeScroller(scroller);
  rows = [];
  for (let index = 0; index < 4; index += 1) {
    // List rows are cells: inside the scroll view they wait the content-touch
    // delay (FR11).
    const row = pressable('div', 'cell');
    const label = document.createElement('span');
    label.textContent = `row ${index}`;
    row.appendChild(label);
    scroller.appendChild(row);
    rows.push(row);
  }
  document.body.appendChild(scroller);
  release = installPressFeedback();
});

afterEach(() => {
  release();
  vi.useRealTimers();
  for (const restore of matchMediaRestorers.splice(0).reverse()) {
    restore();
  }
});

describe('the press reaches the surface the finger landed on', () => {
  it('keeps native long-press selection on the row and its switch input while a finger is held: the hold does nothing (spec:AST-094 FR41)', () => {
    coarsePrimaryPointer();
    const row = pressable('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('role', 'switch');
    row.appendChild(input);
    document.body.appendChild(row);
    press(input, 'pointerdown', 10, 10);
    vi.advanceTimersByTime(600);
    expect(row.style.getPropertyValue('user-select')).toBe('');
    expect(input.style.getPropertyValue('user-select')).toBe('');
    press(input, 'pointerup', 10, 10);
    expect(row.style.getPropertyValue('user-select')).toBe('');
    expect(input.style.getPropertyValue('user-select')).toBe('');
    // A mouse never locks anything.
    press(input, 'pointerdown', 10, 10, 'mouse');
    expect(row.style.getPropertyValue('user-select')).toBe('');
    press(input, 'pointerup', 10, 10, 'mouse');
  });

  it('writes no selection or callout lock on any surface: a link keeps its native menu and a row its long-press selection (spec:AST-094 FR41)', () => {
    coarsePrimaryPointer();
    // jsdom drops -webkit-touch-callout, so every 'none' write is recorded.
    const written: string[] = [];
    const setProperty = CSSStyleDeclaration.prototype.setProperty;
    const spy = vi
      .spyOn(CSSStyleDeclaration.prototype, 'setProperty')
      .mockImplementation(function (
        this: CSSStyleDeclaration,
        name: string,
        value: string | null,
        priority?: string,
      ) {
        if (value === 'none') {
          written.push(name);
        }
        setProperty.call(this, name, value, priority);
      });
    const link = pressable('a');
    link.setAttribute('href', '/next');
    link.textContent = 'Next';
    document.body.appendChild(link);
    for (const surface of [link, rows[0]]) {
      press(surface, 'pointerdown', 10, 10);
      vi.advanceTimersByTime(600);
      press(surface, 'pointerup', 10, 10);
    }
    expect(written).toEqual([]);
    spy.mockRestore();
  });

  it('keeps selection under a mouse, a pen and a finger where the primary pointer is fine, as on main (spec:AST-094 FR19, spec:AST-017 FR59)', () => {
    const row = rows[2];
    press(row, 'pointerdown', 10, 10, 'mouse');
    vi.advanceTimersByTime(600);
    expect(row.style.getPropertyValue('user-select')).toBe('');
    press(row, 'pointerup', 10, 10, 'mouse');
    // A desktop pen tablet: a fine primary pointer.
    press(row, 'pointerdown', 10, 10, 'pen');
    vi.advanceTimersByTime(600);
    expect(row.style.getPropertyValue('user-select')).toBe('');
    press(row, 'pointerup', 10, 10, 'pen');
    vi.advanceTimersByTime(600);
    // A finger on a touchscreen laptop: the primary pointer is still fine.
    press(row, 'pointerdown', 10, 10);
    vi.advanceTimersByTime(600);
    expect(row.style.getPropertyValue('user-select')).toBe('');
    press(row, 'pointerup', 10, 10);
    vi.advanceTimersByTime(600);
    // On a touch device a pen keeps it too: a row's hold does nothing
    // (spec:AST-094 FR41).
    const restore = coarsePrimaryPointer();
    try {
      press(row, 'pointerdown', 10, 10, 'pen');
      vi.advanceTimersByTime(600);
      expect(row.style.getPropertyValue('user-select')).toBe('');
      press(row, 'pointerup', 10, 10, 'pen');
      expect(row.style.getPropertyValue('user-select')).toBe('');
    } finally {
      restore();
    }
  });

  it('paints the row after the delay, not before', () => {
    const label = rows[1].firstElementChild;
    if (label == null) {
      throw new Error('the row has no label to press');
    }
    press(label, 'pointerdown', 10, 10);
    vi.advanceTimersByTime(PRESS_ONSET_MS - 1);
    expect(pressedRow()).toBe(-1);
    vi.advanceTimersByTime(1);
    expect(pressedRow()).toBe(1);
  });

  it('paints the innermost surface when they nest', () => {
    const bubble = pressable('button');
    rows[2].appendChild(bubble);
    press(bubble, 'pointerdown', 10, 10);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(bubble.getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
    expect(rows[2].hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });

  it('leaves a mouse press to `:active` where the primary pointer is fine', () => {
    // The test environment is a desktop: `(pointer: coarse)` does not match,
    // so the stylesheet keeps `:active` for the mouse and the controller
    // stays out of its way.
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
    press(rows[0], 'pointerdown', 10, 10, 'mouse');
    vi.advanceTimersByTime(PRESS_ONSET_MS * 2);
    expect(pressedRow()).toBe(-1);
  });

  it('leaves a Space press to `:active` where the primary pointer is fine', () => {
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
    const button = pressable('button');
    rows[0].appendChild(button);
    button.dispatchEvent(
      new KeyboardEvent('keydown', {key: ' ', bubbles: true, cancelable: true}),
    );
    expect(button.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });

  it('ignores a touch that lands outside every pressable', () => {
    const plain = document.createElement('div');
    document.body.appendChild(plain);
    press(plain, 'pointerdown', 10, 10);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(document.querySelectorAll(`[${PRESSED_ATTRIBUTE}]`)).toHaveLength(0);
  });

  it('paints nothing on a disabled surface, and does not light the row around it', () => {
    const button = pressable('button');
    button.setAttribute('disabled', '');
    rows[1].appendChild(button);
    const ariaDisabled = pressable('button');
    ariaDisabled.setAttribute('aria-disabled', 'true');
    rows[2].appendChild(ariaDisabled);
    press(button, 'pointerdown', 10, 10);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    press(button, 'pointerup', 10, 10);
    press(ariaDisabled, 'pointerdown', 10, 10);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(document.querySelectorAll(`[${PRESSED_ATTRIBUTE}]`)).toHaveLength(0);
  });
});

describe('a scroll takes it away and nothing brings it back', () => {
  it('clears on a scroll from the ancestor scroller', () => {
    press(rows[1], 'pointerdown', 10, 10);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(pressedRow()).toBe(1);
    scroller.dispatchEvent(new Event('scroll'));
    expect(pressedRow()).toBe(-1);
  });

  it('clears on `pointercancel`, which iOS fires before the first scroll event', () => {
    press(rows[1], 'pointerdown', 10, 10);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    press(rows[1], 'pointercancel', 10, 10);
    expect(pressedRow()).toBe(-1);
  });

  it('does not repaint a later row while the finger stays down', () => {
    // The list scrolls under a stationary finger and the paint would walk
    // down it, because `:active` outlived the scroll on a node a virtualized
    // list had already recycled.
    press(rows[1], 'pointerdown', 10, 100);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    scroller.dispatchEvent(new Event('scroll'));
    for (let y = 100; y < 400; y += 20) {
      press(rows[3], 'pointermove', 10, y);
      scroller.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(16);
    }
    press(rows[3], 'pointerup', 10, 400);
    vi.advanceTimersByTime(PRESS_ONSET_MS + PRESS_FADE_MS);
    expect(rows.some(row => row.hasAttribute(PRESSED_ATTRIBUTE))).toBe(false);
  });

  it('paints nothing at all when the scroller claims inside the delay (a fling)', () => {
    press(rows[1], 'pointerdown', 10, 100);
    vi.advanceTimersByTime(30);
    press(rows[1], 'pointercancel', 10, 80);
    vi.advanceTimersByTime(PRESS_ONSET_MS * 2);
    expect(pressedRow()).toBe(-1);
  });

  it('hears the NEXT press, once the scrolling finger is up', () => {
    press(rows[1], 'pointerdown', 10, 100);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    press(rows[1], 'pointermove', 10, 400);
    press(rows[1], 'pointerup', 10, 400);

    press(rows[2], 'pointerdown', 10, 420);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(pressedRow()).toBe(2);
  });

  it('hears the next press after a scroll that ended in `pointercancel`', () => {
    // A scroll-claimed gesture ends in `pointercancel`, never `pointerup`:
    // that is the shape a real flick has.
    press(rows[1], 'pointerdown', 10, 100);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    press(rows[1], 'pointercancel', 10, 100);

    press(rows[2], 'pointerdown', 10, 420);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(pressedRow()).toBe(2);
  });

  it('is a brake, not a press, when it lands on a list that is still moving', () => {
    // A touch device: the brake and the finger's lift are coarse-pointer
    // work (spec:AST-094 FR24).
    coarsePrimaryPointer();
    // Measured on iOS: a touch stopping a decelerating list highlights
    // nothing. Nothing else would cancel this press, because stopping the
    // scroll is what makes the scroll events stop.
    press(rows[0], 'pointerdown', 10, 10);
    press(rows[0], 'pointerup', 10, 10);
    scroller.dispatchEvent(new Event('scroll'));
    press(rows[1], 'pointerdown', 10, 100);
    vi.advanceTimersByTime(PRESS_ONSET_MS * 2);
    expect(pressedRow()).toBe(-1);
  });

  it('on an engine without scrollend, still brakes a moving list, and presses once its scroll events stop', () => {
    // A touch device: the brake and the finger's lift are coarse-pointer
    // work (spec:AST-094 FR24).
    coarsePrimaryPointer();
    delete (window as {onscrollend?: unknown}).onscrollend;
    press(rows[0], 'pointerdown', 10, 10);
    press(rows[0], 'pointerup', 10, 10);
    scroller.dispatchEvent(new Event('scroll'));
    lift(rows[0]);
    // A finger lands while the list still glides: a brake, no paint.
    press(rows[1], 'pointerdown', 10, 100);
    vi.advanceTimersByTime(PRESS_ONSET_MS * 2);
    expect(pressedRow()).toBe(-1);
    press(rows[1], 'pointerup', 10, 100);
    lift(rows[1]);
    // No scroll event for the brake window: the list has come to rest.
    vi.advanceTimersByTime(PRESS_SCROLL_BRAKE_MS + 1);
    press(rows[2], 'pointerdown', 10, 190);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(pressedRow()).toBe(2);
  });

  it('a pen press leaves no finger behind: a later programmatic scroll is not a brake', () => {
    // A pen raises pointer events but no touch events, so no touchend would
    // ever clear a finger it recorded.
    press(rows[0], 'pointerdown', 10, 10, 'pen');
    press(rows[0], 'pointerup', 10, 10, 'pen');
    scroller.dispatchEvent(new Event('scroll'));
    press(rows[1], 'pointerdown', 10, 100);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(pressedRow()).toBe(1);
  });

  it('a pen that drags a list still arms the brake: a touch stopping that glide presses nothing', () => {
    // The browser takes the pen to scroll (pointercancel), and the scroll it
    // drives follows; a finger landing on the gliding list is a brake.
    press(rows[0], 'pointerdown', 10, 10, 'pen');
    press(rows[0], 'pointercancel', 10, 10, 'pen');
    scroller.dispatchEvent(new Event('scroll'));
    scroller.dispatchEvent(new Event('scroll'));
    press(rows[1], 'pointerdown', 10, 100);
    vi.advanceTimersByTime(PRESS_ONSET_MS * 2);
    expect(pressedRow()).toBe(-1);
  });

  it('a pen taken to scroll that never scrolls stops counting after the brake window', () => {
    press(rows[0], 'pointerdown', 10, 10, 'pen');
    press(rows[0], 'pointercancel', 10, 10, 'pen');
    vi.advanceTimersByTime(PRESS_SCROLL_BRAKE_MS + 1);
    // A programmatic scroll after that is not a brake.
    scroller.dispatchEvent(new Event('scroll'));
    press(rows[1], 'pointerdown', 10, 100);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(pressedRow()).toBe(1);
  });

  it('presses normally once the list has come to rest, at its scrollend', () => {
    press(rows[0], 'pointerdown', 10, 10);
    press(rows[0], 'pointerup', 10, 10);
    scroller.dispatchEvent(new Event('scroll'));
    lift(rows[0]);
    scroller.dispatchEvent(new Event('scrollend'));
    press(rows[1], 'pointerdown', 10, 100);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(pressedRow()).toBe(1);
  });

  it('a PROGRAMMATIC scroll does not swallow the press', () => {
    // Apps scroll things by themselves constantly: a pane pinned to the bottom
    // scrolls on every streamed frame, keyboard nav calls `scrollIntoView`, a
    // route change restores a position. None of those is a finger braking
    // anything.
    scroller.dispatchEvent(new Event('scroll'));
    press(rows[1], 'pointerdown', 10, 100);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(pressedRow()).toBe(1);
  });

  it('a touch elsewhere does not make a programmatic scroll a brake', () => {
    // "Any finger anywhere, recently" is not enough: tap a control, then press
    // a button inside a pane that is scrolling on its own. No finger drove
    // that scroll, so the press stands.
    const elsewhere = document.createElement('button');
    document.body.appendChild(elsewhere);
    press(elsewhere, 'pointerdown', 10, 500);
    press(elsewhere, 'pointerup', 10, 500);
    scroller.dispatchEvent(new Event('scroll'));
    press(rows[1], 'pointerdown', 10, 100);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(pressedRow()).toBe(1);
  });

  it('a MOUSE release does not count as a finger for the brake', () => {
    // A device can report a coarse pointer and still have a trackpad; a mouse
    // release inside the scroller must not make the next scroll there look
    // finger-driven.
    press(rows[0], 'pointerdown', 10, 10, 'mouse');
    press(rows[0], 'pointerup', 10, 10, 'mouse');
    scroller.dispatchEvent(new Event('scroll'));
    press(rows[1], 'pointerdown', 10, 100);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(pressedRow()).toBe(1);
  });

  it('a scroll in ANOTHER scroller does not swallow the press', () => {
    const elsewhere = document.createElement('div');
    document.body.appendChild(elsewhere);
    press(rows[0], 'pointerdown', 10, 10);
    press(rows[0], 'pointerup', 10, 10);
    elsewhere.dispatchEvent(new Event('scroll', {bubbles: false}));
    press(rows[1], 'pointerdown', 10, 100);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(pressedRow()).toBe(1);
  });

  it('clears when the finger travels past the slop, before any scroll event', () => {
    press(rows[1], 'pointerdown', 10, 100);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    press(rows[1], 'pointermove', 10, 100 + PRESS_SLOP_PX + 1);
    expect(pressedRow()).toBe(-1);
  });

  it('clears when a drag starts from the pressed element', () => {
    press(rows[1], 'pointerdown', 10, 100);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    rows[1].dispatchEvent(new Event('dragstart', {bubbles: true}));
    expect(pressedRow()).toBe(-1);
  });
});

describe('the release', () => {
  it('fades, then leaves no attribute behind', () => {
    press(rows[0], 'pointerdown', 10, 10);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    press(rows[0], 'pointerup', 10, 10);
    expect(rows[0].getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
    vi.advanceTimersByTime(PRESS_FADE_MS);
    expect(rows[0].hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });

  it('answers a tap too quick for the delay, at the release', () => {
    press(rows[0], 'pointerdown', 10, 10);
    vi.advanceTimersByTime(20);
    press(rows[0], 'pointerup', 10, 10);
    expect(rows[0].getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
    vi.advanceTimersByTime(PRESS_FLASH_MS);
    expect(rows[0].getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
    vi.advanceTimersByTime(PRESS_FADE_MS);
    expect(rows[0].hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });

  it('leaves a state it did not write alone: a selection hold outlives the release', () => {
    press(rows[0], 'pointerdown', 10, 10);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    press(rows[0], 'pointerup', 10, 10);
    expect(rows[0].getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
    // The activation pushes, and the row is held selected (selectionHold.ts).
    rows[0].setAttribute(PRESSED_ATTRIBUTE, 'held');
    vi.advanceTimersByTime(PRESS_FADE_MS);
    expect(rows[0].getAttribute(PRESSED_ATTRIBUTE)).toBe('held');
    // A new press on the held row neither repaints nor clears it.
    press(rows[0], 'pointerdown', 10, 10);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(rows[0].getAttribute(PRESSED_ATTRIBUTE)).toBe('held');
    press(rows[0], 'pointercancel', 10, 10);
    expect(rows[0].getAttribute(PRESSED_ATTRIBUTE)).toBe('held');
  });

  it("another painter's fade never cuts the controller's own release short", () => {
    // Two writers kept two clocks: a fade another painter left running on
    // the surface removed the attribute in the middle of the controller's
    // release. With one writer, any write ends a pending fade.
    const control = pressable('button');
    document.body.appendChild(control);
    paintPress(control, 'fading', {releaseMs: 150});
    press(control, 'pointerdown', 10, 10);
    expect(control.getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
    vi.advanceTimersByTime(50);
    press(control, 'pointerup', 10, 10);
    expect(control.getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
    // The other painter's clock ran out here: the release is still running.
    vi.advanceTimersByTime(100);
    expect(control.getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
    vi.advanceTimersByTime(PRESS_FADE_MS - 100);
    expect(control.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });
});

describe('two touches in a row', () => {
  it('answers the second tap while the first is still fading', () => {
    press(rows[0], 'pointerdown', 10, 10);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    press(rows[0], 'pointerup', 10, 10);
    expect(rows[0].getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');

    press(rows[2], 'pointerdown', 10, 300);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(pressedRow()).toBe(2);
    expect(rows[0].hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });

  it('paints nothing for a second finger while the first is still down', () => {
    press(rows[0], 'pointerdown', 10, 10);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    const second = new Event('pointerdown', {bubbles: true});
    Object.assign(second, {
      clientX: 10,
      clientY: 300,
      pointerId: 2,
      pointerType: 'touch',
    });
    rows[2].dispatchEvent(second);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(rows.some(row => row.hasAttribute(PRESSED_ATTRIBUTE))).toBe(false);
  });
});

describe('a phone or tablet paints a mouse or Space press itself', () => {
  // `(pointer: coarse)` reads the PRIMARY pointer. Where it matches, the
  // stylesheet drops every `:active` arm, so a trackpad click or a Space press
  // on a focused button would paint nothing at all unless the controller
  // paints it: a tablet with a keyboard and trackpad, a phone with a mouse.
  const coarse = (query: string): MediaQueryList =>
    ({
      matches: /\(\s*pointer\s*:\s*coarse\s*\)/.test(query),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;

  function key(target: Element, type: 'keydown' | 'keyup', init = {}): void {
    target.dispatchEvent(
      new KeyboardEvent(type, {
        key: ' ',
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
  }

  function focusedButton(row: HTMLElement): HTMLButtonElement {
    const button = document.createElement('button');
    button.setAttribute(PRESSABLE_ATTRIBUTE, '');
    row.appendChild(button);
    button.focus();
    return button;
  }

  beforeEach(() => {
    release();
    vi.stubGlobal('matchMedia', coarse);
    // These are a mouse or a key on a touch-first device: coarse primary.
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(true);
    release = installPressFeedback();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps a mouse or Space press on the fine pointer's 200 ms release, even on a control", () => {
    const control = document.createElement('button');
    control.setAttribute(PRESSABLE_ATTRIBUTE, '');
    rows[1].appendChild(control);
    press(control, 'pointerdown', 10, 100, 'mouse');
    expect(control.getAttribute(PRESS_INPUT_ATTRIBUTE)).toBe('mouse');
    press(control, 'pointerup', 10, 100, 'mouse');
    expect(control.getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
    vi.advanceTimersByTime(PRESS_FADE_MS);
    expect(control.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    expect(control.hasAttribute(PRESS_INPUT_ATTRIBUTE)).toBe(false);
    control.remove();
  });

  it('paints a mouse press at once, holds it, and fades it at the release', () => {
    press(rows[1], 'pointerdown', 10, 100, 'mouse');
    // No onset delay: a mouse button cannot become a scroll.
    expect(rows[1].getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
    vi.advanceTimersByTime(1000);
    expect(rows[1].getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
    press(rows[1], 'pointerup', 10, 100, 'mouse');
    expect(rows[1].getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
    vi.advanceTimersByTime(PRESS_FADE_MS);
    expect(rows[1].hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });

  it('keeps the paint while the mouse is dragged off the surface, as `:active` does', () => {
    press(rows[1], 'pointerdown', 10, 100, 'mouse');
    press(document.body, 'pointermove', 400, 900, 'mouse');
    scroller.dispatchEvent(new Event('scroll'));
    expect(rows[1].getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
    press(document.body, 'pointerup', 400, 900, 'mouse');
    expect(rows[1].getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
  });

  it('paints only the primary button', () => {
    const secondary = new Event('pointerdown', {bubbles: true});
    Object.assign(secondary, {
      button: 2,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
      pointerType: 'mouse',
    });
    rows[0].dispatchEvent(secondary);
    expect(pressedRow()).toBe(-1);
  });

  it('paints the innermost surface, and nothing on a disabled one', () => {
    const inner = pressable('button');
    rows[2].appendChild(inner);
    press(inner, 'pointerdown', 10, 200, 'mouse');
    expect(inner.getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
    expect(rows[2].hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    press(inner, 'pointerup', 10, 200, 'mouse');
    vi.advanceTimersByTime(PRESS_FADE_MS);

    const disabled = pressable('button');
    disabled.setAttribute('aria-disabled', 'true');
    rows[3].appendChild(disabled);
    press(disabled, 'pointerdown', 10, 300, 'mouse');
    expect(document.querySelectorAll(`[${PRESSED_ATTRIBUTE}]`)).toHaveLength(0);
  });

  it('drops the paint at once when the pointer is cancelled or a drag starts', () => {
    press(rows[0], 'pointerdown', 10, 10, 'mouse');
    press(rows[0], 'pointercancel', 10, 10, 'mouse');
    expect(rows[0].hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);

    press(rows[1], 'pointerdown', 10, 100, 'mouse');
    rows[1].dispatchEvent(new Event('dragstart', {bubbles: true}));
    expect(rows[1].hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    // The slot is free again: the next press paints.
    press(rows[2], 'pointerdown', 10, 200, 'mouse');
    expect(rows[2].getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
  });

  it("a finger's press and a mouse press keep their own slots", () => {
    press(rows[0], 'pointerdown', 10, 10, 'mouse');
    const touch = new Event('pointerdown', {bubbles: true});
    Object.assign(touch, {
      button: 0,
      clientX: 10,
      clientY: 100,
      pointerId: 7,
      pointerType: 'touch',
    });
    rows[1].dispatchEvent(touch);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(rows[0].getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
    expect(rows[1].getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
    press(rows[0], 'pointerup', 10, 10, 'mouse');
    expect(rows[0].getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
    expect(rows[1].getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
  });

  it("a mouse press on a surface a finger's release is still fading keeps its paint", () => {
    press(rows[0], 'pointerdown', 10, 10);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    press(rows[0], 'pointerup', 10, 10);
    expect(rows[0].getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
    press(rows[0], 'pointerdown', 10, 10, 'mouse');
    // The finger's fade timer would have removed the attribute here.
    vi.advanceTimersByTime(PRESS_FADE_MS * 2);
    expect(rows[0].getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
  });

  it('a mouse press never arms the scroll brake', () => {
    press(rows[0], 'pointerdown', 10, 10, 'mouse');
    press(rows[0], 'pointerup', 10, 10, 'mouse');
    scroller.dispatchEvent(new Event('scroll'));
    press(rows[1], 'pointerdown', 10, 100);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(rows[1].getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
  });

  it('paints a Space press on a focused button while the key is down', () => {
    const button = focusedButton(rows[0]);
    key(button, 'keydown');
    expect(button.getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
    vi.advanceTimersByTime(1000);
    key(button, 'keydown', {repeat: true});
    expect(button.getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
    key(button, 'keyup');
    expect(button.getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
    vi.advanceTimersByTime(PRESS_PROFILES.control.releaseMs);
    expect(button.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });

  it('listens for the key’s release and focus loss only while Space holds a press', () => {
    const attached = new Set<string>();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const keyListeners = () =>
      [...attached].filter(type => type === 'keyup' || type === 'blur').sort();
    const sync = () => {
      for (const [type] of add.mock.calls.splice(0)) {
        attached.add(type);
      }
      for (const [type] of remove.mock.calls.splice(0)) {
        attached.delete(type);
      }
    };
    try {
      const button = focusedButton(rows[0]);
      key(button, 'keydown');
      sync();
      expect(keyListeners()).toEqual(['blur', 'keyup']);
      key(button, 'keyup');
      sync();
      expect(keyListeners()).toEqual([]);
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });

  it('leaves the row around a focused checkbox or radio at rest, as desktop browsers do', () => {
    // Only the input matches `:active` for a Space press; the row around it,
    // the pressable surface, stays at rest in desktop Chromium and WebKit.
    for (const type of ['checkbox', 'radio']) {
      const input = document.createElement('input');
      input.type = type;
      rows[2].appendChild(input);
      input.focus();
      key(input, 'keydown');
      expect(rows[2].hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
      key(input, 'keyup');
    }
  });

  it('paints a Space press only on a focused element that is itself the surface', () => {
    const plain = document.createElement('button');
    rows[2].appendChild(plain);
    plain.focus();
    key(plain, 'keydown');
    expect(rows[2].hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    key(plain, 'keyup');
  });

  it('leaves a menu row to the menu: its highlight is the only paint', () => {
    // useMenuPress FR6 and DEC-6: a press held on one row while the highlight
    // follows the pointer to another would light two rows.
    const menu = document.createElement('div');
    menu.setAttribute('data-astryx-menu-press', '');
    const first = pressable('button');
    const second = pressable('button');
    menu.append(first, second);
    document.body.appendChild(menu);
    try {
      press(first, 'pointerdown', 10, 10, 'mouse');
      press(second, 'pointermove', 10, 40, 'mouse');
      expect(first.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
      press(second, 'pointerup', 10, 40, 'mouse');
      first.focus();
      key(first, 'keydown');
      expect(first.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
      key(first, 'keyup');
    } finally {
      menu.remove();
    }
  });

  it('paints nothing where Space activates nothing, for Enter, or for a press the page cancelled', () => {
    const link = document.createElement('a');
    link.href = '#';
    link.setAttribute(PRESSABLE_ATTRIBUTE, '');
    rows[0].appendChild(link);
    key(link, 'keydown');

    const roleButton = pressable('div');
    roleButton.setAttribute('role', 'button');
    roleButton.tabIndex = 0;
    rows[1].appendChild(roleButton);
    key(roleButton, 'keydown');

    const button = focusedButton(rows[2]);
    key(button, 'keydown', {key: 'Enter'});
    button.addEventListener('keydown', event => event.preventDefault(), {
      once: true,
    });
    key(button, 'keydown');
    expect(document.querySelectorAll(`[${PRESSED_ATTRIBUTE}]`)).toHaveLength(0);
  });

  it('ends the press with its fade when focus leaves before the key comes up', () => {
    const button = focusedButton(rows[0]);
    key(button, 'keydown');
    button.dispatchEvent(new FocusEvent('blur'));
    expect(button.getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
    vi.advanceTimersByTime(PRESS_PROFILES.control.releaseMs);
    expect(button.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });

  it('leaves nothing painted when the page hides or the controller comes down', () => {
    const button = focusedButton(rows[0]);
    key(button, 'keydown');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    expect(button.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);

    press(rows[1], 'pointerdown', 10, 100, 'mouse');
    release();
    expect(rows[1].hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    key(button, 'keydown');
    press(rows[2], 'pointerdown', 10, 200, 'mouse');
    expect(document.querySelectorAll(`[${PRESSED_ATTRIBUTE}]`)).toHaveLength(0);
    // Re-install for afterEach's release.
    release = installPressFeedback();
  });
});

describe("a fine pointer's press: at once, the finger's release, no brake (spec:AST-094 FR11, FR43, DEC-21)", () => {
  // jsdom's matchMedia models a desktop: the primary pointer is fine. A
  // mouse's or a pen's press goes through the controller, as a finger's
  // does, in place of the browser's `:active`.

  function control(row: HTMLElement): HTMLButtonElement {
    const button = document.createElement('button');
    button.setAttribute(PRESSABLE_ATTRIBUTE, '');
    row.appendChild(button);
    return button;
  }

  function mouseDown(
    target: Element,
    init: {button?: number; ctrlKey?: boolean},
  ): void {
    const event = new Event('pointerdown', {bubbles: true, cancelable: true});
    Object.assign(event, {
      button: 0,
      ctrlKey: false,
      clientX: 10,
      clientY: 100,
      pointerId: 1,
      pointerType: 'mouse',
      ...init,
    });
    target.dispatchEvent(event);
  }

  it("paints a mouse's press at once, holds it, and fades it on a finger's clock here: the deselect clock, on any surface", () => {
    // With a fine primary pointer a finger's release keeps the deselect
    // clock on every surface (spec:AST-017 FR59/DEC-25), so a mouse's does.
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
    const button = control(rows[1]);
    press(button, 'pointerdown', 10, 100, 'mouse');
    expect(button.getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
    vi.advanceTimersByTime(1000);
    expect(button.getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
    press(button, 'pointerup', 10, 100, 'mouse');
    expect(button.getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
    vi.advanceTimersByTime(PRESS_PROFILES.cell.releaseMs - 1);
    expect(button.getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
    vi.advanceTimersByTime(1);
    expect(button.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });

  it("paints a mouse's press on a row in a scroll view at once: no content-touch delay", () => {
    press(rows[1], 'pointerdown', 10, 100, 'mouse');
    expect(rows[1].getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
    press(rows[1], 'pointerup', 10, 100, 'mouse');
    expect(rows[1].getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
    vi.advanceTimersByTime(PRESS_PROFILES.cell.releaseMs);
    expect(rows[1].hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });

  it("on a phone or tablet, a mouse's release takes a finger's clock: a control's", () => {
    coarsePrimaryPointer();
    const button = control(rows[1]);
    press(button, 'pointerdown', 10, 100, 'mouse');
    expect(button.getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
    // Only a key's press keeps the deselect clock (PRESS_INPUT_ATTRIBUTE).
    expect(button.hasAttribute(PRESS_INPUT_ATTRIBUTE)).toBe(false);
    press(button, 'pointerup', 10, 100, 'mouse');
    vi.advanceTimersByTime(PRESS_PROFILES.control.releaseMs - 1);
    expect(button.getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
    vi.advanceTimersByTime(1);
    expect(button.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });

  it("paints a pen's press at once, in a scroll view too", () => {
    press(rows[1], 'pointerdown', 10, 100, 'pen');
    expect(rows[1].getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
    press(rows[1], 'pointerup', 10, 100, 'pen');
    expect(rows[1].getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
  });

  it('brakes only a finger: a mouse or a pen landing on a list a finger left moving paints at once', () => {
    coarsePrimaryPointer();
    // A finger flings the list and lifts: it is still moving.
    press(rows[0], 'pointerdown', 10, 10);
    scroller.dispatchEvent(new Event('scroll'));
    press(rows[0], 'pointercancel', 10, 10);
    lift(rows[0]);
    press(rows[1], 'pointerdown', 10, 100, 'pen');
    expect(rows[1].getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
    press(rows[1], 'pointerup', 10, 100, 'pen');
    press(rows[2], 'pointerdown', 10, 200, 'mouse');
    expect(rows[2].getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
  });

  it('paints nothing for a right click, or for a ctrl-click on macOS, which opens the context menu', () => {
    const button = control(rows[1]);
    mouseDown(button, {button: 2});
    expect(button.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    const platform = vi
      .spyOn(navigator, 'platform', 'get')
      .mockReturnValue('MacIntel');
    try {
      mouseDown(button, {ctrlKey: true});
      expect(button.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    } finally {
      platform.mockRestore();
    }
  });

  it('paints a ctrl-click elsewhere, where it is a click', () => {
    const button = control(rows[1]);
    const platform = vi
      .spyOn(navigator, 'platform', 'get')
      .mockReturnValue('Win32');
    try {
      mouseDown(button, {ctrlKey: true});
      expect(button.getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
    } finally {
      platform.mockRestore();
    }
  });

  it("leaves a Space press under a fine pointer on its own path: the browser's `:active` paints it", () => {
    const button = control(rows[1]);
    button.focus();
    button.dispatchEvent(
      new KeyboardEvent('keydown', {key: ' ', bubbles: true, cancelable: true}),
    );
    expect(button.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });
});

describe('a link or button inside a pressable is its own press, for every pointer', () => {
  // The rule RadioListItem's `:active:not(:has(a:active, button:active,
  // [role="button"]:active, [role="link"]:active))` kept for a mouse (#8424):
  // a press on a nested native control is that control's, not the row's.

  function rowWith(kind: 'link' | 'button' | 'roleButton' | 'roleLink'): {
    row: HTMLElement;
    nested: HTMLElement;
    text: HTMLElement;
  } {
    const row = rows[1];
    const text = document.createElement('span');
    text.textContent = 'Free forever.';
    let nested: HTMLElement;
    if (kind === 'link') {
      nested = document.createElement('a');
      nested.setAttribute('href', '#pricing');
    } else if (kind === 'button') {
      nested = document.createElement('button');
    } else {
      nested = document.createElement('span');
      nested.setAttribute('role', kind === 'roleButton' ? 'button' : 'link');
    }
    const label = document.createElement('span');
    label.textContent = 'Compare plans';
    nested.appendChild(label);
    row.append(text, nested);
    return {row, nested: label, text};
  }

  it("a finger on a link in a row paints nothing, and on the row's own text paints the row", () => {
    const {row, nested, text} = rowWith('link');
    press(nested, 'pointerdown', 10, 100);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(row.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    press(nested, 'pointerup', 10, 100);
    vi.runAllTimers();
    press(text, 'pointerdown', 10, 100);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(row.getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
  });

  it("a mouse on a button in a row paints nothing, and on the row's own text paints the row", () => {
    const {row, nested, text} = rowWith('button');
    press(nested, 'pointerdown', 10, 100, 'mouse');
    expect(row.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    press(nested, 'pointerup', 10, 100, 'mouse');
    vi.runAllTimers();
    press(text, 'pointerdown', 10, 100, 'mouse');
    expect(row.getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
  });

  it('treats role="button" and role="link" as their own presses too', () => {
    for (const kind of ['roleButton', 'roleLink'] as const) {
      const {row, nested} = rowWith(kind);
      press(nested, 'pointerdown', 10, 100);
      vi.advanceTimersByTime(PRESS_ONSET_MS);
      expect(row.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
      press(nested, 'pointerup', 10, 100);
      vi.runAllTimers();
      row.replaceChildren();
    }
  });

  it('still paints a pressable that is itself a button, pressed on its label', () => {
    const button = document.createElement('button');
    button.setAttribute(PRESSABLE_ATTRIBUTE, '');
    const label = document.createElement('span');
    label.textContent = 'Save';
    button.appendChild(label);
    document.body.appendChild(button);
    press(label, 'pointerdown', 10, 10);
    expect(button.getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
    button.remove();
  });
});

describe('no gesture is ever left painted', () => {
  // Every case here strands a pending timer if `apply` clears timers
  // unconditionally, and each one ends with a paint on a row nobody is
  // touching.

  it('a finger jittering inside the slop still gets its press', () => {
    // Every real finger produces `pointermove` during the 150 ms delay; only
    // a synthetic touch holds perfectly still.
    press(rows[1], 'pointerdown', 10, 100);
    for (let tick = 0; tick < 6; tick += 1) {
      vi.advanceTimersByTime(20);
      press(rows[1], 'pointermove', 10 + (tick % 2), 100 + (tick % 3));
    }
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(pressedRow()).toBe(1);
  });

  it("a cancel inside a quick tap's flash still resolves to nothing", () => {
    // iOS Safari delivers `touchcancel` at `scrollend`, seconds after a tap,
    // so this is the common shape, not a corner case.
    press(rows[0], 'pointerdown', 10, 10);
    vi.advanceTimersByTime(20);
    press(rows[0], 'pointerup', 10, 10);
    expect(rows[0].getAttribute(PRESSED_ATTRIBUTE)).toBe('on');

    press(rows[0], 'pointercancel', 10, 10);
    vi.advanceTimersByTime(PRESS_FLASH_MS + PRESS_FADE_MS + 50);
    expect(rows[0].hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });

  it('a scroll inside the release fade still resolves to nothing', () => {
    press(rows[0], 'pointerdown', 10, 10);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    press(rows[0], 'pointerup', 10, 10);
    expect(rows[0].getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');

    scroller.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(PRESS_FADE_MS + 50);
    expect(rows[0].hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });

  it('leaves nothing painted after any of the gestures a finger can produce', () => {
    // The guard for the whole class: whatever the sequence, once it is over
    // and every clock has run out, the list is bare.
    const gestures: (() => void)[] = [
      () => {
        press(rows[0], 'pointerdown', 10, 10);
        press(rows[0], 'pointerup', 10, 10);
        press(rows[0], 'pointercancel', 10, 10);
      },
      () => {
        press(rows[1], 'pointerdown', 10, 100);
        vi.advanceTimersByTime(PRESS_ONSET_MS);
        press(rows[1], 'pointerup', 10, 100);
        scroller.dispatchEvent(new Event('scroll'));
      },
      () => {
        press(rows[2], 'pointerdown', 10, 200);
        vi.advanceTimersByTime(40);
        press(rows[2], 'pointermove', 10, 260);
        press(rows[2], 'pointercancel', 10, 260);
      },
      () => {
        press(rows[3], 'pointerdown', 10, 300);
        vi.advanceTimersByTime(PRESS_ONSET_MS);
        scroller.dispatchEvent(new Event('scroll'));
        press(rows[3], 'pointerup', 10, 300);
      },
      () => {
        press(rows[0], 'pointerdown', 10, 10);
        vi.advanceTimersByTime(PRESS_ONSET_MS);
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: 'hidden',
        });
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: 'visible',
        });
      },
    ];
    for (const gesture of gestures) {
      gesture();
      vi.advanceTimersByTime(
        PRESS_ONSET_MS + PRESS_FLASH_MS + PRESS_FADE_MS + 100,
      );
      expect(document.querySelectorAll(`[${PRESSED_ATTRIBUTE}]`)).toHaveLength(
        0,
      );
    }
  });
});

describe('what the list pays for it', () => {
  it('adds no listener to any row', () => {
    const row = pressable();
    const added: string[] = [];
    row.addEventListener = ((type: string) =>
      added.push(type)) as typeof row.addEventListener;
    scroller.appendChild(row);
    press(row, 'pointerdown', 10, 10);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(added).toEqual([]);
  });

  it('registers no touch listener on the window or the document where the primary pointer is fine (spec:AST-094 FR24)', () => {
    release();
    matchMediaRestorers.push(pointerQuery(false).restore);
    const added = [
      vi.spyOn(window, 'addEventListener'),
      vi.spyOn(document, 'addEventListener'),
    ];
    try {
      release = installPressFeedback();
      // A finger lands, as on a touchscreen laptop: still none.
      press(rows[0], 'pointerdown', 10, 10);
      press(rows[0], 'pointerup', 10, 10);
      const types = added.flatMap(spy => spy.mock.calls.map(([type]) => type));
      expect(types.filter(type => type.startsWith('touch'))).toEqual([]);
      expect(types).toContain('pointerdown');
    } finally {
      for (const spy of added) {
        spy.mockRestore();
      }
    }
  });

  it('asks no media query when it installs: a page no one touches never reads the pointer', () => {
    release();
    const matchMedia = vi.spyOn(window, 'matchMedia');
    try {
      release = installPressFeedback();
      expect(matchMedia).not.toHaveBeenCalled();
    } finally {
      matchMedia.mockRestore();
    }
  });

  it('hears touchcancel only while the primary pointer is coarse, and follows it', () => {
    release();
    const pointer = pointerQuery(false);
    matchMediaRestorers.push(pointer.restore);
    release = installPressFeedback();
    // A tablet undocks its mouse: the browser's touchcancel ends a press.
    pointer.set(true);
    press(rows[0], 'pointerdown', 10, 10);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(pressedRow()).toBe(0);
    cancelTouch();
    expect(pressedRow()).toBe(-1);
    // It docks one again: the touch listener comes down.
    pointer.set(false);
    press(rows[1], 'pointerdown', 10, 100);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(pressedRow()).toBe(1);
    cancelTouch();
    expect(pressedRow()).toBe(1);
  });

  it('installs once, however many times it is called, and stays while any holder remains', () => {
    const second = installPressFeedback();
    press(rows[0], 'pointerdown', 10, 10);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(pressedRow()).toBe(0);
    press(rows[0], 'pointerup', 10, 10);
    vi.advanceTimersByTime(PRESS_FADE_MS);
    second();
    // The first holder (beforeEach) is still there: presses are still heard.
    press(rows[1], 'pointerdown', 10, 100);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(pressedRow()).toBe(1);
  });

  it('comes down with the last holder, taking any paint with it', () => {
    press(rows[0], 'pointerdown', 10, 10);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(pressedRow()).toBe(0);
    release();
    expect(pressedRow()).toBe(-1);
    press(rows[1], 'pointerdown', 10, 100);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(pressedRow()).toBe(-1);
    // Re-install for afterEach's release.
    release = installPressFeedback();
  });
});

describe('the release fades: the arms the controller writes to', () => {
  // The CSS half of the model, asserted off the StyleX dev runtime's injected
  // rules the way the component tests do. jsdom runs no animation, so what is
  // held here is the declaration: which arm animates, on which clock, and
  // what the paint reads.
  const variants = [
    'backgroundColor',
    'backgroundImage',
    'backgroundImageOnNeutral',
    'pressedBackgroundColor',
  ] as const;

  function surface(
    style: (typeof interactionOverlayStyles)[keyof typeof interactionOverlayStyles],
  ): HTMLElement {
    const element = pressable('button');
    element.className = stylex.props(style).className ?? '';
    document.body.appendChild(element);
    return element;
  }

  it("runs the release animation on the fading arm, for the machine's clock, on every variant", () => {
    for (const variant of variants) {
      expect(
        hasReleaseFade(surface(interactionOverlayStyles[variant])),
        variant,
      ).toBe(true);
    }
    expect(hasReleaseFade(surface(interactionOverlayStyles.pressedAlpha))).toBe(
      true,
    );
  });

  it("each profile's clock is the stylesheet's constant: one number each", () => {
    expect(PRESS_FADE_MS).toBe(pressConsts.releaseMs);
    expect(PRESS_PROFILES.cell.releaseMs).toBe(pressConsts.releaseMs);
    expect(controlPressConsts.controlReleaseMs).toBe(
      button.highlight.releaseMs,
    );
    expect(controlPressConsts.controlReleaseEase).toBe(
      `cubic-bezier(${button.highlight.releaseCurve.join(', ')})`,
    );
    expect(PRESS_PROFILES.control.releaseMs).toBe(
      controlPressConsts.controlReleaseMs,
    );
    expect(hasReleaseFade(surface(interactionOverlayStyles.pressedAlpha))).toBe(
      true,
    );
  });

  it("declares the press's paint at its strength on every variant, the one place the formula lives", () => {
    for (const variant of variants) {
      expect(
        declaresPressPaint(surface(interactionOverlayStyles[variant])),
        variant,
      ).toBe(true);
    }
    expect(
      declaresPressPaint(surface(interactionOverlayStyles.pressedAlpha)),
    ).toBe(true);
  });

  it("paints both touch arms as the pressed token at the press's strength, and declares the strength 1 on both", () => {
    for (const variant of variants) {
      const element = surface(interactionOverlayStyles[variant]);
      expect(
        readsPressStrength(element, '[data-astryx-press="on"]'),
        variant,
      ).toBe(true);
      expect(readsPressStrength(element), variant).toBe(true);
      // The fading arm declares 1, like the on arm: only the animation moves
      // the strength, so nothing a composer transitions changes at the lift.
      for (const arm of [
        '[data-astryx-press="on"]',
        '[data-astryx-press="fading"]',
      ]) {
        expect(
          rulesWithSelector(element, arm).some(rule =>
            /--astryx-press-alpha:\s*1\b/.test(rule),
          ),
          `${variant} ${arm}`,
        ).toBe(true);
      }
      // ...and lands on nothing, not on the hover strength: under a finger
      // there is no hover.
      expect(
        rulesWithSelector(element, '[data-astryx-press="fading"]').some(rule =>
          rule.includes('--color-overlay-hover'),
        ),
        variant,
      ).toBe(false);
    }
  });

  it('pressedAlpha owns the strength and the release and paints nothing itself', () => {
    const element = surface(interactionOverlayStyles.pressedAlpha);
    expect(
      rulesDeclaredFor(element).some(rule => rule.includes('background')),
    ).toBe(false);
    expect(readsPressStrength(element)).toBe(false);
  });
});

/** `matchMedia` on a device whose primary pointer is coarse. */
function coarsePointer(query: string): MediaQueryList {
  return {
    matches: /\(\s*pointer\s*:\s*coarse\s*\)/.test(query),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  } as MediaQueryList;
}

/** Make `element` a scroller with content to scroll, as jsdom lays out nothing. */
function makeScroller(element: HTMLElement): void {
  element.style.overflowY = 'auto';
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: 100,
  });
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    value: 400,
  });
}

describe('a control is tracked like UIControl', () => {
  it('outside a scroller, paints in the frame the finger lands', () => {
    const control = pressable('button');
    document.body.appendChild(control);
    press(control, 'pointerdown', 10, 10);
    expect(control.getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
  });

  it('inside a scroller, waits the content-touch delay like a cell', () => {
    makeScroller(scroller);
    const control = pressable('button');
    scroller.appendChild(control);
    press(control, 'pointerdown', 10, 10);
    expect(control.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(control.getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
  });

  it('is cancelled by travel past the slop, with no fade', () => {
    const control = pressable('button');
    document.body.appendChild(control);
    press(control, 'pointerdown', 10, 10);
    press(control, 'pointermove', 10, 10 + PRESS_SLOP_PX + 1);
    expect(control.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });

  it('in a fixed bar above a scrolling page, paints in the frame the finger lands', () => {
    makeScroller(scroller);
    const bar = document.createElement('div');
    bar.style.position = 'fixed';
    const control = pressable('button');
    bar.appendChild(control);
    scroller.appendChild(bar);
    press(control, 'pointerdown', 10, 10);
    expect(control.getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
  });

  it('fades at the lift on its profile’s clock under a coarse primary pointer', () => {
    vi.stubGlobal('matchMedia', coarsePointer);
    try {
      expect(window.matchMedia('(pointer: coarse)').matches).toBe(true);
      const control = pressable('button');
      document.body.appendChild(control);
      press(control, 'pointerdown', 10, 10);
      press(control, 'pointerup', 10, 10);
      expect(control.getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
      vi.advanceTimersByTime(PRESS_PROFILES.control.releaseMs - 1);
      expect(control.getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
      vi.advanceTimersByTime(1);
      expect(control.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('with a fine primary pointer, a finger’s release keeps the deselect clock it always had', () => {
    // A touch screen beside a mouse (the desktop rule, `spec:AST-017`
    // FR59/DEC-25): the release is the stylesheet's deselect clock, not UIButton's.
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
    const control = pressable('button');
    document.body.appendChild(control);
    press(control, 'pointerdown', 10, 10);
    press(control, 'pointerup', 10, 10);
    expect(control.getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
    vi.advanceTimersByTime(PRESS_FADE_MS - 1);
    expect(control.getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
    vi.advanceTimersByTime(1);
    expect(control.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });

  it('a cell outside a scroll view highlights at once (FR11)', () => {
    const cell = pressable('div', 'cell');
    document.body.appendChild(cell);
    press(cell, 'pointerdown', 10, 10);
    expect(cell.getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
  });

  it('a cell inside a scroll view waits the content-touch delay (FR11)', () => {
    makeScroller(scroller);
    press(rows[0], 'pointerdown', 10, 10);
    expect(rows[0].hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(rows[0].getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
  });

  it('a menu row in a menu that cannot scroll highlights at once (FR11, DEC-14)', () => {
    // A menu whose rows fit: overflow set, but nothing to scroll.
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    menu.style.overflowY = 'auto';
    Object.defineProperty(menu, 'clientHeight', {
      configurable: true,
      value: 200,
    });
    Object.defineProperty(menu, 'scrollHeight', {
      configurable: true,
      value: 200,
    });
    const row = pressable('div', 'cell');
    row.setAttribute('role', 'menuitem');
    menu.appendChild(row);
    document.body.appendChild(menu);
    press(row, 'pointerdown', 10, 10);
    expect(row.getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
  });

  it('a menu row in a menu that can scroll waits the content-touch delay (FR11, DEC-14)', () => {
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    makeScroller(menu);
    const row = pressable('div', 'cell');
    row.setAttribute('role', 'menuitem');
    menu.appendChild(row);
    document.body.appendChild(menu);
    press(row, 'pointerdown', 10, 10);
    expect(row.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(row.getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
  });

  it('marks a control with an empty marker and a cell with `cell`', () => {
    expect(pressableProps[PRESSABLE_ATTRIBUTE]).toBe('');
    expect(cellPressableProps[PRESSABLE_ATTRIBUTE]).toBe('cell');
  });
});

describe('listeners exist only while a press is live', () => {
  /** The listeners attached right now, as `target type`. */
  function attached(): string[] {
    return [...live.keys()].sort();
  }
  const live = new Map<string, number>();
  function key(target: string, type: string, options: unknown): string {
    const capture =
      typeof options === 'boolean'
        ? options
        : (options as {capture?: boolean} | undefined)?.capture === true;
    return `${target} ${type}${capture ? ' (capture)' : ''}`;
  }

  beforeEach(() => {
    release();
    live.clear();
    for (const [name, target] of [
      ['window', window],
      ['document', document],
    ] as const) {
      const add = target.addEventListener.bind(target);
      const remove = target.removeEventListener.bind(target);
      vi.spyOn(target, 'addEventListener').mockImplementation(
        (
          type: string,
          listener: EventListenerOrEventListenerObject,
          options?: boolean | AddEventListenerOptions,
        ) => {
          const k = key(name, type, options);
          live.set(k, (live.get(k) ?? 0) + 1);
          add(type, listener, options);
        },
      );
      vi.spyOn(target, 'removeEventListener').mockImplementation(
        (
          type: string,
          listener: EventListenerOrEventListenerObject,
          options?: boolean | EventListenerOptions,
        ) => {
          const k = key(name, type, options);
          const count = (live.get(k) ?? 0) - 1;
          if (count > 0) {
            live.set(k, count);
          } else {
            live.delete(k);
          }
          remove(type, listener, options);
        },
      );
    }
    release = installPressFeedback();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const AT_REST = ['window keydown', 'window pointerdown (capture)'];

  it('at rest, the document carries only the two arming listeners', () => {
    expect(attached()).toEqual(AT_REST);
  });

  it('a finger attaches the rest, and they come down when the press is over and the finger is up', () => {
    // A touch device: the brake and the finger's lift are coarse-pointer
    // work (spec:AST-094 FR24).
    coarsePrimaryPointer();
    press(rows[0], 'pointerdown', 10, 10);
    expect(attached()).toEqual(
      expect.arrayContaining([
        'window pointermove (capture)',
        'window pointerup (capture)',
        'window pointercancel (capture)',
        'window touchend (capture)',
        // Through the shared input stream (utils/inputStream.ts): one
        // capture listener per type on the window, which hears every
        // scroller's scroll and scrollend.
        'window scroll (capture)',
        'window scrollend (capture)',
        'window visibilitychange (capture)',
      ]),
    );
    press(rows[0], 'pointerup', 10, 10);
    lift(rows[0]);
    expect(attached()).not.toEqual(AT_REST);
    vi.advanceTimersByTime(PRESS_FLASH_MS + PRESS_PROFILES.cell.releaseMs);
    expect(rows[0].hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    expect(attached()).toEqual(AT_REST);
  });

  it('after a lift that leaves a fling scrolling, they come down at its scrollend, not at a time', () => {
    // A touch device: the brake and the finger's lift are coarse-pointer
    // work (spec:AST-094 FR24).
    coarsePrimaryPointer();
    press(rows[0], 'pointerdown', 10, 10);
    scroller.dispatchEvent(new Event('scroll'));
    press(rows[0], 'pointercancel', 10, 10);
    lift(rows[0]);
    vi.advanceTimersByTime(60_000);
    expect(attached()).toContain('window scrollend (capture)');
    // A touch landing on the gliding list brakes it and paints nothing.
    press(rows[1], 'pointerdown', 10, 100);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(pressedRow()).toBe(-1);
    lift(rows[1]);
    scroller.dispatchEvent(new Event('scrollend'));
    expect(attached()).toEqual(AT_REST);
  });

  it('a mouse on a desktop attaches nothing', () => {
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
    press(rows[0], 'pointerdown', 10, 10, 'mouse');
    press(rows[0], 'pointerup', 10, 10, 'mouse');
    vi.runAllTimers();
    expect(attached()).toEqual(AT_REST);
  });

  it('uninstalling takes every listener down', () => {
    press(rows[0], 'pointerdown', 10, 10);
    release();
    release = () => undefined;
    expect(attached()).toEqual([]);
  });
});

describe('the release clocks the browser specs read', () => {
  it('a control releases in 250 ms (ButtonPress.interaction.browser.spec.ts RELEASE_MS)', () => {
    expect(PRESS_PROFILES.control.releaseMs).toBe(250);
  });

  it('a fine primary pointer keeps 200 ms (ButtonPressRelease.interaction.browser.spec.ts DESELECT_MS)', () => {
    expect(PRESS_FADE_MS).toBe(200);
  });
});
