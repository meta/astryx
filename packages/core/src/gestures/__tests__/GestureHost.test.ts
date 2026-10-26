// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file GestureHost.test.ts
 * @input A GestureHost on the jsdom document, real DOM listeners, and
 *   dispatched touch, pointer, click, contextmenu and scroll events with
 *   explicit timestamps
 * @output The DOM integration: hit-path collection (shadow DOM included),
 *   touch-action negotiation, cancelling touchmove only while claimed,
 *   click suppression and replay, browser takeover, the mouse path, hover,
 *   context menus, focus loss, and telling a finger's scroll (until the
 *   scroller's scrollend) from the program's
 * @position jsdom integration tests of packages/core/src/gestures
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {UIKIT_GESTURES} from '../../motion/uikit/gestures';
import {isFingerScroll, watchFingerScrolls} from '../fingerScroll';
import {GestureHost} from '../GestureHost';
import {HoverGestureRecognizer} from '../HoverGestureRecognizer';
import {LongPressGestureRecognizer} from '../LongPressGestureRecognizer';
import {PanGestureRecognizer} from '../PanGestureRecognizer';
import {PressTracker} from '../PressTracker';
import type {SelectionLock} from '../GestureRecognizer';
import {VelocityTracker} from '../VelocityTracker';
import {lockSelection} from '../selectionLock';
import {TapGestureRecognizer} from '../TapGestureRecognizer';
import {createNativeScrollProbe} from '../nativeScroll';
import {gestureHosts} from '../hostRegistry';
import {holdPageScroll, type PageScrollDecision} from '../pageHold';
import {ManualClock, RecordingConsumer} from './harness';
import {COARSE_POINTER_QUERY} from '../coarsePointer';
import {coarsePrimaryPointer, pointerQuery} from './pointerQuery';

interface Contact {
  id: number;
  x: number;
  y: number;
  target?: EventTarget;
}

function touch(
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  target: EventTarget,
  changed: Contact[],
  all: Contact[],
  time: number,
  cancelable = true,
): Event {
  const event = new Event(type, {bubbles: true, cancelable, composed: true});
  const toTouch = (contact: Contact) => ({
    identifier: contact.id,
    clientX: contact.x,
    clientY: contact.y,
    target: contact.target ?? target,
  });
  Object.defineProperty(event, 'changedTouches', {value: changed.map(toTouch)});
  Object.defineProperty(event, 'touches', {value: all.map(toTouch)});
  Object.defineProperty(event, 'timeStamp', {value: time});
  target.dispatchEvent(event);
  return event;
}

function pointer(
  type: string,
  target: EventTarget,
  init: {
    id?: number;
    pointerType: string;
    x: number;
    y: number;
    buttons?: number;
    time: number;
  },
): Event {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: init.id ?? 1,
    pointerType: init.pointerType,
    clientX: init.x,
    clientY: init.y,
    button: 0,
    buttons: init.buttons ?? 0,
  });
  Object.defineProperty(event, 'timeStamp', {value: init.time});
  target.dispatchEvent(event);
  return event;
}

let host: GestureHost;
let clock: ManualClock;
let detachers: (() => void)[];
/** A phone: the host attaches only where the primary pointer is coarse. */
let restorePointer: () => void;

/** jsdom computes no layout: give a scroller its metrics. */
function scrollable(
  element: HTMLElement,
  metrics: {scrollTop?: number; scrollHeight?: number; clientHeight?: number},
): void {
  for (const [key, value] of Object.entries(metrics)) {
    Object.defineProperty(element, key, {configurable: true, value});
  }
}

/**
 * jsdom drops `touch-action` from styles: elements under test carry it in
 * `data-touch-action`, and computed style reports it from there.
 */
function touchActionFromData(): () => void {
  const original = window.getComputedStyle.bind(window);
  const spy = vi
    .spyOn(window, 'getComputedStyle')
    .mockImplementation((element: Element, pseudo?: string | null) => {
      const style = original(element, pseudo);
      const touchAction = element.getAttribute('data-touch-action');
      if (touchAction == null) {
        return style;
      }
      return new Proxy(style, {
        get(target, key): string | number | object | null | undefined {
          if (key === 'touchAction') {
            return touchAction;
          }
          if (key === 'getPropertyValue') {
            return (name: string) =>
              name === 'touch-action'
                ? touchAction
                : target.getPropertyValue(name);
          }
          const value = Reflect.get(target, key) as
            string | number | object | null | undefined;
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    });
  return () => spy.mockRestore();
}

function mount(html: string): Record<string, HTMLElement> {
  document.body.innerHTML = html;
  const elements: Record<string, HTMLElement> = {};
  for (const element of document.querySelectorAll<HTMLElement>('[id]')) {
    elements[element.id] = element;
  }
  return elements;
}

beforeEach(() => {
  clock = new ManualClock();
  host = new GestureHost(document, {clock});
  detachers = [];
  restorePointer = coarsePrimaryPointer();
});

afterEach(() => {
  for (const detach of detachers) {
    detach();
  }
  document.body.innerHTML = '';
  restorePointer();
});

/** A press tracker whose hold acts, as a stepper's hold-repeat (FR41). */
class LockingConsumer extends RecordingConsumer {
  constructor(readonly selectionLock: SelectionLock = lockSelection) {
    super();
  }
}

describe('GestureHost', () => {
  it('sets touch-action on attach and restores it on detach; the long-press styles wait for a held press', () => {
    const {box} = mount('<div id="box" style="color: red"></div>');
    const set = vi.spyOn(box.style, 'setProperty');
    const remove = vi.spyOn(box.style, 'removeProperty');
    const detachPan = host.attach(
      box,
      new PanGestureRecognizer({direction: 'horizontal'}),
    );
    const detachPress = host.attach(box, new LongPressGestureRecognizer());
    expect(set).toHaveBeenCalledWith('touch-action', 'pan-y pinch-zoom');
    expect(set).not.toHaveBeenCalledWith('-webkit-touch-callout', 'none');
    detachPress();
    detachPan();
    expect(remove).toHaveBeenCalledWith('touch-action');
  });

  it('cancels touchmove only once a recognizer owns the touch, and swallows the click', () => {
    const {box, child} = mount('<div id="box"><span id="child">x</span></div>');
    const pan = new PanGestureRecognizer({name: 'pan'});
    const states: string[] = [];
    pan.addListener(r => states.push(r.state));
    detachers.push(host.attach(box, pan));
    const finger = {id: 7, x: 10, y: 10};
    touch('touchstart', child, [finger], [finger], 0);
    const early = touch(
      'touchmove',
      child,
      [{...finger, x: 15}],
      [{...finger, x: 15}],
      16,
    );
    expect(early.defaultPrevented).toBe(false);
    expect(pan.state).toBe('possible');
    const claimed = touch(
      'touchmove',
      child,
      [{...finger, x: 30}],
      [{...finger, x: 30}],
      32,
    );
    expect(claimed.defaultPrevented).toBe(true);
    expect(states).toEqual(['began']);
    const end = touch('touchend', child, [{...finger, x: 30}], [], 48);
    expect(end.defaultPrevented).toBe(true);
    expect(states).toEqual(['began', 'ended']);
  });

  it('leaves the touchend (and the click) alone when nothing claimed the touch', () => {
    const {box} = mount('<div id="box"></div>');
    const pan = new PanGestureRecognizer({name: 'pan'});
    detachers.push(host.attach(box, pan));
    const finger = {id: 1, x: 10, y: 10};
    touch('touchstart', box, [finger], [finger], 0);
    touch('touchmove', box, [{...finger, x: 13}], [{...finger, x: 13}], 16);
    const end = touch('touchend', box, [{...finger, x: 13}], [], 40);
    expect(end.defaultPrevented).toBe(false);
  });

  it('keeps a claimed one-finger drag when a second finger lands on it (AST-094 FR10)', () => {
    const {box} = mount('<div id="box"></div>');
    const pan = new PanGestureRecognizer({maximumNumberOfTouches: 1});
    detachers.push(host.attach(box, pan));
    const first = {id: 1, x: 10, y: 10};
    touch('touchstart', box, [first], [first], 0);
    const moved = {...first, x: 40};
    touch('touchmove', box, [moved], [moved], 16);
    expect(pan.state).toBe('began');
    const before = pan.translation().x;
    const second = {id: 2, x: 200, y: 200};
    touch('touchstart', box, [second], [moved, second], 20);
    // The first finger keeps driving it, and its moves stay the pan's.
    const next = {...first, x: 70};
    const drag = touch('touchmove', box, [next], [next, second], 32);
    expect(pan.state).toBe('changed');
    expect(pan.translation().x).toBe(before + 30);
    expect(drag.defaultPrevented).toBe(true);
  });

  it('leaves a second finger no recognizer owns to the page while the claimed one is held (spec:AST-094 FR19)', () => {
    const {box} = mount('<div id="box"></div>');
    const pan = new PanGestureRecognizer({maximumNumberOfTouches: 1});
    detachers.push(host.attach(box, pan));
    const first = {id: 1, x: 10, y: 10};
    touch('touchstart', box, [first], [first], 0);
    const moved = {...first, x: 40};
    touch('touchmove', box, [moved], [moved], 16);
    expect(pan.state).toBe('began');
    const before = pan.translation().x;
    const second = {id: 2, x: 200, y: 200};
    touch('touchstart', box, [second], [moved, second], 20);
    const pinchLike = touch(
      'touchmove',
      box,
      [{...second, x: 260}],
      [moved, {...second, x: 260}],
      32,
    );
    expect(pinchLike.defaultPrevented).toBe(false);
    expect(pan.state).toBe('began');
    expect(pan.numberOfTouches).toBe(1);
    // The claimed finger's own moves stay cancelled.
    const own = touch(
      'touchmove',
      box,
      [{...moved, x: 60}],
      [
        {...moved, x: 60},
        {...second, x: 260},
      ],
      48,
    );
    expect(own.defaultPrevented).toBe(true);
  });

  it('reads pointercancel on a finger as the browser taking it', () => {
    const {box} = mount('<div id="box"></div>');
    const pan = new PanGestureRecognizer({name: 'pan'});
    const view = new RecordingConsumer();
    const events: string[] = [];
    detachers.push(host.attach(box, pan), host.attachConsumer(box, view));
    pan.addTransitionListener((_r, _from, to) => events.push(to));
    const finger = {id: 3, x: 10, y: 10};
    touch('touchstart', box, [finger], [finger], 0);
    pointer('pointercancel', box, {
      id: 99,
      pointerType: 'touch',
      x: 10,
      y: 14,
      time: 20,
    });
    expect(events).toEqual(['failed', 'possible']);
    // The view's touch is cancelled, with no release.
    expect(view.events.map(event => event.split(':')[0])).toEqual([
      'began',
      'cancelled',
    ]);
  });

  it("pairs a finger's pointer with its touch: pointermoves inside the browser's touchmove slop count", () => {
    const {box} = mount('<div id="box"></div>');
    const pan = new PanGestureRecognizer({name: 'pan'});
    const states: string[] = [];
    pan.addListener(r => states.push(`${r.state}:${r.translation().x}`));
    detachers.push(host.attach(box, pan));
    // Chromium's order: pointerdown, then touchstart, at the same spot.
    pointer('pointerdown', box, {
      id: 21,
      pointerType: 'touch',
      x: 10,
      y: 10,
      buttons: 1,
      time: 0,
    });
    const finger = {id: 0, x: 10, y: 10};
    touch('touchstart', box, [finger], [finger], 0);
    // No touchmove yet (inside the slop), but the pointer moved 12 px.
    pointer('pointermove', box, {
      id: 21,
      pointerType: 'touch',
      x: 16,
      y: 10,
      buttons: 1,
      time: 16,
    });
    pointer('pointermove', box, {
      id: 21,
      pointerType: 'touch',
      x: 22,
      y: 10,
      buttons: 1,
      time: 32,
    });
    // Translation 2: the 10 px hysteresis is left out, as in UIKit.
    expect(states).toEqual(['began:2']);
    // The first touchmove (the same input as a pointermove) is cancelled
    // and not read twice.
    pointer('pointermove', box, {
      id: 21,
      pointerType: 'touch',
      x: 26,
      y: 10,
      buttons: 1,
      time: 48,
    });
    const first = touch(
      'touchmove',
      box,
      [{...finger, x: 26}],
      [{...finger, x: 26}],
      48,
    );
    expect(first.defaultPrevented).toBe(true);
    expect(states).toEqual(['began:2', 'changed:6']);
    // pointercancel names the finger exactly, whatever its coordinates say.
    pointer('pointercancel', box, {
      id: 21,
      pointerType: 'touch',
      x: 0,
      y: 0,
      time: 60,
    });
    expect(host.arena.getTouch(1)?.takenByBrowser).toBe(true);
  });

  it.each([
    ['WebKit, the touch copy 1 ms later', 1],
    ['Chromium, both copies at one time', 0],
  ])('samples a finger from its pointer events alone: %s', (_, offset) => {
    const {box} = mount('<div id="box"></div>');
    const pan = new PanGestureRecognizer({name: 'pan'});
    let released = Number.NaN;
    pan.addListener(r => {
      if (r.state === 'ended') {
        released = pan.velocity().x;
      }
    });
    detachers.push(host.attach(box, pan));
    pointer('pointerdown', box, {
      id: 21,
      pointerType: 'touch',
      x: 10,
      y: 10,
      buttons: 1,
      time: 0,
    });
    const finger = {id: 0, x: 10, y: 10};
    touch('touchstart', box, [finger], [finger], 0);
    let x = 10;
    for (let step = 1; step <= 10; step++) {
      x += 10;
      const time = step * 16;
      pointer('pointermove', box, {
        id: 21,
        pointerType: 'touch',
        x,
        y: 10,
        buttons: 1,
        time,
      });
      touch(
        'touchmove',
        box,
        [{...finger, x}],
        [{...finger, x}],
        time + offset,
      );
    }
    pointer('pointerup', box, {
      id: 21,
      pointerType: 'touch',
      x,
      y: 10,
      time: 168,
    });
    touch('touchend', box, [{...finger, x}], [], 168);
    // 10 px every 16 ms: 625 px/s, the steady drag's own speed.
    expect(released).toBeCloseTo(625, 6);
  });

  it('samples a finger from its touch events once the browser cancels its pointer', () => {
    const {box} = mount('<div id="box"></div>');
    // A watcher follows the touch the browser takes (AST-094 FR20, DEC-7).
    const pan = new PanGestureRecognizer({
      name: 'pan',
      claimsTouches: false,
      direction: 'vertical',
    });
    detachers.push(host.attach(box, pan));
    pointer('pointerdown', box, {
      id: 21,
      pointerType: 'touch',
      x: 10,
      y: 10,
      buttons: 1,
      time: 0,
    });
    const finger = {id: 0, x: 10, y: 10};
    touch('touchstart', box, [finger], [finger], 0);
    pointer('pointermove', box, {
      id: 21,
      pointerType: 'touch',
      x: 10,
      y: 14,
      buttons: 1,
      time: 16,
    });
    expect(host.arena.getTouch(1)?.y).toBe(14);
    // The browser takes the touch to scroll: the pointer channel ends, the
    // finger keeps moving, and only touch events report it now.
    pointer('pointercancel', box, {
      id: 21,
      pointerType: 'touch',
      x: 10,
      y: 14,
      time: 20,
    });
    touch('touchmove', box, [{...finger, y: 60}], [{...finger, y: 60}], 32);
    expect(host.arena.getTouch(1)?.y).toBe(60);
  });

  it('keeps every report of a 120 Hz finger', () => {
    const {box} = mount('<div id="box"></div>');
    const pan = new PanGestureRecognizer({name: 'pan'});
    let released = Number.NaN;
    pan.addListener(r => {
      if (r.state === 'ended') {
        released = pan.velocity().x;
      }
    });
    detachers.push(host.attach(box, pan));
    pointer('pointerdown', box, {
      id: 21,
      pointerType: 'touch',
      x: 10,
      y: 10,
      buttons: 1,
      time: 0,
    });
    const finger = {id: 0, x: 10, y: 10};
    touch('touchstart', box, [finger], [finger], 0);
    // An accelerating drag reported every 8 ms on both channels.
    const expected = new VelocityTracker();
    expected.add(10, 10, 0);
    let last = {x: 10, time: 0};
    for (let step = 1; step <= 12; step++) {
      const x = 10 + 3 * step * step;
      const time = step * 8;
      pointer('pointermove', box, {
        id: 21,
        pointerType: 'touch',
        x,
        y: 10,
        buttons: 1,
        time,
      });
      touch('touchmove', box, [{...finger, x}], [{...finger, x}], time);
      expected.add(x, 10, time);
      last = {x, time};
    }
    pointer('pointerup', box, {
      id: 21,
      pointerType: 'touch',
      x: last.x,
      y: 10,
      time: last.time,
    });
    touch('touchend', box, [{...finger, x: last.x}], [], last.time);
    // Every report counted once: the blend of the last two intervals.
    expect(released).toBeCloseTo(expected.velocity().x, 6);
  });

  it("gives a finger's target a passive touchmove listener unless a recognizer on that touch can claim while it moves (spec:AST-094 FR19)", () => {
    const {taps, pan} = mount(
      '<div id="taps"><span id="tapChild">t</span></div><div id="pan"><span id="panChild">p</span></div>',
    );
    detachers.push(host.attach(taps, new TapGestureRecognizer({name: 'tap'})));
    detachers.push(host.attach(pan, new PanGestureRecognizer({name: 'pan'})));
    const moveListenerFlags = (element: Element) => {
      const added = vi.spyOn(element, 'addEventListener');
      return () =>
        added.mock.calls
          .filter(([type]) => type === 'touchmove')
          .map(([, , options]) => (options as AddEventListenerOptions).passive);
    };
    const tapChild = taps.querySelector('#tapChild')!;
    const panChild = pan.querySelector('#panChild')!;
    const onTapChild = moveListenerFlags(tapChild);
    const onPanChild = moveListenerFlags(panChild);
    const tapFinger = {id: 1, x: 10, y: 10};
    touch('touchstart', tapChild, [tapFinger], [tapFinger], 0);
    const panFinger = {id: 2, x: 10, y: 10};
    touch('touchstart', panChild, [panFinger], [tapFinger, panFinger], 0);
    expect(onTapChild()).toEqual([true]);
    expect(onPanChild()).toEqual([false]);
    touch('touchend', tapChild, [tapFinger], [panFinger], 20);
    touch('touchend', panChild, [panFinger], [], 20);
  });

  it('gives the blocking touchmove listener only to elements whose recognizers claim while moving', () => {
    const {taps, pan, press, both, row} = mount(
      '<div id="taps"></div><div id="pan"></div><div id="press"></div><div id="both"></div><div id="row"></div>',
    );
    const blocking = (element: HTMLElement) => {
      const added = vi.spyOn(element, 'addEventListener');
      const removed = vi.spyOn(element, 'removeEventListener');
      return {
        added: () =>
          added.mock.calls.filter(([type, , options]) => {
            const flags = options as AddEventListenerOptions | undefined;
            return type === 'touchmove' && flags?.passive === false;
          }).length,
        removed: () =>
          removed.mock.calls.filter(([type]) => type === 'touchmove').length,
      };
    };
    // Taps claim only at the lift: a scroll starting on them never waits.
    const onTaps = blocking(taps);
    detachers.push(host.attach(taps, new TapGestureRecognizer({name: 'tap'})));
    detachers.push(
      host.attach(
        taps,
        new TapGestureRecognizer({name: 'double', numberOfTapsRequired: 2}),
      ),
    );
    expect(onTaps.added()).toBe(0);
    // A press consumer adds none either.
    const onRow = blocking(row);
    detachers.push(host.attachConsumer(row, new RecordingConsumer()));
    expect(onRow.added()).toBe(0);
    // A pan and a long press can take a moving touch: they get one.
    const onPan = blocking(pan);
    detachers.push(host.attach(pan, new PanGestureRecognizer({name: 'pan'})));
    expect(onPan.added()).toBe(1);
    const onPress = blocking(press);
    detachers.push(
      host.attach(press, new LongPressGestureRecognizer({name: 'press'})),
    );
    expect(onPress.added()).toBe(1);
    // A tap beside a pan: the listener comes with the pan and leaves with it.
    const onBoth = blocking(both);
    detachers.push(host.attach(both, new TapGestureRecognizer({name: 'tap2'})));
    expect(onBoth.added()).toBe(0);
    const detachPan = host.attach(
      both,
      new PanGestureRecognizer({name: 'pan2', direction: 'horizontal'}),
    );
    expect(onBoth.added()).toBe(1);
    detachPan();
    expect(onBoth.removed()).toBe(1);
  });

  it("leaves a one-way pan's touch to the page until the pan begins (spec:AST-094 FR19)", () => {
    const {card} = mount('<div id="card"></div>');
    const pan = new PanGestureRecognizer({name: 'pan', direction: 'up'});
    detachers.push(host.attach(card, pan));
    const finger = {id: 1, x: 50, y: 100};
    touch('touchstart', card, [finger], [finger], 0);
    const at = (y: number, time: number) =>
      touch('touchmove', card, [{...finger, y}], [{...finger, y}], time);
    expect(at(97, 16).defaultPrevented).toBe(false);
    expect(at(95, 32).defaultPrevented).toBe(false);
    expect(pan.state).toBe('possible');
    expect(at(88, 48).defaultPrevented).toBe(true);
    expect(pan.state).toBe('began');
    touch('touchend', card, [{...finger, y: 88}], [], 64);
  });

  it('leaves a scroll-edge pan to claim at its begin', () => {
    const {sheet} = mount('<div id="sheet"></div>');
    const pan = new PanGestureRecognizer({
      name: 'sheet',
      direction: 'down',
      scrollEdge: true,
    });
    detachers.push(host.attach(sheet, pan));
    const finger = {id: 1, x: 50, y: 100};
    touch('touchstart', sheet, [finger], [finger], 0);
    const at = (y: number, time: number) =>
      touch('touchmove', sheet, [{...finger, y}], [{...finger, y}], time);
    expect(at(107, 16).defaultPrevented).toBe(false);
    expect(at(112, 32).defaultPrevented).toBe(true);
    expect(pan.state).toBe('began');
    touch('touchend', sheet, [{...finger, y: 112}], [], 48);
  });

  it('names the pointer a finger, a pen or a mouse is driven by', () => {
    const {box} = mount('<div id="box"></div>');
    const press = new LongPressGestureRecognizer({name: 'press'});
    detachers.push(host.attach(box, press));
    // A finger: its pointerdown pairs with its touchstart.
    pointer('pointerdown', box, {
      id: 31,
      pointerType: 'touch',
      x: 10,
      y: 10,
      buttons: 1,
      time: 0,
    });
    const finger = {id: 0, x: 10, y: 10};
    touch('touchstart', box, [finger], [finger], 0);
    const [held] = press.trackedTouches;
    expect(host.pointerIdOf(held)).toBe(31);
    expect(host.pointerIdOf(held.id)).toBe(31);
    touch('touchend', box, [finger], [], 40);
    // A pen is its own pointer.
    pointer('pointerdown', box, {
      id: 7,
      pointerType: 'pen',
      x: 10,
      y: 10,
      buttons: 1,
      time: 100,
    });
    const [pen] = press.trackedTouches;
    expect(host.pointerIdOf(pen)).toBe(7);
    pointer('pointerup', box, {
      id: 7,
      pointerType: 'pen',
      x: 10,
      y: 10,
      time: 140,
    });
    expect(host.pointerIdOf(pen)).toBeNull();
  });

  it('reads a touchmove that can no longer be cancelled as the browser taking it, where it could pan', () => {
    const {list, box} = mount(
      '<div id="list" style="overflow-y: auto"><div id="box"></div></div>',
    );
    scrollable(list, {scrollTop: 0, scrollHeight: 1000, clientHeight: 400});
    const tap = new TapGestureRecognizer({name: 'tap'});
    const events: string[] = [];
    tap.addTransitionListener((_r, _from, to) => events.push(to));
    detachers.push(host.attach(box, tap));
    const finger = {id: 1, x: 10, y: 30};
    touch('touchstart', box, [finger], [finger], 0);
    touch(
      'touchmove',
      box,
      [{...finger, y: 14}],
      [{...finger, y: 14}],
      16,
      false,
    );
    expect(events).toEqual(['failed', 'possible']);
  });

  it('keeps a horizontal drag under pan-y when Chromium stops asking after one unconsumed move', () => {
    const restore = touchActionFromData();
    try {
      const {list, row} = mount(
        '<div id="list" style="overflow-y: auto"><div id="row" data-touch-action="pan-y pinch-zoom"></div></div>',
      );
      scrollable(list, {scrollTop: 0, scrollHeight: 1000, clientHeight: 400});
      const consumer = new RecordingConsumer();
      detachers.push(host.attachConsumer(row, consumer));
      const finger = {id: 1, x: 100, y: 30};
      touch('touchstart', row, [finger], [finger], 0);
      // The first move goes unconsumed; Chromium sends the rest uncancelable
      // although pan-y keeps it from panning sideways.
      touch('touchmove', row, [{...finger, x: 120}], [{...finger, x: 120}], 16);
      touch(
        'touchmove',
        row,
        [{...finger, x: 140, y: 33}],
        [{...finger, x: 140, y: 33}],
        32,
        false,
      );
      touch(
        'touchmove',
        row,
        [{...finger, x: 160, y: 35}],
        [{...finger, x: 160, y: 35}],
        48,
        false,
      );
      expect(consumer.events).toEqual([
        'began:1',
        'moved:1',
        'moved:1',
        'moved:1',
      ]);
    } finally {
      restore();
    }
  });

  it("judges only the first uncancelable move: a sideways drag that turns vertical stays the page's", () => {
    const restore = touchActionFromData();
    try {
      const {list, row} = mount(
        '<div id="list" style="overflow-y: auto"><div id="row" data-touch-action="pan-y pinch-zoom"></div></div>',
      );
      scrollable(list, {scrollTop: 0, scrollHeight: 1000, clientHeight: 400});
      const consumer = new RecordingConsumer();
      detachers.push(host.attachConsumer(row, consumer));
      const finger = {id: 1, x: 100, y: 100};
      touch('touchstart', row, [finger], [finger], 0);
      touch('touchmove', row, [{...finger, x: 120}], [{...finger, x: 120}], 16);
      touch(
        'touchmove',
        row,
        [{...finger, x: 130, y: 98}],
        [{...finger, x: 130, y: 98}],
        32,
        false,
      );
      // Chromium dropped the scroll when it began sideways; the finger
      // turning upward later does not make it a pan.
      touch(
        'touchmove',
        row,
        [{...finger, x: 132, y: 40}],
        [{...finger, x: 132, y: 40}],
        48,
        false,
      );
      expect(
        consumer.events.filter(event => event.startsWith('cancelled')),
      ).toEqual([]);
      expect(consumer.events.at(-1)).toBe('moved:1');
    } finally {
      restore();
    }
  });

  it('reads a scroll above an unclaimed touch that travelled its slop as the browser taking it', () => {
    const {list, row} = mount('<div id="list"><div id="row"></div></div>');
    const consumer = new RecordingConsumer();
    detachers.push(host.attachConsumer(row, consumer));
    const finger = {id: 1, x: 10, y: 10};
    touch('touchstart', row, [finger], [finger], 0);
    const moved = {...finger, y: 10 + UIKIT_GESTURES.press.slop.value};
    touch('touchmove', row, [moved], [moved], 16, false);
    list.dispatchEvent(new Event('scroll'));
    expect(consumer.events.at(-1)).toMatch(/^cancelled/);
  });

  it("leaves a still finger's press and click alone when the page scrolls under it", () => {
    const {list, button} = mount(
      '<div id="list"><button id="button">Go</button></div>',
    );
    const consumer = new RecordingConsumer();
    detachers.push(host.attachConsumer(button, consumer));
    const clicks: number[] = [];
    button.addEventListener('click', () => clicks.push(1));
    const finger = {id: 1, x: 10, y: 10};
    touch('touchstart', button, [finger], [finger], 0);
    // The program scrolls (a transcript pinned to its end, scrollIntoView).
    scrollable(list, {scrollTop: 50, scrollHeight: 2000, clientHeight: 300});
    list.dispatchEvent(new Event('scroll'));
    expect(consumer.events.some(event => event.startsWith('cancelled'))).toBe(
      false,
    );
    const end = touch('touchend', button, [finger], [], 120);
    expect(end.defaultPrevented).toBe(false);
    expect(consumer.events.at(-1)).toMatch(/^ended/);
  });

  it("cancels a finger's moves only when a claimed pen's own stylus touch moves, never a finger nobody owns", () => {
    const {pad, list} = mount('<div id="pad"></div><div id="list"></div>');
    const drawing = new PanGestureRecognizer({name: 'draw'});
    detachers.push(
      host.attach(pad, drawing),
      host.attach(
        list,
        new PanGestureRecognizer({name: 'other', direction: 'horizontal'}),
      ),
    );
    for (const [x, time] of [
      [0, 0],
      [5, 16],
      [30, 32],
    ] as const) {
      pointer(time === 0 ? 'pointerdown' : 'pointermove', pad, {
        id: 9,
        pointerType: 'pen',
        x,
        y: 0,
        buttons: 1,
        time,
      });
    }
    expect(drawing.state).toBe('began');
    // A finger on the list, which no recognizer owns: its moves scroll.
    const finger = {id: 4, x: 10, y: 10};
    touch('touchstart', list, [finger], [finger], 40);
    const move = touch(
      'touchmove',
      list,
      [{...finger, y: 40}],
      [{...finger, y: 40}],
      56,
    );
    expect(move.defaultPrevented).toBe(false);
    // The pen's own stylus touch is held: the browser must not pan with it.
    const stylus = new Event('touchmove', {bubbles: true, cancelable: true});
    const pen = {
      identifier: 77,
      clientX: 31,
      clientY: 0,
      target: pad,
      touchType: 'stylus',
    };
    Object.defineProperty(stylus, 'changedTouches', {value: [pen]});
    Object.defineProperty(stylus, 'touches', {value: [pen]});
    Object.defineProperty(stylus, 'timeStamp', {value: 60});
    pad.dispatchEvent(stylus);
    expect(stylus.defaultPrevented).toBe(true);
    pointer('pointerup', pad, {
      id: 9,
      pointerType: 'pen',
      x: 31,
      y: 0,
      time: 80,
    });
  });

  it('keeps every touchmove listener passive on a finger nothing can claim as it moves', () => {
    const {taps, quiet} = mount('<div id="taps"></div><div id="quiet"></div>');
    class Watcher extends PanGestureRecognizer {
      override get claimsTouches(): boolean {
        return false;
      }
    }
    detachers.push(
      host.attach(taps, new TapGestureRecognizer({name: 'tap'})),
      host.attachConsumer(taps, new RecordingConsumer()),
      host.attach(quiet, new Watcher({name: 'watcher'})),
    );
    for (const element of [taps, quiet]) {
      const added = vi.spyOn(element, 'addEventListener');
      const finger = {id: 1, x: 10, y: 10};
      touch('touchstart', element, [finger], [finger], 0);
      const blocking = added.mock.calls.filter(
        ([type, , options]) =>
          type === 'touchmove' &&
          (options as AddEventListenerOptions | undefined)?.passive === false,
      );
      expect(blocking).toHaveLength(0);
      touch('touchend', element, [finger], [], 50);
    }
  });

  it('follows the flat tree: content slotted into a shadow scroller scrolls with it', () => {
    const {host: shell, item} = mount(
      '<div id="host"><div id="item">row</div></div>',
    );
    const shadow = shell.attachShadow({mode: 'open'});
    shadow.innerHTML =
      '<div id="scroller" style="overflow-y: auto; height: 300px"><slot></slot></div>';
    const scroller = shadow.getElementById('scroller') as HTMLElement;
    scrollable(scroller, {
      scrollTop: 200,
      scrollHeight: 2000,
      clientHeight: 300,
    });
    const probe = createNativeScrollProbe(item);
    expect(probe.canScroll(0, 10)).toBe(true);
    expect(probe.isInsideScroller).toBe(true);
  });

  it("writes a touch-action no wider than the caller's own", () => {
    const restore = touchActionFromData();
    const {trigger, strip} = mount(
      '<div id="trigger" data-touch-action="none"></div><div id="strip" data-touch-action="pan-y"></div>',
    );
    const set = vi.spyOn(trigger.style, 'setProperty');
    const setStrip = vi.spyOn(strip.style, 'setProperty');
    detachers.push(
      host.attach(trigger, new LongPressGestureRecognizer({name: 'hold'})),
      host.attach(
        strip,
        new PanGestureRecognizer({name: 'h', direction: 'horizontal'}),
      ),
    );
    expect(set).toHaveBeenCalledWith('touch-action', 'none');
    // pan-y pinch-zoom (the pan's) ∩ pan-y (the caller's).
    expect(setStrip).toHaveBeenCalledWith('touch-action', 'pan-y');
    restore();
  });

  it('releases the same velocity for one stroke from a finger, a pen and a mouse (spec:AST-100 FR1, FR4)', () => {
    const velocities: number[] = [];
    for (const kind of ['touch', 'pen', 'mouse'] as const) {
      const {box} = mount('<div id="box"></div>');
      const pan = new PanGestureRecognizer({name: kind});
      let released = 0;
      pan.addListener(r => {
        if (r.state === 'ended') {
          released = r.velocity().x;
        }
      });
      const detach = host.attach(box, pan);
      const at = (x: number, time: number, type: 'down' | 'move' | 'up') => {
        if (kind === 'touch') {
          const finger = {id: 1, x, y: 0};
          touch(
            type === 'down'
              ? 'touchstart'
              : type === 'move'
                ? 'touchmove'
                : 'touchend',
            box,
            [finger],
            type === 'up' ? [] : [finger],
            time,
          );
        } else {
          pointer(
            type === 'down'
              ? 'pointerdown'
              : type === 'move'
                ? 'pointermove'
                : 'pointerup',
            box,
            {
              id: 5,
              pointerType: kind,
              x,
              y: 0,
              buttons: type === 'up' ? 0 : 1,
              time,
            },
          );
        }
      };
      // Each stroke later than the last: the arena's clock never goes back.
      const start = 1000 * (velocities.length + 1);
      at(0, start, 'down');
      for (let step = 1; step <= 10; step++) {
        at(step * 12, start + step * 8, 'move');
      }
      at(120, start + 80, 'up');
      velocities.push(released);
      detach();
    }
    expect(velocities[0]).toBeGreaterThan(0);
    expect(velocities[1]).toBeCloseTo(velocities[0], 6);
    expect(velocities[2]).toBeCloseTo(velocities[0], 6);
  });

  describe('finger scrolls', () => {
    it('reads a scroll while a finger that landed inside is down as the finger’s, until the scroller’s scrollend', () => {
      const {list, row} = mount('<div id="list"><div id="row"></div></div>');
      detachers.push(watchFingerScrolls(host, list));
      const finger = {id: 1, x: 10, y: 10};
      touch('touchstart', row, [finger], [finger], 0);
      list.dispatchEvent(new Event('scroll'));
      expect(isFingerScroll(host, list)).toBe(true);
      // The lift starts the momentum: still the finger's scroll.
      touch('touchend', row, [finger], [], 120);
      list.dispatchEvent(new Event('scroll'));
      expect(isFingerScroll(host, list)).toBe(true);
      list.dispatchEvent(new Event('scrollend'));
      expect(isFingerScroll(host, list)).toBe(false);
    });

    it('reads a scroll with no finger down as the program’s, even right after a tap', () => {
      const {list, row} = mount('<div id="list"><div id="row"></div></div>');
      detachers.push(watchFingerScrolls(host, list));
      list.dispatchEvent(new Event('scroll'));
      expect(isFingerScroll(host, list)).toBe(false);
      // A tap whose click scrolls the list (a scrollTo after the lift).
      const finger = {id: 1, x: 10, y: 10};
      touch('touchstart', row, [finger], [finger], 0);
      touch('touchend', row, [finger], [], 80);
      list.dispatchEvent(new Event('scroll'));
      expect(isFingerScroll(host, list)).toBe(false);
    });

    it('reads the page’s own scroll on the document', () => {
      const {row} = mount('<div id="row"></div>');
      detachers.push(watchFingerScrolls(host, document));
      const finger = {id: 1, x: 10, y: 10};
      touch('touchstart', row, [finger], [finger], 0);
      document.dispatchEvent(new Event('scroll'));
      expect(isFingerScroll(host, document)).toBe(true);
      touch('touchend', row, [finger], [], 120);
      document.dispatchEvent(new Event('scrollend'));
      expect(isFingerScroll(host, document)).toBe(false);
    });

    it('does not count a finger down outside the scroller', () => {
      const {list, other} = mount(
        '<div id="list"><div id="row"></div></div><div id="other"></div>',
      );
      detachers.push(watchFingerScrolls(host, list));
      const finger = {id: 1, x: 10, y: 10};
      touch('touchstart', other, [finger], [finger], 0);
      list.dispatchEvent(new Event('scroll'));
      expect(isFingerScroll(host, list)).toBe(false);
    });

    it('keeps a scroll that ends while the finger still rests the finger’s until the lift', () => {
      const {list, row} = mount('<div id="list"><div id="row"></div></div>');
      detachers.push(watchFingerScrolls(host, list));
      const finger = {id: 1, x: 10, y: 10};
      touch('touchstart', row, [finger], [finger], 0);
      list.dispatchEvent(new Event('scroll'));
      list.dispatchEvent(new Event('scrollend'));
      expect(isFingerScroll(host, list)).toBe(true);
      // Lifting without moving the list again ends it.
      touch('touchend', row, [finger], [], 300);
      expect(isFingerScroll(host, list)).toBe(false);
    });

    it('ends a finger’s scroll after a quiet spell where the browser sends no scrollend', () => {
      vi.useFakeTimers();
      const own = Object.getOwnPropertyDescriptor(window, 'onscrollend');
      const proto = Object.getPrototypeOf(window) as object;
      const inherited = Object.getOwnPropertyDescriptor(proto, 'onscrollend');
      Reflect.deleteProperty(window, 'onscrollend');
      Reflect.deleteProperty(proto, 'onscrollend');
      try {
        expect('onscrollend' in window).toBe(false);
        const {list, row} = mount('<div id="list"><div id="row"></div></div>');
        detachers.push(watchFingerScrolls(host, list));
        const finger = {id: 1, x: 10, y: 10};
        touch('touchstart', row, [finger], [finger], 0);
        list.dispatchEvent(new Event('scroll'));
        touch('touchend', row, [finger], [], 120);
        // The momentum keeps scrolling: still the finger's.
        vi.advanceTimersByTime(100);
        list.dispatchEvent(new Event('scroll'));
        vi.advanceTimersByTime(100);
        expect(isFingerScroll(host, list)).toBe(true);
        // Quiet for the fallback spell: the scroll has ended.
        vi.advanceTimersByTime(60);
        expect(isFingerScroll(host, list)).toBe(false);
        // A program's scroll afterwards is not the finger's.
        list.dispatchEvent(new Event('scroll'));
        expect(isFingerScroll(host, list)).toBe(false);
      } finally {
        if (inherited != null) {
          Object.defineProperty(proto, 'onscrollend', inherited);
        }
        if (own != null) {
          Object.defineProperty(window, 'onscrollend', own);
        }
        vi.useRealTimers();
      }
    });

    it('forgets a scroller once nobody watches it', () => {
      const {list, row} = mount('<div id="list"><div id="row"></div></div>');
      const stop = watchFingerScrolls(host, list);
      const finger = {id: 1, x: 10, y: 10};
      touch('touchstart', row, [finger], [finger], 0);
      list.dispatchEvent(new Event('scroll'));
      expect(isFingerScroll(host, list)).toBe(true);
      stop();
      expect(isFingerScroll(host, list)).toBe(false);
      list.dispatchEvent(new Event('scroll'));
      expect(isFingerScroll(host, list)).toBe(false);
    });
  });

  it('drives mouse input through Pointer Events', () => {
    const {box} = mount('<div id="box"></div>');
    const pan = new PanGestureRecognizer({name: 'pan'});
    let released = {x: 0, y: 0};
    pan.addListener(r => {
      if (r.state === 'ended') {
        released = r.velocity();
      }
    });
    detachers.push(host.attach(box, pan));
    pointer('pointerdown', box, {
      pointerType: 'mouse',
      x: 0,
      y: 0,
      buttons: 1,
      time: 0,
    });
    for (let t = 8; t <= 96; t += 8) {
      pointer('pointermove', box, {
        pointerType: 'mouse',
        x: t * 2,
        y: 0,
        buttons: 1,
        time: t,
      });
    }
    pointer('pointerup', box, {pointerType: 'mouse', x: 192, y: 0, time: 104});
    expect(pan.state).toBe('possible');
    expect(released.x).toBeCloseTo(2000, 0);
  });

  it('cancels the context menu while a long press owns the touch', () => {
    const {box} = mount('<div id="box"></div>');
    const press = new LongPressGestureRecognizer({name: 'press'});
    detachers.push(host.attach(box, press));
    const finger = {id: 1, x: 10, y: 10};
    touch('touchstart', box, [finger], [finger], 0);
    const before = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
    });
    box.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(false);
    host.arena.advanceTime(500);
    expect(press.state).toBe('began');
    const during = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
    });
    box.dispatchEvent(during);
    expect(during.defaultPrevented).toBe(true);
  });

  it('holds the click of a tap a double tap may claim, and replays it when the double tap fails', () => {
    const {row, button} = mount(
      '<div id="row"><button id="button">Go</button></div>',
    );
    const double = new TapGestureRecognizer({
      name: 'double',
      numberOfTapsRequired: 2,
    });
    detachers.push(host.attach(row, double));
    const clicks: {target: EventTarget | null; detail: number}[] = [];
    button.addEventListener('click', event =>
      clicks.push({target: event.target, detail: event.detail}),
    );
    const finger = {id: 1, x: 10, y: 10};
    touch('touchstart', button, [finger], [finger], 0);
    const end = touch('touchend', button, [finger], [], 60);
    expect(end.defaultPrevented).toBe(true);
    expect(clicks).toEqual([]);
    const interval = UIKIT_GESTURES.tap.maximumIntervalBetweenTaps.value;
    host.arena.advanceTime(60 + interval);
    expect(clicks).toEqual([{target: button, detail: 1}]);
  });

  it('collects recognizers across shadow roots', () => {
    const {outer} = mount('<div id="outer"></div>');
    const shadow = outer.attachShadow({mode: 'open'});
    shadow.innerHTML = '<span id="inner">x</span>';
    const inner = shadow.getElementById('inner') as HTMLElement;
    const tap = new TapGestureRecognizer({name: 'tap'});
    const actions: string[] = [];
    tap.addListener(r => actions.push(r.state));
    detachers.push(host.attach(outer, tap));
    const finger = {id: 1, x: 5, y: 5, target: inner};
    touch('touchstart', inner, [finger], [finger], 0);
    touch('touchend', inner, [finger], [], 50);
    expect(actions).toEqual(['ended']);
  });

  it('drives hover recognizers from a hovering mouse', () => {
    const {box, other} = mount('<div id="box"></div><div id="other"></div>');
    const hover = new HoverGestureRecognizer();
    const states: string[] = [];
    hover.addListener(r => states.push(r.state));
    detachers.push(host.attach(box, hover));
    pointer('pointermove', box, {pointerType: 'mouse', x: 1, y: 1, time: 0});
    pointer('pointermove', box, {pointerType: 'mouse', x: 2, y: 1, time: 16});
    pointer('pointermove', other, {
      pointerType: 'mouse',
      x: 300,
      y: 1,
      time: 32,
    });
    expect(states).toEqual(['began', 'changed', 'ended']);
    // A finger never hovers.
    pointer('pointermove', box, {pointerType: 'touch', x: 1, y: 1, time: 48});
    expect(states).toHaveLength(3);
  });

  it('cancels every touch in flight when the window loses focus', () => {
    const {box} = mount('<div id="box"></div>');
    const pan = new PanGestureRecognizer({name: 'pan'});
    const states: string[] = [];
    pan.addListener(r => states.push(r.state));
    detachers.push(host.attach(box, pan));
    const finger = {id: 1, x: 10, y: 10};
    touch('touchstart', box, [finger], [finger], 0);
    touch('touchmove', box, [{...finger, x: 40}], [{...finger, x: 40}], 16);
    window.dispatchEvent(new Event('blur'));
    expect(states).toEqual(['began', 'cancelled']);
  });

  it('finishes a gesture whose target left the document mid-gesture', () => {
    const {box, child} = mount('<div id="box"><span id="child">x</span></div>');
    const pan = new PanGestureRecognizer({name: 'pan'});
    const states: string[] = [];
    pan.addListener(r => states.push(r.state));
    detachers.push(host.attach(box, pan));
    const finger = {id: 1, x: 10, y: 10};
    touch('touchstart', child, [finger], [finger], 0);
    touch('touchmove', child, [{...finger, x: 40}], [{...finger, x: 40}], 16);
    // A re-render replaces the span: its events no longer reach the document.
    child.remove();
    const move = touch(
      'touchmove',
      child,
      [{...finger, x: 60}],
      [{...finger, x: 60}],
      32,
    );
    expect(move.defaultPrevented).toBe(true);
    touch('touchend', child, [{...finger, x: 60}], [], 48);
    // The move and the lift after the removal still reached the pan.
    expect(states).toEqual(['began', 'changed', 'ended']);
    expect(host.arena.touches).toEqual([]);
  });

  it('cancels a finger the events say is no longer down', () => {
    const {box} = mount('<div id="box"></div>');
    const pan = new PanGestureRecognizer({name: 'pan'});
    const states: string[] = [];
    pan.addListener(r => states.push(r.state));
    detachers.push(host.attach(box, pan));
    const first = {id: 1, x: 10, y: 10};
    touch('touchstart', box, [first], [first], 0);
    touch('touchmove', box, [{...first, x: 40}], [{...first, x: 40}], 16);
    // Its touchend went to a node outside the document; the next event for
    // another finger no longer lists it.
    const other = {id: 2, x: 300, y: 300};
    touch('touchmove', document.body, [other], [other], 32);
    expect(states).toEqual(['began', 'cancelled']);
  });

  it('treats a reused finger number as a new touch', () => {
    const {box} = mount('<div id="box"></div>');
    const tap = new TapGestureRecognizer({name: 'tap'});
    const states: string[] = [];
    tap.addListener(r => states.push(r.state));
    detachers.push(host.attach(box, tap));
    const finger = {id: 4, x: 10, y: 10};
    touch('touchstart', box, [finger], [finger], 0);
    // No touchend reached us; the same identifier lands again.
    touch('touchstart', box, [finger], [finger], 500);
    touch('touchend', box, [finger], [], 560);
    expect(states).toEqual(['ended']);
  });

  it('cancels every finger on a touchcancel that names none', () => {
    const {box} = mount('<div id="box"></div>');
    const pan = new PanGestureRecognizer({name: 'pan'});
    const states: string[] = [];
    pan.addListener(r => states.push(r.state));
    detachers.push(host.attach(box, pan));
    const finger = {id: 1, x: 10, y: 10};
    touch('touchstart', box, [finger], [finger], 0);
    touch('touchmove', box, [{...finger, x: 40}], [{...finger, x: 40}], 16);
    box.dispatchEvent(new Event('touchcancel', {bubbles: true}));
    expect(states).toEqual(['began', 'cancelled']);
  });

  it('reads epoch-stamped events on the arena clock', () => {
    const {box} = mount('<div id="box"></div>');
    const pan = new PanGestureRecognizer({name: 'pan'});
    let released = {x: 0, y: 0};
    pan.addListener(r => {
      if (r.state === 'ended') {
        released = r.velocity();
      }
    });
    detachers.push(host.attach(box, pan));
    const epoch = performance.timeOrigin + 5000;
    const finger = {id: 1, x: 0, y: 10};
    touch('touchstart', box, [finger], [finger], epoch);
    for (let t = 8; t <= 96; t += 8) {
      const at = {...finger, x: t};
      touch('touchmove', box, [at], [at], epoch + t);
    }
    touch('touchend', box, [{...finger, x: 96}], [], epoch + 100);
    expect(released.x).toBeCloseTo(1000, 0);
    expect(host.arena.now()).toBeLessThan(1e9);
  });

  it('locks only for a recognizer that would take the contact: enabled, and accepting its pointer kind', () => {
    detachers.push(coarsePrimaryPointer());
    const {slider, stylus} = mount(
      '<div><div id="slider"></div><div id="stylus"></div></div>',
    );
    const release = vi.fn();
    const lock = vi.fn(() => release);
    const drag = new PanGestureRecognizer({
      name: 'drag',
      direction: 'horizontal',
      selectionLock: lock,
    });
    detachers.push(host.attach(slider, drag));
    const finger = {id: 1, x: 10, y: 10};
    touch('touchstart', slider, [finger], [finger], 0);
    expect(lock).toHaveBeenCalledTimes(1);
    touch('touchend', slider, [finger], [], 40);
    expect(release).toHaveBeenCalledTimes(1);
    drag.setEnabled(false);
    touch('touchstart', slider, [finger], [finger], 100);
    touch('touchend', slider, [finger], [], 140);
    expect(lock).toHaveBeenCalledTimes(1);
    // A pen-only drag locks for a pen: pen acceptance decides, not touch.
    const penLock = vi.fn(() => () => {});
    detachers.push(
      host.attach(
        stylus,
        new PanGestureRecognizer({
          name: 'pen',
          direction: 'horizontal',
          allowedPointerTypes: ['pen'],
          selectionLock: penLock,
        }),
      ),
    );
    pointer('pointerdown', stylus, {
      id: 7,
      pointerType: 'pen',
      x: 10,
      y: 10,
      time: 200,
    });
    expect(penLock).toHaveBeenCalledTimes(1);
    pointer('pointerup', stylus, {
      id: 7,
      pointerType: 'pen',
      x: 10,
      y: 10,
      time: 240,
    });
  });

  it('shares one blocking touchmove handler among the elements that claim while moving: 200 pans, one handler, none for a tap (spec:AST-094 FR19)', () => {
    const added = vi.spyOn(Element.prototype, 'addEventListener');
    try {
      const pans = Array.from({length: 200}, () => {
        const element = document.createElement('div');
        document.body.appendChild(element);
        detachers.push(
          host.attach(
            element,
            new PanGestureRecognizer({direction: 'horizontal'}),
          ),
          () => element.remove(),
        );
        return element;
      });
      const tapTarget = document.createElement('div');
      document.body.appendChild(tapTarget);
      detachers.push(host.attach(tapTarget, new TapGestureRecognizer()), () =>
        tapTarget.remove(),
      );
      const blocking = added.mock.calls
        .map((call, index) => ({
          call,
          element: added.mock.contexts[index] as Element,
        }))
        .filter(
          ({call: [type, , options]}) =>
            type === 'touchmove' &&
            typeof options === 'object' &&
            options.passive === false,
        );
      // Each claiming element carries the listener itself, so a scroll that
      // starts outside the rows never waits on it...
      expect(blocking.map(({element}) => element)).toEqual(pans);
      // ...and all of them share the host's one handler.
      expect(new Set(blocking.map(({call}) => call[1])).size).toBe(1);
    } finally {
      added.mockRestore();
    }
  });

  it('keeps native long-press selection on a press-tracked element whose hold does nothing (spec:AST-094 FR41)', () => {
    detachers.push(coarsePrimaryPointer());
    const {row, text} = mount(
      '<div id="row" style="user-select: text"><span id="text">Row</span></div>',
    );
    detachers.push(host.attachConsumer(row, new RecordingConsumer()));
    const finger = {id: 1, x: 5, y: 5};
    touch('touchstart', text, [finger], [finger], 0);
    expect(row.style.getPropertyValue('user-select')).toBe('text');
    touch('touchend', text, [finger], [], 600);
    expect(row.style.getPropertyValue('user-select')).toBe('text');
  });

  it('turns text selection and the callout off while a finger holds an element whose hold opens a menu (spec:AST-094 FR41)', () => {
    detachers.push(coarsePrimaryPointer());
    const {trigger} = mount(
      '<div id="trigger" style="user-select: text">Hold for the menu</div>',
    );
    const release = vi.fn();
    const lock = vi.fn(() => release);
    detachers.push(
      host.attach(
        trigger,
        new LongPressGestureRecognizer({name: 'menu', selectionLock: lock}),
      ),
    );
    const finger = {id: 1, x: 5, y: 5};
    touch('touchstart', trigger, [finger], [finger], 0);
    // The host calls the long press's lock for this contact alone.
    expect(lock).toHaveBeenCalledTimes(1);
    expect([
      ...(lock.mock.calls[0] as unknown as [Iterable<Element>])[0],
    ]).toEqual([trigger]);
    expect(release).not.toHaveBeenCalled();
    touch('touchend', trigger, [finger], [], 600);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('a long press brings lockSelection by default', () => {
    expect(new LongPressGestureRecognizer().selectionLock).toBe(lockSelection);
    expect(new TapGestureRecognizer().selectionLock).toBeNull();
  });

  it('keeps native selection on a delegated pressable, whose hold does nothing (spec:AST-094 FR41)', () => {
    detachers.push(coarsePrimaryPointer());
    const {row, off} = mount(
      '<div id="row" data-test-press></div><div id="off" data-test-press="off"></div>',
    );
    detachers.push(
      host.addDelegatedConsumer({
        attribute: 'data-test-press',
        create: element =>
          element.getAttribute('data-test-press') === 'off'
            ? null
            : new RecordingConsumer(),
      }),
    );
    const one = {id: 1, x: 5, y: 5};
    const two = {id: 2, x: 9, y: 9};
    touch('touchstart', row, [one], [one], 0);
    touch('touchstart', row, [two], [one, two], 10);
    expect(row.style.getPropertyValue('user-select')).toBe('');
    touch('touchend', row, [one], [two], 100);
    touch('touchend', row, [two], [], 200);
    expect(row.style.getPropertyValue('user-select')).toBe('');
    touch('touchstart', off, [one], [one], 300);
    expect(off.style.getPropertyValue('user-select')).toBe('');
    touch('touchend', off, [one], [], 400);
  });

  it("calls a press tracker's own selection lock for each finger's press, a stepper's hold-repeat, and nowhere else (spec:AST-094 FR41)", () => {
    detachers.push(coarsePrimaryPointer());
    const {stepper, row} = mount(
      '<div id="stepper">+</div><div id="row">Row</div>',
    );
    const release = vi.fn();
    const lock = vi.fn(
      (_elements: Iterable<Element>, _target: EventTarget | null) => release,
    );
    detachers.push(
      host.attachConsumer(stepper, new LockingConsumer(lock)),
      host.attachConsumer(row, new RecordingConsumer()),
    );
    const finger = {id: 1, x: 5, y: 5};
    touch('touchstart', stepper, [finger], [finger], 0);
    expect(lock).toHaveBeenCalledTimes(1);
    expect([...lock.mock.calls[0][0]]).toEqual([stepper]);
    expect(release).not.toHaveBeenCalled();
    touch('touchend', stepper, [finger], [], 600);
    expect(release).toHaveBeenCalledTimes(1);
    // A mouse press keeps desktop selection.
    pointer('pointerdown', stepper, {
      pointerType: 'mouse',
      x: 5,
      y: 5,
      buttons: 1,
      time: 700,
    });
    pointer('pointerup', stepper, {
      pointerType: 'mouse',
      x: 5,
      y: 5,
      time: 750,
    });
    // A tracker whose hold does nothing brings no lock.
    touch('touchstart', row, [finger], [finger], 800);
    touch('touchend', row, [finger], [], 900);
    expect(lock).toHaveBeenCalledTimes(1);
  });
  it('on a coarse primary pointer, keeps selection for a mouse, a press-tracked row and a pan that does not ask, and locks a pan that asks', () => {
    detachers.push(coarsePrimaryPointer());
    const {row, sheet, slider} = mount(
      '<div id="row"></div><div id="sheet"></div><div id="slider"></div>',
    );
    detachers.push(
      host.attachConsumer(row, new RecordingConsumer()),
      host.attach(sheet, new PanGestureRecognizer()),
      host.attach(
        slider,
        new PanGestureRecognizer({
          direction: 'horizontal',
          selectionLock: lockSelection,
        }),
      ),
    );
    const at = {x: 5, y: 5};
    pointer('pointerdown', row, {
      pointerType: 'mouse',
      ...at,
      buttons: 1,
      time: 0,
    });
    expect(row.style.getPropertyValue('user-select')).toBe('');
    pointer('pointerup', row, {pointerType: 'mouse', ...at, time: 50});
    // A pen on a touch device (an iPad's pencil) on a row whose hold does
    // nothing keeps native selection too (spec:AST-094 FR41).
    pointer('pointerdown', row, {
      pointerType: 'pen',
      ...at,
      buttons: 1,
      time: 100,
    });
    expect(row.style.getPropertyValue('user-select')).toBe('');
    pointer('pointerup', row, {pointerType: 'pen', ...at, time: 150});
    expect(row.style.getPropertyValue('user-select')).toBe('');

    const finger = {id: 1, ...at};
    touch('touchstart', sheet, [finger], [finger], 200);
    expect(sheet.style.getPropertyValue('user-select')).toBe('');
    touch('touchend', sheet, [finger], [], 250);
    touch('touchstart', slider, [finger], [finger], 300);
    expect(slider.style.getPropertyValue('user-select')).toBe('none');
    touch('touchcancel', slider, [finger], [], 350);
    expect(slider.style.getPropertyValue('user-select')).toBe('');
  });

  it("keeps selection for every contact where the primary pointer is fine: a touchscreen laptop's finger, a desktop pen and a mouse (spec:AST-094 FR19, spec:AST-017 FR59)", () => {
    detachers.push(pointerQuery(false).restore);
    const {row, slider} = mount('<div id="row"></div><div id="slider"></div>');
    detachers.push(
      host.attachConsumer(row, new RecordingConsumer()),
      host.attach(
        slider,
        new PanGestureRecognizer({
          direction: 'horizontal',
          selectionLock: lockSelection,
        }),
      ),
    );
    const at = {x: 5, y: 5};
    for (const [time, pointerType] of [
      [0, 'mouse'],
      [100, 'pen'],
      [200, 'touch'],
    ] as const) {
      pointer('pointerdown', row, {
        pointerType,
        ...at,
        buttons: 1,
        time,
      });
      expect(row.style.getPropertyValue('user-select')).toBe('');
      pointer('pointerup', row, {pointerType, ...at, time: time + 50});
    }
    const finger = {id: 1, ...at};
    touch('touchstart', slider, [finger], [finger], 300);
    expect(slider.style.getPropertyValue('user-select')).toBe('');
    touch('touchend', slider, [finger], [], 350);
  });

  it('locks a checkbox under the finger inside a locked element, which WebKit makes selectable, but never a text field', () => {
    detachers.push(coarsePrimaryPointer());
    const {row, check, field} = mount(
      '<div id="row"><input id="check" type="checkbox"><input id="field"></div>',
    );
    // A switch's drag: a hold that does something.
    detachers.push(
      host.attach(
        row,
        new PanGestureRecognizer({
          direction: 'horizontal',
          selectionLock: lockSelection,
        }),
      ),
    );
    const finger = {id: 1, x: 5, y: 5};
    touch('touchstart', check, [finger], [finger], 0);
    expect(check.style.getPropertyValue('user-select')).toBe('none');
    touch('touchend', check, [finger], [], 100);
    expect(check.style.getPropertyValue('user-select')).toBe('');
    touch('touchstart', field, [finger], [finger], 200);
    expect(row.style.getPropertyValue('user-select')).toBe('none');
    expect(field.style.getPropertyValue('user-select')).toBe('');
    touch('touchend', field, [finger], [], 300);
    // An input outside every locked element is not ours to lock.
    const {alone} = mount('<input id="alone" type="checkbox">');
    detachers.push(host.attach(alone, new TapGestureRecognizer()));
    touch('touchstart', alone, [finger], [finger], 400);
    expect(alone.style.getPropertyValue('user-select')).toBe('');
    touch('touchend', alone, [finger], [], 450);
  });

  it('ignores touches that land outside every attached element', () => {
    const {box, elsewhere} = mount(
      '<div id="box"></div><div id="elsewhere"></div>',
    );
    const pan = new PanGestureRecognizer({name: 'pan'});
    detachers.push(host.attach(box, pan));
    const finger = {id: 1, x: 10, y: 10};
    touch('touchstart', elsewhere, [finger], [finger], 0);
    const move = touch(
      'touchmove',
      elsewhere,
      [{...finger, x: 60}],
      [{...finger, x: 60}],
      16,
    );
    expect(move.defaultPrevented).toBe(false);
    expect(host.arena.touches).toEqual([]);
  });
});

describe('holdPageScroll', () => {
  const at = (id: number, x: number, y: number) => [{id, x, y}];
  /** A contact's pointerdown, which reads the primary pointer for a hold. */
  const contact = (pointerType = 'touch', x = 100, y = 300) =>
    pointer('pointerdown', document.body, {pointerType, x, y, time: 0});
  /** Hold the page, then touch it once, as a finger does. */
  const hold = (decide: PageScrollDecision) => {
    const release = holdPageScroll(document, decide);
    contact();
    return release;
  };

  it('asks nothing about the primary pointer as a hold starts, only at its first touch or pen contact', () => {
    const ask = vi.spyOn(window, 'matchMedia');
    detachers.push(() => ask.mockRestore());
    detachers.push(holdPageScroll(document, () => true));
    expect(ask).not.toHaveBeenCalled();
    contact('mouse');
    expect(ask).not.toHaveBeenCalled();
    contact('touch');
    expect(ask).toHaveBeenCalledWith(COARSE_POINTER_QUERY);
  });

  it('holds a touch whose pointerdown comes after its touchstart: the finger is named at its first move', () => {
    const {scrim} = mount('<div id="scrim"></div>');
    detachers.push(holdPageScroll(document, () => true));
    touch('touchstart', scrim, at(1, 100, 300), at(1, 100, 300), 0);
    contact('touch', 100, 300);
    expect(
      touch('touchmove', scrim, at(1, 100, 250), at(1, 100, 250), 16)
        .defaultPrevented,
    ).toBe(true);
  });

  it('cancels a one-finger pan the decision says would scroll the page, for the rest of its touch', () => {
    const {scrim} = mount('<div id="scrim"></div>');
    const decide = vi.fn(() => true);
    detachers.push(hold(decide));

    touch('touchstart', scrim, at(1, 100, 300), at(1, 100, 300), 0);
    const first = touch(
      'touchmove',
      scrim,
      at(1, 100, 250),
      at(1, 100, 250),
      16,
    );
    const second = touch(
      'touchmove',
      scrim,
      at(1, 100, 200),
      at(1, 100, 200),
      32,
    );

    expect(first.defaultPrevented).toBe(true);
    expect(second.defaultPrevented).toBe(true);
    expect(decide).toHaveBeenCalledTimes(1);
    expect(decide).toHaveBeenCalledWith(scrim, 0, -50);
  });

  it('judges a pan once it clears the slop, so a first wobble does not fix its axis', () => {
    const {strip} = mount('<div id="strip"></div>');
    const decide = vi.fn((_origin: EventTarget | null, dx: number) => dx === 0);
    detachers.push(hold(decide));

    touch('touchstart', strip, at(1, 100, 300), at(1, 100, 300), 0);
    const wobble = touch(
      'touchmove',
      strip,
      at(1, 102, 302),
      at(1, 102, 302),
      16,
    );
    const swipe = touch(
      'touchmove',
      strip,
      at(1, 110, 303),
      at(1, 110, 303),
      32,
    );

    expect(wobble.defaultPrevented).toBe(false);
    expect(decide).toHaveBeenCalledTimes(1);
    expect(decide).toHaveBeenCalledWith(strip, 10, 3);
    expect(swipe.defaultPrevented).toBe(false);
  });

  it('lets a pan through when the decision says something under the finger takes it', () => {
    const {list} = mount('<div id="list"></div>');
    detachers.push(hold(() => false));

    touch('touchstart', list, at(1, 100, 300), at(1, 100, 300), 0);
    expect(
      touch('touchmove', list, at(1, 100, 250), at(1, 100, 250), 16)
        .defaultPrevented,
    ).toBe(false);
  });

  it('never cancels a two-finger gesture, so pinch-zoom keeps working', () => {
    const {scrim} = mount('<div id="scrim"></div>');
    const decide = vi.fn(() => true);
    detachers.push(hold(decide));
    const both = [
      {id: 1, x: 100, y: 300},
      {id: 2, x: 200, y: 300},
    ];

    touch('touchstart', scrim, both, both, 0);
    const moved = [
      {id: 1, x: 90, y: 300},
      {id: 2, x: 210, y: 300},
    ];
    expect(touch('touchmove', scrim, moved, moved, 16).defaultPrevented).toBe(
      false,
    );
    expect(decide).not.toHaveBeenCalled();
  });

  it('hands the decision the innermost node of a touch inside a shadow root', () => {
    const {outer} = mount('<div id="outer"></div>');
    const inner = document.createElement('div');
    outer.attachShadow({mode: 'open'}).append(inner);
    const decide = vi.fn(() => false);
    detachers.push(hold(decide));

    touch('touchstart', inner, at(1, 100, 300), at(1, 100, 300), 0);
    touch('touchmove', inner, at(1, 100, 250), at(1, 100, 250), 16);

    expect(decide).toHaveBeenCalledWith(inner, 0, -50);
  });

  it('holds the page of a document that has no gesture host, and creates none', () => {
    const {scrim} = mount('<div id="scrim"></div>');
    gestureHosts.delete(document);
    detachers.push(hold(() => true));

    touch('touchstart', scrim, at(1, 100, 300), at(1, 100, 300), 0);
    expect(
      touch('touchmove', scrim, at(1, 100, 250), at(1, 100, 250), 16)
        .defaultPrevented,
    ).toBe(true);
    expect(gestureHosts.get(document)).toBeUndefined();
  });

  it("leaves a touch that a recognizer of the document's host owns to that recognizer", () => {
    const {box} = mount('<div id="box"></div>');
    gestureHosts.set(document, host);
    detachers.push(() => gestureHosts.delete(document));
    const pan = new PanGestureRecognizer({name: 'pan'});
    detachers.push(host.attach(box, pan));
    const decide = vi.fn(() => true);
    detachers.push(hold(decide));

    touch('touchstart', box, at(1, 100, 300), at(1, 100, 300), 0);
    touch('touchmove', box, at(1, 100, 250), at(1, 100, 250), 16);

    expect(pan.state).toBe('began');
    expect(decide).not.toHaveBeenCalled();
  });

  it('stacks holds and stops judging pans once the last one is released', () => {
    const {scrim} = mount('<div id="scrim"></div>');
    const releaseFirst = hold(() => true);
    const releaseSecond = holdPageScroll(document, () => true);
    const pan = (time: number) => {
      touch('touchstart', scrim, at(1, 100, 300), at(1, 100, 300), time);
      return touch(
        'touchmove',
        scrim,
        at(1, 100, 250),
        at(1, 100, 250),
        time + 16,
      ).defaultPrevented;
    };

    releaseFirst();
    expect(pan(0)).toBe(true);
    releaseSecond();
    releaseSecond();
    expect(pan(100)).toBe(false);
  });
});

describe('touch gates and a second finger', () => {
  it('holds a gated target away from every participant until the gate is released', () => {
    const {layer, button} = mount(
      '<div id="layer"><div id="button"></div></div>',
    );
    const tap = new TapGestureRecognizer({name: 'tap'});
    detachers.push(host.attach(button, tap));
    const release = host.addTouchGate(target => layer.contains(target));
    const finger = {id: 1, x: 5, y: 5};
    touch('touchstart', button, [finger], [finger], 0);
    expect(tap.numberOfTouches).toBe(0);
    touch('touchend', button, [finger], [], 40);
    release();
    touch('touchstart', button, [finger], [finger], 100);
    expect(tap.numberOfTouches).toBe(1);
    touch('touchend', button, [finger], [], 140);
  });

  it('fails a one-finger pan that has not claimed when a second finger lands anywhere, so the browser can pinch', () => {
    const {row, text} = mount('<div id="row"></div><p id="text">plain</p>');
    const swipe = new PanGestureRecognizer({
      name: 'swipe',
      direction: 'horizontal',
      maximumNumberOfTouches: 1,
    });
    const states: string[] = [];
    swipe.addListener(r => states.push(r.state));
    detachers.push(host.attach(row, swipe));
    const first = {id: 1, x: 10, y: 10};
    touch('touchstart', row, [first], [first], 0);
    // Under the hysteresis: still possible, nothing claimed.
    touch('touchmove', row, [{...first, x: 15}], [{...first, x: 15}], 16);
    const second = {id: 2, x: 200, y: 300};
    touch('touchstart', text, [second], [{...first, x: 15}, second], 32);
    // The pan can no longer claim the pair midway: the pinch is the browser's.
    const pinch = touch(
      'touchmove',
      row,
      [{...first, x: 60}],
      [{...first, x: 60}, second],
      48,
    );
    expect(pinch.defaultPrevented).toBe(false);
    expect(states).toEqual([]);
  });

  it('keeps a claimed one-finger drag when a second finger lands anywhere (AST-094 FR10)', () => {
    const {row, text} = mount('<div id="row"></div><p id="text">plain</p>');
    const swipe = new PanGestureRecognizer({
      name: 'swipe',
      direction: 'horizontal',
      maximumNumberOfTouches: 1,
    });
    detachers.push(host.attach(row, swipe));
    const first = {id: 1, x: 10, y: 10};
    touch('touchstart', row, [first], [first], 0);
    touch('touchmove', row, [{...first, x: 40}], [{...first, x: 40}], 16);
    expect(swipe.state).toBe('began');
    const second = {id: 2, x: 200, y: 300};
    touch('touchstart', text, [second], [{...first, x: 40}, second], 32);
    const drag = touch(
      'touchmove',
      row,
      [{...first, x: 80}],
      [{...first, x: 80}, second],
      48,
    );
    expect(swipe.state).toBe('changed');
    expect(drag.defaultPrevented).toBe(true);
  });
});

describe('a delivered press keeps its touch', () => {
  it('cancels the browser pan once the consumer keeps the touch, and not before', () => {
    const {row} = mount('<div id="row"></div>');
    class Keeper extends RecordingConsumer {
      kept = false;
      keepsTouch(): boolean {
        return this.kept;
      }
    }
    const control = new Keeper();
    detachers.push(host.attachConsumer(row, control));
    const finger = {id: 1, x: 10, y: 10};
    touch('touchstart', row, [finger], [finger], 0);
    // Before the press is delivered, a move still scrolls.
    const early = touch(
      'touchmove',
      row,
      [{...finger, y: 14}],
      [{...finger, y: 14}],
      40,
    );
    expect(early.defaultPrevented).toBe(false);
    // Delivered (highlighted past the content delay): the touch is the control's.
    control.kept = true;
    const late = touch(
      'touchmove',
      row,
      [{...finger, y: 54}],
      [{...finger, y: 54}],
      200,
    );
    expect(late.defaultPrevented).toBe(true);
    expect(control.events.some(event => event.startsWith('cancelled'))).toBe(
      false,
    );
    touch('touchend', row, [{...finger, y: 54}], [], 260);
  });
});

describe('detaching a keepsTouch press tracker', () => {
  it('removes its blocking touchmove listener while the element keeps its recognizers', () => {
    const {row} = mount('<div id="row"></div>');
    const active = new Set<EventListenerOrEventListenerObject>();
    const add = row.addEventListener.bind(row);
    const remove = row.removeEventListener.bind(row);
    vi.spyOn(row, 'addEventListener').mockImplementation(
      (type, listener, options) => {
        if (
          type === 'touchmove' &&
          listener != null &&
          typeof options === 'object' &&
          options.passive === false
        ) {
          active.add(listener);
        }
        add(type, listener, options);
      },
    );
    vi.spyOn(row, 'removeEventListener').mockImplementation(
      (type, listener, options) => {
        if (type === 'touchmove' && listener != null) {
          active.delete(listener);
        }
        remove(type, listener, options);
      },
    );
    // A tap decides at the lift: on its own it needs no blocking listener.
    detachers.push(host.attach(row, new TapGestureRecognizer({name: 'tap'})));
    expect(active.size).toBe(0);
    class Keeper extends RecordingConsumer {
      keepsTouch(): boolean {
        return true;
      }
    }
    const detach = host.attachConsumer(row, new Keeper());
    expect(active.size).toBe(1);
    detach();
    expect(active.size).toBe(0);
  });
});

describe('GestureHost.fingersDown', () => {
  it('counts every finger on the screen, one on a plain element too', () => {
    const {handle, row} = mount(
      '<div id="handle"></div><div id="row">plain</div>',
    );
    expect(host.fingersDown()).toBe(0);
    detachers.push(
      host.attach(handle, new LongPressGestureRecognizer({name: 'hold'})),
    );
    const first = {id: 1, x: 10, y: 10, target: handle};
    const second = {id: 2, x: 200, y: 10, target: row};
    touch('touchstart', handle, [first], [first], 0);
    expect(host.fingersDown()).toBe(1);
    // The second finger lands on an element no recognizer is attached to.
    touch('touchstart', row, [second], [first, second], 16);
    expect(host.fingersDown()).toBe(2);
    // A lift lowers it.
    touch('touchend', row, [second], [first], 32);
    expect(host.fingersDown()).toBe(1);
    touch('touchend', handle, [first], [], 48);
    expect(host.fingersDown()).toBe(0);
  });

  it('drops to what a touchcancel lists', () => {
    const {handle, row} = mount(
      '<div id="handle"></div><div id="row">plain</div>',
    );
    detachers.push(
      host.attach(handle, new LongPressGestureRecognizer({name: 'hold'})),
    );
    const first = {id: 1, x: 10, y: 10, target: handle};
    const second = {id: 2, x: 200, y: 10, target: row};
    touch('touchstart', handle, [first], [first], 0);
    touch('touchstart', row, [second], [first, second], 16);
    expect(host.fingersDown()).toBe(2);
    // The system takes every finger.
    touch('touchcancel', handle, [first, second], [], 32);
    expect(host.fingersDown()).toBe(0);
  });

  it('reads 0 once the host stops listening', () => {
    const {handle} = mount('<div id="handle"></div>');
    const detach = host.attach(
      handle,
      new LongPressGestureRecognizer({name: 'hold'}),
    );
    const finger = {id: 1, x: 10, y: 10, target: handle};
    touch('touchstart', handle, [finger], [finger], 0);
    expect(host.fingersDown()).toBe(1);
    detach();
    expect(host.fingersDown()).toBe(0);
  });
});

describe('only where the primary pointer is coarse (spec:AST-094 FR19, FR24)', () => {
  /** Quiets the development warning, and returns its spy. */
  function quietWarning() {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    detachers.push(() => warn.mockRestore());
    return warn;
  }

  it('attaches nothing where it is fine: no touch or pointer listener, no style, nothing delivered', () => {
    quietWarning();
    detachers.push(pointerQuery(false).restore);
    const added = vi.spyOn(EventTarget.prototype, 'addEventListener');
    detachers.push(() => added.mockRestore());
    const {box, row} = mount('<div id="box"></div><div id="row"></div>');
    const pan = new PanGestureRecognizer({name: 'pan'});
    const press = new LongPressGestureRecognizer({name: 'press'});
    const consumer = new RecordingConsumer();
    detachers.push(
      host.attach(box, pan),
      host.attach(box, press),
      host.attachConsumer(row, consumer),
    );
    expect(
      added.mock.calls
        .map(([type]) => type)
        .filter(type => /^(touch|pointer)/.test(type)),
    ).toEqual([]);
    // The long press's callout and selection styles stay the browser's.
    expect(box.style.getPropertyValue('user-select')).toBe('');
    const finger = {id: 1, x: 5, y: 5};
    const moved = {id: 1, x: 60, y: 5};
    touch('touchstart', box, [finger], [finger], 0);
    touch('touchmove', box, [moved], [moved], 16);
    touch('touchend', box, [moved], [], 32);
    touch('touchstart', row, [finger], [finger], 100);
    touch('touchend', row, [finger], [], 150);
    expect(pan.state).toBe('possible');
    expect(consumer.events).toEqual([]);
  });

  it('follows the pointer: turning coarse installs it, turning fine cancels the touch in flight and removes it all', () => {
    quietWarning();
    const pointer = pointerQuery(false);
    detachers.push(pointer.restore);
    const {box} = mount('<div id="box"></div>');
    // jsdom drops touch-action, so the writes are observed.
    const set = vi.spyOn(box.style, 'setProperty');
    const pan = new PanGestureRecognizer({name: 'pan'});
    const states: string[] = [];
    pan.addTransitionListener((_current, _from, to) => states.push(to));
    detachers.push(
      host.attach(box, pan),
      host.attach(box, new LongPressGestureRecognizer({name: 'press'})),
    );
    expect(set).not.toHaveBeenCalledWith('touch-action', expect.anything());
    // A tablet undocks its mouse.
    pointer.set(true);
    expect(set).toHaveBeenCalledWith('touch-action', expect.any(String));
    const finger = {id: 1, x: 5, y: 5};
    const moved = {id: 1, x: 40, y: 5};
    touch('touchstart', box, [finger], [finger], 0);
    touch('touchmove', box, [moved], [moved], 16);
    expect(pan.state).toBe('began');
    // It docks one again mid-drag: the drag ends without acting.
    pointer.set(false);
    expect(states).toContain('cancelled');
    expect(box.style.getPropertyValue('user-select')).toBe('');
    const count = states.length;
    const later = {id: 1, x: 80, y: 5};
    touch('touchmove', box, [later], [later], 32);
    touch('touchend', box, [later], [], 48);
    expect(states).toHaveLength(count);
  });

  it("attaches a recognizer that reads each event's pointer where it is fine, with its own listener and style and no warning (spec:AST-057)", () => {
    const warn = quietWarning();
    detachers.push(pointerQuery(false).restore);
    const {box} = mount('<div id="box"></div>');
    const set = vi.spyOn(box.style, 'setProperty');
    const swipe = new PanGestureRecognizer({
      name: 'swipe',
      direction: 'horizontal',
    });
    const states: string[] = [];
    swipe.addTransitionListener((_current, _from, to) => states.push(to));
    detachers.push(host.attach(box, swipe, {perEventPointer: true}));
    expect(set).toHaveBeenCalledWith('touch-action', 'pan-y pinch-zoom');
    const finger = {id: 1, x: 5, y: 5};
    const moved = {id: 1, x: 60, y: 5};
    touch('touchstart', box, [finger], [finger], 0);
    touch('touchmove', box, [moved], [moved], 16);
    touch('touchend', box, [moved], [], 32);
    expect(states).toEqual(expect.arrayContaining(['began', 'ended']));
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps every other recognizer and press consumer beside it inactive where it is fine, and warns for them', () => {
    const warn = quietWarning();
    detachers.push(pointerQuery(false).restore);
    const {box, row} = mount('<div id="box"></div><div id="row"></div>');
    const set = vi.spyOn(row.style, 'setProperty');
    const tap = new TapGestureRecognizer({name: 'tap'});
    const taps: string[] = [];
    tap.addTransitionListener((_current, _from, to) => taps.push(to));
    const consumer = new RecordingConsumer();
    detachers.push(
      host.attach(box, new PanGestureRecognizer({name: 'swipe'}), {
        perEventPointer: true,
      }),
      host.attach(row, tap),
      host.attachConsumer(row, consumer),
    );
    expect(set).not.toHaveBeenCalled();
    const finger = {id: 2, x: 5, y: 5};
    touch('touchstart', row, [finger], [finger], 0);
    touch('touchend', row, [finger], [], 50);
    expect(taps).toEqual([]);
    expect(consumer.events).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('where the pointer is fine, a per-event press tracker takes no mouse press, and attaches with no warning beside one that stays inactive (spec:AST-094 FR19)', () => {
    const warn = quietWarning();
    detachers.push(pointerQuery(false).restore);
    const {stepper, other} = mount(
      '<div id="stepper"></div><div id="other"></div>',
    );
    const bounds = {left: 0, top: 0, right: 100, bottom: 100};
    const tracker = (events: string[]) =>
      new PressTracker({
        getBounds: () => bounds,
        onControlEvent: event => events.push(event),
        onHighlightChange: isHighlighted =>
          events.push(isHighlighted ? 'highlight' : 'unhighlight'),
      });
    const held: string[] = [];
    const inactive: string[] = [];
    detachers.push(
      host.attachConsumer(stepper, tracker(held), {perEventPointer: true}),
    );
    expect(warn).not.toHaveBeenCalled();
    detachers.push(host.attachConsumer(other, tracker(inactive)));
    expect(warn).toHaveBeenCalledTimes(1);
    pointer('pointerdown', stepper, {
      pointerType: 'mouse',
      x: 5,
      y: 5,
      buttons: 1,
      time: 0,
    });
    pointer('pointerup', stepper, {
      pointerType: 'mouse',
      x: 5,
      y: 5,
      time: 600,
    });
    // Press feedback is for a finger: a mouse keeps the desktop's handling,
    // with no paint and no control event.
    expect(held).toEqual([]);
    pointer('pointerdown', other, {
      id: 2,
      pointerType: 'mouse',
      x: 5,
      y: 5,
      buttons: 1,
      time: 700,
    });
    pointer('pointerup', other, {
      id: 2,
      pointerType: 'mouse',
      x: 5,
      y: 5,
      time: 800,
    });
    expect(inactive).toEqual([]);
  });

  it("where the pointer is fine, gives a per-event press tracker's finger its press feedback only: it paints, reports no control event, and the browser keeps the pan (spec:AST-094 FR19)", () => {
    quietWarning();
    const pointer = pointerQuery(false);
    detachers.push(pointer.restore);
    const {stepper} = mount('<div id="stepper"></div>');
    const bounds = {left: 0, top: 0, right: 100, bottom: 100};
    const events: string[] = [];
    const highlights: boolean[] = [];
    const tracker = new PressTracker({
      getBounds: () => bounds,
      keepsTouch: true,
      onControlEvent: event => events.push(event),
      onHighlightChange: isHighlighted => highlights.push(isHighlighted),
    });
    detachers.push(
      host.attachConsumer(stepper, tracker, {perEventPointer: true}),
    );
    const finger = {id: 1, x: 5, y: 5};
    const moved = {id: 1, x: 5, y: 60};
    touch('touchstart', stepper, [finger], [finger], 0);
    // Its press is painted, as under a coarse pointer, and reports nothing.
    expect(highlights).toContain(true);
    expect(events).toEqual([]);
    // But it never keeps the touch from the browser: the page still pans.
    expect(
      touch('touchmove', stepper, [moved], [moved], 16).defaultPrevented,
    ).toBe(false);
    touch('touchend', stepper, [moved], [], 32);
    expect(events).toEqual([]);
    // On a coarse primary pointer the same held press reports its events
    // and keeps its touch.
    pointer.set(true);
    touch('touchstart', stepper, [finger], [finger], 100);
    expect(events).toEqual(['touchDown']);
    expect(
      touch('touchmove', stepper, [moved], [moved], 116).defaultPrevented,
    ).toBe(true);
    touch('touchend', stepper, [moved], [], 132);
  });

  it('keeps it working when the pointer turns fine, as the rest comes down', () => {
    quietWarning();
    const pointer = pointerQuery(true);
    detachers.push(pointer.restore);
    const {box, row} = mount('<div id="box"></div><div id="row"></div>');
    const removed = vi.spyOn(box.style, 'removeProperty');
    const rowSet = vi.spyOn(row.style, 'setProperty');
    const rowRemoved = vi.spyOn(row.style, 'removeProperty');
    const swipe = new PanGestureRecognizer({
      name: 'swipe',
      direction: 'horizontal',
    });
    const states: string[] = [];
    swipe.addTransitionListener((_current, _from, to) => states.push(to));
    detachers.push(
      host.attach(box, swipe, {perEventPointer: true}),
      host.attach(row, new LongPressGestureRecognizer({name: 'press'})),
    );
    expect(rowSet).toHaveBeenCalledWith('touch-action', 'manipulation');
    pointer.set(false);
    expect(rowRemoved).toHaveBeenCalledWith('touch-action');
    // The swipe's own touch-action stays.
    expect(removed).not.toHaveBeenCalledWith('touch-action');
    const finger = {id: 3, x: 5, y: 5};
    const moved = {id: 3, x: 60, y: 5};
    touch('touchstart', box, [finger], [finger], 0);
    touch('touchmove', box, [moved], [moved], 16);
    touch('touchend', box, [moved], [], 32);
    expect(states).toEqual(expect.arrayContaining(['began', 'ended']));
  });

  it('a page hold and a finger-scroll watch register no touch or scroll listener where it is fine, and follow it while they run', () => {
    quietWarning();
    const pointer = pointerQuery(false);
    detachers.push(pointer.restore);
    // On the document or the window, as each listens (jsdom's window carries
    // its own listener methods).
    const added = [
      vi.spyOn(EventTarget.prototype, 'addEventListener'),
      vi.spyOn(window, 'addEventListener'),
    ];
    const removed = [
      vi.spyOn(EventTarget.prototype, 'removeEventListener'),
      vi.spyOn(window, 'removeEventListener'),
    ];
    detachers.push(() => {
      for (const spy of [...added, ...removed]) {
        spy.mockRestore();
      }
    });
    const {list} = mount('<div id="list"></div>');
    detachers.push(
      holdPageScroll(document, () => true),
      watchFingerScrolls(host, list),
    );
    const types = (spies: typeof added) =>
      spies
        .flatMap(spy => spy.mock.calls.map(([type]) => type))
        .filter(type => /^(touch|scroll)/.test(type));
    expect(types(added)).toEqual([]);
    // The hold reads the pointer at its first touch contact: still fine.
    document.body.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        composed: true,
        pointerType: 'touch',
      }),
    );
    expect(types(added)).toEqual([]);
    pointer.set(true);
    expect(types(added)).toEqual(
      expect.arrayContaining([
        'touchstart',
        'touchmove',
        'scroll',
        'scrollend',
      ]),
    );
    pointer.set(false);
    expect(types(removed)).toEqual(
      expect.arrayContaining([
        'touchstart',
        'touchmove',
        'scroll',
        'scrollend',
      ]),
    );
    expect(isFingerScroll(host, list)).toBe(false);
  });

  it('warns once in development when something attaches where it is fine', () => {
    const warn = quietWarning();
    detachers.push(pointerQuery(false).restore);
    const {a, b} = mount('<div id="a"></div><div id="b"></div>');
    detachers.push(
      host.attach(a, new PanGestureRecognizer()),
      host.attach(b, new TapGestureRecognizer()),
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain(
      'where the primary pointer is fine',
    );
  });
});
