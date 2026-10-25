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
import {GestureHost} from '../GestureHost';
import {HoverGestureRecognizer} from '../HoverGestureRecognizer';
import {LongPressGestureRecognizer} from '../LongPressGestureRecognizer';
import {PanGestureRecognizer} from '../PanGestureRecognizer';
import {TapGestureRecognizer} from '../TapGestureRecognizer';
import {createNativeScrollProbe} from '../nativeScroll';
import {ManualClock, RecordingConsumer} from './harness';

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
});

afterEach(() => {
  for (const detach of detachers) {
    detach();
  }
  document.body.innerHTML = '';
});

describe('GestureHost', () => {
  it('sets touch-action and the long-press styles on attach, and restores them on detach', () => {
    const {box} = mount('<div id="box" style="color: red"></div>');
    const set = vi.spyOn(box.style, 'setProperty');
    const remove = vi.spyOn(box.style, 'removeProperty');
    const detachPan = host.attach(
      box,
      new PanGestureRecognizer({direction: 'horizontal'}),
    );
    const detachPress = host.attach(box, new LongPressGestureRecognizer());
    expect(set).toHaveBeenCalledWith('touch-action', 'pan-y pinch-zoom');
    expect(set).toHaveBeenCalledWith('-webkit-touch-callout', 'none');
    expect(set).toHaveBeenCalledWith('user-select', 'none');
    detachPress();
    expect(remove).toHaveBeenCalledWith('-webkit-touch-callout');
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

  it('gives a claimed one-finger pan up when a second finger lands, so the pinch is the browser’s', () => {
    const {box} = mount('<div id="box"></div>');
    const pan = new PanGestureRecognizer({maximumNumberOfTouches: 1});
    detachers.push(host.attach(box, pan));
    const first = {id: 1, x: 10, y: 10};
    touch('touchstart', box, [first], [first], 0);
    const moved = {...first, x: 40};
    touch('touchmove', box, [moved], [moved], 16);
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
    expect(pan.state).not.toBe('began');
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

  it("cancels a one-way pan's moves from its claim distance, before it begins, and keeps the touch through a reversal", () => {
    const {card} = mount('<div id="card"></div>');
    const pan = new PanGestureRecognizer({name: 'pan', direction: 'up'});
    detachers.push(host.attach(card, pan));
    const finger = {id: 1, x: 50, y: 100};
    touch('touchstart', card, [finger], [finger], 0);
    const at = (y: number, time: number) =>
      touch('touchmove', card, [{...finger, y}], [{...finger, y}], time);
    expect(at(97, 16).defaultPrevented).toBe(false);
    expect(at(95, 32).defaultPrevented).toBe(true);
    expect(pan.state).toBe('possible');
    expect(pan.isClaimCommitted).toBe(true);
    // Safari would give the page nothing now: the reversal is the pan's.
    expect(at(104, 48).defaultPrevented).toBe(true);
    expect(pan.state).toBe('possible');
    expect(at(112, 64).defaultPrevented).toBe(true);
    expect(pan.state).toBe('began');
    touch('touchend', card, [{...finger, y: 112}], [], 80);
    // A drag that starts the other way is the page's.
    const down = {id: 2, x: 50, y: 100};
    touch('touchstart', card, [down], [down], 100);
    const downAt = (y: number, time: number) =>
      touch('touchmove', card, [{...down, y}], [{...down, y}], time);
    expect(downAt(106, 116).defaultPrevented).toBe(false);
    expect(downAt(112, 132).defaultPrevented).toBe(false);
    touch('touchend', card, [{...down, y: 112}], [], 148);
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

  describe('finger scrolls', () => {
    it('reads a scroll while a finger that landed inside is down as the finger’s, until the scroller’s scrollend', () => {
      const {list, row} = mount('<div id="list"><div id="row"></div></div>');
      detachers.push(host.watchFingerScrolls(list));
      const finger = {id: 1, x: 10, y: 10};
      touch('touchstart', row, [finger], [finger], 0);
      list.dispatchEvent(new Event('scroll'));
      expect(host.isFingerScroll(list)).toBe(true);
      // The lift starts the momentum: still the finger's scroll.
      touch('touchend', row, [finger], [], 120);
      list.dispatchEvent(new Event('scroll'));
      expect(host.isFingerScroll(list)).toBe(true);
      list.dispatchEvent(new Event('scrollend'));
      expect(host.isFingerScroll(list)).toBe(false);
    });

    it('reads a scroll with no finger down as the program’s, even right after a tap', () => {
      const {list, row} = mount('<div id="list"><div id="row"></div></div>');
      detachers.push(host.watchFingerScrolls(list));
      list.dispatchEvent(new Event('scroll'));
      expect(host.isFingerScroll(list)).toBe(false);
      // A tap whose click scrolls the list (a scrollTo after the lift).
      const finger = {id: 1, x: 10, y: 10};
      touch('touchstart', row, [finger], [finger], 0);
      touch('touchend', row, [finger], [], 80);
      list.dispatchEvent(new Event('scroll'));
      expect(host.isFingerScroll(list)).toBe(false);
    });

    it('reads the page’s own scroll on the document', () => {
      const {row} = mount('<div id="row"></div>');
      detachers.push(host.watchFingerScrolls(document));
      const finger = {id: 1, x: 10, y: 10};
      touch('touchstart', row, [finger], [finger], 0);
      document.dispatchEvent(new Event('scroll'));
      expect(host.isFingerScroll(document)).toBe(true);
      touch('touchend', row, [finger], [], 120);
      document.dispatchEvent(new Event('scrollend'));
      expect(host.isFingerScroll(document)).toBe(false);
    });

    it('does not count a finger down outside the scroller', () => {
      const {list, other} = mount(
        '<div id="list"><div id="row"></div></div><div id="other"></div>',
      );
      detachers.push(host.watchFingerScrolls(list));
      const finger = {id: 1, x: 10, y: 10};
      touch('touchstart', other, [finger], [finger], 0);
      list.dispatchEvent(new Event('scroll'));
      expect(host.isFingerScroll(list)).toBe(false);
    });

    it('keeps a scroll that ends while the finger still rests the finger’s until the lift', () => {
      const {list, row} = mount('<div id="list"><div id="row"></div></div>');
      detachers.push(host.watchFingerScrolls(list));
      const finger = {id: 1, x: 10, y: 10};
      touch('touchstart', row, [finger], [finger], 0);
      list.dispatchEvent(new Event('scroll'));
      list.dispatchEvent(new Event('scrollend'));
      expect(host.isFingerScroll(list)).toBe(true);
      // Lifting without moving the list again ends it.
      touch('touchend', row, [finger], [], 300);
      expect(host.isFingerScroll(list)).toBe(false);
    });

    it('forgets a scroller once nobody watches it', () => {
      const {list, row} = mount('<div id="list"><div id="row"></div></div>');
      const stop = host.watchFingerScrolls(list);
      const finger = {id: 1, x: 10, y: 10};
      touch('touchstart', row, [finger], [finger], 0);
      list.dispatchEvent(new Event('scroll'));
      expect(host.isFingerScroll(list)).toBe(true);
      stop();
      expect(host.isFingerScroll(list)).toBe(false);
      list.dispatchEvent(new Event('scroll'));
      expect(host.isFingerScroll(list)).toBe(false);
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

  it('locks nothing for a recognizer that would not take the touch', () => {
    const {slider} = mount('<div id="slider"></div>');
    const drag = new PanGestureRecognizer({
      name: 'drag',
      direction: 'horizontal',
      preventsTextSelection: true,
    });
    detachers.push(host.attach(slider, drag));
    drag.setEnabled(false);
    const finger = {id: 1, x: 10, y: 10};
    touch('touchstart', slider, [finger], [finger], 0);
    expect(slider.style.getPropertyValue('user-select')).toBe('');
    touch('touchend', slider, [finger], [], 40);
  });

  it('turns text selection off on a press-tracked element while a finger is down, and restores it', () => {
    const {row, text} = mount(
      '<div id="row" style="user-select: text"><span id="text">Row</span></div>',
    );
    detachers.push(host.attachConsumer(row, new RecordingConsumer()));
    const finger = {id: 1, x: 5, y: 5};
    touch('touchstart', text, [finger], [finger], 0);
    expect(row.style.getPropertyValue('user-select')).toBe('none');
    touch('touchend', text, [finger], [], 600);
    expect(row.style.getPropertyValue('user-select')).toBe('text');
  });

  it('locks a delegated pressable only when it takes the touch, and holds the lock until the last finger lifts', () => {
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
    touch('touchend', row, [one], [two], 100);
    expect(row.style.getPropertyValue('user-select')).toBe('none');
    touch('touchend', row, [two], [], 200);
    expect(row.style.getPropertyValue('user-select')).toBe('');
    touch('touchstart', off, [one], [one], 300);
    expect(off.style.getPropertyValue('user-select')).toBe('');
    touch('touchend', off, [one], [], 400);
  });

  it('keeps selection for a mouse and for a pan that does not ask, and locks a pan that asks and a pen', () => {
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
          preventsTextSelection: true,
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
    pointer('pointerdown', row, {
      pointerType: 'pen',
      ...at,
      buttons: 1,
      time: 100,
    });
    expect(row.style.getPropertyValue('user-select')).toBe('none');
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

  it('locks a checkbox under the finger inside a locked element, which WebKit makes selectable, but never a text field', () => {
    const {row, check, field} = mount(
      '<div id="row"><input id="check" type="checkbox"><input id="field"></div>',
    );
    detachers.push(host.attachConsumer(row, new RecordingConsumer()));
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

  it('cancels a one-finger pan the decision says would scroll the page, for the rest of its touch', () => {
    const {scrim} = mount('<div id="scrim"></div>');
    const decide = vi.fn(() => true);
    detachers.push(host.holdPageScroll(decide));

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
    detachers.push(host.holdPageScroll(decide));

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
    detachers.push(host.holdPageScroll(() => false));

    touch('touchstart', list, at(1, 100, 300), at(1, 100, 300), 0);
    expect(
      touch('touchmove', list, at(1, 100, 250), at(1, 100, 250), 16)
        .defaultPrevented,
    ).toBe(false);
  });

  it('never cancels a two-finger gesture, so pinch-zoom keeps working', () => {
    const {scrim} = mount('<div id="scrim"></div>');
    const decide = vi.fn(() => true);
    detachers.push(host.holdPageScroll(decide));
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
    detachers.push(host.holdPageScroll(decide));

    touch('touchstart', inner, at(1, 100, 300), at(1, 100, 300), 0);
    touch('touchmove', inner, at(1, 100, 250), at(1, 100, 250), 16);

    expect(decide).toHaveBeenCalledWith(inner, 0, -50);
  });

  it('stacks holds and stops judging pans once the last one is released', () => {
    const {scrim} = mount('<div id="scrim"></div>');
    const releaseFirst = host.holdPageScroll(() => true);
    const releaseSecond = host.holdPageScroll(() => true);
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

  it('gives a one-finger pan up when a second finger lands anywhere, so the browser can pinch', () => {
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
    expect(['cancelled', 'failed', 'possible']).toContain(swipe.state);
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
