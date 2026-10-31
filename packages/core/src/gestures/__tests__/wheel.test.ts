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
    /** The legacy `wheelDeltaX`/`wheelDeltaY` Chromium and WebKit send. */
    legacy?: {x: number; y: number};
    /** A trackpad's wheel: its legacy delta three times its delta. */
    trackpad?: boolean;
    /** Shift held, as Shift+wheel sends. */
    shift?: boolean;
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
    shiftKey: init.shift ?? false,
  });
  Object.defineProperty(event, 'timeStamp', {value: init.time});
  const legacy =
    init.legacy ??
    (init.trackpad === true
      ? {x: -3 * (init.dx ?? 0), y: -3 * (init.dy ?? 0)}
      : null);
  if (legacy != null) {
    Object.defineProperty(event, 'wheelDeltaX', {value: legacy.x});
    Object.defineProperty(event, 'wheelDeltaY', {value: legacy.y});
  }
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
    expect(
      wheel(item, {trackpad: true, dx: -20, time: 0}).defaultPrevented,
    ).toBe(false);
    expect(states).toEqual([]);
    expect(
      wheel(item, {trackpad: true, dx: 20, time: 200}).defaultPrevented,
    ).toBe(true);
    expect(
      wheel(item, {trackpad: true, dx: 20, time: 216}).defaultPrevented,
    ).toBe(true);
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
    expect(
      wheel(item, {trackpad: true, dx: -20, time: 0}).defaultPrevented,
    ).toBe(true);
    expect(
      wheel(item, {trackpad: true, dx: -20, time: 16}).defaultPrevented,
    ).toBe(true);
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
    expect(
      wheel(content, {trackpad: true, dy: -20, time: 0}).defaultPrevented,
    ).toBe(false);
    expect(
      wheel(content, {trackpad: true, dy: -20, time: 16}).defaultPrevented,
    ).toBe(false);
    // At the top, a scroll down is the owner's too.
    scrollableY(owner, {scrollTop: 0, scrollHeight: 300, clientHeight: 200});
    expect(
      wheel(content, {trackpad: true, dy: 20, time: 200}).defaultPrevented,
    ).toBe(false);
    expect(states).toEqual([]);
    // At the top, pulling the content down: the pan's.
    expect(
      wheel(content, {trackpad: true, dy: -20, time: 400}).defaultPrevented,
    ).toBe(true);
    expect(
      wheel(content, {trackpad: true, dy: -20, time: 416}).defaultPrevented,
    ).toBe(true);
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
    expect(
      wheel(card, {trackpad: true, dx: 16, time: 0}).defaultPrevented,
    ).toBe(true);
    expect(
      wheel(card, {trackpad: true, dx: 16, time: 16}).defaultPrevented,
    ).toBe(true);
    expect(states).toEqual(['began', 'changed']);
    const afterTwo = pan.translation().x;
    // The card has moved out from under a still cursor: the next steps land
    // on the wrapper.
    for (const time of [32, 48, 64, 80]) {
      expect(
        wheel(wrapper, {trackpad: true, dx: 16, time}).defaultPrevented,
      ).toBe(true);
    }
    expect(pan.translation().x).toBe(afterTwo - 64);
    expect(states.at(-1)).toBe('changed');
    expect(
      (added.mock.calls as unknown[][]).filter(call => call[0] === 'wheel'),
    ).toHaveLength(1);
    const removed = vi.spyOn(document, 'removeEventListener');
    // A followed trackpad swipe ends 220 ms after its last wheel.
    clock.runDue(80 + 220);
    expect(states.slice(-2)).toEqual(['ended', 'possible']);
    expect(
      (removed.mock.calls as unknown[][]).filter(call => call[0] === 'wheel'),
    ).toHaveLength(1);
    // Over: a wheel on the wrapper is the page's again.
    expect(
      wheel(wrapper, {trackpad: true, dx: 16, time: 400}).defaultPrevented,
    ).toBe(false);
  });

  it("ends a wheel gesture whose pan is detached mid-gesture at once, and takes the document's wheel listener with it (FR24)", () => {
    const {card} = mount('<div id="card"></div>');
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      allowedScrollTypes: ['continuous'],
    });
    const detach = host.attach(card, pan);
    wheel(card, {trackpad: true, dx: 16, time: 0});
    wheel(card, {trackpad: true, dx: 16, time: 16});
    expect(pan.state).toBe('changed');
    const removed = vi.spyOn(document, 'removeEventListener');
    detach();
    expect(
      (removed.mock.calls as unknown[][]).filter(call => call[0] === 'wheel'),
    ).toHaveLength(1);
    expect(
      wheel(document.body, {trackpad: true, dx: 16, time: 32}).defaultPrevented,
    ).toBe(false);
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

  it("takes no scroll on a pan by default: a pan follows a trackpad's scroll only where its owner allows it, so its element gets no wheel listener (spec:AST-094 FR43, DEC-24)", () => {
    const {box} = mount('<div id="box"></div>');
    const added = vi.spyOn(box, 'addEventListener');
    const pan = new PanGestureRecognizer({direction: 'horizontal'});
    const states = statesOf(pan);
    detachers.push(host.attach(box, pan));
    expect(pan.allowedScrollTypes.size).toBe(0);
    expect(
      (added.mock.calls as unknown[][]).filter(call => call[0] === 'wheel'),
    ).toEqual([]);
    expect(wheel(box, {trackpad: true, dx: 30, time: 0}).defaultPrevented).toBe(
      false,
    );
    expect(states).toEqual([]);
  });

  it("never takes a mouse wheel's notches on a pan, even one a caller passes 'discrete': they scroll what is under the pointer (spec:AST-094 FR43, DEC-24)", () => {
    const {box} = mount('<div id="box"></div>');
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      // @ts-expect-error a pan takes only a trackpad's scroll
      allowedScrollTypes: ['continuous', 'discrete'],
    });
    const states = statesOf(pan);
    detachers.push(host.attach(box, pan));
    // A notch in lines (Firefox's), a whole 100 px notch, and a 120 tick over
    // 40 px (Chromium's).
    expect(wheel(box, {dx: 1, mode: 1, time: 0}).defaultPrevented).toBe(false);
    clock.runDue(300);
    expect(wheel(box, {dx: 100, time: 400}).defaultPrevented).toBe(false);
    clock.runDue(700);
    expect(
      wheel(box, {dx: 40, legacy: {x: -120, y: 0}, time: 800}).defaultPrevented,
    ).toBe(false);
    expect(states).toEqual([]);
  });

  it('leaves a wheel every taker declined to the page from its first step, as with no gesture system: a pan whose shouldReceiveTouch refuses it prevents nothing (spec:AST-094 FR43, FR19)', () => {
    const {box} = mount('<div id="box"></div>');
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      allowedScrollTypes: ['continuous'],
      // A Toast declines a wheel a scroller under it can still take.
      shouldReceiveTouch: () => false,
    });
    const states = statesOf(pan);
    detachers.push(host.attach(box, pan));
    const prevented = [0, 16, 32, 48, 64, 80].map(
      time => wheel(box, {trackpad: true, dx: 16, time}).defaultPrevented,
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
      edges: ['leading'],
      // @ts-expect-error the screen-edge pan takes no allowedScrollTypes
      allowedScrollTypes: ['continuous', 'discrete'],
    });
    expect(edge.allowedScrollTypes.size).toBe(0);
    detachers.push(host.attach(box, edge));
    expect(added.mock.calls.map(call => call[0])).not.toContain('wheel');
    expect(wheel(box, {dx: 30, time: 0}).defaultPrevented).toBe(false);
  });

  it('takes a trackpad scroll along its axis on a pan that allows continuous scrolling: it begins past 10 px, follows the content, and ends 220 ms after the last wheel, a slow swipe pausing between its wheels', () => {
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
      wheel(box, {trackpad: true, dx: 6.5, dy: 0.5, time}),
    );
    expect(events.every(event => event.defaultPrevented)).toBe(true);
    expect(states[0]).toBe('began');
    // The content moves the way the fingers do: a scroll right drags it left.
    expect(pan.translation().x).toBeLessThan(0);
    expect(states).not.toContain('ended');
    clock.runDue(48 + 219);
    expect(states).not.toContain('ended');
    clock.runDue(48 + 220);
    expect(states).toContain('ended');
  });

  it("releases a trackpad's scroll with the fingers' speed where they lift into momentum, and still where they stop (spec:AST-094 FR43, DEC-24)", () => {
    const {smooth, stopped} = mount(
      '<div id="smooth"></div><div id="stopped"></div>',
    );
    const released: Record<string, {velocity: number; scroll: number}> = {};
    for (const [key, element] of [
      ['smooth', smooth],
      ['stopped', stopped],
    ] as const) {
      const pan = new PanGestureRecognizer({
        direction: 'vertical',
        allowedScrollTypes: ['continuous'],
      });
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
    // A trackpad's fling: steady deltas, then shrinking ones as the fingers
    // lift into momentum. It releases at the lift with the fingers' speed.
    let time = 500;
    for (const dy of [8, 8, 8, 8, 7.6, 7.2, 6.8, 6.4, 6, 5.6]) {
      wheel(smooth, {trackpad: true, dy, time});
      time += 16;
    }
    clock.runDue(time + 200);
    expect(Math.abs(released.smooth.velocity)).toBeGreaterThan(0);
    expect(Math.abs(released.smooth.scroll)).toBeGreaterThan(0);
    // Fingers that stop: the scroll ends 180 ms after its last wheel, still.
    for (const at of [1500, 1516, 1532, 1548]) {
      wheel(stopped, {trackpad: true, dy: 8, time: at});
    }
    clock.runDue(1548 + 180);
    expect(Math.abs(released.stopped.velocity)).toBe(0);
    expect(Math.abs(released.stopped.scroll)).toBe(0);
  });

  it("releases a trackpad scroll whose fingers stop still whatever the host's clock reads: the release is stamped on the wheels' own times", () => {
    // The host schedules a gesture's end on its clock, while the arena reads
    // the wheels' own timestamps, which need not share the clock's base: a
    // page whose clock a test fakes, as a sheet's tests do.
    const {pad} = mount('<div id="pad"></div>');
    const released: number[] = [];
    const pan = new PanGestureRecognizer({
      direction: 'vertical',
      allowedScrollTypes: ['continuous'],
    });
    pan.addTransitionListener((current, _from, to) => {
      if (to === 'ended') {
        released.push(current.velocity().y);
      }
    });
    detachers.push(host.attach(pad, pan));
    clock.time = 0;
    for (const time of [1_000_000, 1_000_016, 1_000_032, 1_000_048]) {
      const event = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: 20,
        clientY: 20,
        deltaY: 8,
      });
      Object.defineProperty(event, 'timeStamp', {value: time});
      // A trackpad's signature: a legacy delta three times the delta.
      Object.defineProperty(event, 'wheelDeltaX', {value: 0});
      Object.defineProperty(event, 'wheelDeltaY', {value: -24});
      pad.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    clock.runDue(200);
    expect(released.map(Math.abs)).toEqual([0]);
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
      wheel(box, {trackpad: true, dx: 8, time});
    }
    // The timer that would end it has not run: the next wheel, 250 ms later
    // (past a swipe's 220 ms), ends it and begins another.
    for (const time of [282, 298, 314]) {
      wheel(box, {trackpad: true, dx: 8, time});
    }
    expect(states.filter(state => state === 'began')).toHaveLength(2);
    expect(states).toContain('ended');
  });

  it('leaves a wheel across its axis to the page', () => {
    const {box} = mount('<div id="box"></div>');
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      allowedScrollTypes: ['continuous'],
    });
    const states = statesOf(pan);
    detachers.push(host.attach(box, pan));
    const events = [0, 16, 32].map(time =>
      wheel(box, {trackpad: true, dy: 12, time}),
    );
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
      wheel(document.getElementById('row') as HTMLElement, {
        trackpad: true,
        dx: 8,
        time,
      }),
    );
    // Decided once, at the gesture's first wheel: the list scrolls.
    Object.defineProperty(list, 'scrollLeft', {configurable: true, value: 400});
    native.push(
      wheel(document.getElementById('row') as HTMLElement, {
        trackpad: true,
        dx: 8,
        time: 48,
      }),
    );
    expect(native.some(event => event.defaultPrevented)).toBe(false);
    expect(states).toEqual([]);
    clock.runDue(48 + 100);
    const taken = [500, 516, 532].map(time =>
      wheel(document.getElementById('row') as HTMLElement, {
        trackpad: true,
        dx: 8,
        time,
      }),
    );
    expect(taken.every(event => event.defaultPrevented)).toBe(true);
    expect(states[0]).toBe('began');
  });

  it("tells a mouse wheel's notches from a trackpad: a pan leaves lines and whole notches to the page and takes a trackpad's scroll (spec:AST-094 FR43, DEC-24)", () => {
    const {smooth} = mount('<div id="smooth"></div>');
    const pan = new PanGestureRecognizer({
      direction: 'vertical',
      allowedScrollTypes: ['continuous'],
    });
    const states = statesOf(pan);
    detachers.push(host.attach(smooth, pan));
    // Lines (Firefox's mouse wheel), and a whole notch in pixels (Chromium's).
    expect(wheel(smooth, {dy: 3, mode: 1, time: 0}).defaultPrevented).toBe(
      false,
    );
    clock.runDue(200);
    expect(wheel(smooth, {dy: 100, time: 300}).defaultPrevented).toBe(false);
    clock.runDue(500);
    expect(states).toEqual([]);
    expect(
      wheel(smooth, {trackpad: true, dy: 12, time: 600}).defaultPrevented,
    ).toBe(true);
    expect(states[0]).toBe('began');
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
      wheel(box, {trackpad: true, dx: 8, time});
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
      allowedScrollTypes: ['continuous'],
      claimsTouches: false,
    });
    const states = statesOf(watcher);
    detachers.push(host.attach(box, watcher));
    expect(
      (added.mock.calls as unknown[][]).filter(call => call[0] === 'wheel'),
    ).toEqual([]);
    expect(wheel(box, {trackpad: true, dx: 30, time: 0}).defaultPrevented).toBe(
      false,
    );
    expect(states).toEqual([]);
  });

  it('leaves a first wheel already prevented, or one that cannot be cancelled, to the page for its whole gesture', () => {
    const {box, inner} = mount('<div id="box"><div id="inner"></div></div>');
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      allowedScrollTypes: ['continuous'],
    });
    const states = statesOf(pan);
    detachers.push(host.attach(box, pan));
    // An app's own handler below the pan prevented the first wheel.
    inner.addEventListener('wheel', event => event.preventDefault(), {
      once: true,
    });
    wheel(inner, {trackpad: true, dx: 30, time: 0});
    expect(
      wheel(inner, {trackpad: true, dx: 30, time: 16}).defaultPrevented,
    ).toBe(false);
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
    Object.defineProperty(uncancelable, 'wheelDeltaX', {value: -90});
    Object.defineProperty(uncancelable, 'wheelDeltaY', {value: 0});
    clock.time = 500;
    inner.dispatchEvent(uncancelable);
    expect(
      wheel(inner, {trackpad: true, dx: 30, time: 516}).defaultPrevented,
    ).toBe(false);
    expect(states).toEqual([]);
  });

  it("stamps a trackpad gesture's release no later than the press that ends it: a long press right after keeps its own clock (spec:AST-094 FR16)", () => {
    const {box, other} = mount('<div id="box"></div><div id="other"></div>');
    detachers.push(
      host.attach(
        box,
        new PanGestureRecognizer({
          direction: 'vertical',
          allowedScrollTypes: ['continuous'],
        }),
      ),
    );
    const press = new LongPressGestureRecognizer({name: 'press'});
    const began: number[] = [];
    press.addListener(recognizer => {
      if (recognizer.state === 'began') {
        began.push(clock.time);
      }
    });
    detachers.push(host.attach(other, press));
    // A trackpad's scroll past the pan's 10 px start.
    expect(wheel(box, {trackpad: true, dy: 12, time: 0}).defaultPrevented).toBe(
      true,
    );
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
    // 500 ms after the pen landed, not after the scroll's release time.
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

describe("a mouse's wheel and a trackpad's lift (spec:AST-094 FR43)", () => {
  /** A pan that takes only a trackpad's scroll, horizontally. */
  function trackpadPan(box: HTMLElement): PanGestureRecognizer {
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      allowedPointerTypes: [],
      allowedScrollTypes: ['continuous'],
    });
    detachers.push(host.attach(box, pan));
    return pan;
  }

  for (const [name, init] of [
    [
      'deltas a hair off whole pixels, as a mouse wheel on Windows sends',
      {dx: 100.0000015},
    ],
    [
      'a legacy wheelDelta that is not three times the delta',
      {dx: 10, legacy: {x: -120, y: 0}},
    ],
    [
      'a 120 legacy tick over a 40 px delta, a notch',
      {dx: 40, legacy: {x: -120, y: 0}},
    ],
  ] as const) {
    it(`counts ${name} as a mouse's wheel: a pan that takes only a trackpad's scroll leaves it to the page`, () => {
      const {box} = mount('<div id="box"></div>');
      const pan = trackpadPan(box);
      const states = statesOf(pan);
      for (let step = 0; step < 3; step++) {
        const event = wheel(box, {...init, time: step * 16});
        expect(event.defaultPrevented).toBe(false);
      }
      expect(states).toEqual([]);
    });
  }

  it("counts a pixel scroll that carries no legacy wheelDelta, as Firefox sends, as a mouse's wheel: a pan that takes only a trackpad's scroll leaves it to the page", () => {
    const {box} = mount('<div id="box"></div>');
    const pan = trackpadPan(box);
    const states = statesOf(pan);
    for (let step = 0; step < 3; step++) {
      const event = wheel(box, {dx: 7, time: step * 16});
      expect(event.defaultPrevented).toBe(false);
    }
    expect(states).toEqual([]);
  });

  it("counts a scroll with Shift held, as Shift+wheel sends, as a mouse's wheel even with a trackpad's deltas: a pan that takes only a trackpad's scroll leaves it to the page (spec:AST-094 FR43)", () => {
    const {box} = mount('<div id="box"></div>');
    const pan = trackpadPan(box);
    const states = statesOf(pan);
    for (let step = 0; step < 3; step++) {
      const event = wheel(box, {
        trackpad: true,
        shift: true,
        dx: 7,
        time: step * 16,
      });
      expect(event.defaultPrevented).toBe(false);
    }
    expect(states).toEqual([]);
  });

  it("takes a trackpad's precise deltas, whose legacy wheelDelta is three times each", () => {
    const {box} = mount('<div id="box"></div>');
    const pan = trackpadPan(box);
    const states = statesOf(pan);
    for (let step = 0; step < 3; step++) {
      wheel(box, {dx: 7, legacy: {x: -21, y: 0}, time: step * 16});
    }
    expect(states[0]).toBe('began');
  });
});

describe("a trackpad scroll through the splitter's undecided stretch (spec:AST-094 FR43)", () => {
  /** A horizontal pan that takes only a trackpad's scroll, and what it did. */
  function followed() {
    const {box} = mount('<div id="box"></div>');
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      allowedPointerTypes: [],
      allowedScrollTypes: ['continuous'],
    });
    const seen: {state: string; x: number; velocity: number}[] = [];
    pan.addTransitionListener((recognizer, _from, to) => {
      seen.push({
        state: to,
        x: recognizer.translation().x,
        velocity: recognizer.velocity().x,
      });
    });
    detachers.push(host.attach(box, pan));
    return {box, seen};
  }

  /** Each wheel 16 ms apart from 0; returns the time after the last. */
  function stream(box: HTMLElement, deltas: number[]): number {
    let time = 0;
    for (const dx of deltas) {
      wheel(box, {trackpad: true, dx, time});
      time += 16;
    }
    return time;
  }

  it("keeps a trackpad pan moving at the fingers' speed while the splitter is undecided, and lets go at the lift still moving at that speed: no stall", () => {
    const {box, seen} = followed();
    // Four steady deltas, then four shrinking ones (the lift is read at the
    // fourth), then momentum.
    const end = stream(box, [10, 10, 10, 10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6]);
    clock.runDue(end + 500);
    const changed = seen.filter(entry => entry.state === 'changed');
    // The fingers' travel at their last move is -30 (40 px past the 10 px
    // hysteresis); through the shrinking deltas the pan moves on 10 px a
    // wheel at their speed.
    expect(changed.map(entry => entry.x).slice(-4)).toEqual([
      -40, -50, -60, -70,
    ]);
    const ended = seen.filter(entry => entry.state === 'ended');
    expect(ended).toHaveLength(1);
    expect(ended[0].x).toBeCloseTo(-70, 6);
    // Released at the fingers' speed, 10 px a 16 ms wheel.
    expect(ended[0].velocity).toBeCloseTo(-625, -1);
    // The momentum after the lift moves nothing.
    expect(
      seen.slice(seen.indexOf(ended[0]) + 1).map(entry => entry.state),
    ).toEqual(['possible']);
  });

  it('absorbs what the undecided stretch showed when the fingers carry on: never a step back, and no extra travel', () => {
    const {box, seen} = followed();
    const deltas = [10, 10, 10, 10, 9.5, 9, 10, 10, 10, 10, 10, 10];
    const end = stream(box, deltas);
    clock.runDue(end + 500);
    const moves = seen.filter(
      entry => entry.state === 'changed' || entry.state === 'ended',
    );
    for (const [i, entry] of moves.entries()) {
      if (i > 0) {
        expect(entry.x).toBeLessThanOrEqual(moves[i - 1].x);
      }
    }
    // The fingers' whole travel, past the 10 px hysteresis.
    const travel = deltas.reduce((sum, delta) => sum + delta, 0) - 10;
    expect(moves.at(-1)?.x).toBeCloseTo(-travel, 6);
  });

  it("never moves the pan past what the fingers' last speed projects through a long undecided stretch", () => {
    const {box, seen} = followed();
    // Deltas that shrink too slowly to read a lift for a while.
    const shrinking = [9.9, 9.8, 9.7, 9.6, 9.5, 9.4];
    stream(box, [10, 10, 10, 10, ...shrinking]);
    const changed = seen.filter(entry => entry.state === 'changed');
    expect(changed.map(entry => entry.x).slice(-shrinking.length)).toEqual(
      shrinking.map((_, i) => -30 - 10 * (i + 1)),
    );
  });
});

describe("the splitter's gestures on timed trackpad streams (spec:AST-094 FR43, DEC-24)", () => {
  /** A pan that takes a trackpad's scroll, and how many gestures it began. */
  function counted(direction: 'horizontal' | 'vertical') {
    const {box} = mount('<div id="box"></div>');
    const pan = new PanGestureRecognizer({
      direction,
      allowedPointerTypes: [],
      allowedScrollTypes: ['continuous'],
    });
    const states = statesOf(pan);
    detachers.push(host.attach(box, pan));
    return {box, began: () => states.filter(state => state === 'began').length};
  }

  /** Fingers, then a shrinking run whose fourth delta reads the lift. */
  const SWIPE = [12, 12, 12, 12, 11, 10, 9, 8];

  it("counts ten swipes that each start in the last one's momentum as ten gestures", () => {
    const {box, began} = counted('horizontal');
    let time = 0;
    for (let swipe = 0; swipe < 10; swipe++) {
      // The next swipe's first delta rises against the decay.
      for (const dx of [...SWIPE, 7, 6, 5]) {
        clock.runDue(time);
        wheel(box, {trackpad: true, dx, time});
        time += 16;
      }
    }
    clock.runDue(time + 500);
    expect(began()).toBe(10);
  });

  it('counts ten swipes whose momentum runs out as ten gestures', () => {
    const {box, began} = counted('horizontal');
    let time = 0;
    for (let swipe = 0; swipe < 10; swipe++) {
      for (const dx of [...SWIPE, 7, 6, 5, 4, 3, 2, 1]) {
        clock.runDue(time);
        wheel(box, {trackpad: true, dx, time});
        time += 16;
      }
      time += 400;
    }
    clock.runDue(time + 500);
    expect(began()).toBe(10);
  });

  it('counts a slow drag with 150 ms pauses as one gesture', () => {
    const {box, began} = counted('vertical');
    let time = 0;
    for (let stretch = 0; stretch < 6; stretch++) {
      for (let step = 0; step < 5; step++) {
        clock.runDue(time);
        wheel(box, {trackpad: true, dy: 4, time});
        time += 16;
      }
      // A 150 ms pause from the stretch's last wheel to the next one's first.
      time += 150 - 16;
    }
    clock.runDue(time + 500);
    expect(began()).toBe(1);
  });
});
