// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file inputStream.test.ts
 * @input Uses vitest and jsdom's window and document
 * @output One native listener per event type however many subscribe, removed
 *   with the last; subscribers in order, each isolated from another's throw;
 *   passive unless a subscriber cancels, and passive again when it leaves;
 *   an app's capture-phase stop (stopPropagation on the document or on the
 *   window, stopImmediatePropagation on the document) starves no subscriber; events
 *   fired at the document reach the stream; a page of pressables registers
 *   no non-passive listener, and the gesture host none that holds a scroll;
 *   the press feedback controller imports nothing from gestures/; the
 *   latest delivered pointer event's type is readable, and none is recorded
 *   while no subscriber hears pointer events
 * @position Unit tests of packages/core/src/utils/inputStream.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {getGestureHost} from '../gestures/GestureHost';
import {
  getDownPresses,
  getTouches,
  getLastMousePoint,
  getLastPointerType,
  subscribeInput,
} from './inputStream';
import {installPressFeedback} from './pressFeedback';

type Registration = {
  type: string;
  options: AddEventListenerOptions | boolean | undefined;
};

function spyRegistrations() {
  const added: Registration[] = [];
  const removed: Registration[] = [];
  const originalAdd = window.addEventListener.bind(window);
  const originalRemove = window.removeEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((...args) => {
    added.push({type: args[0], options: args[2]});
    originalAdd(...args);
  });
  vi.spyOn(window, 'removeEventListener').mockImplementation((...args) => {
    removed.push({type: args[0], options: args[2]});
    originalRemove(...args);
  });
  return {added, removed};
}

const unsubscribers: (() => void)[] = [];

afterEach(() => {
  for (const unsubscribe of unsubscribers.splice(0)) {
    unsubscribe();
  }
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function subscribe(...args: Parameters<typeof subscribeInput>): () => void {
  const unsubscribe = subscribeInput(...args);
  unsubscribers.push(unsubscribe);
  return unsubscribe;
}

function pointerDown(target: EventTarget): Event {
  const event = new Event('pointerdown', {bubbles: true, cancelable: true});
  target.dispatchEvent(event);
  return event;
}

describe('inputStream', () => {
  it('registers one capture listener per event type, however many subscribe, and removes it with the last', () => {
    const {added, removed} = spyRegistrations();
    const first = subscribe(window, 'pointerdown', () => {});
    const second = subscribe(window, 'pointerdown', () => {});
    subscribe(window, 'pointerup', () => {});
    expect(added.map(r => r.type)).toEqual(['pointerdown', 'pointerup']);
    expect(added[0].options).toEqual({capture: true, passive: true});
    first();
    expect(removed).toEqual([]);
    second();
    second(); // a second call does nothing
    expect(removed.map(r => r.type)).toEqual(['pointerdown']);
  });

  it('runs a first subscriber before the others, even subscribed after them, and its true ends the dispatch', () => {
    const calls: string[] = [];
    let isHeld = false;
    // Only a first subscriber's true ends the dispatch.
    subscribe(window, 'pointerdown', () => {
      calls.push('press feedback');
      return true;
    });
    subscribe(
      window,
      'pointerdown',
      () => {
        calls.push('hold');
        return isHeld;
      },
      {first: true},
    );
    subscribe(window, 'pointerdown', () => calls.push('gesture host'));
    pointerDown(document.body);
    expect(calls).toEqual(['hold', 'press feedback', 'gesture host']);
    calls.length = 0;
    isHeld = true;
    pointerDown(document.body);
    expect(calls).toEqual(['hold']);
  });

  it('delivers to every subscriber in subscription order, each isolated from another that throws', () => {
    const reported = vi.fn();
    vi.stubGlobal('reportError', reported);
    const calls: string[] = [];
    subscribe(window, 'pointerdown', () => calls.push('press feedback'));
    subscribe(window, 'pointerdown', () => {
      calls.push('throws');
      throw new Error('a subscriber failed');
    });
    subscribe(window, 'pointerdown', () => calls.push('gesture host'));
    pointerDown(document.body);
    expect(calls).toEqual(['press feedback', 'throws', 'gesture host']);
    expect(reported).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('stays passive unless a subscriber cancels, and turns passive again when it leaves', () => {
    const {added, removed} = spyRegistrations();
    subscribe(window, 'touchmove', () => {});
    const blocking = subscribe(window, 'touchmove', () => {}, {cancels: true});
    expect(added.map(r => r.options)).toEqual([
      {capture: true, passive: true},
      {capture: true, passive: false},
    ]);
    blocking();
    expect(removed).toHaveLength(2);
    expect(added.at(-1)?.options).toEqual({capture: true, passive: true});
    // A canceling subscriber's preventDefault takes effect.
    subscribe(
      window,
      'pointerdown',
      event => {
        event.preventDefault();
      },
      {cancels: true},
    );
    expect(pointerDown(document.body).defaultPrevented).toBe(true);
  });

  it.each([
    ['stopPropagation on the document', document, 'stopPropagation'],
    [
      'stopImmediatePropagation on the document',
      document,
      'stopImmediatePropagation',
    ],
    [
      'stopPropagation on the window, registered first',
      window,
      'stopPropagation',
    ],
  ] as const)(
    "still reaches every subscriber under an app's capture-phase %s",
    (_name, node, stop) => {
      const button = document.createElement('button');
      document.body.append(button);
      const listener = (event: Event) => event[stop]();
      // Registered before any subscriber, as an app shell's listener is.
      node.addEventListener('pointerdown', listener, {capture: true});
      const pressFeedback = vi.fn();
      const gestureHost = vi.fn();
      subscribe(window, 'pointerdown', pressFeedback);
      subscribe(window, 'pointerdown', gestureHost);
      pointerDown(button);
      node.removeEventListener('pointerdown', listener, {capture: true});
      expect(pressFeedback).toHaveBeenCalledTimes(1);
      expect(gestureHost).toHaveBeenCalledTimes(1);
    },
  );

  it("reaches events fired at the document and an element's scroll", () => {
    const visibility = vi.fn();
    const scroll = vi.fn();
    subscribe(window, 'visibilitychange', visibility);
    subscribe(window, 'scroll', scroll);
    document.dispatchEvent(new Event('visibilitychange', {bubbles: true}));
    const scroller = document.createElement('div');
    document.body.append(scroller);
    scroller.dispatchEvent(new Event('scroll'));
    expect(visibility).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.calls[0][0].target).toBe(scroller);
  });

  it('delivers an event to the subscribers present when it arrived', () => {
    const late = vi.fn();
    let unsubscribeLate: (() => void) | null = null;
    subscribe(window, 'pointerdown', () => {
      unsubscribeLate?.();
    });
    unsubscribeLate = subscribe(window, 'pointerdown', late);
    pointerDown(document.body);
    expect(late).not.toHaveBeenCalled();
  });

  it('registers no non-passive listener for a page of pressables, and none that holds a scroll for the gesture host', () => {
    const {added} = spyRegistrations();
    const uninstall = installPressFeedback();
    expect(added.length).toBeGreaterThan(0);
    expect(
      added.filter(
        r => typeof r.options === 'object' && r.options.passive === false,
      ),
    ).toEqual([]);
    uninstall();
    added.length = 0;
    const host = getGestureHost(document);
    const box = document.createElement('div');
    document.body.append(box);
    const detach = host.attachConsumer(box, {
      touchesBegan: () => {},
      touchesMoved: () => {},
      touchesEnded: () => {},
      touchesCancelled: () => {},
    } as never);
    const blocking = added
      .filter(r => typeof r.options === 'object' && r.options.passive === false)
      .map(r => r.type);
    expect(blocking).not.toContain('touchstart');
    expect(blocking).not.toContain('touchmove');
    expect(blocking).not.toContain('wheel');
    detach();
  });

  it("records the latest delivered pointer event's type, before its subscribers run, and only while one hears pointer events", () => {
    const view = document.defaultView as Window;
    const heard: (string | null)[] = [];
    const stop = subscribeInput(view, 'pointermove', () => {
      heard.push(getLastPointerType(view));
    });
    document.body.dispatchEvent(
      new PointerEvent('pointermove', {bubbles: true, pointerType: 'mouse'}),
    );
    expect(getLastPointerType(view)).toBe('mouse');
    document.body.dispatchEvent(
      new PointerEvent('pointermove', {bubbles: true, pointerType: 'touch'}),
    );
    expect(heard).toEqual(['mouse', 'touch']);
    stop();

    // No subscriber, no native listener: the stream hears nothing.
    document.body.dispatchEvent(
      new PointerEvent('pointermove', {bubbles: true, pointerType: 'pen'}),
    );
    expect(getLastPointerType(view)).toBe('touch');
  });

  it("records where each finger's or pen's press that is down was last, while one hears pointer presses, and forgets them when the last listener for their end goes", () => {
    const view = document.defaultView as Window;
    const press = (
      type: string,
      pointerType: string,
      pointerId: number,
      x: number,
      y: number,
    ) =>
      document.body.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerType,
          pointerId,
          clientX: x,
          clientY: y,
        }),
      );
    const stops = (
      ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const
    ).map(type => subscribeInput(view, type, () => {}));
    press('pointerdown', 'touch', 31, 10, 20);
    press('pointerdown', 'pen', 32, 30, 40);
    press('pointerdown', 'mouse', 33, 50, 60);
    // A move of a pointer that is not down records nothing.
    press('pointermove', 'touch', 34, 70, 80);
    press('pointermove', 'touch', 31, 12, 22);
    expect([...getDownPresses(view)]).toEqual([
      [31, {x: 12, y: 22}],
      [32, {x: 30, y: 40}],
    ]);
    press('pointerup', 'touch', 31, 12, 22);
    press('pointercancel', 'pen', 32, 30, 40);
    press('pointerup', 'mouse', 33, 50, 60);
    expect([...getDownPresses(view)]).toEqual([]);
    press('pointerdown', 'touch', 35, 1, 2);
    expect([...getDownPresses(view)]).toEqual([[35, {x: 1, y: 2}]]);
    for (const stop of stops) {
      stop();
    }
    expect([...getDownPresses(view)]).toEqual([]);
  });

  it('counts the fingers on the screen while touch starts and ends are heard, through a native pan that cancels the press', () => {
    const view = document.defaultView as Window;
    const touch = (type: string, fingers: number) =>
      document.body.dispatchEvent(
        Object.assign(new Event(type, {bubbles: true}), {
          touches: Array.from({length: fingers}, () => ({})),
        }),
      );
    // With only the start heard, an end could be missed: nothing is counted.
    const stopStart = subscribeInput(view, 'touchstart', () => {});
    touch('touchstart', 1);
    expect(getTouches(view).fingers).toBe(0);
    const stopEnd = subscribeInput(view, 'touchend', () => {});
    const stopCancel = subscribeInput(view, 'touchcancel', () => {});
    const stopPointer = subscribeInput(view, 'pointercancel', () => {});
    touch('touchstart', 1);
    expect(getTouches(view).fingers).toBeGreaterThan(0);
    // A native pan cancels the finger's pointer, not its touch.
    document.body.dispatchEvent(
      new PointerEvent('pointercancel', {
        bubbles: true,
        pointerType: 'touch',
        pointerId: 41,
      }),
    );
    expect(getTouches(view).fingers).toBeGreaterThan(0);
    touch('touchstart', 2);
    touch('touchend', 1);
    expect(getTouches(view).fingers).toBeGreaterThan(0);
    touch('touchcancel', 0);
    expect(getTouches(view).fingers).toBe(0);
    touch('touchstart', 1);
    expect(getTouches(view).fingers).toBeGreaterThan(0);
    // Once no subscriber hears a touch end, a finger may have lifted unheard.
    stopEnd();
    expect(getTouches(view).fingers).toBe(0);
    stopStart();
    stopCancel();
    stopPointer();
  });

  it('counts the touch starts it hears while it counts fingers, and keeps that count once it stops', () => {
    const view = document.defaultView as Window;
    const touch = (type: string, fingers: number) =>
      document.body.dispatchEvent(
        Object.assign(new Event(type, {bubbles: true}), {
          touches: Array.from({length: fingers}, () => ({})),
        }),
      );
    const stopStart = subscribeInput(view, 'touchstart', () => {});
    const before = getTouches(view).starts;
    touch('touchstart', 1);
    expect(getTouches(view).starts).toBe(before);
    const stopEnd = subscribeInput(view, 'touchend', () => {});
    const stopCancel = subscribeInput(view, 'touchcancel', () => {});
    touch('touchstart', 1);
    expect(getTouches(view).starts).toBe(before + 1);
    // A second finger is a new touch; an end or a cancel starts none.
    touch('touchstart', 2);
    touch('touchend', 1);
    touch('touchcancel', 0);
    expect(getTouches(view).starts).toBe(before + 2);
    // With no touch end heard, it counts no finger and no start.
    stopEnd();
    touch('touchstart', 1);
    expect(getTouches(view).fingers).toBe(0);
    expect(getTouches(view).starts).toBe(before + 2);
    stopStart();
    stopCancel();
  });

  it("records where the latest delivered mouse pointer event was, and keeps it through a finger's events", () => {
    const view = document.defaultView as Window;
    const stop = subscribeInput(view, 'pointermove', () => {});
    document.body.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerType: 'mouse',
        clientX: 40,
        clientY: 60,
      }),
    );
    expect(getLastMousePoint(view)).toEqual({x: 40, y: 60});
    document.body.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerType: 'touch',
        clientX: 200,
        clientY: 10,
      }),
    );
    expect(getLastMousePoint(view)).toEqual({x: 40, y: 60});
    stop();
  });

  it('keeps the press feedback controller free of the gesture system', () => {
    const utils = path.resolve(__dirname);
    const seen = new Set<string>();
    const queue = [path.join(utils, 'pressFeedback.ts')];
    const statement =
      /^\s*(import|export)\s+(type\s+)?([^'";]*?\s+from\s+)?'([^']+)';/gms;
    while (queue.length > 0) {
      const file = queue.pop() as string;
      if (seen.has(file)) {
        continue;
      }
      seen.add(file);
      for (const match of fs.readFileSync(file, 'utf8').matchAll(statement)) {
        const [, , isTypeOnly, , specifier] = match;
        if (isTypeOnly != null || !specifier.startsWith('.')) {
          continue;
        }
        const base = path.resolve(path.dirname(file), specifier);
        const resolved = [
          `${base}.ts`,
          `${base}.tsx`,
          path.join(base, 'index.ts'),
        ].find(candidate => fs.existsSync(candidate));
        if (resolved == null) {
          throw new Error(`cannot resolve ${specifier} from ${file}`);
        }
        queue.push(resolved);
      }
    }
    const modules = [...seen].map(file =>
      path.relative(path.resolve(utils, '..'), file),
    );
    expect(modules).toContain(path.join('utils', 'inputStream.ts'));
    expect(
      modules.filter(module => module.startsWith(`gestures${path.sep}`)),
    ).toEqual([]);
  });
});
