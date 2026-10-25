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
import {afterEach, describe, expect, it, vi} from 'vitest';
import {PanGestureRecognizer} from '../PanGestureRecognizer';
import type {ControlEvent} from '../PressTracker';
import {useGestureRecognizer, usePressTracker} from '../useGestureRecognizer';

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

  it('ends a gesture in flight when it is disabled, without calling the listener from that commit', () => {
    const states: string[] = [];
    let pan: PanGestureRecognizer | null = null;
    const {getByTestId, rerender} = render(
      <Draggable
        onPan={r => states.push(r.state)}
        onRecognizer={r => {
          pan = r;
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
    // The handler that turned it off owns the end: no callback from an Effect
    // (architecture:react-component-runtime INV2).
    expect(states).toEqual(['began']);
    expect((pan as PanGestureRecognizer | null)?.state).not.toBe('changed');
    touch('touchmove', surface, {id: 3, x: 60, y: 0}, 32);
    expect(states).toEqual(['began']);
    touch('touchend', surface, {id: 3, x: 60, y: 0}, 48, true);
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

  it('takes an option changed after mount from the next touch', () => {
    const events: ControlEvent[] = [];
    const {getByTestId, rerender} = render(
      <Button onEvent={event => events.push(event)} />,
    );
    rerender(<Button onEvent={event => events.push(event)} cancelTravel={5} />);
    const button = getByTestId('button');
    touch('touchstart', button, {id: 7, x: 1, y: 1}, 0);
    touch('touchmove', button, {id: 7, x: 1, y: 11}, 16);
    expect(events).toEqual(['touchDown', 'touchCancel']);
    touch('touchend', button, {id: 7, x: 1, y: 11}, 50, true);
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
});
