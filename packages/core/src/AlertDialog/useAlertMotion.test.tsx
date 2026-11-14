// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useAlertMotion.test.tsx
 * @input A component using useAlertMotion, with the motion animator replaced
 *   by a recorder whose animations end when the test says so
 * @output The touch motion contract: the presentation plays scale 1.2 to 1
 *   and opacity 0 to 1, with the dimming, on the theme's entrance timing; the
 *   dismissal fades from where it is on the exit tokens and keeps the alert
 *   presented until the fade ends; a reopen fades back from where it is;
 *   pointer input waits while either transition runs; no spring plays
 * @position jsdom tests of packages/core/src/AlertDialog/useAlertMotion.ts
 */

import {act, render} from '@testing-library/react';
import {StrictMode, type CSSProperties} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {MotionCurve} from '../motion/animator';
import {cubicBezier} from '../motion/bezier';
import {parseCssEasing} from '../motion/roles';
import {declaredTimingTokens} from '../motion/themeTiming';
import {isInHeldLayer} from '../Layer/inputHold';
import {useAlertMotion, type AlertMotion} from './useAlertMotion';

type RecordedCall =
  | {kind: 'attach'; target: unknown}
  | {kind: 'set'; values: Record<string, number>}
  | {kind: 'play'; curves: Record<string, MotionCurve>}
  | {kind: 'animate'};

interface Recorded {
  readonly options: {pseudoElement?: string; base?: Record<string, number>};
  readonly calls: RecordedCall[];
  /** What `get` answers: the values on screen. */
  presented: Record<string, number>;
  /** Ends each `play` call's animation, in call order. */
  readonly endings: ((isDone: boolean) => void)[];
}

const {recorded} = vi.hoisted(() => ({recorded: [] as Recorded[]}));

vi.mock('../motion/animator', () => ({
  createMotionEngine: (
    _element: unknown,
    options: {pseudoElement?: string; base?: Record<string, number>} = {},
  ) => {
    const record: Recorded = {options, calls: [], endings: [], presented: {}};
    recorded.push(record);
    let element: unknown = null;
    const handle = (properties: string[]) => {
      let end: (isDone: boolean) => void = () => {};
      const finished = new Promise<boolean>(resolve => {
        end = resolve;
      });
      record.endings.push(end);
      return {
        properties,
        finished,
        started: new Promise<number>(() => {}),
        value: () => 0,
        velocity: () => 0,
        curve: () => null,
        retarget: () => {
          throw new Error('not used');
        },
        stop: () => {},
      };
    };
    return {
      reducedMotion: () => 'off',
      get element() {
        return element;
      },
      attach: (target: unknown) => {
        element = target;
        record.calls.push({kind: 'attach', target});
      },
      set: (values: Record<string, number>) =>
        record.calls.push({kind: 'set', values}),
      play: (curves: Record<string, MotionCurve>) => {
        record.calls.push({kind: 'play', curves});
        return handle(Object.keys(curves));
      },
      animate: () => {
        record.calls.push({kind: 'animate'});
        return handle([]);
      },
      get: (property: string) => record.presented[property] ?? 0,
      getVelocity: () => 0,
      decay: () => {
        throw new Error('not used');
      },
      rebase: () => {},
      stop: () => {},
      atRest: async () => {},
      dispose: () => {},
    };
  },
}));

let latest: AlertMotion | null = null;

function Alert({
  isOpen,
  isEnabled,
  style,
}: {
  isOpen: boolean;
  isEnabled: boolean;
  style?: CSSProperties;
}) {
  const motion = useAlertMotion({isOpen, isEnabled});
  latest = motion;
  return (
    <div ref={motion.ref} data-testid="alert" style={style}>
      <button type="button">Delete</button>
    </div>
  );
}

const motion = (): AlertMotion => {
  if (latest == null) {
    throw new Error('not rendered');
  }
  return latest;
};

/** Whether the input hold keeps a finger's input from the alert. */
const isHeld = (): boolean =>
  isInHeldLayer(document.querySelector('[data-testid="alert"]'));

/** The two animators the hook made: the alert and its dimming. */
function animators(): {panel: Recorded; backdrop: Recorded} {
  const panel = recorded.find(r => r.options.pseudoElement == null);
  const backdrop = recorded.find(r => r.options.pseudoElement === '::backdrop');
  if (panel == null || backdrop == null) {
    throw new Error('animators not created');
  }
  return {panel, backdrop};
}

const moves = (record: Recorded) =>
  record.calls.filter(call => call.kind !== 'attach');

/** The curves of the last `play` call on `record`. */
function lastCurves(record: Recorded): Record<string, MotionCurve> {
  const call = moves(record).at(-1);
  if (call?.kind !== 'play') {
    throw new Error(`the last move is ${call?.kind ?? 'nothing'}, not play`);
  }
  return call.curves;
}

/** Core's own value of a timing token, in seconds or as an easing. */
const ENTRANCE_S =
  parseFloat(declaredTimingTokens['--duration-medium-max']) / 1000;
const EXIT_S = parseFloat(declaredTimingTokens['--duration-fast']) / 1000;
/** Core's own curve for an easing token. */
function easeOf(token: '--ease-entrance' | '--ease-exit') {
  const points = parseCssEasing(declaredTimingTokens[token]);
  if (points == null) {
    throw new Error(`${token} is no cubic-bezier`);
  }
  return cubicBezier(points);
}
const ENTRANCE_EASE = easeOf('--ease-entrance');
const EXIT_EASE = easeOf('--ease-exit');

/** Expects `curve` to carry `from` to `to` over `seconds` on `ease`. */
function expectTimed(
  curve: MotionCurve | undefined,
  from: number,
  to: number,
  seconds: number,
  ease: (x: number) => number,
) {
  expect(curve?.duration).toBeCloseTo(seconds, 6);
  expect(curve?.at(0)).toBeCloseTo(from, 6);
  expect(curve?.at(seconds)).toBeCloseTo(to, 6);
  for (const x of [0.25, 0.5, 0.75]) {
    expect(curve?.at(seconds * x)).toBeCloseTo(from + (to - from) * ease(x), 4);
  }
}

beforeEach(() => {
  recorded.length = 0;
  latest = null;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useAlertMotion', () => {
  it("presents from scale 1.2 and opacity 0 with the dimming, on the theme's entrance timing", () => {
    render(<Alert isOpen isEnabled />);
    const {panel, backdrop} = animators();
    expect(moves(panel)[0]).toEqual({
      kind: 'set',
      values: {opacity: 0, scale: 1.2},
    });
    expect(moves(backdrop)[0]).toEqual({kind: 'set', values: {opacity: 0}});
    const alert = lastCurves(panel);
    expect(Object.keys(alert).sort()).toEqual(['opacity', 'scale']);
    expectTimed(alert.opacity, 0, 1, ENTRANCE_S, ENTRANCE_EASE);
    expectTimed(alert.scale, 1.2, 1, ENTRANCE_S, ENTRANCE_EASE);
    expectTimed(lastCurves(backdrop).opacity, 0, 1, ENTRANCE_S, ENTRANCE_EASE);
    expect(motion().isPresented).toBe(true);
    expect(motion().isDriving).toBe(true);
  });

  it("plays a theme's own entrance and exit tokens", () => {
    const style = {
      '--duration-medium-max': '300ms',
      '--ease-entrance': 'cubic-bezier(0.4, 0, 0.2, 1)',
      '--duration-exit': '120ms',
      '--ease-exit': 'cubic-bezier(0.4, 0, 1, 1)',
    } as CSSProperties;
    const view = render(<Alert isOpen isEnabled style={style} />);
    const {panel} = animators();
    expectTimed(
      lastCurves(panel).opacity,
      0,
      1,
      0.3,
      cubicBezier([0.4, 0, 0.2, 1]),
    );
    panel.presented = {opacity: 1, scale: 1};
    view.rerender(<Alert isOpen={false} isEnabled style={style} />);
    expectTimed(
      lastCurves(panel).opacity,
      1,
      0,
      0.12,
      cubicBezier([0.4, 0, 1, 1]),
    );
  });

  it('plays no spring: every motion is a timed curve', () => {
    const view = render(<Alert isOpen isEnabled />);
    view.rerender(<Alert isOpen={false} isEnabled />);
    view.rerender(<Alert isOpen isEnabled />);
    for (const record of recorded) {
      expect(record.calls.some(call => call.kind === 'animate')).toBe(false);
    }
  });

  it('starts no wider than the viewport: a wide alert scales from less than 1.2', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(370);
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(
      402,
    );
    render(<Alert isOpen isEnabled />);
    expect(moves(animators().panel)[0]).toEqual({
      kind: 'set',
      values: {opacity: 0, scale: 402 / 370},
    });
  });

  it('starts at 1.2 when that fits the viewport', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(320);
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(
      402,
    );
    render(<Alert isOpen isEnabled />);
    expect(moves(animators().panel)[0]).toEqual({
      kind: 'set',
      values: {opacity: 0, scale: 1.2},
    });
  });

  it('fades from where it is on the exit tokens when closed while it presents, and the scale keeps its own curve', async () => {
    const view = render(<Alert isOpen isEnabled />);
    const {panel, backdrop} = animators();
    panel.presented = {opacity: 0.83, scale: 1.03};
    backdrop.presented = {opacity: 0.83};
    view.rerender(<Alert isOpen={false} isEnabled />);
    const alert = lastCurves(panel);
    expect(Object.keys(alert)).toEqual(['opacity']);
    expectTimed(alert.opacity, 0.83, 0, EXIT_S, EXIT_EASE);
    expectTimed(lastCurves(backdrop).opacity, 0.83, 0, EXIT_S, EXIT_EASE);
    await act(async () => {
      panel.endings.at(-1)?.(true);
    });
    expect(motion().isPresented).toBe(false);
  });

  it('stays presented while it fades out, then hides when the fade ends', async () => {
    const view = render(<Alert isOpen isEnabled />);
    const {panel} = animators();
    panel.presented = {opacity: 1, scale: 1};
    view.rerender(<Alert isOpen={false} isEnabled />);
    expect(motion().isPresented).toBe(true);
    await act(async () => {
      panel.endings.at(-1)?.(true);
    });
    expect(motion().isPresented).toBe(false);
  });

  it('hides once the exit has had its time when its end is never reported', () => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    const view = render(<Alert isOpen isEnabled />);
    view.rerender(<Alert isOpen={false} isEnabled />);
    act(() => {
      vi.advanceTimersByTime(EXIT_S * 1000 + 99);
    });
    expect(motion().isPresented).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(motion().isPresented).toBe(false);
  });

  it('fades back from where it is on the entrance tokens when reopened during the exit, without hiding', async () => {
    const view = render(<Alert isOpen isEnabled />);
    const {panel, backdrop} = animators();
    view.rerender(<Alert isOpen={false} isEnabled />);
    const exitEnding = panel.endings.at(-1);
    panel.presented = {opacity: 0.4, scale: 1};
    backdrop.presented = {opacity: 0.4};
    view.rerender(<Alert isOpen isEnabled />);
    expect(motion().isPresented).toBe(true);
    expectTimed(lastCurves(panel).opacity, 0.4, 1, ENTRANCE_S, ENTRANCE_EASE);
    expectTimed(
      lastCurves(backdrop).opacity,
      0.4,
      1,
      ENTRANCE_S,
      ENTRANCE_EASE,
    );
    // Held until the fade back ends.
    expect(isHeld()).toBe(true);
    await act(async () => {
      panel.endings.at(-1)?.(true);
    });
    expect(isHeld()).toBe(false);
    // The exit that the reopen abandoned ends late and hides nothing.
    await act(async () => {
      exitEnding?.(true);
    });
    expect(motion().isPresented).toBe(true);
  });

  it('gives focus back to the action the dismissal took it from when reopened during the exit', () => {
    const view = render(<Alert isOpen isEnabled />);
    const action = document.querySelector<HTMLButtonElement>(
      '[data-testid="alert"] > button',
    );
    act(() => action?.focus());
    expect(document.activeElement).toBe(action);
    view.rerender(<Alert isOpen={false} isEnabled />);
    expect(document.activeElement).toBe(document.body);
    view.rerender(<Alert isOpen isEnabled />);
    expect(action?.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(action);
  });

  it('holds pointer input until the presentation ends, and keeps its content live for keys and assistive technology', async () => {
    render(<Alert isOpen isEnabled />);
    const {panel} = animators();
    const action = document.querySelector<HTMLButtonElement>(
      '[data-testid="alert"] > button',
    );
    expect(isHeld()).toBe(true);
    expect(document.querySelector('[popover="manual"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="alert"] [inert]')).toBeNull();
    expect(
      document.querySelector('[data-testid="alert"]')?.hasAttribute('inert'),
    ).toBe(false);
    act(() => action?.focus());
    expect(document.activeElement).toBe(action);
    await act(async () => {
      panel.endings.at(-1)?.(true);
    });
    expect(isHeld()).toBe(false);
    expect(document.querySelector('[popover="manual"]')).toBeNull();
  });

  it('makes its content inert while it leaves', () => {
    const view = render(<Alert isOpen isEnabled />);
    view.rerender(<Alert isOpen={false} isEnabled />);
    expect(isHeld()).toBe(true);
    expect(
      document.querySelector('[data-testid="alert"] > button[inert]'),
    ).not.toBeNull();
  });

  it('keeps its input hold when mounted open under StrictMode, whose effect replay runs every cleanup once', () => {
    render(
      <StrictMode>
        <Alert isOpen isEnabled />
      </StrictMode>,
    );
    expect(isHeld()).toBe(true);
    expect(document.querySelector('[popover="manual"]')).not.toBeNull();
  });

  it('attaches both animators to the element only while it drives', () => {
    const view = render(<Alert isOpen isEnabled={false} />);
    const {panel, backdrop} = animators();
    expect(panel.calls.at(-1)).toEqual({kind: 'attach', target: null});
    expect(backdrop.calls.at(-1)).toEqual({kind: 'attach', target: null});
    view.rerender(<Alert isOpen isEnabled />);
    const element = view.getByTestId('alert');
    expect(panel.calls.at(-1)).toEqual({kind: 'attach', target: element});
    expect(backdrop.calls.at(-1)).toEqual({kind: 'attach', target: element});
    expect(backdrop.options).toEqual({
      pseudoElement: '::backdrop',
      base: {opacity: 1},
    });
  });

  it('gives the dialog back at rest when a mouse takes over', () => {
    const view = render(<Alert isOpen isEnabled />);
    const {panel, backdrop} = animators();
    view.rerender(<Alert isOpen isEnabled={false} />);
    expect(moves(panel).at(-1)).toEqual({
      kind: 'set',
      values: {opacity: 1, scale: 1},
    });
    expect(moves(backdrop).at(-1)).toEqual({
      kind: 'set',
      values: {opacity: 1},
    });
    expect(panel.calls.at(-1)).toEqual({kind: 'attach', target: null});
    expect(backdrop.calls.at(-1)).toEqual({kind: 'attach', target: null});
  });

  it('does nothing when disabled: no motion, no hold, and it closes with the caller', () => {
    const view = render(<Alert isOpen isEnabled={false} />);
    view.rerender(<Alert isOpen={false} isEnabled={false} />);
    const {panel, backdrop} = animators();
    expect(moves(panel)).toEqual([]);
    expect(moves(backdrop)).toEqual([]);
    expect(motion().isPresented).toBe(false);
    expect(motion().isDriving).toBe(false);
    expect(isHeld()).toBe(false);
  });

  it('leaves no timer behind when unmounted during the exit', () => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    const view = render(<Alert isOpen isEnabled />);
    view.rerender(<Alert isOpen={false} isEnabled />);
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
