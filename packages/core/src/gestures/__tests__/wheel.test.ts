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
import {createNativeScrollProbe} from '../nativeScroll';
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
  it.each([
    [
      'a 50° swipe is the pan’s when its axisRatio is 0.5, as a finger’s is',
      0.5,
      6.4,
      7.7,
      true,
    ],
    [
      'a 35° swipe is the page’s when its axisRatio of 2 leaves it undecided',
      2,
      8.2,
      5.7,
      false,
    ],
  ] as const)(
    'reads a trackpad’s direction by the pan’s own rule: %s',
    (_name, axisRatio, dx, dy, takes) => {
      const {box} = mount('<div id="box"></div>');
      const pan = new PanGestureRecognizer({
        direction: 'horizontal',
        axisRatio,
        allowedScrollTypes: ['continuous'],
      });
      const states = statesOf(pan);
      detachers.push(host.attach(box, pan));
      expect(
        wheel(box, {trackpad: true, dx, dy, time: 0}).defaultPrevented,
      ).toBe(takes);
      for (const time of [16, 32, 48]) {
        wheel(box, {trackpad: true, dx, dy, time});
      }
      expect(states.includes('began')).toBe(takes);
    },
  );

  it.each([
    ['a blur', 'blur', false],
    ['a hidden page', 'hidden', false],
    ['a blur, under a coarse primary pointer', 'blur', true],
  ] as const)(
    'cancels a trackpad pan mid-swipe at %s: it reads cancelled, never ended, the rest of that stream is the page’s, and the next stream is decided afresh',
    (_name, how, isCoarse) => {
      const {box, outside} = mount(
        '<div id="box"></div><div id="outside"></div>',
      );
      const subject = isCoarse
        ? new GestureHost(document, {clock, isPrimaryPointerCoarse: () => true})
        : host;
      const pan = new PanGestureRecognizer({
        direction: 'horizontal',
        allowedScrollTypes: ['continuous'],
      });
      const states = statesOf(pan);
      detachers.push(subject.attach(box, pan));
      for (const time of [0, 16, 32]) {
        clock.runDue(time);
        expect(
          wheel(box, {trackpad: true, dx: 10, time}).defaultPrevented,
        ).toBe(true);
      }
      expect(states.at(-1)).toBe('changed');
      clock.runDue(40);
      if (how === 'blur') {
        window.dispatchEvent(new Event('blur'));
      } else {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => 'hidden',
        });
        detachers.push(() => {
          delete (document as {visibilityState?: unknown}).visibilityState;
        });
        document.dispatchEvent(new Event('visibilitychange'));
      }
      expect(states.slice(-2)).toEqual(['cancelled', 'possible']);
      // The rest of the stream is the page's: the fingers' wheels, then the
      // momentum after their lift.
      const rest = [10, 10, 10, 10, 12, 11.4, 10.8, 10.3, 9.8, 9.3, 8.8, 8.4];
      rest.forEach((dx, i) => {
        expect(
          wheel(box, {trackpad: true, dx, time: 48 + i * 16}).defaultPrevented,
        ).toBe(false);
      });
      expect(states.filter(state => state === 'began')).toHaveLength(1);
      expect(states).not.toContain('ended');
      // The latch is gone: a wheel outside the pan is the page's.
      expect(
        wheel(outside, {trackpad: true, dx: 8, time: 48 + 12 * 16})
          .defaultPrevented,
      ).toBe(false);
      // After the stream's pause, a new stream is decided afresh.
      clock.runDue(48 + 12 * 16 + 400);
      expect(
        wheel(box, {trackpad: true, dx: 10, time: 700}).defaultPrevented,
      ).toBe(true);
    },
  );

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
    // The scroller's stream ends 220 ms after its last wheel (FR43); the
    // next one is decided afresh.
    expect(
      wheel(item, {trackpad: true, dx: 20, time: 400}).defaultPrevented,
    ).toBe(true);
    expect(
      wheel(item, {trackpad: true, dx: 20, time: 416}).defaultPrevented,
    ).toBe(true);
    expect(states).toEqual(['began', 'changed']);
  });

  it("reads a right-to-left scroller by a finger's edge test: one WebKit leaves a pixel past its reported range is at its end, and a scroll on toward it is the pan’s", () => {
    const {strip, scroller, item} = mount(
      '<div id="strip"><div id="scroller" dir="rtl"><div id="item"></div></div></div>',
    );
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      allowedScrollTypes: ['continuous'],
    });
    const states = statesOf(pan);
    detachers.push(host.attach(strip, pan));
    // A fractional width rounds the reported overflow down to 99, while
    // WebKit scrolls to -100 (measured): past the reported end, so at it.
    scrollableX(scroller, {
      scrollLeft: -100,
      scrollWidth: 299,
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

  it("reads a scroller's ends as a finger's probe does: 0.75 px short of its end it can still scroll, so the stream is the scroller's; within half a pixel, the pan's (spec:AST-094 FR43, FR19)", () => {
    const {sheet, list, row} = mount(
      '<div id="sheet"><div id="list"><div id="row"></div></div></div>',
    );
    const pan = new PanGestureRecognizer({
      direction: 'vertical',
      allowedScrollTypes: ['continuous'],
    });
    const states = statesOf(pan);
    detachers.push(host.attach(sheet, pan));
    scrollableY(list, {
      scrollTop: 299.25,
      scrollHeight: 400,
      clientHeight: 100,
    });
    expect(
      createNativeScrollProbe(row, {readsTouchAction: false}).canScroll(0, -8),
    ).toBe(true);
    expect(wheel(row, {trackpad: true, dy: 8, time: 0}).defaultPrevented).toBe(
      false,
    );
    expect(states).toEqual([]);
    Object.defineProperty(list, 'scrollTop', {
      configurable: true,
      value: 299.6,
    });
    expect(
      createNativeScrollProbe(row, {readsTouchAction: false}).canScroll(0, -8),
    ).toBe(false);
    expect(
      wheel(row, {trackpad: true, dy: 8, time: 400}).defaultPrevented,
    ).toBe(true);
    expect(
      wheel(row, {trackpad: true, dy: 8, time: 416}).defaultPrevented,
    ).toBe(true);
    expect(states[0]).toBe('began');
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
    const added = vi.spyOn(window, 'addEventListener');
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
    // One capturing, non-passive wheel listener on the window: the shared
    // input stream's (architecture:react-component-runtime INV13).
    expect(
      (added.mock.calls as unknown[][]).filter(
        call =>
          call[0] === 'wheel' &&
          (call[2] as AddEventListenerOptions | undefined)?.capture === true &&
          (call[2] as AddEventListenerOptions | undefined)?.passive === false,
      ),
    ).toHaveLength(1);
    const removed = vi.spyOn(window, 'removeEventListener');
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

  it("hears a latched wheel through the shared input stream, so an app's window-capture stopPropagation of a wheel outside the moved element cannot hand it to the page (architecture:react-component-runtime INV13)", () => {
    const {card, outside} = mount(
      '<div id="card"></div><div id="outside"></div>',
    );
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      allowedScrollTypes: ['continuous'],
    });
    detachers.push(host.attach(card, pan));
    // The app stops every wheel that does not land on the card, on the
    // window's capture phase.
    const stop = (event: Event) => {
      if (event.target !== card) {
        event.stopPropagation();
      }
    };
    window.addEventListener('wheel', stop, {capture: true});
    try {
      wheel(card, {trackpad: true, dx: 16, time: 0});
      wheel(card, {trackpad: true, dx: 16, time: 16});
      expect(pan.state).toBe('changed');
      // The card moved from under the cursor: the next step lands outside.
      const step = wheel(outside, {trackpad: true, dx: 16, time: 32});
      expect(step.defaultPrevented).toBe(true);
      expect(pan.translation().x).toBeLessThan(-16);
    } finally {
      window.removeEventListener('wheel', stop, {capture: true});
    }
  });

  it("ends a wheel gesture whose pan is detached mid-gesture at once, and takes the window's wheel listener with it (FR24)", () => {
    const {card} = mount('<div id="card"></div>');
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      allowedScrollTypes: ['continuous'],
    });
    const detach = host.attach(card, pan);
    wheel(card, {trackpad: true, dx: 16, time: 0});
    wheel(card, {trackpad: true, dx: 16, time: 16});
    expect(pan.state).toBe('changed');
    const removed = vi.spyOn(window, 'removeEventListener');
    detach();
    // The latch leaves the shared stream, and its window listener goes with
    // its last subscriber.
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

  it('never lets momentum move a trackpad pan when a stalled page merges two momentum wheels into one, 1 ms after the one before (spec:AST-094 FR43)', () => {
    const {smooth} = mount('<div id="smooth"></div>');
    const pan = new PanGestureRecognizer({
      direction: 'vertical',
      allowedScrollTypes: ['continuous'],
    });
    const states: string[] = [];
    pan.addTransitionListener((_current, _from, to) => {
      if (to !== 'changed') {
        states.push(to);
      }
    });
    detachers.push(host.attach(smooth, pan));
    // A fling, then momentum that shrinks 7 % a frame. The page stalls and
    // receives two momentum steps as one wheel, 1 ms after the one before.
    const stream: [number, number][] = [];
    let time = 500;
    for (const dy of [8, 8, 8, 8, 7.6, 7.2, 6.8, 6.4, 6, 5.6]) {
      stream.push([dy, time]);
      time += 16;
    }
    let dy = 5.2;
    for (let i = 0; i < 6; i++) {
      stream.push([dy, time]);
      dy *= 0.93;
      time += 16;
    }
    const before = time - 16;
    stream.push([dy + dy * 0.93, before + 1]);
    dy *= 0.93 * 0.93;
    time = before + 17;
    for (let i = 0; i < 8; i++) {
      stream.push([dy, time]);
      dy *= 0.93;
      time += 16;
    }
    for (const [delta, at] of stream) {
      wheel(smooth, {trackpad: true, dy: delta, time: at});
    }
    clock.runDue(time + 400);
    // The pan let go at the lift; the merged wheel starts no gesture it takes.
    expect(states).toEqual(['began', 'ended', 'possible']);
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

  it("keeps a trackpad stream a scroller took for FR43's pause bound, not 100 ms: a slow drag that rests 130 ms at the list's end stays the list's, and the pan takes only the next stream (spec:AST-094 FR43)", () => {
    const {sheet, list, row} = mount(
      '<div id="sheet"><div id="list"><div id="row"></div></div></div>',
    );
    const pan = new PanGestureRecognizer({
      direction: 'vertical',
      allowedScrollTypes: ['continuous'],
    });
    const states = statesOf(pan);
    detachers.push(host.attach(sheet, pan));
    scrollableY(list, {scrollTop: 0, scrollHeight: 400, clientHeight: 100});
    const at = (time: number) => {
      clock.runDue(time);
      return wheel(row, {trackpad: true, dy: 8, time});
    };
    // Three wheels the list scrolls.
    expect([0, 16, 32].map(at).some(event => event.defaultPrevented)).toBe(
      false,
    );
    // The list reaches its end; the fingers rest 130 ms and carry on: still
    // the list's stream, so the pan never takes it midway.
    Object.defineProperty(list, 'scrollTop', {configurable: true, value: 300});
    expect([162, 178, 194].map(at).some(event => event.defaultPrevented)).toBe(
      false,
    );
    expect(states).toEqual([]);
    // Past the 180 ms bound the stream has ended; the next one is the pan's.
    expect([600, 616].map(at).every(event => event.defaultPrevented)).toBe(
      true,
    );
    expect(states[0]).toBe('began');
  });

  it('keeps a ctrl-wheel pinch out of the trackpad splitter: a pinch that slows and reverses, or rests 60 ms, stays one gesture, and ends 100 ms after its last wheel (spec:AST-094 FR43)', () => {
    const {photo} = mount('<div id="photo"></div>');
    const pinch = new PinchGestureRecognizer();
    const states = statesOf(pinch);
    detachers.push(host.attach(photo, pinch));
    const at = (time: number, dy: number) => {
      clock.runDue(time);
      return wheel(photo, {dy, ctrl: true, time});
    };
    const deltas = [-3, -4, -5, -4, -3, -2.5, -2, -1.5, 1, 2, 3, 4];
    for (const [i, dy] of deltas.entries()) {
      expect(at(i * 16, dy).defaultPrevented).toBe(true);
    }
    expect(states.filter(state => state === 'began')).toHaveLength(1);
    expect(states).not.toContain('ended');
    // One pinch throughout: still magnified after the reversal, where a
    // second pinch starting from 1 would read below it.
    expect(pinch.scale).toBeGreaterThan(1);
    clock.runDue(11 * 16 + 99);
    expect(states).not.toContain('ended');
    clock.runDue(11 * 16 + 100);
    expect(states.filter(state => state === 'ended')).toHaveLength(1);
    // Slowing, then resting 60 ms, is still one pinch.
    states.length = 0;
    for (const [i, dy] of [-5, -4, -3, -2.5, -2].entries()) {
      at(1000 + i * 16, dy);
    }
    at(1000 + 4 * 16 + 60, -2);
    expect(states.filter(state => state === 'began')).toHaveLength(1);
    expect(states).not.toContain('ended');
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

  it.each(['detached', 'disabled'] as const)(
    'stamps the release of a trackpad pan %s mid-swipe at its last wheel: a long press right after keeps its own clock (spec:AST-094 FR16)',
    how => {
      const {box, other} = mount('<div id="box"></div><div id="other"></div>');
      const pan = new PanGestureRecognizer({
        direction: 'vertical',
        allowedScrollTypes: ['continuous'],
      });
      const detach = host.attach(box, pan);
      const press = new LongPressGestureRecognizer({name: 'press'});
      const began: number[] = [];
      press.addListener(recognizer => {
        if (recognizer.state === 'began') {
          began.push(clock.time);
        }
      });
      detachers.push(host.attach(other, press));
      expect(
        wheel(box, {trackpad: true, dy: 12, time: 0}).defaultPrevented,
      ).toBe(true);
      // 10 ms later the pan leaves mid-swipe, and the fingers' next wheel
      // lands at 16 ms, the page's now.
      clock.runDue(10);
      if (how === 'detached') {
        detach();
      } else {
        pan.setEnabled(false);
        detachers.push(detach);
      }
      clock.runDue(16);
      expect(
        wheel(box, {trackpad: true, dy: 12, time: 16}).defaultPrevented,
      ).toBe(false);
      // A pen comes down at 20 ms.
      clock.runDue(20);
      const down = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 6,
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
      // 500 ms after the pen landed, not after the scroll's end window.
      expect(began).toHaveLength(1);
    },
  );

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
    const seen: {state: string; x: number; velocity: number; time: number}[] =
      [];
    pan.addTransitionListener((recognizer, _from, to) => {
      seen.push({
        state: to,
        x: recognizer.translation().x,
        velocity: recognizer.velocity().x,
        time: clock.time,
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

  it("ends a slow trackpad drag on the fingers' travel when a stalled page receives a merged step 1 ms after the one before: a bunched pair sets no speed", () => {
    const {box, seen} = followed();
    // The fingers move 2 px every 16 ms. The page stalls 50 ms and gets the
    // next two steps as one 4 px wheel, 1 ms after the one before. Then 2 px
    // every 16 ms again, and the fingers stop.
    const times: number[] = [0, 16, 32, 48, 64, 114, 115];
    const deltas: number[] = [2, 2, 2, 2, 2, 2, 4];
    for (let i = 0; i < 12; i++) {
      times.push(131 + 16 * i);
      deltas.push(2);
    }
    times.forEach((time, index) => {
      wheel(box, {trackpad: true, dx: deltas[index], time});
    });
    clock.runDue(times[times.length - 1] + 500);
    const ended = seen.filter(entry => entry.state === 'ended');
    expect(ended).toHaveLength(1);
    // 40 px of fingers' travel, 10 of it the pan's hysteresis: -30. The
    // fingers stopped, so the release is still.
    expect(ended[0].x).toBeCloseTo(-30, 0);
    expect(ended[0].velocity).toBe(0);
  });

  it("keeps the fingers' speed through a held tail when a stalled page merges two steps right after a held wheel", () => {
    const {box, seen} = followed();
    // A 4 px wheel every 16 ms. A shrinking wheel is held, and a stalled page
    // receives the next two steps as one 8 px wheel 1 ms after it.
    const times = [0, 16, 32, 48, 64, 80, 81, 97, 113, 129, 145, 161];
    const deltas = [4, 4, 4, 4, 4, 3.9, 8, 4.2, 4.1, 4, 3.9, 3.8];
    times.forEach((time, i) => {
      wheel(box, {trackpad: true, dx: deltas[i], time});
    });
    clock.runDue(times[times.length - 1] + 500);
    // After the merge, the pan never moves faster than the fingers' fastest
    // step, 4.2 px in 16 ms.
    const tail = seen.filter(
      entry => entry.state === 'changed' && entry.time > 81,
    );
    expect(tail.length).toBeGreaterThan(1);
    for (let i = 1; i < tail.length; i++) {
      const speed =
        Math.abs(tail[i].x - tail[i - 1].x) / (tail[i].time - tail[i - 1].time);
      expect(speed).toBeLessThanOrEqual(4.2 / 16 + 1e-9);
    }
  });

  /** Wheel times at `hz` from `from` ms, through `stamp`, moved by ±`jitter`. */
  function framesAt(
    hz: number,
    count: number,
    stamp: (time: number) => number,
    jitter: number,
    from = 0,
  ): number[] {
    return Array.from({length: count}, (_, i) =>
      stamp(from + (i * 1000) / hz + (i % 2 === 0 ? jitter : -jitter)),
    );
  }

  const asIs = (time: number) => time;
  const whole = (time: number) => Math.round(time);

  /** Trackpad streams: frame rates, whole-millisecond stamps and jitter. */
  const STREAMS = [
    ['60 Hz', 60, asIs, 0],
    ['120 Hz', 120, asIs, 0],
    ['240 Hz', 240, asIs, 0],
    ['240 Hz, ±0.3 ms jitter', 240, asIs, 0.3],
    ['240 Hz, whole ms', 240, whole, 0],
    ['300 Hz', 300, asIs, 0],
    ['300 Hz, whole ms', 300, whole, 0],
    ['360 Hz', 360, asIs, 0],
    ['360 Hz, whole ms', 360, whole, 0],
    ['480 Hz, whole ms', 480, whole, 0],
    ['500 Hz, whole ms', 500, whole, 0],
  ] as const;

  it.each([
    [
      'six 2 px wheels 80 ms apart',
      [0, 80, 160, 240, 320, 400],
      [416, 432, 448, 464, 480],
    ],
    [
      'wheels 64, 64, 64, 48 and 32 ms apart',
      [0, 64, 128, 192, 240, 272],
      [288, 304, 320, 336, 352],
    ],
  ] as const)(
    "keeps the fingers' speed when a slow drag turns into a flick: %s, then 10 px frames into the lift",
    (_name, slow, fast) => {
      const {box, seen} = followed();
      slow.forEach(time => {
        wheel(box, {trackpad: true, dx: 2, time});
      });
      [10, 9.5, 9, 8.5, 8].forEach((dx, i) => {
        wheel(box, {trackpad: true, dx, time: fast[i]});
      });
      clock.runDue(fast[fast.length - 1] + 500);
      // As on main, the first 10 px frame sets the fingers' speed, 10 px in 16
      // ms. The pan lets go at the lift still moving at it.
      const ended = seen.filter(entry => entry.state === 'ended');
      expect(ended).toHaveLength(1);
      expect(ended[0].x).toBeCloseTo(-52, 6);
      expect(ended[0].velocity).toBeCloseTo(-625, 6);
    },
  );

  it.each([
    ['grow back to their size', [4.2, 4.1, 4, 3.9, 3.8]],
    ['go on shrinking', [3.95, 3.9, 3.85, 3.8, 3.75]],
  ])(
    "ends a trackpad drag on the fingers' travel, still, when a stalled page merges two steps right after a shrinking one, and the steps after it %s",
    (_after, tail) => {
      const {box, seen} = followed();
      // The fingers move 4 px every 16 ms, and one step shrinks. The page
      // then receives the next two steps as one wheel 1 ms later. Five more
      // steps follow, and the fingers stop.
      const times = [0, 16, 32, 48, 64, 80, 81, 97, 113, 129, 145, 161];
      const deltas = [4, 4, 4, 4, 4, 3.9, 8, ...tail];
      deltas.forEach((dx, i) => {
        wheel(box, {trackpad: true, dx, time: times[i]});
      });
      clock.runDue(times[times.length - 1] + 500);
      const ended = seen.filter(entry => entry.state === 'ended');
      expect(ended).toHaveLength(1);
      // Nothing lifted, so the release is still. The pan reaches the
      // fingers' travel, less its 10 px of hysteresis, and stays less than
      // one of their steps ahead of it.
      const travel = deltas.reduce((sum, dx) => sum + dx, 0) - 10;
      expect(ended[0].velocity).toBe(0);
      expect(ended[0].x).toBeLessThanOrEqual(-travel);
      expect(ended[0].x).toBeGreaterThan(-travel - 4.2);
    },
  );

  /**
   * Trackpad flicks as WebKit delivered them to a page: 12 px finger steps,
   * then momentum. Each wheel is [time in whole ms, delta].
   */
  const RECORDED: Record<string, [number, number][]> = {
    run9: [
      [0, 12],
      [16, 12],
      [36, 12],
      [49, 12],
      [65, 12],
      [81, 12],
      [97, 12],
      [113, 12],
      [129, 12],
      [145, 12],
      [161, 12],
      [177, 12],
      [194, 11],
      [210, 10],
      [226, 9],
      [242, 8],
      [259, 7],
      [274, 6],
      [297, 5],
      [297, 4],
      [323, 3],
      [339, 2],
      [355, 1],
    ],
    run0: [
      [0, 12],
      [16, 12],
      [39, 12],
      [39, 12],
      [68, 12],
      [81, 12],
      [97, 12],
      [113, 12],
      [145, 12],
      [145, 12],
      [161, 12],
      [177, 12],
      [193, 11],
      [209, 10],
      [225, 9],
      [241, 8],
      [258, 7],
      [274, 6],
      [297, 5],
      [297, 4],
      [322, 3],
      [338, 2],
      [354, 1],
    ],
    run4: [
      [0, 12],
      [15, 12],
      [40, 12],
      [40, 12],
      [73, 12],
      [81, 12],
      [98, 12],
      [115, 12],
      [150, 12],
      [150, 24],
      [167, 12],
      [197, 11],
      [209, 10],
      [225, 9],
      [242, 8],
      [257, 7],
      [282, 6],
      [283, 5],
      [306, 4],
      [322, 3],
      [338, 2],
      [354, 1],
    ],
    run6: [
      [0, 12],
      [16, 12],
      [43, 12],
      [43, 12],
      [76, 12],
      [83, 12],
      [105, 12],
      [105, 12],
      [133, 12],
      [133, 12],
      [162, 12],
      [177, 12],
      [193, 11],
      [209, 10],
      [225, 9],
      [241, 8],
      [258, 7],
      [299, 6],
      [299, 9],
      [327, 3],
      [327, 2],
      [354, 1],
    ],
    run18: [
      [0, 12],
      [15, 12],
      [41, 12],
      [42, 12],
      [75, 12],
      [83, 12],
      [101, 12],
      [113, 12],
      [142, 12],
      [143, 12],
      [153, 12],
      [193, 12],
      [193, 11],
      [209, 10],
      [225, 9],
      [241, 8],
      [258, 7],
      [273, 6],
      [298, 5],
      [298, 4],
      [321, 3],
      [338, 2],
      [354, 1],
    ],
    run28: [
      [0, 12],
      [17, 12],
      [43, 12],
      [43, 12],
      [56, 12],
      [87, 12],
      [87, 12],
      [129, 12],
      [129, 12],
      [145, 12],
      [178, 12],
      [178, 12],
      [194, 11],
      [210, 10],
      [226, 9],
      [242, 8],
      [259, 7],
      [274, 6],
      [302, 5],
      [302, 4],
      [322, 3],
      [339, 2],
      [354, 1],
    ],
  };

  it.each([
    ['with no stall', 'run9', -12 / 16],
    ['with no stall, again', 'run0', -12 / 16],
    ['whose stalls end before its last finger step', 'run4', -12 / 17],
    ['whose momentum a stall merges', 'run6', -12 / 15],
    [
      'whose last finger step comes 40 ms late, with the first momentum step bunched 0 ms after it',
      'run18',
      -(12 + 11) / 40,
    ],
    [
      'whose last finger step but one comes 33 ms late, with the last bunched 0 ms after it',
      'run28',
      -(12 + 12) / 33,
    ],
  ] as const)(
    "releases a recorded WebKit flick at the fingers' speed: a flick %s",
    (_flick, run, speed) => {
      const {box, seen} = followed();
      let last = 0;
      for (const [time, dx] of RECORDED[run]) {
        wheel(box, {trackpad: true, dx, time});
        last = time;
      }
      clock.runDue(last + 500);
      const ended = seen.filter(entry => entry.state === 'ended');
      expect(ended).toHaveLength(1);
      // In px/s. A late step and the wheel bunched after it share the late
      // step's interval, which the stall took.
      expect(ended[0].velocity).toBeCloseTo(speed * 1000, 6);
    },
  );

  it("releases a flick at the fingers' speed when a stall delivers its held-back steps one by one, 1 ms apart, at 500 Hz", () => {
    const {box, seen} = followed();
    // 1.5 px every 2 ms, 750 px/s. A 50 ms stall holds 25 steps: the page
    // receives one late, then the other 24 one by one, 1 ms apart. Momentum
    // follows, and its fourth step reads as the lift.
    const times: number[] = [];
    const deltas: number[] = [];
    for (let i = 0; i < 20; i++) {
      times.push(i * 2);
      deltas.push(1.5);
    }
    const late = times[times.length - 1] + 50;
    for (let k = 0; k < 25; k++) {
      times.push(late + k);
      deltas.push(1.5);
    }
    for (const [k, dx] of [1.4, 1.3, 1.2, 1.1].entries()) {
      times.push(late + 24 + 2 * (k + 1));
      deltas.push(dx);
    }
    deltas.forEach((dx, i) => {
      wheel(box, {trackpad: true, dx, time: times[i]});
    });
    clock.runDue(times[times.length - 1] + 500);
    const ended = seen.filter(entry => entry.state === 'ended');
    expect(ended).toHaveLength(1);
    // The 25 steps' 37.5 px took the late step's 50 ms, not the delivery's.
    expect(ended[0].velocity).toBeCloseTo(-750, 6);
  });

  it.each([
    ['one 36 px wheel', [[137, 36]]],
    [
      'a 24 px and a 12 px wheel 1 ms apart',
      [
        [137, 24],
        [138, 12],
      ],
    ],
  ] as const)(
    'reads a bunch after a held wheel the same however the stall splits it: %s',
    (_bunch, bunch) => {
      const {box, seen} = followed();
      // 12 px every 16 ms. A step comes 40 ms late, and a held 11 px wheel 16
      // ms after it. The bunch comes 1 ms after the held wheel, so no stamped
      // interval holds its time. Momentum follows.
      const stream: (readonly [number, number])[] = [
        [0, 12],
        [16, 12],
        [32, 12],
        [48, 12],
        [64, 12],
        [80, 12],
        [120, 12],
        [136, 11],
        ...bunch,
        [154, 11],
        [170, 10],
        [186, 9],
        [202, 8],
      ];
      for (const [time, dx] of stream) {
        wheel(box, {trackpad: true, dx, time});
      }
      clock.runDue(202 + 500);
      const ended = seen.filter(entry => entry.state === 'ended');
      expect(ended).toHaveLength(1);
      // The late step's reading stands: 12 px in 40 ms.
      expect(ended[0].velocity).toBeCloseTo(-300, 6);
    },
  );

  it.each([
    ['one 21 px wheel', [[121, 21]]],
    [
      'an 11 px and a 10 px wheel 1 ms apart',
      [
        [121, 11],
        [122, 10],
      ],
    ],
  ] as const)(
    'reads a bunch that starts shrinking right after a late step the same however the stall splits it: %s',
    (_bunch, bunch) => {
      const {box, seen} = followed();
      // 12 px every 16 ms. A step comes 40 ms late, and the bunch the stall
      // held back arrives 1 ms after it. Momentum follows into the lift.
      const stream: (readonly [number, number])[] = [
        [0, 12],
        [16, 12],
        [32, 12],
        [48, 12],
        [64, 12],
        [80, 12],
        [120, 12],
        ...bunch,
        [137, 9],
        [153, 8],
        [169, 7],
        [185, 6],
      ];
      for (const [time, dx] of stream) {
        wheel(box, {trackpad: true, dx, time});
      }
      clock.runDue(185 + 500);
      const ended = seen.filter(entry => entry.state === 'ended');
      expect(ended).toHaveLength(1);
      // The whole bunch joins the late step's 40 ms, held to the 750 px/s
      // before it.
      expect(ended[0].velocity).toBeCloseTo(-750, 6);
    },
  );

  it("never moves or releases faster than the fingers when a stall's bunch of shrinking wheels arrives 1 ms apart", () => {
    const {box, seen} = followed();
    // 12 px every 16 ms. A step comes 60 ms late, then 11, 10 and 9 px wheels
    // 1 ms apart. The 8 px wheel on the next frame reads as the lift.
    const times = [0, 16, 32, 48, 64, 80, 140, 141, 142, 143, 159];
    const deltas = [12, 12, 12, 12, 12, 12, 12, 11, 10, 9, 8];
    deltas.forEach((dx, i) => {
      wheel(box, {trackpad: true, dx, time: times[i]});
    });
    clock.runDue(times[times.length - 1] + 500);
    const shown = seen.filter(
      entry => entry.state === 'changed' && entry.time >= 140,
    );
    for (let i = 1; i < shown.length; i++) {
      const speed =
        Math.abs(shown[i].x - shown[i - 1].x) /
        (shown[i].time - shown[i - 1].time);
      expect(speed).toBeLessThanOrEqual(12 / 16 + 1e-9);
    }
    const ended = seen.filter(entry => entry.state === 'ended');
    expect(ended).toHaveLength(1);
    // Each 1 ms of the bunch runs at the speed before its join. The release
    // blends the last two intervals: 0.2 × 700 plus 0.8 × 550 px/s.
    expect(ended[0].velocity).toBeCloseTo(-580, 6);
  });

  it('never reads the fingers faster than they last were when a bunched wheel carries more than its stall took', () => {
    const {box, seen} = followed();
    // 12 px every 16 ms. A step comes 20 ms late. Three more arrive as one
    // 36 px wheel 0 ms after it. That is more travel than 20 ms at the
    // fingers' speed covers. Momentum follows, and its fourth step reads as
    // the lift.
    const times = [0, 16, 32, 48, 64, 80, 100, 100, 116, 132, 148, 164];
    const deltas = [12, 12, 12, 12, 12, 12, 12, 36, 11, 10, 9, 8];
    deltas.forEach((dx, i) => {
      wheel(box, {trackpad: true, dx, time: times[i]});
    });
    clock.runDue(times[times.length - 1] + 500);
    const ended = seen.filter(entry => entry.state === 'ended');
    expect(ended).toHaveLength(1);
    // The joined reading, 48 px in 20 ms, holds at the 12 px in 16 ms before.
    expect(ended[0].velocity).toBeCloseTo(-750, 6);
  });

  it.each(STREAMS)(
    "keeps a trackpad pan moving at the fingers' speed through the undecided stretch at %s",
    (_name, hz, stamp, jitter) => {
      const {box, seen} = followed();
      const deltas = [10, 10, 10, 10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6];
      const times = framesAt(hz, deltas.length, stamp, jitter);
      deltas.forEach((dx, i) => {
        wheel(box, {trackpad: true, dx, time: times[i]});
      });
      clock.runDue(times[times.length - 1] + 500);
      // The fingers last move on the fourth wheel, to -30, at the speed of
      // their last pair. Through the shrinking wheels the pan goes on at it.
      const speed = -10 / (times[3] - times[2]);
      const shown = seen
        .filter(entry => entry.state === 'changed')
        .map(entry => entry.x)
        .slice(-4);
      expect(shown).toHaveLength(4);
      [4, 5, 6, 7].forEach((wheelIndex, k) => {
        expect(shown[k]).toBeCloseTo(
          -30 + speed * (times[wheelIndex] - times[3]),
          6,
        );
      });
    },
  );

  it.each(STREAMS)(
    "ends a slow trackpad drag on the fingers' travel when a stalled page merges two steps at %s",
    (_name, hz, stamp, jitter) => {
      const {box, seen} = followed();
      // Eight 2 px steps, then a 50 ms stall. The page receives one step,
      // then the next two as one 4 px wheel 1 ms later. Four more steps
      // follow, and the fingers stop.
      const before = framesAt(hz, 8, stamp, jitter);
      const resumed = before[before.length - 1] + 50;
      const tail = framesAt(hz, 5, stamp, jitter, resumed + 1).slice(1);
      const times = [...before, resumed, resumed + 1, ...tail];
      const deltas = [2, 2, 2, 2, 2, 2, 2, 2, 2, 4, 2, 2, 2, 2];
      deltas.forEach((dx, i) => {
        wheel(box, {trackpad: true, dx, time: times[i]});
      });
      clock.runDue(times[times.length - 1] + 500);
      const ended = seen.filter(entry => entry.state === 'ended');
      expect(ended).toHaveLength(1);
      // 30 px of fingers' travel, 10 of it the pan's hysteresis.
      expect(ended[0].x).toBeCloseTo(-20, 6);
      expect(ended[0].velocity).toBe(0);
    },
  );

  it.each([
    ['a blur', 'blur', false],
    ['a hidden page', 'hidden', false],
    ['a blur, under a coarse primary pointer', 'blur', true],
  ] as const)(
    'keeps a ctrl-wheel pinch through %s: the pinch keeps its stream, and the page never zooms',
    (_name, how, isCoarse) => {
      const {photo} = mount('<div id="photo"></div>');
      const subject = isCoarse
        ? new GestureHost(document, {clock, isPrimaryPointerCoarse: () => true})
        : host;
      const pinch = new PinchGestureRecognizer();
      const states = statesOf(pinch);
      detachers.push(subject.attach(photo, pinch));
      for (const time of [0, 16, 32]) {
        expect(wheel(photo, {dy: -10, ctrl: true, time}).defaultPrevented).toBe(
          true,
        );
      }
      expect(states[0]).toBe('began');
      clock.runDue(40);
      if (how === 'blur') {
        window.dispatchEvent(new Event('blur'));
      } else {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => 'hidden',
        });
        detachers.push(() => {
          delete (document as {visibilityState?: unknown}).visibilityState;
        });
        document.dispatchEvent(new Event('visibilitychange'));
      }
      expect(states).not.toContain('cancelled');
      const scale = pinch.scale;
      for (const time of [48, 64, 80]) {
        expect(wheel(photo, {dy: -10, ctrl: true, time}).defaultPrevented).toBe(
          true,
        );
      }
      expect(pinch.scale).toBeGreaterThan(scale);
      clock.runDue(80 + 100);
      expect(states).toContain('ended');
      expect(states).not.toContain('cancelled');
    },
  );

  it('cancels nothing when focus moves between elements mid-swipe: only the window’s own blur ends a trackpad pan', () => {
    const {box, field} = mount(
      '<div id="box"></div><input id="field" type="text" />',
    );
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      allowedScrollTypes: ['continuous'],
    });
    const states = statesOf(pan);
    detachers.push(host.attach(box, pan));
    for (const time of [0, 16, 32]) {
      wheel(box, {trackpad: true, dx: 10, time});
    }
    expect(states.at(-1)).toBe('changed');
    field.dispatchEvent(new FocusEvent('focus'));
    field.dispatchEvent(new FocusEvent('blur'));
    expect(states).not.toContain('cancelled');
    expect(
      wheel(box, {trackpad: true, dx: 10, time: 48}).defaultPrevented,
    ).toBe(true);
    expect(states.at(-1)).toBe('changed');
  });

  it('keeps the momentum of a pan its lift released latched through a blur: the blur cancels nothing, and the momentum still moves no surface (spec:AST-094 FR43)', () => {
    const {box, seen} = followed();
    const deltas = [10, 10, 10, 10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6];
    deltas.forEach((dx, i) => wheel(box, {trackpad: true, dx, time: i * 16}));
    expect(seen.some(entry => entry.state === 'ended')).toBe(true);
    window.dispatchEvent(new Event('blur'));
    expect(seen.map(entry => entry.state)).not.toContain('cancelled');
    expect(
      wheel(box, {trackpad: true, dx: 5.5, time: 12 * 16}).defaultPrevented,
    ).toBe(true);
  });

  it('keeps the momentum after the lift prevented, latched to the pan it released: momentum never moves a surface or continues a gesture (spec:AST-094 FR43)', () => {
    const {box, seen} = followed();
    // Four steady wheels, then sixteen shrinking ones 16 ms apart: the lift
    // is read at the fourth shrinking wheel (112 ms), and twelve momentum
    // wheels follow it.
    const deltas = [
      10, 10, 10, 10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5, 5, 4.5, 4, 3.5, 3,
      2.5, 2,
    ];
    const events = deltas.map((dx, i) =>
      wheel(box, {trackpad: true, dx, time: i * 16}),
    );
    const lift = seen.findIndex(entry => entry.state === 'ended');
    expect(lift).toBeGreaterThan(-1);
    // Every wheel was the pan's: none after the lift reached the page.
    expect(events.slice(8).map(event => event.defaultPrevented)).toEqual(
      Array.from({length: 12}, () => true),
    );
    expect(events.every(event => event.defaultPrevented)).toBe(true);
    // The momentum moved nothing and began nothing.
    expect(seen.slice(lift + 1).map(entry => entry.state)).toEqual([
      'possible',
    ]);
    // The fingers' next swipe, past the momentum's 50 ms pause, is a new
    // gesture the pan takes.
    const next = [0, 16, 32].map(t =>
      wheel(box, {trackpad: true, dx: 10, time: 20 * 16 + 60 + t}),
    );
    expect(next.every(event => event.defaultPrevented)).toBe(true);
    expect(seen.filter(entry => entry.state === 'began')).toHaveLength(2);
  });

  it("lets the momentum's latch go with the stream's end window: a wheel after it is decided afresh (spec:AST-094 FR43)", () => {
    const {box, seen} = followed();
    const deltas = [10, 10, 10, 10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6];
    for (const [i, dx] of deltas.entries()) {
      expect(
        wheel(box, {trackpad: true, dx, time: i * 16}).defaultPrevented,
      ).toBe(true);
    }
    expect(seen.some(entry => entry.state === 'ended')).toBe(true);
    const outside = document.createElement('div');
    document.body.append(outside);
    try {
      // Within the window the momentum is still the pan's.
      clock.runDue(11 * 16 + 219);
      expect(
        wheel(outside, {trackpad: true, dx: 5.5, time: 11 * 16 + 30})
          .defaultPrevented,
      ).toBe(true);
      // 220 ms after its last wheel the stream has ended: the next wheel
      // there is the page's.
      clock.runDue(11 * 16 + 30 + 220);
      expect(
        wheel(outside, {trackpad: true, dx: 5, time: 11 * 16 + 260})
          .defaultPrevented,
      ).toBe(false);
    } finally {
      outside.remove();
    }
  });

  it('lets the momentum’s latch go when the pan it released is detached: the next wheels are the page’s (spec:AST-094 FR43, FR24)', () => {
    const {box} = mount('<div id="box"></div>');
    const pan = new PanGestureRecognizer({
      direction: 'horizontal',
      allowedScrollTypes: ['continuous'],
    });
    const detach = host.attach(box, pan);
    const deltas = [10, 10, 10, 10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6];
    const events = deltas.map((dx, i) =>
      wheel(box, {trackpad: true, dx, time: i * 16}),
    );
    expect(events.every(event => event.defaultPrevented)).toBe(true);
    detach();
    const outside = document.createElement('div');
    document.body.append(outside);
    try {
      expect(
        wheel(outside, {trackpad: true, dx: 5.5, time: 12 * 16})
          .defaultPrevented,
      ).toBe(false);
    } finally {
      outside.remove();
    }
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
