// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useGestureRecognizer.test.tsx
 * @input React components using useGestureRecognizer / usePressTracker, and
 *   touch events dispatched on their elements
 * @output The hooks keep one recognizer per component, attach before the
 *   first touch, run the latest listener without rendering per move, and
 *   detach on unmount
 * @position jsdom tests of packages/core/src/gestures/useGestureRecognizer.ts
 */

import {act, render} from '@testing-library/react';
import {useRef} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {getGestureHost} from '../GestureHost';
import {PanGestureRecognizer} from '../PanGestureRecognizer';
import type {ControlEvent} from '../PressTracker';
import {useGestureRecognizer, usePressTracker} from '../useGestureRecognizer';
import {coarsePrimaryPointer} from './harness';

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

let renders = 0;

function Draggable({
  onPan,
  onRecognizer,
  isEnabled = true,
}: {
  onPan: (recognizer: PanGestureRecognizer) => void;
  onRecognizer?: (recognizer: PanGestureRecognizer) => void;
  isEnabled?: boolean;
}) {
  renders += 1;
  const ref = useRef<HTMLDivElement>(null);
  const pan = useGestureRecognizer(
    ref,
    () => new PanGestureRecognizer({direction: 'horizontal'}),
    onPan,
    {isEnabled},
  );
  onRecognizer?.(pan);
  return <div data-testid="surface" ref={ref} />;
}

// A phone: the document's host listens only where the pointer is coarse.
let restorePointer: () => void = () => {};
beforeEach(() => {
  restorePointer = coarsePrimaryPointer();
});
afterEach(() => {
  restorePointer();
});

describe('useGestureRecognizer', () => {
  afterEach(() => {
    renders = 0;
  });

  it('drives the latest listener with no render per move', () => {
    const seen: string[] = [];
    const {getByTestId} = render(
      <Draggable
        onPan={recognizer => {
          seen.push(`${recognizer.state}:${recognizer.translation().x}`);
        }}
      />,
    );
    const surface = getByTestId('surface');
    expect(renders).toBe(1);
    touch('touchstart', surface, {id: 1, x: 0, y: 0}, 0);
    for (let x = 6; x <= 36; x += 6) {
      touch('touchmove', surface, {id: 1, x, y: 0}, x * 2);
    }
    touch('touchend', surface, {id: 1, x: 36, y: 0}, 80, true);
    // The 10 px hysteresis is left out of the translation, as in UIKit.
    expect(seen).toEqual([
      'began:2',
      'changed:8',
      'changed:14',
      'changed:20',
      'changed:26',
      'ended:26',
    ]);
    expect(renders).toBe(1);
  });

  it('keeps one recognizer across renders and reads the newest listener', () => {
    const identities = new Set<PanGestureRecognizer>();
    const first = vi.fn();
    const second = vi.fn();
    const {getByTestId, rerender} = render(
      <Draggable onPan={first} onRecognizer={r => identities.add(r)} />,
    );
    rerender(
      <Draggable onPan={second} onRecognizer={r => identities.add(r)} />,
    );
    expect(identities.size).toBe(1);
    const surface = getByTestId('surface');
    touch('touchstart', surface, {id: 2, x: 0, y: 0}, 0);
    touch('touchmove', surface, {id: 2, x: 30, y: 0}, 16);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    touch('touchend', surface, {id: 2, x: 30, y: 0}, 32, true);
  });

  it('cancels a gesture in flight when it is disabled, without calling the listener from the effect', () => {
    const states: string[] = [];
    // A listener of the recognizer's own, outside the hook, hears the cancel.
    const heard: string[] = [];
    let pan: PanGestureRecognizer | null = null;
    const {getByTestId, rerender} = render(
      <Draggable
        onPan={r => states.push(r.state)}
        onRecognizer={r => {
          if (pan == null) {
            pan = r;
            r.addListener(current => heard.push(current.state));
          }
        }}
      />,
    );
    const surface = getByTestId('surface');
    touch('touchstart', surface, {id: 3, x: 0, y: 0}, 0);
    touch('touchmove', surface, {id: 3, x: 30, y: 0}, 16);
    act(() => {
      rerender(
        <Draggable onPan={r => states.push(r.state)} isEnabled={false} />,
      );
    });
    // Disabling cancels the gesture; its attachment then goes (FR24), which
    // leaves the recognizer at rest. The hook reports nothing from the effect.
    expect(heard).toContain('cancelled');
    expect(pan!.state).not.toBe('changed');
    expect(states).toEqual(['began']);
    touch('touchend', surface, {id: 3, x: 30, y: 0}, 32, true);
    expect(states).toEqual(['began']);
  });

  it('follows the element when the node behind the ref is replaced', () => {
    const onPan = vi.fn();
    function Swappable({tag}: {tag: 'div' | 'section'}) {
      const ref = useRef<HTMLElement>(null);
      useGestureRecognizer(
        ref,
        () => new PanGestureRecognizer({direction: 'horizontal'}),
        onPan,
      );
      const Tag = tag;
      return <Tag data-testid="surface" ref={ref as never} />;
    }
    const {getByTestId, rerender} = render(<Swappable tag="div" />);
    const first = getByTestId('surface');
    rerender(<Swappable tag="section" />);
    const second = getByTestId('surface');
    expect(second).not.toBe(first);
    touch('touchstart', first, {id: 6, x: 0, y: 0}, 0);
    touch('touchmove', first, {id: 6, x: 30, y: 0}, 16);
    touch('touchend', first, {id: 6, x: 30, y: 0}, 32, true);
    expect(onPan).not.toHaveBeenCalled();
    touch('touchstart', second, {id: 7, x: 0, y: 0}, 100);
    touch('touchmove', second, {id: 7, x: 30, y: 0}, 116);
    expect(onPan).toHaveBeenCalled();
    touch('touchend', second, {id: 7, x: 30, y: 0}, 132, true);
  });

  it('reports cancelled to a handler that disables the recognizer itself, from that handler', () => {
    const states: string[] = [];
    let pan: PanGestureRecognizer | null = null;
    const {getByTestId} = render(
      <Draggable
        onPan={r => states.push(r.state)}
        onRecognizer={r => {
          pan = r;
        }}
      />,
    );
    const surface = getByTestId('surface');
    touch('touchstart', surface, {id: 6, x: 0, y: 0}, 0);
    touch('touchmove', surface, {id: 6, x: 30, y: 0}, 16);
    // A handler (here, the test) turns it off: UIKit's .cancelled, at once.
    (pan as PanGestureRecognizer | null)?.setEnabled(false);
    expect(states).toEqual(['began', 'cancelled']);
    touch('touchend', surface, {id: 6, x: 30, y: 0}, 32, true);
  });

  it('attaches nothing while disabled: no touch-action, no gesture (FR24)', () => {
    const states: string[] = [];
    const {getByTestId, rerender} = render(
      <Draggable onPan={r => states.push(r.state)} />,
    );
    const surface = getByTestId('surface');
    const remove = vi.spyOn(surface.style, 'removeProperty');
    act(() => {
      rerender(
        <Draggable onPan={r => states.push(r.state)} isEnabled={false} />,
      );
    });
    // Disabling detaches: the host gives the element its touch-action back.
    expect(remove).toHaveBeenCalledWith('touch-action');
    touch('touchstart', surface, {id: 6, x: 0, y: 0}, 0);
    touch('touchmove', surface, {id: 6, x: 30, y: 0}, 16);
    touch('touchend', surface, {id: 6, x: 30, y: 0}, 32, true);
    expect(states).toEqual([]);
    act(() => {
      rerender(<Draggable onPan={r => states.push(r.state)} />);
    });
    touch('touchstart', surface, {id: 8, x: 0, y: 0}, 100);
    touch('touchmove', surface, {id: 8, x: 30, y: 0}, 116);
    expect(states).toContain('began');
    touch('touchend', surface, {id: 8, x: 30, y: 0}, 132, true);
  });

  it('detaches on unmount', () => {
    const onPan = vi.fn();
    const {getByTestId, unmount} = render(<Draggable onPan={onPan} />);
    const surface = getByTestId('surface');
    const remove = vi.spyOn(surface.style, 'removeProperty');
    unmount();
    expect(remove).toHaveBeenCalledWith('touch-action');
    touch('touchstart', surface, {id: 4, x: 0, y: 0}, 0);
    touch('touchmove', surface, {id: 4, x: 30, y: 0}, 16);
    expect(onPan).not.toHaveBeenCalled();
  });
});

function Button({
  onEvent,
  cancelTravel,
  isBraking,
}: {
  onEvent: (event: ControlEvent) => void;
  cancelTravel?: number;
  isBraking?: () => boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  usePressTracker(ref, {
    onControlEvent: event => onEvent(event),
    cancelTravel,
    isBraking,
  });
  return (
    <button data-testid="button" ref={ref} type="button">
      Go
    </button>
  );
}

describe('usePressTracker', () => {
  it('reports UIControl events for a tap', () => {
    const events: ControlEvent[] = [];
    const {getByTestId} = render(
      <Button onEvent={event => events.push(event)} />,
    );
    const button = getByTestId('button');
    touch('touchstart', button, {id: 5, x: 1, y: 1}, 0);
    touch('touchend', button, {id: 5, x: 1, y: 1}, 50, true);
    expect(events).toEqual(['touchDown', 'touchUpInside']);
  });

  it('ends a held press on unmount without calling back from the effect', () => {
    const highlights: boolean[] = [];
    const events: ControlEvent[] = [];
    function HeldButton() {
      const ref = useRef<HTMLButtonElement>(null);
      usePressTracker(ref, {
        onControlEvent: event => events.push(event),
        onHighlightChange: isHighlighted => highlights.push(isHighlighted),
      });
      return (
        <button data-testid="held" ref={ref} type="button">
          Go
        </button>
      );
    }
    const {getByTestId, unmount} = render(<HeldButton />);
    touch('touchstart', getByTestId('held'), {id: 9, x: 1, y: 1}, 0);
    const seenHighlights = [...highlights];
    const seenEvents = [...events];
    unmount();
    expect(highlights).toEqual(seenHighlights);
    expect(events).toEqual(seenEvents);
  });

  it('passes isBraking through to the tracker', () => {
    const events: ControlEvent[] = [];
    const isBraking = vi.fn(() => true);
    function BrakingButton() {
      const ref = useRef<HTMLButtonElement>(null);
      usePressTracker(ref, {
        onControlEvent: event => events.push(event),
        isBraking,
      });
      return (
        <button data-testid="braking" ref={ref} type="button">
          Go
        </button>
      );
    }
    const {getByTestId} = render(<BrakingButton />);
    const button = getByTestId('braking');
    touch('touchstart', button, {id: 8, x: 1, y: 1}, 0);
    touch('touchend', button, {id: 8, x: 1, y: 1}, 50, true);
    expect(isBraking).toHaveBeenCalled();
    expect(events).not.toContain('touchDown');
  });

  it("uses the caller's scroll brake", () => {
    const events: ControlEvent[] = [];
    const {getByTestId} = render(
      <Button onEvent={event => events.push(event)} isBraking={() => true} />,
    );
    const button = getByTestId('button');
    touch('touchstart', button, {id: 8, x: 1, y: 1}, 0);
    touch('touchend', button, {id: 8, x: 1, y: 1}, 50, true);
    expect(events).toEqual([]);
  });

  it('presses nothing for a touch that brakes a scroll', () => {
    const events: ControlEvent[] = [];
    const {getByTestId} = render(
      <Button onEvent={event => events.push(event)} />,
    );
    const button = getByTestId('button');
    const brake = vi
      .spyOn(getGestureHost(document), 'isScrollBraking')
      .mockReturnValue(true);
    touch('touchstart', button, {id: 7, x: 1, y: 1}, 0);
    touch('touchend', button, {id: 7, x: 1, y: 1}, 50, true);
    expect(events).toEqual([]);
    brake.mockRestore();
  });
});
