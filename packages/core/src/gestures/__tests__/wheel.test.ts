// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file wheel.test.ts
 * @input A GestureHost on a manual clock, with pans and pinches that allow
 *   scroll input, driven by synthetic WheelEvents
 * @output Tests for spec:AST-094 FR43's wheel and trackpad input: a pan
 *   takes scrolling only where it allows that scroll type (UIKit's
 *   allowedScrollTypesMask, none by default), along its own axis, after the
 *   scrollers under the pointer; a pinch takes a ctrl-wheel; a wheel gesture
 *   ends 100 ms after its last event
 * @position Unit tests of the host's wheel input (GestureHost.ts)
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {GestureHost} from '../GestureHost';
import {PanGestureRecognizer} from '../PanGestureRecognizer';
import {PinchGestureRecognizer} from '../PinchGestureRecognizer';
import {ManualClock} from './harness';

let clock: ManualClock;
let host: GestureHost;
let detachers: (() => void)[];

function mount(html: string): Record<string, HTMLElement> {
  document.body.innerHTML = html;
  const elements: Record<string, HTMLElement> = {};
  for (const element of document.querySelectorAll<HTMLElement>('[id]')) {
    elements[element.id] = element;
  }
  return elements;
}

function wheel(
  target: EventTarget,
  init: {
    x?: number;
    y?: number;
    dx?: number;
    dy?: number;
    mode?: number;
    ctrl?: boolean;
    time: number;
  },
): WheelEvent {
  clock.time = init.time;
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: init.x ?? 20,
    clientY: init.y ?? 20,
    deltaX: init.dx ?? 0,
    deltaY: init.dy ?? 0,
    deltaMode: init.mode ?? 0,
    ctrlKey: init.ctrl ?? false,
  });
  Object.defineProperty(event, 'timeStamp', {value: init.time});
  target.dispatchEvent(event);
  return event;
}

function statesOf(recognizer: PanGestureRecognizer | PinchGestureRecognizer) {
  const states: string[] = [];
  recognizer.addTransitionListener((_recognizer, _from, to) => states.push(to));
  return states;
}

/** jsdom has no layout: give a scroller its horizontal metrics. */
function scrollableX(
  element: HTMLElement,
  metrics: {scrollLeft: number; scrollWidth: number; clientWidth: number},
): void {
  element.style.overflowX = 'auto';
  for (const [key, value] of Object.entries(metrics)) {
    Object.defineProperty(element, key, {configurable: true, value});
  }
}

/** jsdom has no layout: give a scroller its vertical metrics. */
function scrollableY(
  element: HTMLElement,
  metrics: {scrollTop: number; scrollHeight: number; clientHeight: number},
): void {
  element.style.overflowY = 'auto';
  for (const [key, value] of Object.entries(metrics)) {
    Object.defineProperty(element, key, {configurable: true, value});
  }
}

beforeEach(() => {
  clock = new ManualClock();
  host = new GestureHost(document, {
    clock,
    isPrimaryPointerCoarse: () => false,
  });
  detachers = [];
});

afterEach(() => {
  for (const detach of detachers.splice(0)) {
    detach();
  }
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('wheel and trackpad input (spec:AST-094 FR43)', () => {
  it("takes a wheel on a scroll-edge pan only while no scroller under the pointer could scroll for it, its own scroll owner above it included, as a finger's (FR19)", () => {
    const {owner, content} = mount(
      '<div id="owner"><div id="content"></div></div>',
    );
    const pull = new PanGestureRecognizer({
      direction: 'vertical',
      scrollEdge: true,
      allowedScrollTypes: ['continuous'],
    });
    const states = statesOf(pull);
    detachers.push(host.attach(content, pull));
    // Mid-scroll: a scroll up is the owner's.
    scrollableY(owner, {scrollTop: 50, scrollHeight: 300, clientHeight: 200});
    expect(wheel(content, {dy: -20, time: 0}).defaultPrevented).toBe(false);
    expect(wheel(content, {dy: -20, time: 16}).defaultPrevented).toBe(false);
    // At the top, a scroll down is the owner's too.
    scrollableY(owner, {scrollTop: 0, scrollHeight: 300, clientHeight: 200});
    expect(wheel(content, {dy: 20, time: 200}).defaultPrevented).toBe(false);
    expect(states).toEqual([]);
    // At the top, pulling the content down: the pan's.
    expect(wheel(content, {dy: -20, time: 400}).defaultPrevented).toBe(true);
    expect(wheel(content, {dy: -20, time: 416}).defaultPrevented).toBe(true);
    expect(states).toEqual(['began', 'changed']);
  });

  it("reads a wheel's scrollers past touch-action, which only narrows a finger's pan: content with touch-action none still leaves a mid-scroll wheel to its owner", () => {
    const {owner, content} = mount(
      '<div id="owner"><div id="content" style="touch-action: none"></div></div>',
    );
    const pull = new PanGestureRecognizer({
      direction: 'vertical',
      scrollEdge: true,
      allowedScrollTypes: ['continuous'],
    });
    const states = statesOf(pull);
    detachers.push(host.attach(content, pull));
    scrollableY(owner, {scrollTop: 50, scrollHeight: 300, clientHeight: 200});
    expect(wheel(content, {dy: -20, time: 0}).defaultPrevented).toBe(false);
    expect(wheel(content, {dy: -20, time: 16}).defaultPrevented).toBe(false);
    expect(states).toEqual([]);
  });

  it('latches a wheel gesture to the pan that took it, as a browser latches a scroller: a step that lands outside the moved element still drives the pan and is prevented, until the gesture ends', () => {
    const {wrapper, card} = mount(
      '<div id="wrapper"><div id="card"></div></div>',
    );
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      allowedScrollTypes: ['continuous'],
    });
    const states = statesOf(pan);
    detachers.push(host.attach(card, pan));
    const added = vi.spyOn(document, 'addEventListener');
    expect(wheel(card, {dx: 16, time: 0}).defaultPrevented).toBe(true);
    expect(wheel(card, {dx: 16, time: 16}).defaultPrevented).toBe(true);
    expect(states).toEqual(['began', 'changed']);
    const afterTwo = pan.translation().x;
    // The card has moved out from under a still cursor: the next steps land
    // on the wrapper.
    for (const time of [32, 48, 64, 80]) {
      expect(wheel(wrapper, {dx: 16, time}).defaultPrevented).toBe(true);
    }
    expect(pan.translation().x).toBe(afterTwo - 64);
    expect(states.at(-1)).toBe('changed');
    expect(
      (added.mock.calls as unknown[][]).filter(call => call[0] === 'wheel'),
    ).toHaveLength(1);
    const removed = vi.spyOn(document, 'removeEventListener');
    clock.runDue(80 + 100);
    expect(states.slice(-2)).toEqual(['ended', 'possible']);
    expect(
      (removed.mock.calls as unknown[][]).filter(call => call[0] === 'wheel'),
    ).toHaveLength(1);
    // Over: a wheel on the wrapper is the page's again.
    expect(wheel(wrapper, {dx: 16, time: 400}).defaultPrevented).toBe(false);
  });

  it("ends a wheel gesture whose pan is detached mid-gesture at once, and takes the document's wheel listener with it (FR24)", () => {
    const {card} = mount('<div id="card"></div>');
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      allowedScrollTypes: ['continuous'],
    });
    const detach = host.attach(card, pan);
    wheel(card, {dx: 16, time: 0});
    wheel(card, {dx: 16, time: 16});
    expect(pan.state).toBe('changed');
    const removed = vi.spyOn(document, 'removeEventListener');
    detach();
    expect(
      (removed.mock.calls as unknown[][]).filter(call => call[0] === 'wheel'),
    ).toHaveLength(1);
    expect(wheel(document.body, {dx: 16, time: 32}).defaultPrevented).toBe(
      false,
    );
  });

  it("takes no wheel for a pan that allows no scroll type, UIKit's default: its element gets no wheel listener, and the page scrolls", () => {
    const {box} = mount('<div id="box"></div>');
    const added = vi.spyOn(box, 'addEventListener');
    const pan = new PanGestureRecognizer({direction: 'horizontal'});
    const states = statesOf(pan);
    detachers.push(host.attach(box, pan));
    expect(added.mock.calls.map(call => call[0])).not.toContain('wheel');
    expect(wheel(box, {dx: 30, time: 0}).defaultPrevented).toBe(false);
    expect(states).toEqual([]);
  });

  it('takes a trackpad scroll along its axis on a pan that allows continuous scrolling: it begins past 10 px, follows the content, and ends 100 ms after the last wheel', () => {
    const {box} = mount('<div id="box"></div>');
    const added = vi.spyOn(box, 'addEventListener');
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      allowedScrollTypes: ['continuous'],
    });
    const states = statesOf(pan);
    detachers.push(host.attach(box, pan));
    expect(
      (added.mock.calls as unknown[][]).filter(call => call[0] === 'wheel'),
    ).toEqual([['wheel', expect.any(Function), {passive: false}]]);
    const events = [0, 16, 32, 48].map(time =>
      wheel(box, {dx: 6.5, dy: 0.5, time}),
    );
    expect(events.every(event => event.defaultPrevented)).toBe(true);
    expect(states[0]).toBe('began');
    // The content moves the way the fingers do: a scroll right drags it left.
    expect(pan.translation().x).toBeLessThan(0);
    expect(states).not.toContain('ended');
    clock.runDue(48 + 99);
    expect(states).not.toContain('ended');
    clock.runDue(48 + 100);
    expect(states).toContain('ended');
  });

  it('starts a new wheel gesture after a quiet gap even when the end timer has not run yet (a blocked main thread)', () => {
    const {box} = mount('<div id="box"></div>');
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      allowedScrollTypes: ['continuous'],
    });
    const states = statesOf(pan);
    detachers.push(host.attach(box, pan));
    for (const time of [0, 16, 32]) {
      wheel(box, {dx: 8, time});
    }
    // The timer that would end it has not run: the next wheel, 150 ms later,
    // ends it at its last wheel and begins another.
    for (const time of [182, 198, 214]) {
      wheel(box, {dx: 8, time});
    }
    expect(states.filter(state => state === 'began')).toHaveLength(2);
    expect(states).toContain('ended');
  });

  it('leaves a wheel across its axis to the page', () => {
    const {box} = mount('<div id="box"></div>');
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      allowedScrollTypes: ['continuous', 'discrete'],
    });
    const states = statesOf(pan);
    detachers.push(host.attach(box, pan));
    const events = [0, 16, 32].map(time => wheel(box, {dy: 12, time}));
    expect(events.some(event => event.defaultPrevented)).toBe(false);
    expect(states).toEqual([]);
  });

  it('leaves a wheel to a scroller under the pointer that can still scroll that way, for the whole wheel gesture, and takes the next one once it is at its edge', () => {
    const {box, list} = mount(
      '<div id="box"><div id="list"><div id="row">row</div></div></div>',
    );
    scrollableX(list, {scrollLeft: 0, scrollWidth: 600, clientWidth: 200});
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      allowedScrollTypes: ['continuous'],
    });
    const states = statesOf(pan);
    detachers.push(host.attach(box, pan));
    const native = [0, 16, 32].map(time =>
      wheel(document.getElementById('row') as HTMLElement, {dx: 8, time}),
    );
    // Decided once, at the gesture's first wheel: the list scrolls.
    Object.defineProperty(list, 'scrollLeft', {configurable: true, value: 400});
    native.push(
      wheel(document.getElementById('row') as HTMLElement, {dx: 8, time: 48}),
    );
    expect(native.some(event => event.defaultPrevented)).toBe(false);
    expect(states).toEqual([]);
    clock.runDue(48 + 100);
    const taken = [500, 516, 532].map(time =>
      wheel(document.getElementById('row') as HTMLElement, {dx: 8, time}),
    );
    expect(taken.every(event => event.defaultPrevented)).toBe(true);
    expect(states[0]).toBe('began');
  });

  it("tells a mouse wheel's notches from a trackpad: a pan that allows continuous scrolling only leaves them to the page, one that allows discrete takes them, a line at 40 px", () => {
    const {smooth, notched} = mount(
      '<div id="smooth"></div><div id="notched"></div>',
    );
    const trackpadOnly = new PanGestureRecognizer({
      direction: 'vertical',
      allowedScrollTypes: ['continuous'],
    });
    const wheelToo = new PanGestureRecognizer({
      direction: 'vertical',
      allowedScrollTypes: ['discrete'],
    });
    detachers.push(
      host.attach(smooth, trackpadOnly),
      host.attach(notched, wheelToo),
    );
    // Lines (Firefox's mouse wheel), and a whole notch in pixels (Chromium's).
    expect(wheel(smooth, {dy: 3, mode: 1, time: 0}).defaultPrevented).toBe(
      false,
    );
    clock.runDue(200);
    expect(wheel(smooth, {dy: 100, time: 300}).defaultPrevented).toBe(false);
    clock.runDue(500);
    const states = statesOf(wheelToo);
    expect(wheel(notched, {dy: 1, mode: 1, time: 600}).defaultPrevented).toBe(
      true,
    );
    expect(states[0]).toBe('began');
    // One line is 40 px, past the 10 px start: the pan moved with it.
    expect(Math.abs(wheelToo.translation().y)).toBeGreaterThan(0);
  });

  it('takes a ctrl-wheel on a pinch, a trackpad pinch or ctrl and a mouse wheel: the scale follows exp(-deltaY / 100), the page does not zoom, and it ends 100 ms after the last wheel', () => {
    const {photo} = mount('<div id="photo"></div>');
    const pinch = new PinchGestureRecognizer();
    const states = statesOf(pinch);
    detachers.push(host.attach(photo, pinch));
    const events = [0, 16, 32, 48, 64].map(time =>
      wheel(photo, {dy: -10, ctrl: true, time}),
    );
    expect(events.every(event => event.defaultPrevented)).toBe(true);
    expect(states[0]).toBe('began');
    expect(pinch.scale).toBeGreaterThan(1);
    expect(pinch.scale).toBeLessThanOrEqual(Math.exp(0.5) + 1e-6);
    clock.runDue(64 + 100);
    expect(states).toContain('ended');
  });

  it("keeps the page's text selection when a wheel pan claims, as a scroll does", () => {
    const {box} = mount('<div id="box">Some selected text</div>');
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      allowedScrollTypes: ['continuous'],
    });
    detachers.push(host.attach(box, pan));
    const selection = window.getSelection() as Selection;
    selection.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(box);
    selection.addRange(range);
    for (const time of [0, 16, 32, 48]) {
      wheel(box, {dx: 8, time});
    }
    expect(pan.state).not.toBe('possible');
    expect(selection.rangeCount).toBe(1);
    expect(box.style.getPropertyValue('user-select')).toBe('');
  });

  it('removes the wheel listener when the pan is disabled or detached', () => {
    const {box} = mount('<div id="box"></div>');
    const removed = vi.spyOn(box, 'removeEventListener');
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      allowedScrollTypes: ['continuous'],
    });
    const detach = host.attach(box, pan);
    pan.isEnabled = false;
    host.update(box);
    expect(removed.mock.calls.map(call => call[0])).toContain('wheel');
    expect(wheel(box, {dx: 30, time: 0}).defaultPrevented).toBe(false);
    detach();
  });
});
