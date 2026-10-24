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

  it('cancels a gesture in flight when it is disabled', () => {
    const states: string[] = [];
    const {getByTestId, rerender} = render(
      <Draggable onPan={r => states.push(r.state)} />,
    );
    const surface = getByTestId('surface');
    touch('touchstart', surface, {id: 3, x: 0, y: 0}, 0);
    touch('touchmove', surface, {id: 3, x: 30, y: 0}, 16);
    act(() => {
      rerender(
        <Draggable onPan={r => states.push(r.state)} isEnabled={false} />,
      );
    });
    expect(states).toEqual(['began', 'cancelled']);
    touch('touchend', surface, {id: 3, x: 30, y: 0}, 32, true);
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

function Button({onEvent}: {onEvent: (event: ControlEvent) => void}) {
  const ref = useRef<HTMLButtonElement>(null);
  usePressTracker(ref, {onControlEvent: event => onEvent(event)});
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
});

function Swappable({
  as,
  onPan,
}: {
  as: 'none' | 'div' | 'span';
  onPan: (recognizer: PanGestureRecognizer) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useGestureRecognizer(
    ref,
    () => new PanGestureRecognizer({direction: 'horizontal'}),
    onPan,
  );
  if (as === 'none') {
    return null;
  }
  return as === 'div' ? (
    <div data-testid="node" ref={ref as React.RefObject<HTMLDivElement>} />
  ) : (
    <span data-testid="node" ref={ref} />
  );
}

describe('useGestureRecognizer follows the element behind its ref', () => {
  it('attaches to a node rendered after mount, and to a node swapped behind the same ref', () => {
    const states: string[] = [];
    const onPan = (r: PanGestureRecognizer) => states.push(r.state);
    const {getByTestId, rerender} = render(
      <Swappable as="none" onPan={onPan} />,
    );
    rerender(<Swappable as="div" onPan={onPan} />);
    const first = getByTestId('node');
    touch('touchstart', first, {id: 1, x: 0, y: 0}, 0);
    touch('touchmove', first, {id: 1, x: 30, y: 0}, 16);
    touch('touchend', first, {id: 1, x: 30, y: 0}, 32, true);
    expect(states).toContain('began');
    states.length = 0;
    rerender(<Swappable as="span" onPan={onPan} />);
    const second = getByTestId('node');
    expect(second).not.toBe(first);
    touch('touchstart', second, {id: 2, x: 0, y: 0}, 100);
    touch('touchmove', second, {id: 2, x: 30, y: 0}, 116);
    touch('touchend', second, {id: 2, x: 30, y: 0}, 132, true);
    expect(states).toContain('began');
    // The detached node no longer drives it.
    states.length = 0;
    touch('touchstart', first, {id: 3, x: 0, y: 0}, 200);
    touch('touchmove', first, {id: 3, x: 30, y: 0}, 216);
    touch('touchend', first, {id: 3, x: 30, y: 0}, 232, true);
    expect(states).toEqual([]);
  });

  it('reports nothing from cleanup when it unmounts mid-gesture', () => {
    const states: string[] = [];
    const {getByTestId, unmount} = render(
      <Draggable onPan={r => states.push(r.state)} />,
    );
    const surface = getByTestId('surface');
    touch('touchstart', surface, {id: 5, x: 0, y: 0}, 0);
    touch('touchmove', surface, {id: 5, x: 30, y: 0}, 16);
    expect(states).toEqual(['began']);
    unmount();
    expect(states).toEqual(['began']);
  });
});

function LaterButton({
  isShown,
  onEvent,
  onHighlight,
  isBraking,
  highlightDelay,
}: {
  isShown: boolean;
  onEvent?: (event: ControlEvent) => void;
  onHighlight?: (isOn: boolean) => void;
  isBraking?: () => boolean;
  highlightDelay?: 'inScrollers' | 'always' | 'never';
}) {
  const ref = useRef<HTMLButtonElement>(null);
  usePressTracker(ref, {
    onControlEvent: event => onEvent?.(event),
    onHighlightChange: isOn => onHighlight?.(isOn),
    isBraking,
    highlightDelay,
  });
  return isShown ? (
    <button data-testid="stepper" ref={ref} type="button">
      +
    </button>
  ) : null;
}

describe('usePressTracker follows its element and its options', () => {
  it('tracks a node rendered after mount', () => {
    const events: ControlEvent[] = [];
    const {getByTestId, rerender} = render(
      <LaterButton isShown={false} onEvent={event => events.push(event)} />,
    );
    rerender(<LaterButton isShown onEvent={event => events.push(event)} />);
    const stepper = getByTestId('stepper');
    touch('touchstart', stepper, {id: 1, x: 2, y: 2}, 0);
    touch('touchend', stepper, {id: 1, x: 2, y: 2}, 60, true);
    expect(events).toContain('touchUpInside');
  });

  it("uses the caller's brake", () => {
    const events: ControlEvent[] = [];
    const {getByTestId} = render(
      <LaterButton
        isShown
        isBraking={() => true}
        onEvent={event => events.push(event)}
      />,
    );
    const stepper = getByTestId('stepper');
    touch('touchstart', stepper, {id: 1, x: 2, y: 2}, 0);
    touch('touchend', stepper, {id: 1, x: 2, y: 2}, 60, true);
    expect(events).not.toContain('touchDown');
    expect(events).not.toContain('touchUpInside');
  });

  it('takes a highlight delay changed after mount from the next touch', () => {
    vi.useFakeTimers();
    const highlights: boolean[] = [];
    const {getByTestId, rerender} = render(
      <LaterButton
        isShown
        highlightDelay="never"
        onHighlight={isOn => highlights.push(isOn)}
      />,
    );
    rerender(
      <LaterButton
        isShown
        highlightDelay="always"
        onHighlight={isOn => highlights.push(isOn)}
      />,
    );
    const stepper = getByTestId('stepper');
    touch('touchstart', stepper, {id: 1, x: 2, y: 2}, 0);
    // 'always' waits the content-touch delay before highlighting.
    expect(highlights).toEqual([]);
    touch('touchend', stepper, {id: 1, x: 2, y: 2}, 400, true);
    vi.useRealTimers();
  });

  it('calls no callback from cleanup when it unmounts while highlighted', () => {
    const highlights: boolean[] = [];
    const {getByTestId, unmount} = render(
      <LaterButton
        isShown
        highlightDelay="never"
        onHighlight={isOn => highlights.push(isOn)}
      />,
    );
    const stepper = getByTestId('stepper');
    touch('touchstart', stepper, {id: 1, x: 2, y: 2}, 0);
    expect(highlights).toEqual([true]);
    unmount();
    expect(highlights).toEqual([true]);
  });
});

function boundsOf(element: HTMLElement, width: number, height: number): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
}

function SwappedColumn({
  which,
  freshRef,
  onEvent,
}: {
  which: 'a' | 'b';
  freshRef: boolean;
  onEvent: (event: ControlEvent) => void;
}) {
  const stableRef = useRef<HTMLButtonElement>(null);
  const fresh = {current: null as HTMLButtonElement | null};
  const ref = freshRef ? fresh : stableRef;
  usePressTracker(ref, {onControlEvent: event => onEvent(event)});
  return which === 'a' ? (
    <button key="a" data-testid="a" ref={ref} type="button">
      A
    </button>
  ) : (
    <button key="b" data-testid="b" ref={ref} type="button">
      B
    </button>
  );
}

describe('usePressTracker hit-tests the element behind its ref now', () => {
  for (const freshRef of [false, true]) {
    it(`judges a lift against the swapped node's bounds (${freshRef ? 'a new ref object' : 'the same ref'})`, () => {
      const events: ControlEvent[] = [];
      const {getByTestId, rerender} = render(
        <SwappedColumn
          which="a"
          freshRef={freshRef}
          onEvent={event => events.push(event)}
        />,
      );
      rerender(
        <SwappedColumn
          which="b"
          freshRef={freshRef}
          onEvent={event => events.push(event)}
        />,
      );
      const b = getByTestId('b');
      boundsOf(b, 100, 40);
      touch('touchstart', b, {id: 1, x: 10, y: 10}, 0);
      // Far outside B, past the tracking expansion.
      touch('touchmove', b, {id: 1, x: 400, y: 400}, 16);
      touch('touchend', b, {id: 1, x: 400, y: 400}, 32, true);
      expect(events).toContain('touchDown');
      expect(events).toContain('touchUpOutside');
      expect(events).not.toContain('touchUpInside');
    });
  }
});
