// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createPanGesture.test.tsx
 * @input createPanGesture and usePanGesture driven by touches through the
 *   document's gesture host
 * @output Tests for spec:AST-107 FR1 and FR6: a drag reported as values, on
 *   each axis, cancelled, and never for a press or a long press; one API at
 *   two layers; no listener left after destroy
 * @position Tests of the public pan factory and its hook
 */

import {act, render} from '@testing-library/react';
import {StrictMode, useRef, useState} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  createPanGesture,
  type PanGestureEvent,
  type PanGestureOptions,
} from '../createPanGesture';
import {usePanGesture} from '../../hooks/usePanGesture';
import {armClickGuard, disarmClickGuard} from '../../utils/clickGuard';
import {coarsePrimaryPointer} from './harness';

function touch(
  type: string,
  target: EventTarget,
  contact: {id: number; x: number; y: number},
  time: number,
  isLift = false,
): Event {
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
  return event;
}

// The document's host outlives a test, so event times only move forward.
let clock = 0;
function later(): number {
  clock += 10_000;
  return clock;
}

/** A finger dragging from (10, 10) by `dx`, `dy` in four 16 ms steps, then lifting. */
function drag(
  target: Element,
  dx: number,
  dy: number,
  {lift = true, start = later()}: {lift?: boolean; start?: number} = {},
): number {
  const id = 1;
  touch('touchstart', target, {id, x: 10, y: 10}, start);
  for (let step = 1; step <= 4; step++) {
    touch(
      'touchmove',
      target,
      {id, x: 10 + (dx * step) / 4, y: 10 + (dy * step) / 4},
      start + step * 16,
    );
  }
  if (lift) {
    touch('touchend', target, {id, x: 10 + dx, y: 10 + dy}, start + 80, true);
  }
  return start;
}

/** A drag through Pointer Events only, as a mouse or a pen makes it. */
function pointerDrag(
  target: Element,
  pointerType: 'mouse' | 'pen',
  dx: number,
): void {
  const start = later();
  const send = (type: string, x: number, time: number, buttons: number) => {
    const event = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 7,
      pointerType,
      clientX: x,
      clientY: 10,
      button: 0,
      buttons,
    });
    Object.defineProperty(event, 'timeStamp', {value: time});
    target.dispatchEvent(event);
  };
  send('pointerdown', 10, start, 1);
  for (let step = 1; step <= 4; step++) {
    send('pointermove', 10 + (dx * step) / 4, start + step * 16, 1);
  }
  send('pointerup', 10 + dx, start + 80, 0);
}

/** The states in order, a run of 'changed' counted once. */
function phases(events: PanGestureEvent[]): string[] {
  return events
    .map(event => event.state)
    .filter((state, index, all) => index === 0 || state !== all[index - 1]);
}

/** Every listener added to the document, the window and `element`, net of removals. */
function trackListeners(element?: Element): () => number {
  const live = new Map<string, number>();
  const restores: (() => void)[] = [];
  const targets: EventTarget[] =
    element == null ? [document, window] : [document, window, element];
  for (const target of targets) {
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    const key = (
      type: string,
      listener: unknown,
      options?: boolean | EventListenerOptions,
    ) => {
      const capture =
        typeof options === 'boolean' ? options : options?.capture === true;
      return `${target === document ? 'd' : target === window ? 'w' : 'e'}:${type}:${capture}:${listenerId(listener)}`;
    };
    target.addEventListener = (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ) => {
      live.set(key(type, listener, options), 1);
      add(type, listener, options);
    };
    target.removeEventListener = (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | EventListenerOptions,
    ) => {
      live.delete(key(type, listener, options));
      remove(type, listener, options);
    };
    restores.push(() => {
      target.addEventListener = add;
      target.removeEventListener = remove;
    });
  }
  afterEachRestore.push(...restores);
  return () => live.size;
}

const ids = new WeakMap<object, number>();
let nextId = 0;
function listenerId(listener: unknown): number {
  if (
    listener == null ||
    (typeof listener !== 'object' && typeof listener !== 'function')
  ) {
    return -1;
  }
  let id = ids.get(listener);
  if (id == null) {
    id = nextId++;
    ids.set(listener, id);
  }
  return id;
}

const afterEachRestore: (() => void)[] = [];
let restorePointer: () => void = () => {};
const surfaces: HTMLElement[] = [];
const destroys: (() => void)[] = [];

function surface(): HTMLElement {
  const element = document.createElement('div');
  document.body.append(element);
  surfaces.push(element);
  return element;
}

function pan(element: Element, options: PanGestureOptions) {
  const gesture = createPanGesture(element, options);
  destroys.push(() => gesture.destroy());
  return gesture;
}

// A phone: the document's host listens only where the pointer is coarse.
beforeEach(() => {
  restorePointer = coarsePrimaryPointer();
});
afterEach(() => {
  for (const destroy of destroys.splice(0)) {
    destroy();
  }
  for (const element of surfaces.splice(0)) {
    element.remove();
  }
  for (const restore of afterEachRestore.splice(0)) {
    restore();
  }
  restorePointer();
  vi.useRealTimers();
});

describe('createPanGesture (spec:AST-107 FR1, FR6)', () => {
  it('reports a horizontal drag as began, changed and ended values, and hands out no recognizer', () => {
    const element = surface();
    const events: PanGestureEvent[] = [];
    const gesture = pan(element, {
      axis: 'x',
      onPan: event => events.push(event),
    });
    expect(Object.keys(gesture)).toEqual(['destroy']);
    drag(element, 40, 0);
    expect(phases(events)).toEqual(['began', 'changed', 'ended']);
    for (const event of events) {
      // Exactly the record's values (spec:AST-107 FR1): no pointer kind.
      expect(Object.keys(event).sort()).toEqual([
        'state',
        'translation',
        'velocity',
      ]);
      expect(event.translation.y).toBe(0);
      expect(event.velocity.y).toBe(0);
    }
    // The threshold's travel is not part of the translation: the step that
    // reached 10 px begins the drag at 0, as UIKit's pan does.
    expect(events[0].translation.x).toBe(0);
    expect(events.at(-1)?.translation.x).toBe(30);
    expect(events.at(-1)?.velocity.x).toBeGreaterThan(0);
  });

  it('is driven by a finger, a mouse and a pen alike (spec:AST-107 FR1, AST-094 FR43)', () => {
    const element = surface();
    const events: PanGestureEvent[] = [];
    pan(element, {axis: 'x', onPan: event => events.push(event)});
    drag(element, 60, 0);
    expect(phases(events)).toEqual(['began', 'changed', 'ended']);
    for (const pointerType of ['mouse', 'pen'] as const) {
      events.length = 0;
      pointerDrag(element, pointerType, 60);
      expect(phases(events)).toEqual(['began', 'changed', 'ended']);
    }
  });

  it('reports a vertical drag on the y axis, with nothing across it', () => {
    const element = surface();
    const events: PanGestureEvent[] = [];
    pan(element, {axis: 'y', onPan: event => events.push(event)});
    drag(element, 4, 40);
    expect(phases(events)).toEqual(['began', 'changed', 'ended']);
    for (const event of events) {
      expect(event.translation.x).toBe(0);
      expect(event.velocity.x).toBe(0);
    }
    expect(events.at(-1)?.translation.y).toBe(30);
    expect(events.at(-1)?.velocity.y).toBeGreaterThan(0);
  });

  it('reports nothing for a drag off its axis', () => {
    const element = surface();
    const onPan = vi.fn();
    pan(element, {axis: 'x', onPan});
    drag(element, 0, 40);
    expect(onPan).not.toHaveBeenCalled();
  });

  it('reports both axes without an axis', () => {
    const element = surface();
    const events: PanGestureEvent[] = [];
    pan(element, {onPan: event => events.push(event)});
    drag(element, 40, 20);
    expect(events.at(-1)?.state).toBe('ended');
    expect(events.at(-1)?.translation.x).toBeGreaterThan(0);
    expect(events.at(-1)?.translation.y).toBeGreaterThan(0);
  });

  it('reports a cancelled drag as cancelled, with no velocity', () => {
    const element = surface();
    const events: PanGestureEvent[] = [];
    pan(element, {axis: 'x', onPan: event => events.push(event)});
    const start = drag(element, 40, 0, {lift: false});
    touch('touchcancel', element, {id: 1, x: 50, y: 10}, start + 96, true);
    expect(phases(events)).toEqual(['began', 'changed', 'cancelled']);
    expect(events.at(-1)?.velocity).toEqual({x: 0, y: 0});
  });

  it('reports nothing for a press or a long press', () => {
    vi.useFakeTimers();
    const element = surface();
    const onPan = vi.fn();
    pan(element, {axis: 'x', onPan});
    // A press: down and up in place.
    const press = later();
    touch('touchstart', element, {id: 1, x: 10, y: 10}, press);
    touch('touchend', element, {id: 1, x: 10, y: 10}, press + 80, true);
    // A long press: a finger held still well past the long-press duration.
    const hold = later();
    touch('touchstart', element, {id: 2, x: 10, y: 10}, hold);
    vi.advanceTimersByTime(1000);
    touch('touchend', element, {id: 2, x: 11, y: 10}, hold + 1000, true);
    expect(onPan).not.toHaveBeenCalled();
  });

  it('removes every listener it added on destroy, and a destroy mid-drag cancels the drag once', () => {
    const element = surface();
    const live = trackListeners(element);
    const before = live();
    const events: PanGestureEvent[] = [];
    const gesture = createPanGesture(element, {
      axis: 'x',
      onPan: event => events.push(event),
    });
    const start = drag(element, 40, 0, {lift: false});
    gesture.destroy();
    expect(phases(events)).toEqual(['began', 'changed', 'cancelled']);
    expect(live()).toBe(before);
    // Nothing reaches it any more.
    touch('touchmove', element, {id: 1, x: 80, y: 10}, start + 120);
    touch('touchend', element, {id: 1, x: 80, y: 10}, start + 136, true);
    const reported = events.length;
    drag(element, 40, 0);
    expect(events).toHaveLength(reported);
    // A second destroy does nothing.
    gesture.destroy();
    expect(live()).toBe(before);
  });
});

describe('createPanGesture on the server (spec:AST-107 FR6)', () => {
  it('does no DOM work at import', async () => {
    vi.resetModules();
    const touched: string[] = [];
    const realDocument: Document = document;
    const realMatchMedia: typeof window.matchMedia = window.matchMedia;
    const documentDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      'document',
    );
    const matchMediaDescriptor = Object.getOwnPropertyDescriptor(
      window,
      'matchMedia',
    );
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      get(): Document {
        touched.push('document');
        return realDocument;
      },
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      get(): typeof window.matchMedia {
        touched.push('matchMedia');
        return realMatchMedia;
      },
    });
    try {
      const module = await import('../createPanGesture');
      expect(typeof module.createPanGesture).toBe('function');
      const hooks = await import('../../hooks/usePanGesture');
      expect(typeof hooks.usePanGesture).toBe('function');
    } finally {
      if (documentDescriptor) {
        Object.defineProperty(globalThis, 'document', documentDescriptor);
      }
      if (matchMediaDescriptor) {
        Object.defineProperty(window, 'matchMedia', matchMediaDescriptor);
      }
    }
    expect(touched).toEqual([]);
  });
});

function Draggable({
  axis,
  onPan,
}: {
  axis?: 'x' | 'y';
  onPan: (event: PanGestureEvent) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  usePanGesture(ref, {axis, onPan});
  return <div data-testid="surface" ref={ref} />;
}

describe('usePanGesture (spec:AST-107 FR1, FR6)', () => {
  it('reports what its factory reports, through the latest onPan', () => {
    const first = vi.fn();
    const events: PanGestureEvent[] = [];
    const {getByTestId, rerender} = render(
      <Draggable axis="x" onPan={first} />,
    );
    rerender(<Draggable axis="x" onPan={event => events.push(event)} />);
    drag(getByTestId('surface'), 40, 0);
    expect(first).not.toHaveBeenCalled();
    expect(phases(events)).toEqual(['began', 'changed', 'ended']);
    expect(events.at(-1)?.translation).toEqual({x: 30, y: 0});
  });

  it('calls onPan from no effect: a drag in progress at unmount ends without a cancelled event (architecture:react-component-runtime INV2)', () => {
    const events: PanGestureEvent[] = [];
    const {getByTestId, unmount} = render(
      <Draggable axis="x" onPan={event => events.push(event)} />,
    );
    drag(getByTestId('surface'), 40, 0, {lift: false});
    expect(phases(events)).toEqual(['began', 'changed']);
    unmount();
    expect(phases(events)).toEqual(['began', 'changed']);
  });

  it('calls onPan from no effect: a drag in progress when the axis changes ends without a cancelled event (architecture:react-component-runtime INV2)', () => {
    const events: PanGestureEvent[] = [];
    const onPan = (event: PanGestureEvent) => events.push(event);
    const {getByTestId, rerender} = render(
      <Draggable axis="x" onPan={onPan} />,
    );
    drag(getByTestId('surface'), 40, 0, {lift: false});
    expect(phases(events)).toEqual(['began', 'changed']);
    rerender(<Draggable axis="y" onPan={onPan} />);
    expect(phases(events)).toEqual(['began', 'changed']);
  });

  it('attaches once under StrictMode and removes every listener at unmount', () => {
    const events: PanGestureEvent[] = [];
    const holder = document.createElement('div');
    document.body.append(holder);
    surfaces.push(holder);
    // React keeps its own root listeners on the container after unmount.
    // The page's once-per-document listeners go in first, so the count is
    // the pan's alone: React's own, and the click guard's window click
    // listener, which the guard keeps once a gesture first arms it
    // (utils/clickGuard.ts).
    const warmup = document.createElement('div');
    document.body.append(warmup);
    surfaces.push(warmup);
    render(<div />, {container: warmup}).unmount();
    armClickGuard(document);
    disarmClickGuard(document);
    const live = trackListeners();
    const before = live();
    const {getByTestId, unmount} = render(
      <StrictMode>
        <Draggable axis="x" onPan={event => events.push(event)} />
      </StrictMode>,
      {container: holder},
    );
    drag(getByTestId('surface'), 40, 0);
    expect(phases(events)).toEqual(['began', 'changed', 'ended']);
    unmount();
    // The drag's claimed lift armed the click guard, which outlives the pan
    // on purpose, to swallow the browser's click after it, until the next
    // press or its window ends: end it here.
    disarmClickGuard(document);
    expect(live()).toBe(before);
  });

  it('follows the element when the ref moves to a new node', () => {
    const events: PanGestureEvent[] = [];
    function Swapping() {
      const ref = useRef<HTMLDivElement>(null);
      const [which, setWhich] = useState<'a' | 'b'>('a');
      usePanGesture(ref, {axis: 'x', onPan: event => events.push(event)});
      return (
        <>
          <button type="button" onClick={() => setWhich('b')}>
            swap
          </button>
          {which === 'a' ? (
            <div key="a" data-testid="a" ref={ref} />
          ) : (
            <div key="b" data-testid="b" ref={ref} />
          )}
        </>
      );
    }
    const {getByTestId, getByRole} = render(<Swapping />);
    const first = getByTestId('a');
    act(() => {
      getByRole('button').click();
    });
    drag(first, 40, 0);
    expect(events).toHaveLength(0);
    drag(getByTestId('b'), 40, 0);
    expect(phases(events)).toEqual(['began', 'changed', 'ended']);
  });
});
