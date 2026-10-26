// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file contextMenuPressCurve.test.ts
 * @input vitest, the context-menu constants, the press feedback curves, an
 *   independent RK4 integration, and per-frame presentation sizes of UIKit's
 *   press platter measured on iOS 26.2
 * @output The press feedback against UIKit: the size UIKit asks for, the
 *   closed-form curve against a numerical integration of the same spring,
 *   continuity where the ramp changes, and the visible size of a long press
 *   and of a press lifted at 0.25 s against the measured frames
 * @position Unit tests of packages/core/src/ContextMenu/contextMenuPressCurve.ts
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {solveSpring, toSpring} from '../motion/spring';
import {
  contextMenu,
  registerContextMenuTable,
} from '../motion/uikit/contextMenu';
import {
  PRESS_FEEDBACK_START_MS,
  pressFeedbackCurve,
  pressFeedbackMotion,
  pressFeedbackTarget,
} from './contextMenuPressCurve';
import {
  UIKIT_EARLY_LIFT,
  UIKIT_EARLY_LIFT_AT,
  UIKIT_LONG_PRESS,
  UIKIT_PRESS_VIEW_WIDTH,
} from './__tests__/uikitPressFrames';

const press = contextMenu.press;

/** The visible scale of a held press `t` ms after the touch. */
function held(t: number): number {
  const curve = pressFeedbackCurve();
  return t <= PRESS_FEEDBACK_START_MS
    ? 1
    : curve.at((t - PRESS_FEEDBACK_START_MS) / 1000);
}

/**
 * The visible scale of a press lifted at `lift` ms: the held curve until the
 * screen shows the lift, then the feedback spring back to 1 from where the
 * curve was (what the animator plays on `fail`).
 */
function liftedAt(lift: number): (t: number) => number {
  const curve = pressFeedbackCurve();
  const turn = lift + press.returnLatencyMs;
  const s = (turn - PRESS_FEEDBACK_START_MS) / 1000;
  const back = solveSpring(toSpring(press.feedbackSpring), {
    from: curve.at(s),
    to: 1,
    velocity: curve.velocity(s),
  });
  return t => (t < turn ? held(t) : back.value((t - turn) / 1000));
}

function errors(
  measured: ReadonlyArray<readonly [number, number]>,
  model: (t: number) => number,
): {rms: number; max: number} {
  const points = measured.map(
    ([t, value]) => Math.abs(model(t) - value) * UIKIT_PRESS_VIEW_WIDTH,
  );
  return {
    rms: Math.sqrt(points.reduce((sum, e) => sum + e * e, 0) / points.length),
    max: Math.max(...points),
  };
}

describe('pressFeedbackTarget', () => {
  it('is 1 until the onset, then ramps to 1.04 at the commit', () => {
    expect(pressFeedbackTarget(0)).toBe(1);
    expect(pressFeedbackTarget(press.feedbackOnsetMs)).toBe(1);
    expect(pressFeedbackTarget(press.commitMs)).toBeCloseTo(1.04, 10);
  });

  it('continues on the slower ramp from the same size, and stops when the menu displays', () => {
    expect(pressFeedbackTarget(press.commitMs + 1e-9)).toBeCloseTo(1.04, 8);
    expect(pressFeedbackTarget(press.menuDisplayMs)).toBeCloseTo(
      1 + (press.feedbackRateAfterCommit * press.menuDisplayMs) / 1000,
      10,
    );
    expect(pressFeedbackTarget(5000)).toBe(
      pressFeedbackTarget(press.menuDisplayMs),
    );
  });
});

describe('pressFeedbackCurve', () => {
  it('matches a numerical integration of the feedback spring chasing the ramp', () => {
    const {stiffness, damping, mass} = toSpring(press.feedbackSpring);
    const curve = pressFeedbackCurve();
    const target = (s: number) =>
      pressFeedbackTarget(press.feedbackOnsetMs + s * 1000);
    let x = 1;
    let v = 0;
    const h = 1e-4;
    let worst = 0;
    for (let step = 0; step * h < curve.duration - h; step++) {
      const s = step * h;
      if (step % 50 === 0) {
        worst = Math.max(worst, Math.abs(curve.at(s) - x));
      }
      const f = (px: number, pv: number, ps: number): [number, number] => [
        pv,
        (stiffness * (target(ps) - px) - damping * pv) / mass,
      ];
      const [a1, b1] = f(x, v, s);
      const [a2, b2] = f(x + (h / 2) * a1, v + (h / 2) * b1, s + h / 2);
      const [a3, b3] = f(x + (h / 2) * a2, v + (h / 2) * b2, s + h / 2);
      const [a4, b4] = f(x + h * a3, v + h * b3, s + h);
      x += (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4);
      v += (h / 6) * (b1 + 2 * b2 + 2 * b3 + b4);
    }
    expect(worst).toBeLessThan(1e-6);
  });

  it('is continuous in value and velocity where the ramp changes', () => {
    const curve = pressFeedbackCurve();
    for (const ms of [press.commitMs, press.menuDisplayMs]) {
      const s = (ms - press.feedbackOnsetMs) / 1000;
      expect(curve.at(s + 1e-7)).toBeCloseTo(curve.at(s - 1e-7), 6);
      expect(curve.velocity(s + 1e-7)).toBeCloseTo(curve.velocity(s - 1e-7), 4);
    }
  });

  it('starts from rest at 1 and rests on the last size', () => {
    const curve = pressFeedbackCurve();
    expect(curve.at(0)).toBe(1);
    expect(curve.velocity(0)).toBe(0);
    expect(curve.at(curve.duration)).toBeCloseTo(
      pressFeedbackTarget(press.menuDisplayMs),
      3,
    );
    expect(Math.abs(curve.velocity(curve.duration))).toBeLessThan(1e-3);
  });

  it('continues from a press still moving', () => {
    const curve = pressFeedbackCurve({from: 1.02, velocity: -0.05});
    expect(curve.at(0)).toBeCloseTo(1.02, 10);
    expect(curve.velocity(0)).toBeCloseTo(-0.05, 10);
  });
});

describe('the press feedback against UIKit (iOS 26.2, measured frames)', () => {
  it('a long press: the visible size follows UIKit’s within 0.05 pt rms on a 200 pt view', () => {
    const {rms, max} = errors(UIKIT_LONG_PRESS, held);
    expect(rms).toBeLessThan(0.05);
    expect(max).toBeLessThan(0.12);
  });

  it('a press lifted at 0.25 s: it overshoots on the way back as UIKit’s does, within 0.05 pt rms', () => {
    const {rms, max} = errors(UIKIT_EARLY_LIFT, liftedAt(UIKIT_EARLY_LIFT_AT));
    expect(rms).toBeLessThan(0.05);
    expect(max).toBeLessThan(0.12);
    // The measured peak after the lift: 1.00504 at 332.8 ms.
    expect(liftedAt(UIKIT_EARLY_LIFT_AT)(332.8)).toBeCloseTo(1.00504, 4);
  });
});

describe('pressFeedbackMotion: the feedback plays the table’s motion (touch motion stays internal)', () => {
  // The touch code registers the table before its first motion.
  registerContextMenuTable();

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  function themed(values: Record<string, string>) {
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (element: Element) =>
        ({
          getPropertyValue: (name: string) =>
            element.hasAttribute('data-astryx-theme')
              ? (values[name] ?? '')
              : '',
        }) as CSSStyleDeclaration,
    );
    const scope = document.createElement('div');
    scope.setAttribute('data-astryx-theme', 'test');
    const child = document.createElement('div');
    scope.append(child);
    document.body.append(scope);
    return child;
  }

  it('reads the table’s spring, onset and latency where no theme sets them', () => {
    const element = themed({});
    expect(pressFeedbackMotion(element)).toEqual({
      spring: contextMenu.press.feedbackSpring,
      onsetMs: contextMenu.press.feedbackOnsetMs,
      latencyMs: contextMenu.press.feedbackLatencyMs,
    });
  });

  it('takes nothing from a theme: no ContextMenu value is a motion role', () => {
    const element = themed({
      '--motion-context-menu-press-feedback-spring': '0.5s 0',
      '--motion-context-menu-press-feedback-latency-ms': '80ms',
      '--motion-context-menu-press-feedback-onset-ms': '300ms',
      '--motion-context-menu-press-commit-ms': '100ms',
    });
    const motion = pressFeedbackMotion(element);
    expect(motion).toEqual({
      spring: contextMenu.press.feedbackSpring,
      onsetMs: contextMenu.press.feedbackOnsetMs,
      latencyMs: contextMenu.press.feedbackLatencyMs,
    });
    const curve = pressFeedbackCurve({motion});
    expect(curve.at(0)).toBe(1);
    expect(curve.at(0.3)).toBeGreaterThan(1);
  });

  it('starts its ramp at the onset it is given and reaches the commit continuously', () => {
    // Nothing until the onset; the ramp then reaches UIKit's commit
    // continuously.
    expect(pressFeedbackTarget(250, 300)).toBe(1);
    expect(pressFeedbackTarget(400, 300)).toBeCloseTo(1.016, 6);
    expect(pressFeedbackTarget(400.001, 300)).toBeCloseTo(1.016, 4);
  });
});
