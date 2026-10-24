// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file curves.ts
 * @input Uses a Playwright `Page`, a `Locator` for the animated element, and
 *   the Web Animations API in the page (CSS transitions and CSS animations are
 *   Web Animations too)
 * @output `holdAnimations` (pause every running animation and describe it),
 *   `seekAnimations` (move them all to t ms), `sampleCurve` (the presented
 *   transform/opacity at each t), `releaseAnimations`, and `curveOf`, which
 *   picks one channel out of the samples for ./math's `compareCurve`.
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

export interface HeldAnimation {
  readonly index: number;
  /** `CSSTransition`, `CSSAnimation` or `Animation` (script-created). */
  readonly kind: string;
  /** Transitioned property or animation name, when CSS made it. */
  readonly name: string | null;
  readonly target: string | null;
  readonly durationMs: number;
  readonly delayMs: number;
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
  return page.evaluate(root => {
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
  readonly transform: Transform2D;
  readonly opacity: number;
  /** Raw computed values, for the JSON trace. */
  readonly raw: {readonly transform: string; readonly opacity: string};
}

/**
 * The presented transform and opacity of `locator` at each time (ms from the
 * held animations' start). Hold the animations first.
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
        return {t, transform: style.transform, opacity: style.opacity};
      });
    },
    {ts: [...times], inset: END_INSET_MS},
  );
  return raw.map(r => ({
    t: r.t,
    transform: parseTransform(r.transform),
    opacity: Number(r.opacity),
    raw: {transform: r.transform, opacity: r.opacity},
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
  /** Epoch ms when the active interval starts and ends (page clock). */
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
  for (;;) {
    const found = await locator.evaluate((element, minProgress) => {
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
          const start =
            performance.timeOrigin +
            Number(a.startTime) +
            Number(timing?.delay ?? 0);
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
            from: start,
            to: start + Number(timing?.activeDuration ?? 0),
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
 * Resolves once nothing animates on `locator`'s element (or inside it) and its
 * transform has held still for two frames: the element is at rest.
 */
export async function waitForRest(
  locator: Locator,
  {timeout = 5_000}: {timeout?: number} = {},
): Promise<void> {
  await locator.evaluate(
    (element, ms) =>
      new Promise<void>((resolve, reject) => {
        const deadline = performance.now() + ms;
        let last = '';
        let still = 0;
        const tick = () => {
          const transform = getComputedStyle(element).transform;
          const animating = element
            .getAnimations({subtree: true})
            .some(a => a.playState === 'running');
          still = !animating && transform === last ? still + 1 : 0;
          last = transform;
          if (still >= 2) {
            resolve();
          } else if (performance.now() > deadline) {
            reject(new Error('waitForRest: still moving'));
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
    timeout,
  );
}
