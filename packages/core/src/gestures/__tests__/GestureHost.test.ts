// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file GestureHost.test.ts
 * @input A GestureHost on the jsdom document, real DOM listeners, and
 *   dispatched touch, pointer, click, contextmenu and scroll events with
 *   explicit timestamps
 * @output The DOM integration: hit-path collection (shadow DOM included),
 *   touch-action negotiation, cancelling touchmove only while claimed,
 *   click suppression and replay, browser takeover, the mouse path, hover,
 *   context menus, focus loss
 * @position jsdom integration tests of packages/core/src/gestures
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {UIKIT_GESTURES} from '../../motion/uikit/gestures';
import {GestureHost} from '../GestureHost';
import {HoverGestureRecognizer} from '../HoverGestureRecognizer';
import {LongPressGestureRecognizer} from '../LongPressGestureRecognizer';
import {PanGestureRecognizer} from '../PanGestureRecognizer';
import {lockSelection} from '../selectionLock';
import {TapGestureRecognizer} from '../TapGestureRecognizer';
import {createNativeScrollProbe} from '../nativeScroll';
import {ManualClock, RecordingConsumer} from './harness';
import type {GestureTouch} from '../types';

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
  return () => {
    window.matchMedia = matchMedia;
  };
}

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
      // The author's rule outranks the host's zero-specificity rule, which
      // applies where the author sets nothing.
      const touchAction =
        element.getAttribute('data-touch-action') ??
        element.getAttribute('data-astryx-touch-action');
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

/** The host's touch-action rules in a document or shadow root. */
function hostRules(root: Document | ShadowRoot): string {
  const adopted = (root.adoptedStyleSheets ?? []).flatMap(sheet =>
    [...sheet.cssRules].map(rule => rule.cssText),
  );
  const styles = [...root.querySelectorAll('style')].map(
    style => style.textContent ?? '',
  );
  return [...adopted, ...styles].join('\n');
}

/**
 * Make `CSS.supports` answer as iOS WebKit does for its touch callout: there
 * the selection lock is an inline style (`spec:AST-094` FR41), which these
 * cases read.
 */
function asIosWebKit(): () => void {
  const original = globalThis.CSS;
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: {
      ...original,
      supports: (query: string) => query === '(-webkit-touch-callout: none)',
    },
  });
  return () => {
    Object.defineProperty(globalThis, 'CSS', {
      configurable: true,
      value: original,
    });
  };
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
  host = new GestureHost(document, {clock, isPrimaryPointerCoarse: () => true});
  detachers = [];
});

afterEach(() => {
  for (const detach of detachers) {
    detach();
  }
  document.body.innerHTML = '';
});

describe('GestureHost', () => {
  it('tells a recognizer tracking a finger about a second finger on plain page content, and leaves that finger to the page (spec:AST-094 FR28)', () => {
    const {box} = mount('<div id="box"></div><p id="page">text</p>');
    const page = document.getElementById('page')!;
    const elsewhere: number[] = [];
    class Recorder extends LongPressGestureRecognizer {
      protected override touchBeganElsewhere(
        touches: ReadonlyArray<GestureTouch>,
      ): void {
        elsewhere.push(...touches.map(t => t.id));
      }
    }
    const recorder = new Recorder({name: 'recorder'});
    detachers.push(host.attach(box, recorder));
    const first = {id: 1, x: 10, y: 10};
    touch('touchstart', box, [first], [first], 0);
    const second = {id: 2, x: 200, y: 300};
    const start = touch('touchstart', page, [second], [first, second], 20);
    expect(elsewhere).toHaveLength(1);
    expect(start.defaultPrevented).toBe(false);
    const moved = {...second, y: 340};
    const move = touch('touchmove', page, [moved], [first, moved], 36);
    expect(move.defaultPrevented).toBe(false);
    const end = touch('touchend', page, [moved], [first], 50);
    expect(end.defaultPrevented).toBe(false);
    touch('touchend', box, [first], [], 60);
  });

  it('leaves a finger on plain page content alone when no finger is being tracked', () => {
    const {box} = mount('<div id="box"></div><p id="page">text</p>');
    const page = document.getElementById('page')!;
    const elsewhere: number[] = [];
    class Recorder extends LongPressGestureRecognizer {
      protected override touchBeganElsewhere(
        touches: ReadonlyArray<GestureTouch>,
      ): void {
        elsewhere.push(...touches.map(t => t.id));
      }
    }
    detachers.push(host.attach(box, new Recorder({name: 'recorder'})));
    const finger = {id: 1, x: 200, y: 300};
    touch('touchstart', page, [finger], [finger], 0);
    touch('touchend', page, [finger], [], 30);
    expect(elsewhere).toEqual([]);
  });

  it("does not read a recognizer's own scroll write as the browser taking the finger (spec:AST-094 FR30)", async () => {
    const {list} = mount('<div id="list"><div id="row"></div></div>');
    scrollable(list, {scrollHeight: 1000, clientHeight: 200});
    const row = document.getElementById('row')!;
    // Tolerant enough to keep tracking a finger that has travelled the
    // press slop: only such a finger's touch can be the browser's pan.
    const press = new LongPressGestureRecognizer({
      name: 'press',
      allowableMovement: 100,
    });
    detachers.push(host.attach(row, press));
    const finger = {id: 1, x: 10, y: 10};
    touch('touchstart', row, [finger], [finger], 0);
    const moved = {...finger, y: 40};
    touch('touchmove', row, [moved], [moved], 16);
    host.ownScroll(list);
    list.dispatchEvent(new Event('scroll'));
    expect(press.numberOfTouches).toBe(1);
    // After the next frame, a scroll nobody announced is the browser's again.
    await new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    await new Promise(resolve => requestAnimationFrame(resolve));
    list.dispatchEvent(new Event('scroll'));
    expect(press.numberOfTouches).toBe(0);
  });

  it("keeps a recognizer's own-scroll exemption until the newest call's frame has passed, so an autoscroll every frame keeps its finger (spec:AST-094 FR30)", async () => {
    const {list} = mount('<div id="list"><div id="row"></div></div>');
    scrollable(list, {scrollHeight: 1000, clientHeight: 200});
    const row = document.getElementById('row')!;
    const press = new LongPressGestureRecognizer({
      name: 'press',
      allowableMovement: 100,
    });
    detachers.push(host.attach(row, press));
    const finger = {id: 1, x: 10, y: 10};
    touch('touchstart', row, [finger], [finger], 0);
    const moved = {...finger, y: 40};
    touch('touchmove', row, [moved], [moved], 16);
    const frame = async () =>
      new Promise(resolve => requestAnimationFrame(resolve));
    // An edge autoscroll writes every frame, announcing each write.
    host.ownScroll(list);
    await frame();
    host.ownScroll(list);
    await frame();
    // The first call's frame has passed, the newest one's has not.
    list.dispatchEvent(new Event('scroll'));
    expect(press.numberOfTouches).toBe(1);
  });

  it('watches the pointer kind only while something is attached (spec:AST-094 FR24)', () => {
    const {box} = mount('<div id="box"></div>');
    const add = vi.fn();
    const remove = vi.fn();
    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: add,
      removeEventListener: remove,
    })) as unknown as typeof window.matchMedia;
    try {
      const host2 = new GestureHost(document, {clock});
      expect(add).not.toHaveBeenCalled();
      const detach = host2.attach(box, new PanGestureRecognizer());
      expect(add).toHaveBeenCalledTimes(1);
      detach();
      expect(remove).toHaveBeenCalledWith('change', add.mock.calls[0][1]);
    } finally {
      window.matchMedia = matchMedia;
    }
  });

  it('sets touch-action only while the primary pointer is coarse and a recognizer is enabled (spec:AST-094 FR19)', () => {
    const {box} = mount('<div id="box"></div>');
    const mark = () => box.getAttribute('data-astryx-touch-action');
    let coarse = false;
    const host2 = new GestureHost(document, {
      clock,
      isPrimaryPointerCoarse: () => coarse,
    });
    const pan = new PanGestureRecognizer({direction: 'horizontal'});
    const detach = host2.attach(box, pan);
    expect(mark()).toBeNull();
    coarse = true;
    host2.update(box);
    expect(mark()).toBe('pan-y pinch-zoom');
    pan.setEnabled(false);
    expect(mark()).toBeNull();
    pan.setEnabled(true);
    expect(mark()).toBe('pan-y pinch-zoom');
    coarse = false;
    host2.update(box);
    expect(mark()).toBeNull();
    detach();
  });

  it('registers no document listener for a disabled consumer until it is enabled (spec:AST-094 FR24)', () => {
    const {box} = mount('<div id="box"></div>');
    const added = vi.spyOn(document, 'addEventListener');
    const removed = vi.spyOn(document, 'removeEventListener');
    added.mockClear();
    removed.mockClear();
    const types = (spy: typeof added) =>
      spy.mock.calls
        .map(call => call[0])
        .filter(t => /^(touch|pointer)/.test(t));
    const coarse = new GestureHost(document, {
      clock,
      isPrimaryPointerCoarse: () => true,
    });
    let enabled = false;
    const consumer = new RecordingConsumer();
    Object.assign(consumer, {isEnabled: () => enabled});
    const detach = coarse.attachConsumer(box, consumer);
    expect(types(added)).toEqual([]);
    enabled = true;
    coarse.update(box);
    expect(types(added)).toContain('touchstart');
    enabled = false;
    coarse.update(box);
    expect(types(removed)).toContain('touchstart');
    detach();
  });

  it('stops listening when a detach leaves an element only disabled recognizers, or a consumer leaves only them (spec:AST-094 FR24)', () => {
    const {box} = mount('<div id="box"></div>');
    const removed = vi.spyOn(document, 'removeEventListener');
    const types = () =>
      removed.mock.calls
        .map(call => call[0])
        .filter(t => /^(touch|pointer)/.test(t));
    const coarse = new GestureHost(document, {
      clock,
      isPrimaryPointerCoarse: () => true,
    });
    const detachOff = coarse.attach(
      box,
      new PanGestureRecognizer({isEnabled: false}),
    );
    const detachOn = coarse.attach(box, new TapGestureRecognizer());
    removed.mockClear();
    detachOn();
    expect(types()).toContain('touchstart');
    const detachConsumer = coarse.attachConsumer(box, new RecordingConsumer());
    removed.mockClear();
    detachConsumer();
    expect(types()).toContain('touchstart');
    detachOff();
  });

  it('registers no document listener where the primary pointer is fine, or while nothing enabled is attached (spec:AST-094 FR19, FR24)', () => {
    const {box} = mount('<div id="box"></div>');
    const added = vi.spyOn(document, 'addEventListener');
    const removed = vi.spyOn(document, 'removeEventListener');
    added.mockClear();
    removed.mockClear();
    const types = (spy: typeof added) =>
      spy.mock.calls
        .map(call => call[0])
        .filter(t => /^(touch|pointer)/.test(t));
    // A fine primary pointer: nothing is registered, an element's touchmove
    // listener included.
    const fine = new GestureHost(document, {
      clock,
      isPrimaryPointerCoarse: () => false,
    });
    const boxAdded = vi.spyOn(box, 'addEventListener');
    const detachFine = fine.attach(box, new PanGestureRecognizer());
    expect(types(added)).toEqual([]);
    expect(boxAdded).not.toHaveBeenCalled();
    detachFine();
    // A coarse one, with only a disabled recognizer: still nothing.
    const coarse = new GestureHost(document, {
      clock,
      isPrimaryPointerCoarse: () => true,
    });
    const pan = new PanGestureRecognizer({isEnabled: false});
    const detach = coarse.attach(box, pan);
    expect(types(added)).toEqual([]);
    expect(boxAdded).not.toHaveBeenCalled();
    // Enabling it registers the listeners; disabling removes them.
    pan.setEnabled(true);
    expect(types(added)).toContain('touchstart');
    expect(boxAdded).toHaveBeenCalledWith('touchmove', expect.any(Function), {
      passive: false,
    });
    pan.setEnabled(false);
    expect(types(removed)).toContain('touchstart');
    detach();
  });

  it('sets touch-action on attach and restores it on detach; the long-press styles wait for a held press', () => {
    // The author's value is read in the next frame (FR18): fake the frame.
    vi.useFakeTimers({toFake: ['setTimeout', 'requestAnimationFrame']});
    detachers.push(() => vi.useRealTimers());
    const {box} = mount('<div id="box" style="color: red"></div>');
    const set = vi.spyOn(box.style, 'setProperty');
    const remove = vi.spyOn(box.style, 'removeProperty');
    const detachPan = host.attach(
      box,
      new PanGestureRecognizer({direction: 'horizontal'}),
    );
    const detachPress = host.attach(box, new LongPressGestureRecognizer());
    vi.advanceTimersByTime(16);
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

  it('leaves a second finger no recognizer owns to the page while the claimed one is held (spec:AST-094 FR19)', () => {
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

  it('lets a scroll take an unclaimed touch from 10 px of travel, straight or diagonal, and not before (spec:AST-094 FR20)', () => {
    const takenAfter = (dx: number, dy: number) => {
      const {list, row} = mount('<div id="list"><div id="row"></div></div>');
      const consumer = new RecordingConsumer();
      const detach = host.attachConsumer(row, consumer);
      const finger = {id: 1, x: 10, y: 10};
      touch('touchstart', row, [finger], [finger], 0);
      const moved = {...finger, x: 10 + dx, y: 10 + dy};
      touch('touchmove', row, [moved], [moved], 16);
      list.dispatchEvent(new Event('scroll'));
      const taken = consumer.events.some(event =>
        event.startsWith('cancelled'),
      );
      touch('touchend', row, [moved], [], 32);
      detach();
      return taken;
    };
    expect(takenAfter(0, 9)).toBe(false);
    expect(takenAfter(0, 10)).toBe(true);
    // 9.9 px and 11.3 px from where it landed.
    expect(takenAfter(7, 7)).toBe(false);
    expect(takenAfter(8, 8)).toBe(true);
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
    vi.useFakeTimers({toFake: ['setTimeout', 'requestAnimationFrame']});
    const restore = touchActionFromData();
    try {
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
      vi.advanceTimersByTime(16);
      // manipulation (the hold's) with none, and pan-y pinch-zoom (the
      // pan's) with pan-y, allow the caller's own: its rule stays in force.
      expect(window.getComputedStyle(trigger).touchAction).toBe('none');
      expect(window.getComputedStyle(strip).touchAction).toBe('pan-y');
      expect(set).not.toHaveBeenCalledWith('touch-action', expect.anything());
      expect(setStrip).not.toHaveBeenCalledWith(
        'touch-action',
        expect.anything(),
      );
    } finally {
      restore();
      vi.useRealTimers();
    }
  });

  it('marks an element with its derived touch-action as it attaches, under a rule any author rule outranks, with no inline write and no style read (spec:AST-094 FR18, DEC-8)', () => {
    const restore = touchActionFromData();
    try {
      const {box} = mount('<div id="box"></div>');
      const set = vi.spyOn(box.style, 'setProperty');
      const read = vi.mocked(window.getComputedStyle);
      read.mockClear();
      detachers.push(
        host.attach(box, new PanGestureRecognizer({direction: 'horizontal'})),
      );
      expect(box.getAttribute('data-astryx-touch-action')).toBe(
        'pan-y pinch-zoom',
      );
      expect(hostRules(document)).toContain(
        ':where([data-astryx-touch-action="pan-y pinch-zoom"])',
      );
      expect(set).not.toHaveBeenCalledWith('touch-action', expect.anything());
      expect(read).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("keeps an author rule in force from the first frame, and writes the intersection inline only where it is narrower than the author's (spec:AST-094 FR18)", () => {
    vi.useFakeTimers({toFake: ['setTimeout', 'requestAnimationFrame']});
    const restore = touchActionFromData();
    try {
      const {both, strip} = mount(
        '<div id="both" data-touch-action="pan-x pan-y"></div><div id="strip" data-touch-action="pan-y"></div>',
      );
      const setBoth = vi.spyOn(both.style, 'setProperty');
      const setStrip = vi.spyOn(strip.style, 'setProperty');
      detachers.push(
        host.attach(both, new PanGestureRecognizer({direction: 'horizontal'})),
        host.attach(strip, new PanGestureRecognizer({direction: 'horizontal'})),
      );
      // Before the host reads anything, the author's value stands.
      expect(both.getAttribute('data-astryx-touch-action')).toBe(
        'pan-y pinch-zoom',
      );
      expect(window.getComputedStyle(both).touchAction).toBe('pan-x pan-y');
      expect(setBoth).not.toHaveBeenCalledWith(
        'touch-action',
        expect.anything(),
      );
      vi.advanceTimersByTime(16);
      // pan-y pinch-zoom with pan-x pan-y allows pan-y: narrower than the
      // author's, so it is written.
      expect(setBoth).toHaveBeenLastCalledWith('touch-action', 'pan-y');
      // With pan-y it is the author's own value: nothing to write.
      expect(setStrip).not.toHaveBeenCalledWith(
        'touch-action',
        expect.anything(),
      );
    } finally {
      restore();
      vi.useRealTimers();
    }
  });

  it('removes the mark when the last recognizer detaches', () => {
    const {box} = mount('<div id="box"></div>');
    const detach = host.attach(
      box,
      new PanGestureRecognizer({direction: 'horizontal'}),
    );
    expect(box.hasAttribute('data-astryx-touch-action')).toBe(true);
    detach();
    expect(box.hasAttribute('data-astryx-touch-action')).toBe(false);
  });

  it('adds the rule to the shadow root an element is in', () => {
    const {box} = mount('<div id="box"></div>');
    const shadow = box.attachShadow({mode: 'open'});
    const inner = document.createElement('div');
    shadow.append(inner);
    detachers.push(host.attach(inner, new LongPressGestureRecognizer()));
    expect(inner.getAttribute('data-astryx-touch-action')).toBe('manipulation');
    expect(hostRules(shadow)).toContain(
      ':where([data-astryx-touch-action="manipulation"])',
    );
  });

  it("is never wider than the author's touch-action, at any frame (spec:AST-094 FR18, DEC-8)", () => {
    vi.useFakeTimers({toFake: ['setTimeout', 'requestAnimationFrame']});
    const restore = touchActionFromData();
    try {
      const {trigger} = mount(
        '<div id="trigger" data-touch-action="none"></div>',
      );
      const set = vi.spyOn(trigger.style, 'setProperty');
      detachers.push(
        host.attach(trigger, new LongPressGestureRecognizer({name: 'hold'})),
      );
      // The author's none outranks the host's manipulation from the attach
      // on, and the read finds nothing to narrow.
      expect(window.getComputedStyle(trigger).touchAction).toBe('none');
      vi.advanceTimersByTime(16);
      expect(window.getComputedStyle(trigger).touchAction).toBe('none');
      expect(set).not.toHaveBeenCalledWith('touch-action', expect.anything());
    } finally {
      restore();
      vi.useRealTimers();
    }
  });

  it('gives an element attached while on screen its touch-action in the attach itself', () => {
    const restore = touchActionFromData();
    try {
      const {box} = mount('<div id="box"></div>');
      detachers.push(host.attach(box, new TapGestureRecognizer({name: 'tap'})));
      expect(window.getComputedStyle(box).touchAction).toBe('manipulation');
    } finally {
      restore();
    }
  });

  it("reads no computed style while attaching: a caller's inline touch-action applies at once, a stylesheet's is read in the next frame", () => {
    vi.useFakeTimers({toFake: ['setTimeout', 'requestAnimationFrame']});
    const restore = touchActionFromData();
    try {
      const {trigger, strip} = mount(
        '<div id="trigger" data-touch-action="none"></div><div id="strip"></div>',
      );
      // jsdom keeps no touch-action in a style: this stands in for the
      // caller's inline `touch-action: pan-y`.
      vi.spyOn(strip.style, 'getPropertyValue').mockImplementation(name =>
        name === 'touch-action' ? 'pan-y' : '',
      );
      const set = vi.spyOn(trigger.style, 'setProperty');
      const setStrip = vi.spyOn(strip.style, 'setProperty');
      const read = vi.mocked(window.getComputedStyle);
      read.mockClear();
      detachers.push(
        host.attach(trigger, new LongPressGestureRecognizer({name: 'hold'})),
        host.attach(
          strip,
          new PanGestureRecognizer({name: 'h', direction: 'horizontal'}),
        ),
      );
      // Attaching forces no style recalc over whatever just mounted.
      expect(read).not.toHaveBeenCalled();
      // The caller's inline value: pan-y pinch-zoom ∩ pan-y, at once.
      expect(setStrip).toHaveBeenLastCalledWith('touch-action', 'pan-y');
      // A stylesheet's value: read once in the next frame, where none is
      // already no wider than both allow.
      vi.advanceTimersByTime(16);
      expect(read).toHaveBeenCalledTimes(1);
      expect(set).not.toHaveBeenCalledWith('touch-action', expect.anything());
    } finally {
      restore();
      vi.useRealTimers();
    }
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

  it('remembers a finger the window blur cancelled until it lifts, and refuses that lift its click: nothing acts (spec:AST-094 FR28)', () => {
    const {box, page} = mount('<div id="box"></div><p id="page">text</p>');
    const tap = new TapGestureRecognizer({name: 'tap'});
    const states: string[] = [];
    tap.addTransitionListener((_r, _from, to) => states.push(to));
    detachers.push(host.attach(box, tap));
    const finger = {id: 1, x: 10, y: 10};
    touch('touchstart', box, [finger], [finger], 0);
    window.dispatchEvent(new Event('blur'));
    // The browser kept the touch alive: its lift would click the box.
    const lift = touch('touchend', box, [finger], [], 80);
    expect(lift.defaultPrevented).toBe(true);
    expect(states).not.toContain('ended');
    // Only that lift: a later finger with the same identifier keeps its
    // click.
    touch('touchstart', page, [finger], [finger], 200);
    expect(touch('touchend', page, [finger], [], 260).defaultPrevented).toBe(
      false,
    );
    // A cancelled finger whose lift never came: the next touch with its
    // identifier is a new finger, and its lift keeps its click too.
    touch('touchstart', box, [finger], [finger], 300);
    window.dispatchEvent(new Event('blur'));
    touch('touchstart', page, [finger], [finger], 400);
    expect(touch('touchend', page, [finger], [], 460).defaultPrevented).toBe(
      false,
    );
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

  it('keeps native long-press selection under a 0 ms long press, a touch-down detector whose hold does nothing (spec:AST-094 FR41)', () => {
    detachers.push(coarsePrimaryPointer());
    const {photo} = mount(
      '<div id="photo" style="user-select: text">Photo</div>',
    );
    detachers.push(
      host.attach(
        photo,
        new LongPressGestureRecognizer({minimumPressDuration: 0}),
      ),
    );
    const set = vi.spyOn(photo.style, 'setProperty');
    const finger = {id: 1, x: 5, y: 5};
    touch('touchstart', photo, [finger], [finger], 0);
    expect(set).not.toHaveBeenCalledWith('user-select', 'none');
    expect(set).not.toHaveBeenCalledWith('-webkit-touch-callout', 'none');
    expect(photo.style.getPropertyValue('user-select')).toBe('text');
    touch('touchend', photo, [finger], [], 1200);
  });

  it('locks for a hold that takes the touch, and nothing where it declines one: a zero-delay hold opts in with its own lock (spec:AST-094 FR41)', () => {
    detachers.push(asIosWebKit());
    detachers.push(coarsePrimaryPointer());
    const {bar, lens, search} = mount(
      '<div id="bar"><div id="lens">Lens</div><button id="search">Search</button></div>',
    );
    // A tab bar's lens: a hold at 0 ms that brings the lock itself, and
    // takes only touches on the lens, not on the search tab beside it.
    detachers.push(
      host.attach(
        bar,
        new LongPressGestureRecognizer({
          minimumPressDuration: 0,
          selectionLock: lockSelection,
          shouldReceiveTouch: (_recognizer, contact) =>
            contact.target instanceof Node && lens.contains(contact.target),
        }),
      ),
    );
    const finger = {id: 1, x: 5, y: 5};
    touch('touchstart', search, [finger], [finger], 0);
    expect(bar.style.getPropertyValue('user-select')).toBe('');
    touch('touchend', search, [finger], [], 100);
    touch('touchstart', lens, [finger], [finger], 200);
    expect(bar.style.getPropertyValue('user-select')).toBe('none');
    touch('touchend', lens, [finger], [], 300);
    expect(bar.style.getPropertyValue('user-select')).toBe('');
  });

  it('on a coarse primary pointer, keeps selection for a mouse, a press-tracked row and a pan that does not ask, and locks a pan that asks', () => {
    detachers.push(asIosWebKit());
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
    detachers.push(asIosWebKit());
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
