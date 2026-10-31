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
import {LongPressGestureRecognizer} from '../LongPressGestureRecognizer';
import {PanGestureRecognizer} from '../PanGestureRecognizer';
import {PinchGestureRecognizer} from '../PinchGestureRecognizer';
import {ScreenEdgePanGestureRecognizer} from '../ScreenEdgePanGestureRecognizer';
import {TapGestureRecognizer} from '../TapGestureRecognizer';
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
  it('reads a right-to-left scroller under the pointer by its own range: at its start a scroll toward it is the pan’s, a scroll away from it the scroller’s', () => {
    const {strip, scroller, item} = mount(
      '<div id="strip"><div id="scroller" dir="rtl"><div id="item"></div></div></div>',
    );
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      allowedScrollTypes: ['continuous'],
    });
    const states = statesOf(pan);
    detachers.push(host.attach(strip, pan));
    // Right to left, scrollLeft runs from 0 at the start to minus the
    // overflow: at 0 the scroller cannot scroll right any further.
    scrollableX(scroller, {scrollLeft: 0, scrollWidth: 300, clientWidth: 200});
    expect(wheel(item, {dx: -20, time: 0}).defaultPrevented).toBe(false);
    expect(states).toEqual([]);
    expect(wheel(item, {dx: 20, time: 200}).defaultPrevented).toBe(true);
    expect(wheel(item, {dx: 20, time: 216}).defaultPrevented).toBe(true);
    expect(states).toEqual(['began', 'changed']);
  });

  it('reads a right-to-left scroller a pixel short of its end, where Chromium stops it, as at its end: a scroll on toward the end is the pan’s', () => {
    const {strip, scroller, item} = mount(
      '<div id="strip"><div id="scroller" dir="rtl"><div id="item"></div></div></div>',
    );
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      allowedScrollTypes: ['continuous'],
    });
    const states = statesOf(pan);
    detachers.push(host.attach(strip, pan));
    // The end is minus the overflow (-100); Chromium stops at -99.
    scrollableX(scroller, {
      scrollLeft: -99,
      scrollWidth: 300,
      clientWidth: 200,
    });
    expect(wheel(item, {dx: -20, time: 0}).defaultPrevented).toBe(true);
    expect(wheel(item, {dx: -20, time: 16}).defaultPrevented).toBe(true);
    expect(states).toEqual(['began', 'changed']);
  });

  it('finds a scroller inside a shadow tree between the pointer and the pan, from what the wheel landed on', () => {
    const {outer} = mount('<div id="outer"></div>');
    const shadow = outer.attachShadow({mode: 'open'});
    shadow.innerHTML = '<div id="scroller"><div id="item"></div></div>';
    const scroller = shadow.getElementById('scroller') as HTMLElement;
    const item = shadow.getElementById('item') as HTMLElement;
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      allowedScrollTypes: ['continuous'],
    });
    const states = statesOf(pan);
    detachers.push(host.attach(outer, pan));
    scrollableX(scroller, {scrollLeft: 50, scrollWidth: 300, clientWidth: 200});
    expect(wheel(item, {dx: 20, time: 0}).defaultPrevented).toBe(false);
    expect(wheel(item, {dx: 20, time: 16}).defaultPrevented).toBe(false);
    expect(states).toEqual([]);
  });

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

  it('arms nothing else for a recognizer that takes only scroll input (no pointer types): where the primary pointer is fine its element gets the wheel listener alone, and no finger, mouse or pen starts it', () => {
    const {content} = mount('<div id="content"></div>');
    const added = vi.spyOn(content, 'addEventListener');
    const pan = new PanGestureRecognizer({
      direction: 'vertical',
      allowedPointerTypes: [],
      allowedScrollTypes: ['continuous'],
    });
    const states = statesOf(pan);
    detachers.push(host.attach(content, pan));
    expect(
      (added.mock.calls as unknown[][]).map(call => String(call[0])),
    ).toEqual(['wheel']);
    for (const pointerType of ['mouse', 'pen', 'touch']) {
      for (const [type, y] of [
        ['pointerdown', 10],
        ['pointermove', 40],
        ['pointermove', 80],
        ['pointerup', 80],
      ] as const) {
        content.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            pointerId: 7,
            pointerType,
            clientX: 10,
            clientY: y,
            buttons: type === 'pointerup' ? 0 : 1,
          }),
        );
      }
    }
    expect(states).toEqual([]);
  });

  it('makes no touch listener cancelling for a scroll-only claimer: with it beside a watcher, the touchend stays passive and the contextmenu off (spec:AST-094 FR20, FR24)', () => {
    const {watched, pull} = mount(
      '<div id="watched"></div><div id="pull"></div>',
    );
    const added = vi.spyOn(window, 'addEventListener');
    detachers.push(() => added.mockRestore());
    const coarse = new GestureHost(document, {
      clock,
      isPrimaryPointerCoarse: () => true,
    });
    // A watcher installs the host's touch listeners, all passive (FR20).
    detachers.push(
      coarse.attach(
        watched,
        new PanGestureRecognizer({claimsTouches: false, direction: 'vertical'}),
      ),
    );
    added.mockClear();
    // A pull that takes only the wheel claims no touch.
    detachers.push(
      coarse.attach(
        pull,
        new PanGestureRecognizer({
          direction: 'vertical',
          allowedPointerTypes: [],
          allowedScrollTypes: ['continuous'],
        }),
      ),
    );
    const calls = added.mock.calls as unknown as [
      string,
      unknown,
      AddEventListenerOptions | undefined,
    ][];
    expect(
      calls.filter(
        ([type, , options]) =>
          type === 'touchend' && options?.passive === false,
      ),
    ).toEqual([]);
    expect(calls.filter(([type]) => type === 'contextmenu')).toEqual([]);
  });

  it('listens for the wheel only where a recognizer a wheel can drive allows it: a tap that allows scroll input adds no wheel listener', () => {
    const {box} = mount('<div id="box"></div>');
    const added = vi.spyOn(box, 'addEventListener');
    const tap = new TapGestureRecognizer({allowedScrollTypes: ['continuous']});
    detachers.push(host.attach(box, tap));
    expect(
      (added.mock.calls as unknown[][]).filter(call => call[0] === 'wheel'),
    ).toEqual([]);
  });

  it("takes wheel and trackpad scrolling on a pan by default, a mouse wheel's notches included (spec:AST-094 FR43)", () => {
    const {box} = mount('<div id="box"></div>');
    const added = vi.spyOn(box, 'addEventListener');
    const pan = new PanGestureRecognizer({direction: 'horizontal'});
    const states = statesOf(pan);
    detachers.push(host.attach(box, pan));
    expect(
      (added.mock.calls as unknown[][]).filter(call => call[0] === 'wheel'),
    ).toEqual([['wheel', expect.any(Function), {passive: false}]]);
    expect(wheel(box, {dx: 30, time: 0}).defaultPrevented).toBe(true);
    expect(states[0]).toBe('began');
    clock.runDue(200);
    // A mouse wheel's notch, in lines (Firefox's).
    expect(wheel(box, {dx: 1, mode: 1, time: 300}).defaultPrevented).toBe(true);
    expect(states.filter(state => state === 'began')).toHaveLength(2);
  });

  it('leaves a wheel every taker declined to the page from its first step, as with no gesture system: a pan whose shouldReceiveTouch refuses it prevents nothing (spec:AST-094 FR43, FR19)', () => {
    const {box} = mount('<div id="box"></div>');
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      // A Toast declines a wheel a scroller under it can still take.
      shouldReceiveTouch: () => false,
    });
    const states = statesOf(pan);
    detachers.push(host.attach(box, pan));
    const prevented = [0, 16, 32, 48, 64, 80].map(
      time => wheel(box, {dx: 16, time}).defaultPrevented,
    );
    expect(prevented).toEqual([false, false, false, false, false, false]);
    expect(states).toEqual([]);
    clock.runDue(300);
    // A notch, too.
    expect(wheel(box, {dx: 1, mode: 1, time: 400}).defaultPrevented).toBe(
      false,
    );
  });

  it('takes no wheel for a pan whose caller allows no scroll type: its element gets no wheel listener, and the page scrolls', () => {
    const {box} = mount('<div id="box"></div>');
    const added = vi.spyOn(box, 'addEventListener');
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      allowedScrollTypes: [],
    });
    const states = statesOf(pan);
    detachers.push(host.attach(box, pan));
    expect(added.mock.calls.map(call => call[0])).not.toContain('wheel');
    expect(wheel(box, {dx: 30, time: 0}).defaultPrevented).toBe(false);
    expect(states).toEqual([]);
  });

  it('takes no wheel on a screen-edge pan, which FR43 keeps off under a mouse and a trackpad: a widened allowedScrollTypes is refused (spec:AST-094 FR43)', () => {
    const {box} = mount('<div id="box"></div>');
    const added = vi.spyOn(box, 'addEventListener');
    const edge = new ScreenEdgePanGestureRecognizer({
      edges: ['left'],
      // @ts-expect-error the screen-edge pan takes no allowedScrollTypes
      allowedScrollTypes: ['continuous', 'discrete'],
    });
    expect(edge.allowedScrollTypes.size).toBe(0);
    detachers.push(host.attach(box, edge));
    expect(added.mock.calls.map(call => call[0])).not.toContain('wheel');
    expect(wheel(box, {dx: 30, time: 0}).defaultPrevented).toBe(false);
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

  it("releases a mouse wheel's notches still, so position alone decides, while a trackpad's scroll keeps its speed (coordinator ruling; FR43 is silent)", () => {
    const {notched, smooth} = mount(
      '<div id="notched"></div><div id="smooth"></div>',
    );
    const released: Record<string, {velocity: number; scroll: number}> = {};
    for (const [key, element] of [
      ['notched', notched],
      ['smooth', smooth],
    ] as const) {
      const pan = new PanGestureRecognizer({direction: 'vertical'});
      pan.addTransitionListener((current, _from, to) => {
        if (to === 'ended') {
          released[key] = {
            velocity: current.velocity().y,
            scroll: current.scrollVelocity().y,
          };
        }
      });
      detachers.push(host.attach(element, pan));
    }
    // Three quick 100 px notches, as a mouse wheel reports them.
    for (const time of [0, 16, 32]) {
      expect(wheel(notched, {dy: 100, time}).defaultPrevented).toBe(true);
    }
    clock.runDue(32 + 100);
    expect(Math.abs(released.notched.velocity)).toBe(0);
    expect(Math.abs(released.notched.scroll)).toBe(0);
    // A trackpad's steady scroll keeps its speed at the release.
    for (const time of [500, 516, 532, 548]) {
      wheel(smooth, {dy: 8, time});
    }
    clock.runDue(548 + 100);
    expect(Math.abs(released.smooth.velocity)).toBeGreaterThan(0);
    expect(Math.abs(released.smooth.scroll)).toBeGreaterThan(0);
  });

  it("releases a trackpad fling at the fingers' last move, so the release keeps their speed: the momentum wheels before the lift is read never stop it (#8676 rescope preview)", () => {
    const {smooth} = mount('<div id="smooth"></div>');
    let released: {velocity: number; time: number} | null = null;
    const pan = new PanGestureRecognizer({direction: 'vertical'});
    pan.addTransitionListener((current, _from, to) => {
      if (to === 'ended') {
        released = {velocity: current.velocity().y, time: clock.time};
      }
    });
    detachers.push(host.attach(smooth, pan));
    // The fingers move steadily, then lift: momentum wheels shrink smoothly.
    let time = 0;
    for (let i = 0; i < 6; i++) {
      wheel(smooth, {dy: 10, time});
      time += 8;
    }
    let delta = 10;
    for (let i = 0; i < 20; i++) {
      delta *= 0.92;
      wheel(smooth, {dy: delta, time});
      time += 16;
    }
    clock.runDue(time + 300);
    expect(released).not.toBeNull();
    expect(Math.abs(released!.velocity)).toBeGreaterThan(500);
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

  it('keeps a watcher pan off the wheel: its element gets no wheel listener, and the page keeps the wheel (spec:AST-094 FR20, DEC-7)', () => {
    const {box} = mount('<div id="box"></div>');
    const added = vi.spyOn(box, 'addEventListener');
    const watcher = new PanGestureRecognizer({
      direction: 'horizontal',
      claimsTouches: false,
    });
    const states = statesOf(watcher);
    detachers.push(host.attach(box, watcher));
    expect(
      (added.mock.calls as unknown[][]).filter(call => call[0] === 'wheel'),
    ).toEqual([]);
    expect(wheel(box, {dx: 30, time: 0}).defaultPrevented).toBe(false);
    expect(states).toEqual([]);
  });

  it('leaves a first wheel already prevented, or one that cannot be cancelled, to the page for its whole gesture', () => {
    const {box, inner} = mount('<div id="box"><div id="inner"></div></div>');
    const pan = new PanGestureRecognizer({direction: 'horizontal'});
    const states = statesOf(pan);
    detachers.push(host.attach(box, pan));
    // An app's own handler below the pan prevented the first wheel.
    inner.addEventListener('wheel', event => event.preventDefault(), {
      once: true,
    });
    wheel(inner, {dx: 30, time: 0});
    expect(wheel(inner, {dx: 30, time: 16}).defaultPrevented).toBe(false);
    expect(states).toEqual([]);
    clock.runDue(400);
    // A wheel the browser lets no one cancel.
    const uncancelable = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: false,
      composed: true,
      clientX: 20,
      clientY: 20,
      deltaX: 30,
    });
    Object.defineProperty(uncancelable, 'timeStamp', {value: 500});
    clock.time = 500;
    inner.dispatchEvent(uncancelable);
    expect(wheel(inner, {dx: 30, time: 516}).defaultPrevented).toBe(false);
    expect(states).toEqual([]);
  });

  it("stamps a notch gesture's release no later than the press that ends it: a long press right after keeps its own clock (spec:AST-094 FR16)", () => {
    const {box, other} = mount('<div id="box"></div><div id="other"></div>');
    detachers.push(
      host.attach(box, new PanGestureRecognizer({direction: 'vertical'})),
    );
    const press = new LongPressGestureRecognizer({name: 'press'});
    const began: number[] = [];
    press.addListener(recognizer => {
      if (recognizer.state === 'began') {
        began.push(clock.time);
      }
    });
    detachers.push(host.attach(other, press));
    // A mouse wheel's notch.
    expect(wheel(box, {dy: 100, time: 0}).defaultPrevented).toBe(true);
    // A pen comes down 20 ms later, ending the wheel gesture.
    clock.time = 20;
    const down = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 5,
      pointerType: 'pen',
      clientX: 5,
      clientY: 5,
      buttons: 1,
    });
    Object.defineProperty(down, 'timeStamp', {value: 20});
    other.dispatchEvent(down);
    clock.runDue(519);
    expect(began).toEqual([]);
    clock.runDue(521);
    // 500 ms after the pen landed, not after the notch's release time.
    expect(began).toHaveLength(1);
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
