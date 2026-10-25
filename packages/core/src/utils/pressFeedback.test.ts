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
import {
  durationToMs,
  hasReleaseFade,
  readsPressStrength,
  declaresPressPaint,
  rulesDeclaredFor,
  rulesWithSelector,
} from '../__tests__/pressState';
import {
  interactionOverlayStyles,
  pressConsts,
} from './interactionOverlay.stylex';
import {
  PRESSABLE_ATTRIBUTE,
  PRESSED_ATTRIBUTE,
  installPressFeedback,
  subscribePressPaint,
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
  Object.assign(event, {clientX: x, clientY: y, pointerId: 1, pointerType});
  element.dispatchEvent(event);
}

const pressedRow = (): number =>
  rows.findIndex(row => row.getAttribute(PRESSED_ATTRIBUTE) === 'on');

function pressable(tag = 'div'): HTMLElement {
  const element = document.createElement(tag);
  element.setAttribute(PRESSABLE_ATTRIBUTE, '');
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

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  scroller = document.createElement('div');
  rows = [];
  for (let index = 0; index < 4; index += 1) {
    const row = pressable();
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
  it('locks text selection on the row and its switch input while a finger is held, where the primary pointer is coarse', () => {
    coarsePrimaryPointer();
    const row = pressable('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('role', 'switch');
    row.appendChild(input);
    document.body.appendChild(row);
    press(input, 'pointerdown', 10, 10);
    vi.advanceTimersByTime(600);
    expect(row.style.getPropertyValue('user-select')).toBe('none');
    expect(input.style.getPropertyValue('user-select')).toBe('none');
    press(input, 'pointerup', 10, 10);
    expect(row.style.getPropertyValue('user-select')).toBe('');
    expect(input.style.getPropertyValue('user-select')).toBe('');
    // A mouse never locks anything.
    press(input, 'pointerdown', 10, 10, 'mouse');
    expect(row.style.getPropertyValue('user-select')).toBe('');
    press(input, 'pointerup', 10, 10, 'mouse');
  });

  it("keeps a link's native long-press menu: no callout lock on a link or under one", () => {
    coarsePrimaryPointer();
    // jsdom drops -webkit-touch-callout, so the lock's writes are recorded.
    const written = new Map<Element, string[]>();
    const setProperty = CSSStyleDeclaration.prototype.setProperty;
    const owners = new WeakMap<CSSStyleDeclaration, Element>();
    const spy = vi
      .spyOn(CSSStyleDeclaration.prototype, 'setProperty')
      .mockImplementation(function (
        this: CSSStyleDeclaration,
        name: string,
        value: string | null,
        priority?: string,
      ) {
        const owner = owners.get(this);
        if (owner != null && value === 'none') {
          written.set(owner, [...(written.get(owner) ?? []), name]);
        }
        setProperty.call(this, name, value, priority);
      });
    const track = (element: HTMLElement) => {
      owners.set(element.style, element);
      return element;
    };
    const link = track(pressable('a'));
    link.setAttribute('href', '/next');
    const text = document.createElement('span');
    text.textContent = 'Next';
    link.appendChild(text);
    document.body.appendChild(link);
    press(text, 'pointerdown', 10, 10);
    vi.advanceTimersByTime(600);
    press(text, 'pointerup', 10, 10);
    // iOS shows a link's menu and preview on a long press: no callout lock.
    expect(written.get(link)).toEqual(['-webkit-user-select', 'user-select']);
    // A link inside a pressable row keeps its menu too.
    const row = track(pressable());
    const inner = document.createElement('a');
    inner.setAttribute('href', '/more');
    inner.textContent = 'More';
    row.appendChild(inner);
    document.body.appendChild(row);
    press(inner, 'pointerdown', 10, 10);
    vi.advanceTimersByTime(600);
    press(inner, 'pointerup', 10, 10);
    expect(written.get(row)).toEqual(['-webkit-user-select', 'user-select']);
    // A plain row still loses the callout.
    const plain = track(rows[0]);
    press(plain, 'pointerdown', 10, 10);
    vi.advanceTimersByTime(600);
    press(plain, 'pointerup', 10, 10);
    expect(written.get(plain)).toEqual([
      '-webkit-touch-callout',
      '-webkit-user-select',
      'user-select',
    ]);
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
    // On a touch device a pen locks, as a finger does.
    const restore = coarsePrimaryPointer();
    try {
      press(row, 'pointerdown', 10, 10, 'pen');
      vi.advanceTimersByTime(600);
      expect(row.style.getPropertyValue('user-select')).toBe('none');
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

  it('ignores a mouse entirely', () => {
    press(rows[0], 'pointerdown', 10, 10, 'mouse');
    vi.advanceTimersByTime(PRESS_ONSET_MS * 2);
    expect(pressedRow()).toBe(-1);
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
    vi.advanceTimersByTime(PRESS_SCROLL_BRAKE_MS + 10);

    press(rows[2], 'pointerdown', 10, 420);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(pressedRow()).toBe(2);
  });

  it('is a brake, not a press, when it lands on a list that is still moving', () => {
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

  it('presses normally once the list has come to rest', () => {
    press(rows[0], 'pointerdown', 10, 10);
    press(rows[0], 'pointerup', 10, 10);
    scroller.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(PRESS_SCROLL_BRAKE_MS + 10);
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
    window.dispatchEvent(new Event('touchcancel'));
    expect(pressedRow()).toBe(-1);
    // It docks one again: the touch listener comes down.
    pointer.set(false);
    press(rows[1], 'pointerdown', 10, 100);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(pressedRow()).toBe(1);
    window.dispatchEvent(new Event('touchcancel'));
    expect(pressedRow()).toBe(1);
  });

  it("reports each change of a surface's paint to its subscribers: on, fading, none", () => {
    const paints: string[] = [];
    const stop = subscribePressPaint(rows[0], paint => paints.push(paint));
    press(rows[0], 'pointerdown', 10, 10);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    press(rows[0], 'pointerup', 10, 10);
    vi.advanceTimersByTime(PRESS_FADE_MS + 50);
    expect(paints).toEqual(['on', 'fading', 'none']);
    stop();
    press(rows[0], 'pointerdown', 10, 10);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    expect(paints).toHaveLength(3);
    press(rows[0], 'pointercancel', 10, 10);
  });

  it('follows 200 subscribed surfaces with no observer and no listener per surface', () => {
    const observers = vi.fn();
    vi.stubGlobal('MutationObserver', observers);
    const added = [
      vi.spyOn(window, 'addEventListener'),
      vi.spyOn(document, 'addEventListener'),
    ];
    const surfaces = Array.from({length: 200}, () => pressable('button'));
    const perSurface = surfaces.map(surface =>
      vi.spyOn(surface, 'addEventListener'),
    );
    const stops: (() => void)[] = [];
    try {
      for (const surface of surfaces) {
        stops.push(subscribePressPaint(surface, () => {}));
      }
      expect(observers).not.toHaveBeenCalled();
      for (const spy of [...added, ...perSurface]) {
        expect(spy).not.toHaveBeenCalled();
      }
    } finally {
      for (const stop of stops) {
        stop();
      }
      for (const spy of [...added, ...perSurface]) {
        spy.mockRestore();
      }
      vi.unstubAllGlobals();
    }
  });

  it("keeps reporting to a surface's other subscribers when one throws", () => {
    const paints: string[] = [];
    const errors: unknown[] = [];
    const queued = vi
      .spyOn(globalThis, 'queueMicrotask')
      .mockImplementation(callback => {
        try {
          callback();
        } catch (error) {
          errors.push(error);
        }
      });
    const stops = [
      subscribePressPaint(rows[1], () => {
        throw new Error('a broken subscriber');
      }),
      subscribePressPaint(rows[1], paint => paints.push(paint)),
    ];
    try {
      press(rows[1], 'pointerdown', 10, 100);
      vi.advanceTimersByTime(PRESS_ONSET_MS);
      expect(paints).toEqual(['on']);
      expect(errors).toHaveLength(1);
      expect(pressedRow()).toBe(1);
    } finally {
      for (const stop of stops) {
        stop();
      }
      queued.mockRestore();
      press(rows[1], 'pointercancel', 10, 100);
    }
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

  it("the machine's clock is the stylesheet's constant: one number", () => {
    expect(PRESS_FADE_MS).toBe(pressConsts.releaseMs);
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
