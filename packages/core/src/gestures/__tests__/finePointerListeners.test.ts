// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file finePointerListeners.test.ts
 * @input GestureHost under a fine primary pointer, with the shared input
 *   stream counted and synthetic pointer and touch events
 * @output What the host listens with where the primary pointer is fine
 *   (`spec:AST-094` FR24, FR43): its page listeners go when the window blurs
 *   during a press; a kept press has its blocking touchmove only during a
 *   press; a mouse or a pen drives a hover recognizer through listeners on
 *   its element alone
 * @position Unit tests of packages/core/src/gestures/GestureHost.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {GestureHost} from '../GestureHost';
import {HoverGestureRecognizer} from '../HoverGestureRecognizer';
import {LongPressGestureRecognizer} from '../LongPressGestureRecognizer';
import {PanGestureRecognizer} from '../PanGestureRecognizer';
import {PressTracker} from '../PressTracker';
import {TapGestureRecognizer} from '../TapGestureRecognizer';
import type * as InputStreamModule from '../../utils/inputStream';
import {ManualClock} from './harness';

/** Live subscriptions to the shared input stream, by event type. */
const subscriptions = new Map<string, number>();

vi.mock('../../utils/inputStream', async importOriginal => {
  const real = await importOriginal<typeof InputStreamModule>();
  return {
    ...real,
    subscribeInput: ((...args: Parameters<typeof real.subscribeInput>) => {
      const type = args[1];
      subscriptions.set(type, (subscriptions.get(type) ?? 0) + 1);
      const unsubscribe = real.subscribeInput(...args);
      let isDone = false;
      return () => {
        if (!isDone) {
          isDone = true;
          subscriptions.set(type, (subscriptions.get(type) ?? 0) - 1);
        }
        unsubscribe();
      };
    }) as typeof real.subscribeInput,
  };
});

function pageListeners(): string[] {
  return [...subscriptions]
    .filter(([, count]) => count > 0)
    .map(([type]) => type)
    .sort();
}

function pointer(
  type: string,
  target: EventTarget,
  init: {
    pointerType: string;
    x: number;
    y: number;
    buttons?: number;
    time: number;
    relatedTarget?: EventTarget | null;
  },
): void {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: init.pointerType === 'mouse' ? 1 : 2,
    pointerType: init.pointerType,
    clientX: init.x,
    clientY: init.y,
    buttons: init.buttons ?? 0,
    relatedTarget: init.relatedTarget ?? null,
  });
  Object.defineProperty(event, 'timeStamp', {value: init.time});
  target.dispatchEvent(event);
}

function touch(
  type: string,
  target: EventTarget,
  contact: {id: number; x: number; y: number},
  time: number,
  isLift = false,
): void {
  const event = new Event(type, {bubbles: true, cancelable: true});
  const entry = {
    identifier: contact.id,
    clientX: contact.x,
    clientY: contact.y,
    target,
  };
  Object.defineProperty(event, 'changedTouches', {value: [entry]});
  Object.defineProperty(event, 'touches', {value: isLift ? [] : [entry]});
  Object.defineProperty(event, 'timeStamp', {value: time});
  target.dispatchEvent(event);
}

let detachers: (() => void)[];
let host: GestureHost;

function mount(html: string): Record<string, HTMLElement> {
  document.body.innerHTML = html;
  const elements: Record<string, HTMLElement> = {};
  for (const element of document.querySelectorAll<HTMLElement>('[id]')) {
    elements[element.id] = element;
  }
  return elements;
}

/** The element's live `touchmove` listeners, counted as they come and go. */
function countTouchMoves(element: Element): () => number {
  let count = 0;
  const add = element.addEventListener.bind(element);
  const remove = element.removeEventListener.bind(element);
  element.addEventListener = ((type: string, ...rest: [never, never?]) => {
    if (type === 'touchmove') {
      count += 1;
    }
    add(type, ...rest);
  }) as typeof element.addEventListener;
  element.removeEventListener = ((type: string, ...rest: [never, never?]) => {
    if (type === 'touchmove') {
      count -= 1;
    }
    remove(type, ...rest);
  }) as typeof element.removeEventListener;
  return () => count;
}

beforeEach(() => {
  subscriptions.clear();
  detachers = [];
  host = new GestureHost(document, {
    clock: new ManualClock(),
    isPrimaryPointerCoarse: () => false,
  });
});

afterEach(() => {
  for (const detach of detachers.splice(0)) {
    detach();
  }
  document.body.innerHTML = '';
});

describe('a fine primary pointer', () => {
  it('takes down the page listeners when the window blurs during a press', async () => {
    const {box} = mount('<div id="box"></div>');
    detachers.push(host.attach(box, new TapGestureRecognizer()));
    expect(pageListeners()).toEqual([]);
    pointer('pointerdown', box, {
      pointerType: 'mouse',
      x: 5,
      y: 5,
      buttons: 1,
      time: 0,
    });
    expect(pageListeners()).toContain('pointermove');
    window.dispatchEvent(new Event('blur'));
    await Promise.resolve();
    expect(pageListeners()).toEqual([]);
  });

  it("gives a kept press its blocking touchmove only during a press, as a phone's needs it only for a finger", async () => {
    const {stepper} = mount('<div id="stepper"></div>');
    const touchMoves = countTouchMoves(stepper);
    detachers.push(
      host.attachConsumer(
        stepper,
        new PressTracker({getBounds: () => null, keepsTouch: true}),
      ),
    );
    expect(touchMoves()).toBe(0);
    // A touchscreen laptop's finger: its pointerdown comes before its
    // touchstart, so the listener is in place before the first touchmove.
    pointer('pointerdown', stepper, {
      pointerType: 'touch',
      x: 5,
      y: 5,
      buttons: 1,
      time: 0,
    });
    expect(touchMoves()).toBeGreaterThan(0);
    touch('touchstart', stepper, {id: 1, x: 5, y: 5}, 0);
    pointer('pointerup', stepper, {pointerType: 'touch', x: 5, y: 5, time: 50});
    touch('touchend', stepper, {id: 1, x: 5, y: 5}, 50, true);
    await Promise.resolve();
    expect(touchMoves()).toBe(0);
  });

  it('drives a hover recognizer for a mouse or a pen, with listeners on its element alone (FR43)', () => {
    const {card, outside} = mount(
      '<div id="card"></div><div id="outside"></div>',
    );
    const hover = new HoverGestureRecognizer();
    const states: string[] = [];
    hover.addListener(() => states.push(hover.state));
    detachers.push(host.attach(card, hover));
    for (const pointerType of ['mouse', 'pen']) {
      pointer('pointermove', card, {pointerType, x: 5, y: 5, time: 0});
      pointer('pointermove', card, {pointerType, x: 8, y: 5, time: 16});
      pointer('pointerout', card, {
        pointerType,
        x: 120,
        y: 5,
        time: 32,
        relatedTarget: outside,
      });
    }
    expect(states).toEqual([
      'began',
      'changed',
      'ended',
      'began',
      'changed',
      'ended',
    ]);
    expect(pageListeners()).toEqual([]);
  });

  it("cancels a claimed finger's lift and the browser's menu during an armed press, as where the primary pointer is coarse (spec:AST-094 FR21)", () => {
    const {sheet} = mount('<div id="sheet"></div>');
    detachers.push(
      host.attach(sheet, new PanGestureRecognizer({direction: 'horizontal'})),
      host.attach(sheet, new LongPressGestureRecognizer({name: 'press'})),
    );
    // A touchscreen laptop's finger: its pointerdown arms the press.
    pointer('pointerdown', sheet, {
      pointerType: 'touch',
      x: 5,
      y: 5,
      buttons: 1,
      time: 0,
    });
    touch('touchstart', sheet, {id: 1, x: 5, y: 5}, 0);
    // The finger's pointer events sample it; its touchmove follows each.
    pointer('pointermove', sheet, {
      pointerType: 'touch',
      x: 40,
      y: 5,
      buttons: 1,
      time: 32,
    });
    touch('touchmove', sheet, {id: 1, x: 40, y: 5}, 32);
    // The browser's own menu for that finger stays off.
    const menu = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
    });
    sheet.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    // The claimed finger's lift clicks nothing.
    pointer('pointerup', sheet, {pointerType: 'touch', x: 40, y: 5, time: 48});
    const lift = new Event('touchend', {bubbles: true, cancelable: true});
    const entry = {identifier: 1, clientX: 40, clientY: 5, target: sheet};
    Object.defineProperty(lift, 'changedTouches', {value: [entry]});
    Object.defineProperty(lift, 'touches', {value: []});
    Object.defineProperty(lift, 'timeStamp', {value: 48});
    sheet.dispatchEvent(lift);
    expect(lift.defaultPrevented).toBe(true);
  });

  it("keeps a kept press's finger during an armed press: its moves are cancelled, as on a phone (spec:AST-094 FR11, DEC-21)", () => {
    const {stepper} = mount('<div id="stepper"></div>');
    detachers.push(
      host.attachConsumer(
        stepper,
        new PressTracker({getBounds: () => null, keepsTouch: true}),
      ),
    );
    pointer('pointerdown', stepper, {
      pointerType: 'touch',
      x: 5,
      y: 5,
      buttons: 1,
      time: 0,
    });
    touch('touchstart', stepper, {id: 1, x: 5, y: 5}, 0);
    const move = new Event('touchmove', {bubbles: true, cancelable: true});
    const entry = {identifier: 1, clientX: 9, clientY: 5, target: stepper};
    Object.defineProperty(move, 'changedTouches', {value: [entry]});
    Object.defineProperty(move, 'touches', {value: [entry]});
    Object.defineProperty(move, 'timeStamp', {value: 16});
    stepper.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(true);
    touch('touchend', stepper, {id: 1, x: 9, y: 5}, 50, true);
  });

  it('takes down the page listeners when the page is hidden during a press (spec:AST-094 FR24)', async () => {
    const {box} = mount('<div id="box"></div>');
    detachers.push(host.attach(box, new TapGestureRecognizer()));
    pointer('pointerdown', box, {
      pointerType: 'mouse',
      x: 5,
      y: 5,
      buttons: 1,
      time: 0,
    });
    expect(pageListeners()).toContain('pointermove');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
      expect(pageListeners()).toEqual([]);
    } finally {
      Reflect.deleteProperty(document, 'visibilityState');
    }
  });
});
