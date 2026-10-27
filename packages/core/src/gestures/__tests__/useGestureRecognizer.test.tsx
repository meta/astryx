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
import {StrictMode, useEffect, useRef} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {SelectionLock} from '../GestureRecognizer';
import {getGestureHost} from '../GestureHost';
import {PanGestureRecognizer} from '../PanGestureRecognizer';
import type {ControlEvent} from '../PressTracker';
import {lockSelection} from '../selectionLock';
import {TapGestureRecognizer} from '../TapGestureRecognizer';
import {useGestureRecognizer, usePressTracker} from '../useGestureRecognizer';
import {coarsePrimaryPointer, pointerQuery} from './pointerQuery';

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

// A phone: the host attaches only where the primary pointer is coarse.
let restorePointer: () => void = () => {};
beforeEach(() => {
  restorePointer = coarsePrimaryPointer();
});
afterEach(() => {
  restorePointer();
});

/** Wait for the next animation frame, where the host writes touch-action. */
async function nextFrame(): Promise<void> {
  await act(async () => {
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => resolve());
    });
  });
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

  it("attaches a recognizer that reads each event's pointer where the primary pointer is fine (spec:AST-057)", () => {
    const pointer = pointerQuery(false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const onPan = vi.fn();
      function Swipe() {
        const ref = useRef<HTMLDivElement>(null);
        useGestureRecognizer(
          ref,
          () => new PanGestureRecognizer({direction: 'horizontal'}),
          onPan,
          {perEventPointer: true},
        );
        return <div data-testid="surface" ref={ref} />;
      }
      const {getByTestId, unmount} = render(<Swipe />);
      const surface = getByTestId('surface');
      touch('touchstart', surface, {id: 9, x: 0, y: 0}, 0);
      touch('touchmove', surface, {id: 9, x: 30, y: 0}, 16);
      expect(onPan).toHaveBeenCalled();
      touch('touchend', surface, {id: 9, x: 30, y: 0}, 32, true);
      unmount();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      pointer.restore();
    }
  });

  it('reports a recognizer that required the disabled one to fail after the isEnabled Effect, not inside it, in its recognized state (react-component-runtime INV2)', async () => {
    const states: string[] = [];
    const onSingle = vi.fn((recognizer: TapGestureRecognizer) => {
      states.push(recognizer.state);
    });
    function Taps({isDoubleEnabled}: {isDoubleEnabled: boolean}) {
      const ref = useRef<HTMLDivElement>(null);
      const double = useGestureRecognizer(
        ref,
        () => new TapGestureRecognizer({numberOfTapsRequired: 2}),
        undefined,
        {isEnabled: isDoubleEnabled},
      );
      const single = useGestureRecognizer(
        ref,
        () => new TapGestureRecognizer(),
        onSingle,
      );
      useEffect(() => {
        single.requireToFail(double);
      }, [single, double]);
      return <div data-testid="taps" ref={ref} />;
    }
    const {getByTestId, rerender} = render(<Taps isDoubleEnabled />);
    const surface = getByTestId('taps');
    touch('touchstart', surface, {id: 1, x: 5, y: 5}, 0);
    touch('touchend', surface, {id: 1, x: 5, y: 5}, 40, true);
    // The single tap waits for the double tap to fail.
    expect(onSingle).not.toHaveBeenCalled();
    // Turning the double tap off fails it in the Effect; the single tap
    // waiting on it recognizes in a pass just after, so its caller hears it
    // outside the Effect, reading the recognized state.
    rerender(<Taps isDoubleEnabled={false} />);
    expect(onSingle).not.toHaveBeenCalled();
    await act(async () => {
      await Promise.resolve();
    });
    expect(states).toEqual(['ended']);
  });

  it('reports a recognizer that required one a replaced node cancelled after that layout Effect, not inside it (react-component-runtime INV2)', async () => {
    const states: string[] = [];
    function Nested({innerKey}: {innerKey: string}) {
      const outerRef = useRef<HTMLDivElement>(null);
      const innerRef = useRef<HTMLDivElement>(null);
      const double = useGestureRecognizer(
        innerRef,
        () => new TapGestureRecognizer({numberOfTapsRequired: 2}),
      );
      const single = useGestureRecognizer(
        outerRef,
        () => new TapGestureRecognizer(),
        recognizer => {
          states.push(recognizer.state);
        },
      );
      useEffect(() => {
        single.requireToFail(double);
      }, [single, double]);
      return (
        <div ref={outerRef}>
          <div key={innerKey} data-testid="inner" ref={innerRef} />
        </div>
      );
    }
    const {getByTestId, rerender} = render(<Nested innerKey="first" />);
    const inner = getByTestId('inner');
    touch('touchstart', inner, {id: 2, x: 5, y: 5}, 0);
    touch('touchend', inner, {id: 2, x: 5, y: 5}, 40, true);
    expect(states).toEqual([]);
    // The double tap's node is replaced: detaching it cancels its wait in a
    // layout Effect, and the outer single tap recognizes just after.
    rerender(<Nested innerKey="second" />);
    expect(states).toEqual([]);
    await act(async () => {
      await Promise.resolve();
    });
    expect(states).toEqual(['ended']);
  });

  it('attaches nothing while disabled: no touch-action, no gesture (FR24)', async () => {
    const states: string[] = [];
    const {getByTestId, rerender} = render(
      <Draggable onPan={r => states.push(r.state)} />,
    );
    const surface = getByTestId('surface');
    // The host writes its touch-action in the next frame (FR18).
    await nextFrame();
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

  it('follows the element behind the ref when it is replaced (INV6)', () => {
    const states: string[] = [];
    function Swapped({id}: {id: string}) {
      const ref = useRef<HTMLDivElement>(null);
      useGestureRecognizer(
        ref,
        () => new PanGestureRecognizer({direction: 'horizontal'}),
        r => states.push(r.state),
      );
      return <div key={id} data-testid={id} ref={ref} />;
    }
    const {getByTestId, rerender} = render(<Swapped id="first" />);
    act(() => {
      rerender(<Swapped id="second" />);
    });
    const second = getByTestId('second');
    touch('touchstart', second, {id: 9, x: 0, y: 0}, 0);
    touch('touchmove', second, {id: 9, x: 30, y: 0}, 16);
    expect(states).toContain('began');
    touch('touchend', second, {id: 9, x: 30, y: 0}, 32, true);
  });

  it('detaches on unmount', async () => {
    const onPan = vi.fn();
    const {getByTestId, unmount} = render(<Draggable onPan={onPan} />);
    const surface = getByTestId('surface');
    // The host writes its touch-action in the next frame (FR18).
    await nextFrame();
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
  selectionLock,
  isDisabled = false,
}: {
  onEvent: (event: ControlEvent) => void;
  cancelTravel?: number;
  isBraking?: () => boolean;
  selectionLock?: SelectionLock;
  isDisabled?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  usePressTracker(ref, {
    onControlEvent: event => onEvent(event),
    cancelTravel,
    isBraking,
    selectionLock,
    isEnabled: () => !isDisabled,
  });
  return (
    <button data-testid="button" ref={ref} type="button">
      Go
    </button>
  );
}

describe('usePressTracker', () => {
  it('gives the host no listener while the control is disabled (FR24)', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const {rerender, unmount} = render(
      <Button onEvent={() => {}} isDisabled />,
    );
    const added = () =>
      add.mock.calls.filter(([type]) => type === 'touchstart').length;
    expect(added()).toBe(0);
    rerender(<Button onEvent={() => {}} />);
    expect(added()).toBe(1);
    rerender(<Button onEvent={() => {}} isDisabled />);
    expect(
      remove.mock.calls.filter(([type]) => type === 'touchstart').length,
    ).toBe(1);
    unmount();
    add.mockRestore();
    remove.mockRestore();
  });

  it('ends a press whose control, the only enabled one, is disabled under the finger: nothing reports from the commit or at the lift', () => {
    const events: ControlEvent[] = [];
    const onEvent = (event: ControlEvent) => events.push(event);
    const {getByTestId, rerender} = render(<Button onEvent={onEvent} />);
    const button = getByTestId('button');
    touch('touchstart', button, {id: 11, x: 1, y: 1}, 0);
    expect(events).toEqual(['touchDown']);
    act(() => {
      rerender(<Button onEvent={onEvent} isDisabled />);
    });
    // The commit that disables it ends the press and calls back nothing.
    expect(events).toEqual(['touchDown']);
    touch('touchend', button, {id: 11, x: 1, y: 1}, 50, true);
    expect(events).toEqual(['touchDown']);
  });

  it('ends a press whose control is disabled under the finger while another control keeps the host listening: the lift reports nothing', () => {
    const events: ControlEvent[] = [];
    const onEvent = (event: ControlEvent) => events.push(event);
    function Other() {
      const ref = useRef<HTMLButtonElement>(null);
      usePressTracker(ref);
      return (
        <button data-testid="other" ref={ref} type="button">
          Other
        </button>
      );
    }
    function Pair({isDisabled}: {isDisabled: boolean}) {
      return (
        <>
          <Button onEvent={onEvent} isDisabled={isDisabled} />
          <Other />
        </>
      );
    }
    const {getByTestId, rerender} = render(<Pair isDisabled={false} />);
    const button = getByTestId('button');
    touch('touchstart', button, {id: 12, x: 1, y: 1}, 0);
    expect(events).toEqual(['touchDown']);
    act(() => {
      rerender(<Pair isDisabled />);
    });
    expect(events).toEqual(['touchDown']);
    // A disabled control tracks no touch: the lift is no touchUpInside.
    touch('touchend', button, {id: 12, x: 1, y: 1}, 50, true);
    expect(events).toEqual(['touchDown']);
  });

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

  it('locks selection and the callout for each press of a control whose hold acts, given the lock (spec:AST-094 FR41)', () => {
    const {getByTestId} = render(
      <Button onEvent={() => {}} selectionLock={lockSelection} />,
    );
    const button = getByTestId('button');
    // Where iOS WebKit does not run, the lock refuses a selection by
    // cancelling selectstart (jsdom has no touch callout).
    const refuses = () => {
      const event = new Event('selectstart', {bubbles: true, cancelable: true});
      button.dispatchEvent(event);
      return event.defaultPrevented;
    };
    touch('touchstart', button, {id: 3, x: 1, y: 1}, 0);
    expect(refuses()).toBe(true);
    touch('touchend', button, {id: 3, x: 1, y: 1}, 50, true);
    expect(refuses()).toBe(false);
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

  it('attaches a per-event press tracker where the primary pointer is fine, which takes no mouse press there, beside one that stays inactive', () => {
    const pointer = pointerQuery(false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const held: ControlEvent[] = [];
      const inactive: ControlEvent[] = [];
      function Stepper({
        events,
        perEventPointer,
        testId,
      }: {
        events: ControlEvent[];
        perEventPointer: boolean;
        testId: string;
      }) {
        const ref = useRef<HTMLButtonElement>(null);
        usePressTracker(ref, {
          onControlEvent: event => events.push(event),
          perEventPointer,
        });
        return (
          <button data-testid={testId} ref={ref} type="button">
            +
          </button>
        );
      }
      const {getByTestId} = render(
        <>
          <Stepper events={held} perEventPointer testId="held" />
          <Stepper events={inactive} perEventPointer={false} testId="other" />
        </>,
      );
      const mouse = (type: string, target: Element, id: number) => {
        const event = new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: id,
          pointerType: 'mouse',
          clientX: 5,
          clientY: 5,
          button: 0,
          buttons: type === 'pointerdown' ? 1 : 0,
        });
        target.dispatchEvent(event);
      };
      const stepper = getByTestId('held');
      boundsOf(stepper, 44, 44);
      mouse('pointerdown', stepper, 1);
      mouse('pointerup', stepper, 1);
      // Its press feedback is for a finger (spec:AST-094 FR19): a mouse
      // keeps the desktop's handling.
      expect(held).toEqual([]);
      const other = getByTestId('other');
      boundsOf(other, 44, 44);
      mouse('pointerdown', other, 2);
      mouse('pointerup', other, 2);
      expect(inactive).toEqual([]);
    } finally {
      warn.mockRestore();
      pointer.restore();
    }
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

  function PressInTaps({
    isDoubleEnabled,
    hasSingle,
    onEvent,
  }: {
    isDoubleEnabled: boolean;
    hasSingle: boolean;
    onEvent: (event: ControlEvent | 'highlight' | 'unhighlight') => void;
  }) {
    const outerRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLButtonElement>(null);
    const double = useGestureRecognizer(
      outerRef,
      () => new TapGestureRecognizer({numberOfTapsRequired: 2}),
      undefined,
      {isEnabled: isDoubleEnabled},
    );
    const single = useGestureRecognizer(
      outerRef,
      () => new TapGestureRecognizer(),
      undefined,
      {isEnabled: hasSingle},
    );
    useEffect(() => {
      single.requireToFail(double);
    }, [single, double]);
    usePressTracker(innerRef, {
      onControlEvent: onEvent,
      onHighlightChange: isHighlighted =>
        onEvent(isHighlighted ? 'highlight' : 'unhighlight'),
    });
    return (
      <div ref={outerRef}>
        <button data-testid="press" ref={innerRef} type="button" />
      </div>
    );
  }

  it.each([
    ['alone', false],
    ['with a single tap waiting on it', true],
  ])(
    'ends a press that waits on an ancestor double tap after, not inside, the isEnabled Effect that turns it off (%s; react-component-runtime INV2)',
    async (_event, hasSingle) => {
      const events: (ControlEvent | 'highlight' | 'unhighlight')[] = [];
      const {getByTestId, rerender} = render(
        <PressInTaps
          isDoubleEnabled
          hasSingle={hasSingle}
          onEvent={event => events.push(event)}
        />,
      );
      const button = getByTestId('press');
      touch('touchstart', button, {id: 21, x: 1, y: 1}, 0);
      touch('touchend', button, {id: 21, x: 1, y: 1}, 40, true);
      const before = [...events];
      // Turning the double tap off fails it in the Effect: whatever that
      // arena pass resolves for the press reaches no caller callback.
      rerender(
        <PressInTaps
          isDoubleEnabled={false}
          hasSingle={hasSingle}
          onEvent={event => events.push(event)}
        />,
      );
      expect(events).toEqual(before);
      // Just after it, the press ends and un-highlights: nothing is left
      // highlighted.
      await act(async () => {
        await Promise.resolve();
      });
      expect(events.slice(before.length)).toEqual([
        'touchUpInside',
        'unhighlight',
      ]);
    },
  );

  it('tracks the element behind the ref when it is replaced (INV6)', () => {
    const events: ControlEvent[] = [];
    function Swapped({id}: {id: string}) {
      const ref = useRef<HTMLButtonElement>(null);
      usePressTracker(ref, {onControlEvent: event => events.push(event)});
      return <button key={id} data-testid={id} ref={ref} type="button" />;
    }
    const {getByTestId, rerender} = render(<Swapped id="first" />);
    act(() => {
      rerender(<Swapped id="second" />);
    });
    const second = getByTestId('second');
    touch('touchstart', second, {id: 10, x: 1, y: 1}, 0);
    touch('touchend', second, {id: 10, x: 1, y: 1}, 50, true);
    expect(events).toEqual(['touchDown', 'touchUpInside']);
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

function SwappedSurface({
  which,
  onPan,
}: {
  which: 'a' | 'b';
  onPan: (recognizer: PanGestureRecognizer) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useGestureRecognizer(
    ref,
    () => new PanGestureRecognizer({direction: 'horizontal'}),
    onPan,
  );
  return which === 'a' ? (
    <div key="a" data-testid="a" ref={ref} />
  ) : (
    <div key="b" data-testid="b" ref={ref} />
  );
}

describe('useGestureRecognizer follows a replaced node', () => {
  for (const strict of [false, true]) {
    it(`cancels a gesture in flight without calling the listener from the effect${strict ? ' (StrictMode)' : ''}`, () => {
      const states: string[] = [];
      const wrap = (node: React.ReactElement) =>
        strict ? <StrictMode>{node}</StrictMode> : node;
      const {getByTestId, rerender} = render(
        wrap(<SwappedSurface which="a" onPan={r => states.push(r.state)} />),
      );
      const a = getByTestId('a');
      touch('touchstart', a, {id: 3, x: 0, y: 0}, 0);
      touch('touchmove', a, {id: 3, x: 30, y: 0}, 16);
      expect(states).toEqual(['began']);
      rerender(
        wrap(<SwappedSurface which="b" onPan={r => states.push(r.state)} />),
      );
      // The replaced node's cancel comes from a layout effect: no callback.
      expect(states).toEqual(['began']);
      // The new node drives the same recognizer.
      const b = getByTestId('b');
      touch('touchstart', b, {id: 4, x: 0, y: 0}, 100);
      touch('touchmove', b, {id: 4, x: 30, y: 0}, 116);
      expect(states).toEqual(['began', 'began']);
      touch('touchend', b, {id: 4, x: 30, y: 0}, 132, true);
    });
  }
});

describe('usePressTracker keeps its press through an option change', () => {
  for (const strict of [false, true]) {
    it(`a press in progress survives a rerender with new options${strict ? ' (StrictMode)' : ''}`, () => {
      const events: ControlEvent[] = [];
      const highlights: boolean[] = [];
      function Held({cancelTravel}: {cancelTravel?: number}) {
        const ref = useRef<HTMLButtonElement>(null);
        usePressTracker(ref, {
          onControlEvent: event => events.push(event),
          onHighlightChange: isHighlighted => highlights.push(isHighlighted),
          cancelTravel,
        });
        return (
          <button data-testid="held" ref={ref} type="button">
            Go
          </button>
        );
      }
      const wrap = (node: React.ReactElement) =>
        strict ? <StrictMode>{node}</StrictMode> : node;
      const {getByTestId, rerender} = render(wrap(<Held />));
      const button = getByTestId('held');
      touch('touchstart', button, {id: 6, x: 1, y: 1}, 0);
      expect(highlights).toEqual([true]);
      rerender(wrap(<Held cancelTravel={50} />));
      // Still pressed: the tracker was not rebuilt or disposed.
      expect(highlights).toEqual([true]);
      touch('touchend', button, {id: 6, x: 1, y: 1}, 50, true);
      expect(events).toEqual(['touchDown', 'touchUpInside']);
    });
  }
});

describe('the hooks let go of an element removed while they stay mounted', () => {
  it('useGestureRecognizer cancels its gesture without calling back, and works on a new element', () => {
    const states: string[] = [];
    function Maybe({shown}: {shown: boolean}) {
      const ref = useRef<HTMLDivElement>(null);
      useGestureRecognizer(
        ref,
        () => new PanGestureRecognizer({direction: 'horizontal'}),
        r => states.push(r.state),
      );
      return shown ? <div data-testid="maybe" ref={ref} /> : null;
    }
    const {getByTestId, rerender} = render(<Maybe shown />);
    const first = getByTestId('maybe');
    touch('touchstart', first, {id: 11, x: 0, y: 0}, 0);
    touch('touchmove', first, {id: 11, x: 30, y: 0}, 16);
    expect(states).toEqual(['began']);
    rerender(<Maybe shown={false} />);
    expect(states).toEqual(['began']);
    rerender(<Maybe shown />);
    const second = getByTestId('maybe');
    touch('touchstart', second, {id: 12, x: 0, y: 0}, 100);
    touch('touchmove', second, {id: 12, x: 30, y: 0}, 116);
    expect(states).toEqual(['began', 'began']);
    touch('touchend', second, {id: 12, x: 30, y: 0}, 132, true);
  });

  it('usePressTracker ends its press without calling back, and presses a new element', () => {
    const events: ControlEvent[] = [];
    const highlights: boolean[] = [];
    function Maybe({shown}: {shown: boolean}) {
      const ref = useRef<HTMLButtonElement>(null);
      usePressTracker(ref, {
        onControlEvent: event => events.push(event),
        onHighlightChange: isHighlighted => highlights.push(isHighlighted),
      });
      return shown ? (
        <button data-testid="maybe" ref={ref} type="button">
          Go
        </button>
      ) : null;
    }
    const {getByTestId, rerender} = render(<Maybe shown />);
    touch('touchstart', getByTestId('maybe'), {id: 13, x: 1, y: 1}, 0);
    expect(highlights).toEqual([true]);
    rerender(<Maybe shown={false} />);
    expect(highlights).toEqual([true]);
    expect(events).toEqual(['touchDown']);
    rerender(<Maybe shown />);
    const button = getByTestId('maybe');
    touch('touchstart', button, {id: 14, x: 1, y: 1}, 100);
    touch('touchend', button, {id: 14, x: 1, y: 1}, 150, true);
    expect(events).toEqual(['touchDown', 'touchDown', 'touchUpInside']);
  });
});

describe('usePressTracker reads trackingExpansion as it is now', () => {
  it('a smaller expansion takes effect without rebuilding the tracker', () => {
    const events: ControlEvent[] = [];
    function Tracked({expansion}: {expansion: number}) {
      const ref = useRef<HTMLButtonElement>(null);
      usePressTracker(ref, {
        onControlEvent: event => events.push(event),
        trackingExpansion: expansion,
      });
      return (
        <button data-testid="tracked" ref={ref} type="button">
          Go
        </button>
      );
    }
    const {getByTestId, rerender} = render(<Tracked expansion={70} />);
    const button = getByTestId('tracked');
    boundsOf(button, 100, 40);
    touch('touchstart', button, {id: 15, x: 10, y: 10}, 0);
    // 30 px below the bottom edge: inside a 70 px expansion.
    touch('touchmove', button, {id: 15, x: 10, y: 70}, 16);
    expect(events).not.toContain('touchDragExit');
    rerender(<Tracked expansion={10} />);
    // The same point is outside a 10 px expansion, mid-press.
    touch('touchmove', button, {id: 15, x: 10, y: 71}, 32);
    expect(events).toContain('touchDragExit');
    touch('touchend', button, {id: 15, x: 10, y: 71}, 48, true);
    expect(events).toContain('touchUpOutside');
  });
});
