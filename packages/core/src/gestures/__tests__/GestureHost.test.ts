// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file GestureHost.test.ts
 * @input A GestureHost on the jsdom document, real DOM listeners, and
 *   dispatched touch, pointer, click, contextmenu and scroll events with
 *   explicit timestamps
 * @output The DOM integration: hit-path collection (shadow DOM included),
 *   touch-action negotiation, cancelling touchmove only while claimed,
 *   click suppression and replay, browser takeover, the mouse path,
 *   context menus, focus loss
 * @position jsdom integration tests of packages/core/src/gestures
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {UIKIT_GESTURES} from '../../motion/uikit/gestures';
import {GestureHost} from '../GestureHost';
import {LongPressGestureRecognizer} from '../LongPressGestureRecognizer';
import {PanGestureRecognizer} from '../PanGestureRecognizer';
import {ScreenEdgePanGestureRecognizer} from '../ScreenEdgePanGestureRecognizer';
import {TapGestureRecognizer} from '../TapGestureRecognizer';
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

/** jsdom computes no layout: give a scroller its metrics. */
function scrollable(
  element: HTMLElement,
  metrics: {
    scrollTop?: number;
    scrollHeight?: number;
    clientHeight?: number;
    scrollLeft?: number;
    scrollWidth?: number;
    clientWidth?: number;
  },
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
  it("measures a screen-edge pan's view, so an edge-zone strip takes the axis at UIKit's 15 px, not 10 (spec:AST-094 FR18)", () => {
    const {strip} = mount('<div id="strip"></div>');
    strip.getBoundingClientRect = () =>
      DOMRect.fromRect({x: 0, y: 0, width: 40, height: 800});
    const pan = new ScreenEdgePanGestureRecognizer({
      name: 'edge',
      edges: ['leading'],
    });
    detachers.push(host.attach(strip, pan));
    const down = {id: 1, x: 5, y: 300};
    touch('touchstart', strip, [down], [down], 0);
    const at14 = {...down, x: 19};
    touch('touchmove', strip, [at14], [at14], 16);
    expect(pan.state).toBe('possible');
    const at15 = {...down, x: 20};
    touch('touchmove', strip, [at15], [at15], 32);
    expect(pan.state).toBe('began');
    touch('touchend', strip, [at15], [], 48);
  });

  it("re-derives a screen-edge pan's touch-action when its box or the viewport resizes, with no listener of its own (spec:AST-094 FR19, FR24, DEC-22)", () => {
    // jsdom has no ResizeObserver: a stand-in the test drives.
    const observed = new Set<Element>();
    const callbacks: (() => void)[] = [];
    class StandInResizeObserver {
      constructor(callback: () => void) {
        callbacks.push(callback);
      }
      observe(target: Element): void {
        observed.add(target);
      }
      unobserve(target: Element): void {
        observed.delete(target);
      }
      disconnect(): void {
        observed.clear();
      }
    }
    const original = Object.getOwnPropertyDescriptor(window, 'ResizeObserver');
    const width = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      value: StandInResizeObserver,
    });
    const listen = vi.spyOn(window, 'addEventListener');
    try {
      const {strip, trail} = mount(
        '<div id="strip"></div><div id="trail"></div>',
      );
      let stripWidth = 40;
      strip.getBoundingClientRect = () =>
        DOMRect.fromRect({x: 0, y: 0, width: stripWidth, height: 800});
      trail.getBoundingClientRect = () =>
        DOMRect.fromRect({x: 1004, y: 0, width: 20, height: 800});
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 1024,
      });
      const leading = new ScreenEdgePanGestureRecognizer({name: 'edge'});
      const detachStrip = host.attach(strip, leading);
      // A leading pan in LTR watches the left side: the viewport cannot move
      // its band, so only its own box is watched.
      expect(observed).toEqual(new Set([strip]));
      const trailing = new ScreenEdgePanGestureRecognizer({
        name: 'back',
        edges: ['trailing'],
      });
      const detachTrail = host.attach(trail, trailing);
      // The trailing pan's band moves with the viewport: the root is watched.
      expect(observed).toEqual(
        new Set([strip, trail, document.documentElement]),
      );
      expect(strip.getAttribute('data-astryx-touch-action')).toBe(
        'pan-y pinch-zoom',
      );
      expect(trail.getAttribute('data-astryx-touch-action')).toBe(
        'pan-y pinch-zoom',
      );
      // The strip grows past the band: its claim goes.
      stripWidth = 390;
      callbacks.forEach(callback => callback());
      expect(strip.hasAttribute('data-astryx-touch-action')).toBe(false);
      // The viewport widens, so the root resizes: the trailing strip no
      // longer sits at its edge.
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 1280,
      });
      callbacks.forEach(callback => callback());
      expect(trail.hasAttribute('data-astryx-touch-action')).toBe(false);
      // A disabled pan is not watched (FR24).
      trailing.setEnabled(false);
      expect(observed).toEqual(new Set([strip]));
      // Nothing is watched once the last edge pan lets go, and no listener
      // was ever added for a resize.
      detachStrip();
      detachTrail();
      expect(observed.size).toBe(0);
      expect(listen).not.toHaveBeenCalledWith(
        'resize',
        expect.anything(),
        expect.anything(),
      );
    } finally {
      listen.mockRestore();
      if (original == null) {
        delete (window as {ResizeObserver?: unknown}).ResizeObserver;
      } else {
        Object.defineProperty(window, 'ResizeObserver', original);
      }
      if (width != null) {
        Object.defineProperty(window, 'innerWidth', width);
      }
    }
  });

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

  it('sets touch-action for every pointer while a recognizer is enabled (spec:AST-094 FR18, FR43)', () => {
    const {box} = mount('<div id="box"></div>');
    const mark = () => box.getAttribute('data-astryx-touch-action');
    let coarse = false;
    const host2 = new GestureHost(document, {
      clock,
      isPrimaryPointerCoarse: () => coarse,
    });
    const pan = new PanGestureRecognizer({direction: 'horizontal'});
    const detach = host2.attach(box, pan);
    // A touchscreen laptop's finger gets it as a phone's does.
    expect(mark()).toBe('pan-y pinch-zoom');
    pan.setEnabled(false);
    expect(mark()).toBeNull();
    pan.setEnabled(true);
    expect(mark()).toBe('pan-y pinch-zoom');
    coarse = true;
    host2.update(box);
    expect(mark()).toBe('pan-y pinch-zoom');
    detach();
    expect(mark()).toBeNull();
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

  it('registers no page listener while idle where the primary pointer is fine, or while nothing enabled is attached (spec:AST-094 FR24, FR43)', () => {
    const {box} = mount('<div id="box"></div>');
    const added = vi.spyOn(document, 'addEventListener');
    const removed = vi.spyOn(document, 'removeEventListener');
    added.mockClear();
    removed.mockClear();
    const types = (spy: typeof added) =>
      spy.mock.calls
        .map(call => call[0])
        .filter(t => /^(touch|pointer)/.test(t));
    // A fine primary pointer: the page has no listener; the element keeps
    // one passive pointerdown for its press and, as a claimer, its blocking
    // touchmove (FR19, a listener FR24 counts apart).
    const fine = new GestureHost(document, {
      clock,
      isPrimaryPointerCoarse: () => false,
    });
    const boxAdded = vi.spyOn(box, 'addEventListener');
    const detachFine = fine.attach(box, new PanGestureRecognizer());
    expect(types(added)).toEqual([]);
    expect(boxAdded.mock.calls.map(call => [call[0], call[2]])).toEqual([
      ['touchmove', {passive: false}],
      ['pointerdown', {capture: true, passive: true}],
    ]);
    detachFine();
    boxAdded.mockClear();
    // A coarse one, with only a disabled recognizer: nothing at all.
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
  it('leaves no touch-action rule in a document or shadow root once its last marked element lets go (spec:AST-094 FR24)', () => {
    const restore = touchActionFromData();
    try {
      const {box, other, outer} = mount(
        '<div id="box"></div><div id="other"></div><div id="outer"></div>',
      );
      const shadow = outer.attachShadow({mode: 'open'});
      shadow.innerHTML = '<div id="inner"></div>';
      const inner = shadow.getElementById('inner') as HTMLElement;
      const releaseBox = host.attach(
        box,
        new PanGestureRecognizer({direction: 'horizontal'}),
      );
      const releaseOther = host.attach(
        other,
        new PanGestureRecognizer({direction: 'vertical'}),
      );
      const releaseInner = host.attach(
        inner,
        new PanGestureRecognizer({direction: 'horizontal'}),
      );
      expect(hostRules(document)).toContain('data-astryx-touch-action');
      expect(hostRules(shadow)).toContain('data-astryx-touch-action');
      // One element still marked keeps its root's rules.
      releaseBox();
      expect(hostRules(document)).toContain('data-astryx-touch-action');
      releaseOther();
      expect(hostRules(document)).not.toContain('data-astryx-touch-action');
      releaseInner();
      expect(hostRules(shadow)).not.toContain('data-astryx-touch-action');
      // A later attach brings its rule back.
      detachers.push(
        host.attach(box, new PanGestureRecognizer({direction: 'horizontal'})),
      );
      expect(hostRules(document)).toContain(
        ':where([data-astryx-touch-action="pan-y pinch-zoom"])',
      );
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
  for (const {keyword, resolved, make, written} of [
    {
      keyword: 'initial',
      resolved: 'auto',
      make: () => new TapGestureRecognizer({name: 'tap'}),
      written: 'manipulation',
    },
    {
      keyword: 'inherit',
      resolved: 'pan-y',
      make: () =>
        new PanGestureRecognizer({name: 'h', direction: 'horizontal'}),
      written: null,
    },
  ]) {
    it(`reads a caller's inline \`touch-action: ${keyword}\` as what it resolves to, never intersecting the keyword itself (spec:AST-094 FR18, DEC-8)`, () => {
      vi.useFakeTimers({toFake: ['setTimeout', 'requestAnimationFrame']});
      const restore = touchActionFromData();
      try {
        // jsdom keeps no touch-action: the inline keyword stands in through
        // getPropertyValue, and what it resolves to through computed style.
        const {box} = mount(
          `<div id="box" data-touch-action="${resolved}"></div>`,
        );
        vi.spyOn(box.style, 'getPropertyValue').mockImplementation(name =>
          name === 'touch-action' ? keyword : '',
        );
        const set = vi.spyOn(box.style, 'setProperty');
        detachers.push(host.attach(box, make()));
        // A keyword names no touch-action of its own: nothing is written
        // from it at once, and never none.
        expect(set).not.toHaveBeenCalledWith('touch-action', expect.anything());
        vi.advanceTimersByTime(16);
        expect(set).not.toHaveBeenCalledWith('touch-action', 'none');
        if (written == null) {
          // What the derived value allows of it is its own value: nothing
          // to narrow.
          expect(set).not.toHaveBeenCalledWith(
            'touch-action',
            expect.anything(),
          );
        } else {
          expect(set).toHaveBeenLastCalledWith('touch-action', written);
        }
      } finally {
        restore();
        vi.useRealTimers();
      }
    });
  }
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

  it('turns selection and the callout off for one held press, only where the hold does something (spec:AST-094 FR41)', () => {
    const {hold, plain} = mount(
      '<div><div id="hold"></div><div id="plain"></div></div>',
    );
    detachers.push(host.attach(hold, new LongPressGestureRecognizer()));
    detachers.push(host.attach(plain, new TapGestureRecognizer()));
    // jsdom drops the prefixed properties, so the writes are observed.
    const set = vi.spyOn(hold.style, 'setProperty');
    const remove = vi.spyOn(hold.style, 'removeProperty');
    const plainSet = vi.spyOn(plain.style, 'setProperty');
    const finger = {id: 1, x: 10, y: 10};
    touch('touchstart', hold, [finger], [finger], 0);
    expect(set).toHaveBeenCalledWith('-webkit-touch-callout', 'none');
    expect(set).toHaveBeenCalledWith('user-select', 'none');
    expect(remove).not.toHaveBeenCalledWith('user-select');
    touch('touchend', hold, [finger], [], 100);
    expect(remove).toHaveBeenCalledWith('-webkit-touch-callout');
    expect(remove).toHaveBeenCalledWith('user-select');
    const other = {id: 2, x: 10, y: 40};
    touch('touchstart', plain, [other], [other], 200);
    expect(plainSet).not.toHaveBeenCalledWith('user-select', 'none');
    touch('touchend', plain, [other], [], 260);
  });

  it('leaves selection and the callout alone on an element attached with manageStyle: false, whose styles the caller keeps', () => {
    const {hold} = mount('<div id="hold"></div>');
    detachers.push(
      host.attach(hold, new LongPressGestureRecognizer(), {manageStyle: false}),
    );
    const set = vi.spyOn(hold.style, 'setProperty');
    const remove = vi.spyOn(hold.style, 'removeProperty');
    const finger = {id: 1, x: 10, y: 10};
    touch('touchstart', hold, [finger], [finger], 0);
    touch('touchend', hold, [finger], [], 100);
    expect(set).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
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

  it('keeps a vertical drag under pan-x when Chromium stops asking after one unconsumed move', () => {
    // The case above turned 90°: a row of a sideways list, dragged down.
    const restore = touchActionFromData();
    try {
      const {list, row} = mount(
        '<div id="list" style="overflow-x: auto"><div id="row" data-touch-action="pan-x pinch-zoom"></div></div>',
      );
      scrollable(list, {scrollLeft: 0, scrollWidth: 1000, clientWidth: 400});
      const consumer = new RecordingConsumer();
      detachers.push(host.attachConsumer(row, consumer));
      const finger = {id: 1, x: 30, y: 100};
      touch('touchstart', row, [finger], [finger], 0);
      // The first move goes unconsumed; Chromium sends the rest uncancelable
      // although pan-x keeps it from panning vertically.
      touch('touchmove', row, [{...finger, y: 120}], [{...finger, y: 120}], 16);
      touch(
        'touchmove',
        row,
        [{...finger, x: 33, y: 140}],
        [{...finger, x: 33, y: 140}],
        32,
        false,
      );
      touch(
        'touchmove',
        row,
        [{...finger, x: 35, y: 160}],
        [{...finger, x: 35, y: 160}],
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

  it('reads a scroll above an unclaimed touch that has travelled as the browser taking it (spec:AST-094 FR20)', () => {
    const {list, row} = mount('<div id="list"><div id="row"></div></div>');
    const tap = new TapGestureRecognizer({name: 'tap'});
    detachers.push(host.attach(row, tap));
    const finger = {id: 1, x: 10, y: 10};
    touch('touchstart', row, [finger], [finger], 0);
    const moved = {...finger, y: 20};
    touch('touchmove', row, [moved], [moved], 16);
    list.dispatchEvent(new Event('scroll'));
    expect(tap.state).toBe('possible');
    expect(tap.numberOfTouches).toBe(0);
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
    // A still finger: the scroll is the page's own (anchoring, a carousel).
    expect(takenAfter(0, 0)).toBe(false);
    expect(takenAfter(0, 9)).toBe(false);
    expect(takenAfter(0, 10)).toBe(true);
    // 9.9 px and 11.3 px from where it landed.
    expect(takenAfter(7, 7)).toBe(false);
    expect(takenAfter(8, 8)).toBe(true);
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

describe('every pointer where the primary pointer is fine (spec:AST-094 FR19, FR24, FR43)', () => {
  /** The page listeners live now, by type: what was added and not removed. */
  function pageListeners(): () => string[] {
    const counts = new Map<string, number>();
    for (const target of [document, window] as EventTarget[]) {
      const add = target.addEventListener.bind(target);
      const remove = target.removeEventListener.bind(target);
      vi.spyOn(target, 'addEventListener').mockImplementation(
        (type, listener, options) => {
          counts.set(type, (counts.get(type) ?? 0) + 1);
          add(type, listener, options);
        },
      );
      vi.spyOn(target, 'removeEventListener').mockImplementation(
        (type, listener, options) => {
          counts.set(type, (counts.get(type) ?? 0) - 1);
          remove(type, listener, options);
        },
      );
    }
    return () =>
      [...counts]
        .filter(
          ([type, count]) =>
            count > 0 &&
            /^(touch|pointer|click|blur|scroll|contextmenu|visibilitychange)/.test(
              type,
            ),
        )
        .map(([type]) => type)
        .sort();
  }

  function fineHost(): GestureHost {
    return new GestureHost(document, {
      clock,
      isPrimaryPointerCoarse: () => false,
    });
  }

  /** A button press with the button and modifier given. */
  function press(
    target: EventTarget,
    init: {pointerType: string; button: number; ctrlKey?: boolean},
  ): void {
    const event = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 9,
      pointerType: init.pointerType,
      clientX: 10,
      clientY: 10,
      button: init.button,
      buttons: init.button === 0 ? 1 : 2,
      ctrlKey: init.ctrlKey ?? false,
    });
    Object.defineProperty(event, 'timeStamp', {value: 0});
    target.dispatchEvent(event);
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('keeps one passive pointerdown listener on each element that uses a gesture and none on the page while idle; a disabled one keeps none', () => {
    const {box, row, off} = mount(
      '<div id="box"></div><div id="row"></div><div id="off"></div>',
    );
    const live = pageListeners();
    const downs = (element: HTMLElement) => {
      const spy = vi.spyOn(element, 'addEventListener');
      return () => spy.mock.calls.filter(call => call[0] === 'pointerdown');
    };
    const boxDowns = downs(box);
    const rowDowns = downs(row);
    const offAdded = vi.spyOn(off, 'addEventListener');
    const fine = fineHost();
    detachers.push(
      fine.attach(box, new PanGestureRecognizer({direction: 'horizontal'})),
      fine.attach(row, new TapGestureRecognizer()),
      fine.attach(off, new TapGestureRecognizer({isEnabled: false})),
    );
    expect(live()).toEqual([]);
    expect(boxDowns()).toEqual([
      ['pointerdown', expect.any(Function), {capture: true, passive: true}],
    ]);
    expect(rowDowns()).toHaveLength(1);
    expect(offAdded).not.toHaveBeenCalled();
  });

  it("installs the page listeners for a mouse's primary-button press, serves it to every recognizer on its path, and removes them as the press ends", () => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'performance']});
    const {outer, box} = mount('<div id="outer"><div id="box"></div></div>');
    const live = pageListeners();
    const fine = fineHost();
    const pan = new PanGestureRecognizer({
      name: 'pan',
      direction: 'horizontal',
    });
    const outerTap = new TapGestureRecognizer({name: 'outer'});
    const states: string[] = [];
    const outerTransitions: string[] = [];
    pan.addListener(r => states.push(r.state));
    outerTap.addTransitionListener((_current, _from, to) =>
      outerTransitions.push(to),
    );
    detachers.push(fine.attach(box, pan), fine.attach(outer, outerTap));
    pointer('pointerdown', box, {
      pointerType: 'mouse',
      x: 10,
      y: 10,
      buttons: 1,
      time: 0,
    });
    expect(live()).toEqual(
      expect.arrayContaining(['click', 'pointermove', 'pointerup']),
    );
    pointer('pointermove', box, {
      pointerType: 'mouse',
      x: 40,
      y: 10,
      buttons: 1,
      time: 16,
    });
    pointer('pointerup', box, {pointerType: 'mouse', x: 40, y: 10, time: 32});
    expect(states[0]).toBe('began');
    expect(states[states.length - 1]).toBe('ended');
    expect(outerTransitions).toContain('failed');
    // The click the claimed lift owes is still swallowed (FR21): its
    // listener alone stays, for the swallower's window.
    expect(live()).toEqual(['click']);
    vi.advanceTimersByTime(1001);
    expect(live()).toEqual([]);
  });

  it('removes every page listener at once after a press nothing claimed', () => {
    const {box} = mount('<div id="box"></div>');
    const live = pageListeners();
    const fine = fineHost();
    detachers.push(fine.attach(box, new PanGestureRecognizer()));
    pointer('pointerdown', box, {
      pointerType: 'mouse',
      x: 10,
      y: 10,
      buttons: 1,
      time: 0,
    });
    pointer('pointermove', box, {
      pointerType: 'mouse',
      x: 13,
      y: 10,
      buttons: 1,
      time: 16,
    });
    pointer('pointerup', box, {pointerType: 'mouse', x: 13, y: 10, time: 40});
    expect(live()).toEqual([]);
  });

  it("starts no press for a right click, a pen's barrel button or a ctrl-click on macOS (spec:AST-094 FR43)", () => {
    const {box} = mount('<div id="box"></div>');
    const live = pageListeners();
    const fine = fineHost();
    const tap = new TapGestureRecognizer({name: 'tap'});
    const transitions: string[] = [];
    tap.addTransitionListener((_current, _from, to) => transitions.push(to));
    detachers.push(fine.attach(box, tap));
    press(box, {pointerType: 'mouse', button: 2});
    press(box, {pointerType: 'pen', button: 2});
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    press(box, {pointerType: 'mouse', button: 0, ctrlKey: true});
    expect(live()).toEqual([]);
    expect(transitions).toEqual([]);
    expect(host.arena.touches).toEqual([]);
  });

  it('serves a pen press, and keeps no pointer listener after it', () => {
    const {box} = mount('<div id="box"></div>');
    const live = pageListeners();
    const fine = fineHost();
    const pan = new PanGestureRecognizer({direction: 'horizontal'});
    const states: string[] = [];
    pan.addListener(r => states.push(r.state));
    detachers.push(fine.attach(box, pan));
    pointer('pointerdown', box, {
      id: 3,
      pointerType: 'pen',
      x: 10,
      y: 10,
      buttons: 1,
      time: 0,
    });
    pointer('pointermove', box, {
      id: 3,
      pointerType: 'pen',
      x: 40,
      y: 10,
      buttons: 1,
      time: 16,
    });
    pointer('pointerup', box, {
      id: 3,
      pointerType: 'pen',
      x: 40,
      y: 10,
      time: 32,
    });
    expect(states[0]).toBe('began');
    expect(states[states.length - 1]).toBe('ended');
    expect(live().filter(type => type !== 'click')).toEqual([]);
  });

  it("serves a touchscreen laptop's finger: its pointerdown brings the page listeners, its touches are read, and a claim cancels its touchmove and its lift", () => {
    const {box} = mount('<div id="box"></div>');
    const live = pageListeners();
    const fine = fineHost();
    const pan = new PanGestureRecognizer({direction: 'horizontal'});
    const states: string[] = [];
    pan.addListener(r => states.push(r.state));
    detachers.push(fine.attach(box, pan));
    const finger = {id: 1, x: 10, y: 10};
    const moved = {id: 1, x: 40, y: 10};
    pointer('pointerdown', box, {
      id: 5,
      pointerType: 'touch',
      x: 10,
      y: 10,
      buttons: 1,
      time: 0,
    });
    expect(live()).toEqual(expect.arrayContaining(['touchstart', 'touchend']));
    touch('touchstart', box, [finger], [finger], 0);
    const move = touch('touchmove', box, [moved], [moved], 16);
    expect(states).toContain('began');
    expect(move.defaultPrevented).toBe(true);
    pointer('pointerup', box, {
      id: 5,
      pointerType: 'touch',
      x: 40,
      y: 10,
      time: 32,
    });
    const lift = touch('touchend', box, [moved], [], 32);
    expect(lift.defaultPrevented).toBe(true);
    expect(states[states.length - 1]).toBe('ended');
    expect(live().filter(type => type !== 'click')).toEqual([]);
  });

  it('serves an action group like every attachment: its press reaches every recognizer on its path (family:action-groups FR5)', () => {
    const {outer, group, one} = mount(
      '<div id="outer"><div id="group"><button id="one"></button></div></div>',
    );
    const fine = fineHost();
    const outerPan = new PanGestureRecognizer({direction: 'horizontal'});
    const outerStates: string[] = [];
    outerPan.addListener(r => outerStates.push(r.state));
    detachers.push(
      fine.attach(group, new TapGestureRecognizer(), {actionGroup: true}),
      fine.attach(outer, outerPan),
    );
    pointer('pointerdown', one, {
      pointerType: 'mouse',
      x: 10,
      y: 10,
      buttons: 1,
      time: 0,
    });
    pointer('pointermove', one, {
      pointerType: 'mouse',
      x: 40,
      y: 10,
      buttons: 1,
      time: 16,
    });
    pointer('pointerup', one, {pointerType: 'mouse', x: 40, y: 10, time: 32});
    expect(outerStates).toContain('began');
  });

  it("re-syncs when only some of an element's recognizers detach: one left disabled keeps no pointerdown, page listener or ResizeObserver (spec:AST-094 FR24)", () => {
    const {box} = mount('<div id="box"></div>');
    const live = pageListeners();
    // Where the primary pointer is fine: the element's one pointerdown goes
    // with its last enabled recognizer.
    const boxRemoved = vi.spyOn(box, 'removeEventListener');
    const fine = fineHost();
    const detachPan = fine.attach(box, new PanGestureRecognizer());
    detachers.push(
      fine.attach(box, new TapGestureRecognizer({isEnabled: false})),
    );
    detachPan();
    expect(
      boxRemoved.mock.calls.filter(call => call[0] === 'pointerdown'),
    ).toHaveLength(1);
    // A press consumer's detach re-syncs as a recognizer's does.
    const {pad} = mount('<div id="box"></div><div id="pad"></div>');
    const padRemoved = vi.spyOn(pad, 'removeEventListener');
    const detachConsumer = fine.attachConsumer(pad, new RecordingConsumer());
    detachers.push(
      fine.attach(pad, new TapGestureRecognizer({isEnabled: false})),
    );
    detachConsumer();
    expect(
      padRemoved.mock.calls.filter(call => call[0] === 'pointerdown'),
    ).toHaveLength(1);
    // Where it is coarse: the page's listeners go too.
    const coarse = new GestureHost(document, {
      clock,
      isPrimaryPointerCoarse: () => true,
    });
    const {row} = mount('<div id="row"></div>');
    const detachRowPan = coarse.attach(row, new PanGestureRecognizer());
    detachers.push(
      coarse.attach(row, new TapGestureRecognizer({isEnabled: false})),
    );
    expect(live()).toContain('touchstart');
    detachRowPan();
    expect(live()).toEqual([]);
  });

  it("watches the viewport once a touch-down finds a leading pan's direction switched in place to the right edge, and stops when it switches back (spec:AST-094 FR18, FR24, DEC-22)", () => {
    const observed = new Set<Element>();
    class StandInResizeObserver {
      observe(target: Element): void {
        observed.add(target);
      }
      unobserve(target: Element): void {
        observed.delete(target);
      }
      disconnect(): void {
        observed.clear();
      }
    }
    const original = Object.getOwnPropertyDescriptor(window, 'ResizeObserver');
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      value: StandInResizeObserver,
    });
    try {
      const {strip} = mount('<div id="strip" style="direction: ltr"></div>');
      detachers.push(
        host.attach(
          strip,
          new ScreenEdgePanGestureRecognizer({
            name: 'edge',
            edges: ['leading'],
          }),
        ),
      );
      // Under LTR the leading edge is the left one: its band stays put.
      expect(observed.has(document.documentElement)).toBe(false);
      // The page turns RTL in place; the next touch-down measures again, and
      // the leading edge is the right one, whose band moves with the viewport.
      strip.style.direction = 'rtl';
      const first = {id: 1, x: 4, y: 300};
      touch('touchstart', strip, [first], [first], 0);
      touch('touchend', strip, [first], [], 40);
      expect(observed.has(document.documentElement)).toBe(true);
      // Back to LTR in place: the root is watched for nothing, and goes.
      strip.style.direction = 'ltr';
      const second = {id: 2, x: 4, y: 300};
      touch('touchstart', strip, [second], [second], 200);
      touch('touchend', strip, [second], [], 240);
      expect(observed.has(document.documentElement)).toBe(false);
    } finally {
      if (original == null) {
        delete (window as {ResizeObserver?: unknown}).ResizeObserver;
      } else {
        Object.defineProperty(window, 'ResizeObserver', original);
      }
    }
  });

  it("stops watching a screen-edge pan's box when it detaches while a disabled recognizer stays on the element (spec:AST-094 FR24)", () => {
    const observed = new Set<Element>();
    class StandInResizeObserver {
      observe(target: Element): void {
        observed.add(target);
      }
      unobserve(target: Element): void {
        observed.delete(target);
      }
      disconnect(): void {
        observed.clear();
      }
    }
    const original = Object.getOwnPropertyDescriptor(window, 'ResizeObserver');
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      value: StandInResizeObserver,
    });
    try {
      const {strip} = mount('<div id="strip"></div>');
      const fine = fineHost();
      const detachEdge = fine.attach(
        strip,
        new ScreenEdgePanGestureRecognizer({name: 'edge'}),
      );
      detachers.push(
        fine.attach(strip, new TapGestureRecognizer({isEnabled: false})),
      );
      expect(observed).toEqual(new Set([strip]));
      detachEdge();
      expect(observed.size).toBe(0);
    } finally {
      if (original == null) {
        delete (window as {ResizeObserver?: unknown}).ResizeObserver;
      } else {
        Object.defineProperty(window, 'ResizeObserver', original);
      }
    }
  });

  it('removes the element listener on detach and leaves nothing on the page', () => {
    const {box} = mount('<div id="box"></div>');
    const live = pageListeners();
    const boxRemoved = vi.spyOn(box, 'removeEventListener');
    const fine = fineHost();
    const detach = fine.attach(box, new TapGestureRecognizer());
    detach();
    expect(boxRemoved).toHaveBeenCalledWith(
      'pointerdown',
      expect.any(Function),
      {capture: true, passive: true},
    );
    expect(live()).toEqual([]);
  });

  it('gives a coarse primary pointer its page listeners and no element pointerdown', () => {
    const {box} = mount('<div id="box"></div>');
    const live = pageListeners();
    const boxAdded = vi.spyOn(box, 'addEventListener');
    const coarse = new GestureHost(document, {
      clock,
      isPrimaryPointerCoarse: () => true,
    });
    detachers.push(coarse.attach(box, new TapGestureRecognizer()));
    expect(live()).toEqual(
      expect.arrayContaining(['pointerdown', 'touchstart']),
    );
    expect(
      boxAdded.mock.calls.filter(call => call[0] === 'pointerdown'),
    ).toEqual([]);
  });
});

describe("inputMode 'pointer-events'", () => {
  /** A clock whose timers the test fires. */
  class TimerClock {
    time = 0;
    private readonly timers = new Map<number, () => void>();
    private next = 1;
    now(): number {
      return this.time;
    }
    setTimeout(callback: () => void): number {
      const id = this.next++;
      this.timers.set(id, callback);
      return id;
    }
    clearTimeout(id: number): void {
      this.timers.delete(id);
    }
    /** Runs every timer, and the ones they set, at `time`. */
    fireAll(time: number): void {
      this.time = time;
      while (this.timers.size > 0) {
        const due = [...this.timers.values()];
        this.timers.clear();
        for (const callback of due) {
          callback();
        }
      }
    }
  }

  it("tracks a finger once, from its pointer events, so a still finger's long press begins", () => {
    const {box} = mount('<div id="box"></div>');
    const timers = new TimerClock();
    const pointerHost = new GestureHost(document, {
      clock: timers,
      inputMode: 'pointer-events',
      isPrimaryPointerCoarse: () => true,
    });
    const press = new LongPressGestureRecognizer();
    const states: string[] = [];
    press.addListener(r => states.push(r.state));
    detachers.push(pointerHost.attach(box, press));
    // A browser with Touch Events sends both for one finger.
    pointer('pointerdown', box, {
      pointerType: 'touch',
      x: 10,
      y: 10,
      buttons: 1,
      time: 0,
    });
    const finger = {id: 7, x: 10, y: 10};
    touch('touchstart', box, [finger], [finger], 0);
    expect(press.numberOfTouches).toBe(1);
    timers.fireAll(800);
    expect(states).toContain('began');
    pointer('pointerup', box, {pointerType: 'touch', x: 10, y: 10, time: 820});
    touch('touchend', box, [finger], [], 820);
    expect(states).toContain('ended');
  });

  it("cancels a claimed finger's touchmove, matching its touches to its pointer", () => {
    const {box} = mount('<div id="box"></div>');
    const pointerHost = new GestureHost(document, {
      clock,
      inputMode: 'pointer-events',
      isPrimaryPointerCoarse: () => true,
    });
    const pan = new PanGestureRecognizer({direction: 'horizontal'});
    detachers.push(pointerHost.attach(box, pan));
    pointer('pointerdown', box, {
      pointerType: 'touch',
      x: 10,
      y: 10,
      buttons: 1,
      time: 0,
    });
    const finger = {id: 7, x: 10, y: 10};
    touch('touchstart', box, [finger], [finger], 0);
    // Before the pan claims, the browser keeps the move.
    const early = {...finger, x: 14};
    pointer('pointermove', box, {
      pointerType: 'touch',
      x: 14,
      y: 10,
      buttons: 1,
      time: 8,
    });
    expect(touch('touchmove', box, [early], [early], 8).defaultPrevented).toBe(
      false,
    );
    // Past its hysteresis the pan owns the finger: its touchmoves are cancelled.
    const claimed = {...finger, x: 40};
    pointer('pointermove', box, {
      pointerType: 'touch',
      x: 40,
      y: 10,
      buttons: 1,
      time: 32,
    });
    expect(pan.state).toBe('began');
    expect(
      touch('touchmove', box, [claimed], [claimed], 32).defaultPrevented,
    ).toBe(true);
  });

  it("cancels a claimed finger's touchend, and leaves an unclaimed one's alone", () => {
    const {box, other} = mount('<div id="box"></div><div id="other"></div>');
    const pointerHost = new GestureHost(document, {
      clock,
      inputMode: 'pointer-events',
      isPrimaryPointerCoarse: () => true,
    });
    const pan = new PanGestureRecognizer({direction: 'horizontal'});
    detachers.push(
      pointerHost.attach(box, pan),
      pointerHost.attach(other, new TapGestureRecognizer()),
    );
    // A pan that claims, then lifts: its touchend is cancelled (FR21).
    pointer('pointerdown', box, {
      pointerType: 'touch',
      x: 10,
      y: 10,
      buttons: 1,
      time: 0,
    });
    const finger = {id: 7, x: 10, y: 10};
    touch('touchstart', box, [finger], [finger], 0);
    pointer('pointermove', box, {
      pointerType: 'touch',
      x: 40,
      y: 10,
      buttons: 1,
      time: 32,
    });
    expect(pan.state).toBe('began');
    pointer('pointerup', box, {pointerType: 'touch', x: 40, y: 10, time: 48});
    const lifted = {...finger, x: 40};
    expect(touch('touchend', box, [lifted], [], 48).defaultPrevented).toBe(
      true,
    );
    // A tap nobody claimed before its lift keeps its touchend.
    pointer('pointerdown', other, {
      id: 2,
      pointerType: 'touch',
      x: 10,
      y: 80,
      buttons: 1,
      time: 400,
    });
    const second = {id: 8, x: 10, y: 80};
    touch('touchstart', other, [second], [second], 400);
    pointer('pointerup', other, {
      id: 2,
      pointerType: 'touch',
      x: 10,
      y: 80,
      time: 460,
    });
    expect(touch('touchend', other, [second], [], 460).defaultPrevented).toBe(
      false,
    );
  });
});
