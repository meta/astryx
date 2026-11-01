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
import {TEMPO_RANGE, expandThemeMotion} from '../theme/themeMotion';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
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
  installPressFeedback,
  PRESSABLE_ATTRIBUTE,
  PRESSED_ATTRIBUTE,
} from './pressFeedback';
import {
  PRESS_FADE_MS,
  PRESS_FLASH_MS,
  PRESS_ONSET_MS,
  PRESS_SCROLL_BRAKE_MS,
  PRESS_SLOP_PX,
} from './pressGesture';

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

function pressable(tag = 'div'): HTMLElement {
  const element = document.createElement(tag);
  element.setAttribute(PRESSABLE_ATTRIBUTE, '');
  return element;
}

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
});

describe('the press reaches the surface the finger landed on', () => {
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

  it('scales the fade by the tempo its stylesheet reads, a theme\u2019s or an adaptation rule\u2019s (spec:AST-108 FR4, component:Button FR15)', () => {
    // A rule writes the tempo (a media-query adaptation, say); browsers
    // inherit it from the theme, jsdom only reads it where it is declared.
    const style = document.createElement('style');
    style.textContent = '.slow-row { --_astryx-motion-tempo: 1.5; }';
    document.head.appendChild(style);
    rows[0].classList.add('slow-row');
    try {
      press(rows[0], 'pointerdown', 10, 10);
      vi.advanceTimersByTime(PRESS_ONSET_MS);
      press(rows[0], 'pointerup', 10, 10);
      vi.advanceTimersByTime(PRESS_FADE_MS);
      expect(rows[0].getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
      vi.advanceTimersByTime(PRESS_FADE_MS / 2);
      expect(rows[0].hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    } finally {
      style.remove();
    }
  });

  it('under Reduce Motion a tempo may shorten the fade but never lengthens it past 200 ms (spec:AST-108 FR4)', () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string): MediaQueryList =>
        ({
          matches: /prefers-reduced-motion:\s*reduce/.test(query),
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );
    const style = document.createElement('style');
    style.textContent =
      '.slow-row { --_astryx-motion-tempo: 1.5; } .quick-row { --_astryx-motion-tempo: 0.75; }';
    document.head.appendChild(style);
    try {
      rows[0].classList.add('slow-row');
      press(rows[0], 'pointerdown', 10, 10);
      vi.advanceTimersByTime(PRESS_ONSET_MS);
      press(rows[0], 'pointerup', 10, 10);
      vi.advanceTimersByTime(PRESS_FADE_MS);
      expect(rows[0].hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
      rows[0].classList.replace('slow-row', 'quick-row');
      press(rows[0], 'pointerdown', 10, 10);
      vi.advanceTimersByTime(PRESS_ONSET_MS);
      press(rows[0], 'pointerup', 10, 10);
      vi.advanceTimersByTime(PRESS_FADE_MS * 0.75);
      expect(rows[0].hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    } finally {
      rows[0].classList.remove('slow-row', 'quick-row');
      style.remove();
      vi.unstubAllGlobals();
    }
  });

  it('bounds the release’s tempo at its own maximum, so the bound changes nothing', () => {
    // The clock's 1.5 is TEMPO_RANGE.max, and every tempo a theme writes is
    // clamped to it: a theme asking for 3 writes 1.5.
    const source = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        'interactionOverlay.stylex.ts',
      ),
      'utf8',
    );
    expect(source).toContain(
      `min(var(--_astryx-motion-tempo, 1), ${TEMPO_RANGE.max})`,
    );
    expect(expandThemeMotion({tempo: 3})['--_astryx-motion-tempo']).toBe(
      String(TEMPO_RANGE.max),
    );
  });

  it('caps the stylesheet’s release fade under Reduce Motion', () => {
    const source = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        'interactionOverlay.stylex.ts',
      ),
      'utf8',
    );
    expect(source).toMatch(
      /min\(\$\{pressConsts\.releaseMs\}ms, calc\(\$\{pressConsts\.releaseMs\}ms \* var\(--_astryx-motion-tempo, 1\)\)\)/,
    );
    expect(source).toMatch(
      /'@media \(prefers-reduced-motion: reduce\)': PRESS_RELEASE_DURATION_REDUCED/,
    );
  });

  it('keeps the 200 ms fade without a tempo', () => {
    press(rows[0], 'pointerdown', 10, 10);
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    press(rows[0], 'pointerup', 10, 10);
    vi.advanceTimersByTime(PRESS_FADE_MS);
    expect(rows[0].hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });

  it('times the stylesheet’s release fade by the same tempo', () => {
    // The animation the attribute drives, scaled by the custom property a
    // theme with a tempo writes beside its duration tokens.
    const source = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        'interactionOverlay.stylex.ts',
      ),
      'utf8',
    );
    expect(source).toMatch(
      /calc\(\$\{pressConsts\.releaseMs\}ms \* min\(var\(--_astryx-motion-tempo, 1\),/,
    );
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

  it('fades a mouse press by the theme\u2019s tempo too (spec:AST-108 FR4, component:Button FR15)', () => {
    const style = document.createElement('style');
    style.textContent = '.slow-row { --_astryx-motion-tempo: 1.5; }';
    document.head.appendChild(style);
    rows[1].classList.add('slow-row');
    try {
      press(rows[1], 'pointerdown', 10, 100, 'mouse');
      press(rows[1], 'pointerup', 10, 100, 'mouse');
      vi.advanceTimersByTime(PRESS_FADE_MS);
      expect(rows[1].getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
      vi.advanceTimersByTime(PRESS_FADE_MS / 2);
      expect(rows[1].hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    } finally {
      rows[1].classList.remove('slow-row');
      style.remove();
    }
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
    vi.advanceTimersByTime(PRESS_FADE_MS);
    expect(button.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });

  it('listens for the key’s release and focus loss only while Space holds a press', () => {
    const attached = new Set<string>();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const sync = () => {
      for (const [type] of add.mock.calls.splice(0)) {
        attached.add(type);
      }
      for (const [type] of remove.mock.calls.splice(0)) {
        attached.delete(type);
      }
    };
    const button = focusedButton(rows[0]);
    key(button, 'keydown');
    sync();
    expect([...attached].sort()).toEqual(['blur', 'keyup']);
    key(button, 'keyup');
    sync();
    expect([...attached]).toEqual([]);
    add.mockRestore();
    remove.mockRestore();
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
    vi.advanceTimersByTime(PRESS_FADE_MS);
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
