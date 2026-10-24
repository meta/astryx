// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file curves.ts
 * @input Uses a Playwright `Page`, a `Locator` for the animated element, and
 *   the Web Animations API in the page (CSS transitions and CSS animations are
 *   Web Animations too)
 * @output `holdAnimations` (pause every running animation and describe it),
 *   `seekAnimations` (move them all to t ms), `sampleCurve` (the presented
 *   transform/opacity at each t, with the individual `translate`, `rotate` and
 *   `scale` properties composed in), `releaseAnimations`, `curveOf`, which
 *   picks one channel out of the samples for ./math's `compareCurve`, and the
 *   animation-state waits `waitForAnimation` and `waitForRest`.
 * @position Curve sampling: the exact presented value of an animation at a
 *   fixed time, independent of frame timing, so a curve can be compared with
 *   the UIKit reference to a fraction of a pixel. A paused animation's effect
 *   is applied at its current time and `getComputedStyle` reads it.
 *
 * SYNC: Keep ./storyboard.ts using these for its animation filmstrips.
 */

import type {Locator, Page} from '@playwright/test';
import {parseTransform, type TimedValue, type Transform2D} from './math';

/** How far inside its end a seek past an animation's end lands, ms. */
export const END_INSET_MS = 0.5;

/**
 * Installs `window.__harnessCurveEnd(animation)`: the local time (ms, delay
 * included) where the animation's effect stops changing. An animation whose
 * keyframes end in a run of identical values (an end value held so that a
 * later interruption can read it) ends where that run starts; any other ends
 * at its end time.
 */
async function installCurveEnd(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __harnessCurveEnd?: (animation: Animation) => number;
    };
    if (w.__harnessCurveEnd) {
      return;
    }
    const timingKeys = new Set([
      'offset',
      'computedOffset',
      'easing',
      'composite',
    ]);
    const values = (k: ComputedKeyframe) =>
      JSON.stringify(
        Object.keys(k)
          .filter(p => !timingKeys.has(p))
          .sort()
          .map(p => [p, String(k[p])]),
      );
    w.__harnessCurveEnd = animation => {
      const effect = animation.effect as KeyframeEffect | null;
      const timing = effect?.getComputedTiming();
      const delay = Number(timing?.delay ?? 0);
      const active = Number(timing?.activeDuration ?? 0);
      if (
        effect == null ||
        !Number.isFinite(active) ||
        Number(timing?.iterations ?? 1) !== 1
      ) {
        return delay + active;
      }
      const frames = effect.getKeyframes();
      let first = frames.length - 1;
      while (first > 0 && values(frames[first - 1]) === values(frames[first])) {
        first -= 1;
      }
      return delay + Number(frames[first]?.computedOffset ?? 1) * active;
    };
  });
}

export interface HeldAnimation {
  readonly index: number;
  /** `CSSTransition`, `CSSAnimation` or `Animation` (script-created). */
  readonly kind: string;
  /** Transitioned property or animation name, when CSS made it. */
  readonly name: string | null;
  readonly target: string | null;
  readonly durationMs: number;
  readonly delayMs: number;
  /**
   * Where its curve ends, ms from its start (delay included): before a held
   * end value, if its keyframes end in one; otherwise its end time.
   */
  readonly curveEndMs: number;
  readonly easing: string;
  readonly keyframes: readonly Record<string, unknown>[];
  /** Where it was when held, ms. */
  readonly heldAtMs: number | null;
}

/**
 * Pauses every animation in the document (optionally only those whose target
 * is inside `scope`) and returns what was held. Later `seekAnimations` calls
 * move exactly this set.
 */
export async function holdAnimations(
  page: Page,
  scope?: Locator,
): Promise<HeldAnimation[]> {
  const scopeHandle = scope ? await scope.elementHandle() : null;
  await installCurveEnd(page);
  return page.evaluate(root => {
    const curveEnd = (
      window as unknown as {__harnessCurveEnd: (a: Animation) => number}
    ).__harnessCurveEnd;
    const describe = (node: Element | null) =>
      node == null
        ? null
        : node.tagName.toLowerCase() +
          (node.id ? `#${node.id}` : '') +
          (node.classList.length
            ? `.${[...node.classList].slice(0, 2).join('.')}`
            : '');
    const all = document.getAnimations().filter(animation => {
      const target =
        (animation.effect as KeyframeEffect | null)?.target ?? null;
      return (
        root == null ||
        (target != null && (root === target || root.contains(target)))
      );
    });
    const held = all.map(animation => {
      animation.pause();
      return animation;
    });
    (window as unknown as {__harnessHeld: Animation[]}).__harnessHeld = held;
    return held.map((animation, index) => {
      const effect = animation.effect as KeyframeEffect | null;
      const timing = effect?.getComputedTiming();
      const cssName =
        'transitionProperty' in animation
          ? (animation as unknown as {transitionProperty: string})
              .transitionProperty
          : 'animationName' in animation
            ? (animation as unknown as {animationName: string}).animationName
            : null;
      return {
        index,
        kind: animation.constructor.name,
        name: cssName,
        target: describe((effect?.target as Element | null) ?? null),
        durationMs: Number(timing?.duration ?? 0),
        delayMs: Number(timing?.delay ?? 0),
        curveEndMs: curveEnd(animation),
        easing: String(effect?.getTiming().easing ?? 'linear'),
        keyframes: (effect?.getKeyframes() ?? []).map(
          (k): Record<string, unknown> => ({...k}),
        ),
        heldAtMs:
          animation.currentTime == null ? null : Number(animation.currentTime),
      };
    });
  }, scopeHandle);
}

/**
 * Moves every held animation to `timeMs` (from its own start, delay included).
 * A time at or past an animation's end is clamped to END_INSET_MS before it:
 * an animation without `fill` stops applying its effect exactly at the end,
 * and the frame wanted there is the last one it presents. (Half a millisecond,
 * not less: engines round `currentTime` writes to their timer resolution.)
 */
export async function seekAnimations(
  page: Page,
  timeMs: number,
): Promise<void> {
  await page.evaluate(
    ({t, inset}) => {
      for (const animation of (
        window as unknown as {__harnessHeld?: Animation[]}
      ).__harnessHeld ?? []) {
        const end = Number(
          animation.effect?.getComputedTiming().endTime ?? Infinity,
        );
        animation.currentTime = Math.min(t, end - inset);
      }
    },
    {t: timeMs, inset: END_INSET_MS},
  );
}

/** Resumes (default) or finishes every held animation. */
export async function releaseAnimations(
  page: Page,
  {finish = false}: {finish?: boolean} = {},
): Promise<void> {
  await page.evaluate(shouldFinish => {
    const held =
      (window as unknown as {__harnessHeld?: Animation[]}).__harnessHeld ?? [];
    for (const animation of held) {
      if (shouldFinish) {
        animation.finish();
      } else {
        animation.play();
      }
    }
    (window as unknown as {__harnessHeld?: Animation[]}).__harnessHeld = [];
  }, finish);
}

export interface CurveSample {
  readonly t: number;
  /**
   * The presented 2D transform: `translate` · `rotate` · `scale` ·
   * `transform`, composed in the order CSS applies them.
   */
  readonly transform: Transform2D;
  readonly opacity: number;
  /** Raw computed values, for the JSON trace. */
  readonly raw: {
    readonly transform: string;
    readonly translate: string;
    readonly rotate: string;
    readonly scale: string;
    readonly opacity: string;
  };
}

/**
 * The presented transform and opacity of `locator` at each time (ms from the
 * held animations' start). Hold the animations first. An animation of the
 * individual `translate`, `rotate` or `scale` properties is included: they
 * are composed with `transform` into one matrix.
 */
export async function sampleCurve(
  locator: Locator,
  times: readonly number[],
): Promise<CurveSample[]> {
  const raw = await locator.evaluate(
    (element, {ts, inset}) => {
      const held =
        (window as unknown as {__harnessHeld?: Animation[]}).__harnessHeld ??
        [];
      if (held.length === 0) {
        throw new Error(
          'sampleCurve: no held animations (call holdAnimations first)',
        );
      }
      return ts.map(t => {
        for (const animation of held) {
          // Just inside the end: see seekAnimations.
          const end = Number(
            animation.effect?.getComputedTiming().endTime ?? Infinity,
          );
          animation.currentTime = Math.min(t, end - inset);
        }
        const style = getComputedStyle(element);
        // translate · rotate · scale · transform, as CSS applies them (all
        // about the same transform origin, which `transform` excludes too).
        const box = element as HTMLElement;
        const length = (value: string, size: number) =>
          value.endsWith('%')
            ? (parseFloat(value) / 100) * size
            : parseFloat(value) || 0;
        const matrix = new DOMMatrix();
        if (style.translate !== 'none') {
          const [x = '0px', y = '0px'] = style.translate.split(' ');
          matrix.translateSelf(
            length(x, box.offsetWidth ?? 0),
            length(y, box.offsetHeight ?? 0),
          );
        }
        if (style.rotate !== 'none') {
          // "45deg", "z 45deg" or "0 0 1 45deg": the angle is the last token.
          const angle = style.rotate.split(' ').at(-1) ?? '0deg';
          const turns: Record<string, number> = {
            deg: 1,
            rad: 180 / Math.PI,
            grad: 0.9,
            turn: 360,
          };
          const unit = /[a-z]+$/.exec(angle)?.[0] ?? 'deg';
          matrix.rotateSelf(parseFloat(angle) * (turns[unit] ?? 1));
        }
        if (style.scale !== 'none') {
          const [sx = 1, sy = sx] = style.scale.split(' ').map(Number);
          matrix.scaleSelf(sx, sy);
        }
        if (style.transform !== 'none') {
          matrix.multiplySelf(new DOMMatrix(style.transform));
        }
        const {a, b, c, d, e, f} = matrix;
        return {
          t,
          matrix: `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`,
          transform: style.transform,
          translate: style.translate,
          rotate: style.rotate,
          scale: style.scale,
          opacity: style.opacity,
        };
      });
    },
    {ts: [...times], inset: END_INSET_MS},
  );
  return raw.map(r => ({
    t: r.t,
    transform: parseTransform(r.matrix),
    opacity: Number(r.opacity),
    raw: {
      transform: r.transform,
      translate: r.translate,
      rotate: r.rotate,
      scale: r.scale,
      opacity: r.opacity,
    },
  }));
}

export type Channel =
  'translateX' | 'translateY' | 'scaleX' | 'scaleY' | 'rotate' | 'opacity';

/** One channel of a sampled curve, ready for `compareCurve`. */
export function curveOf(
  samples: readonly CurveSample[],
  channel: Channel,
): TimedValue[] {
  return samples.map(s => ({
    t: s.t,
    value: channel === 'opacity' ? s.opacity : s.transform[channel],
  }));
}

export interface ActiveAnimation {
  readonly kind: string;
  readonly name: string | null;
  /**
   * Epoch ms (page clock) when the animation's curve starts and ends. A held
   * end value (see `HeldAnimation.curveEndMs`) is not part of the curve.
   */
  readonly from: number;
  readonly to: number;
  readonly durationMs: number;
  readonly easing: string;
  readonly keyframes: readonly Record<string, unknown>[];
}

/**
 * Waits until an animation is running on `locator`'s element (or inside it)
 * and has presented at least one frame, and returns its active interval on
 * the page clock. Use it before blocking the main thread: an animation that
 * has not started yet cannot start while the thread is blocked.
 */
export async function waitForAnimation(
  locator: Locator,
  {
    timeout = 5_000,
    minProgressMs = 1,
  }: {timeout?: number; minProgressMs?: number} = {},
): Promise<ActiveAnimation[]> {
  const deadline = Date.now() + timeout;
  await installCurveEnd(locator.page());
  for (;;) {
    const found = await locator.evaluate((element, minProgress) => {
      const curveEnd = (
        window as unknown as {__harnessCurveEnd: (a: Animation) => number}
      ).__harnessCurveEnd;
      return element
        .getAnimations({subtree: true})
        .filter(
          a =>
            a.playState === 'running' &&
            a.startTime != null &&
            Number(a.currentTime ?? 0) >= minProgress,
        )
        .map(a => {
          const effect = a.effect as KeyframeEffect | null;
          const timing = effect?.getComputedTiming();
          const startedAt = performance.timeOrigin + Number(a.startTime);
          const name =
            'transitionProperty' in a
              ? (a as unknown as {transitionProperty: string})
                  .transitionProperty
              : 'animationName' in a
                ? (a as unknown as {animationName: string}).animationName
                : null;
          return {
            kind: a.constructor.name,
            name,
            from: startedAt + Number(timing?.delay ?? 0),
            to: startedAt + curveEnd(a),
            durationMs: Number(timing?.duration ?? 0),
            easing: String(effect?.getTiming().easing ?? 'linear'),
            keyframes: (effect?.getKeyframes() ?? []).map(
              (k): Record<string, unknown> => ({...k}),
            ),
          };
        });
    }, minProgressMs);
    if (found.length > 0) {
      return found;
    }
    if (Date.now() > deadline) {
      throw new Error('waitForAnimation: no animation started on the element');
    }
    await new Promise(resolve => setTimeout(resolve, 4));
  }
}

/**
 * Resolves once `locator`'s element is at rest: no animation on it (or inside
 * it) is pending or still before the end of its curve, and its presented
 * `transform`, `translate`, `rotate`, `scale` and `opacity` (and `::backdrop`
 * opacity) have held still for `frames` consecutive frames.
 *
 * It judges curves and presented values, not `playState`: an animation that
 * holds its end value (a run of identical final keyframes kept so a later
 * interruption can read it) still reports `running` while nothing moves.
 */
export async function waitForRest(
  locator: Locator,
  {timeout = 5_000, frames = 3}: {timeout?: number; frames?: number} = {},
): Promise<void> {
  await installCurveEnd(locator.page());
  await locator.evaluate(
    (element, {ms, need}) =>
      new Promise<void>((resolve, reject) => {
        const deadline = performance.now() + ms;
        const curveEnd = (
          window as unknown as {__harnessCurveEnd: (a: Animation) => number}
        ).__harnessCurveEnd;
        const read = () => {
          const style = getComputedStyle(element);
          const backdrop = getComputedStyle(element, '::backdrop').opacity;
          return [
            style.transform,
            style.translate,
            style.rotate,
            style.scale,
            style.opacity,
            backdrop,
          ].join(' | ');
        };
        let last = read();
        let still = 0;
        const tick = () => {
          const now = read();
          const moving = element
            .getAnimations({subtree: true})
            .some(
              a =>
                a.pending ||
                (a.playState === 'running' &&
                  Number(a.currentTime ?? 0) < curveEnd(a)),
            );
          still = !moving && now === last ? still + 1 : 0;
          last = now;
          if (still >= need) {
            resolve();
          } else if (performance.now() > deadline) {
            reject(new Error(`waitForRest: still moving (${now})`));
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
    {ms: timeout, need: frames},
  );
}
