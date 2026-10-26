// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file curves.ts
 * @input Uses a Playwright `Page`, a `Locator` for the animated element, and
 *   the Web Animations API in the page (CSS transitions and CSS animations are
 *   Web Animations too)
 * @output `holdAnimations` (pause every running animation and describe it),
 *   `seekAnimations` (move them to t ms from the held origin, each keeping
 *   its offset), `sampleCurve` (the presented
 *   transform/opacity at each t, with the individual `translate`, `rotate` and
 *   `scale` properties composed in), `releaseAnimations`, `curveOf`, which
 *   picks one channel out of the samples for ./math's `compareCurve`.
 * @position Curve sampling: the exact presented value of an animation at a
 *   fixed time, independent of frame timing, so a curve can be compared with
 *   the UIKit reference to a fraction of a pixel. A paused animation's effect
 *   is applied at its current time and `getComputedStyle` reads it.
 */

import type {Locator, Page} from '@playwright/test';
import {parseTransform, type TimedValue, type Transform2D} from './math';

/** How far inside its end a seek past an animation's end lands, ms. */
export const END_INSET_MS = 0.5;

/**
 * Installs `window.__harnessCurveEnd(animation)`: the local time (ms, delay
 * included) where the animation's effect stops changing. An animation whose
 * keyframes end in a run of identical values (an end value held so that a
 * later interruption can read it) ends where that run starts, when it plays
 * forward under a linear or cubic-bézier effect easing (the time the run
 * starts is solved from the curve); any other ends at its end time.
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
      // A held end is read only for an animation that plays forward: run
      // backward (a reverse or alternating direction, or `reverse()`'s
      // negative playback rate), the held run is where its motion starts.
      if (
        (timing?.direction ?? 'normal') !== 'normal' ||
        animation.playbackRate < 0
      ) {
        return delay + active;
      }
      const frames = effect.getKeyframes();
      // A run holds only when it reaches offset 1 and every frame in it keys
      // every property the animation keys: a property left out, or a last
      // frame before offset 1, gets an implicit end frame and keeps moving.
      const keyed = new Set(
        frames.flatMap(k => Object.keys(k).filter(p => !timingKeys.has(p))),
      );
      const keysAll = (k: ComputedKeyframe) =>
        [...keyed].every(p => k[p] !== undefined);
      const last = frames[frames.length - 1];
      if (last == null || Number(last.computedOffset) !== 1 || !keysAll(last)) {
        return delay + active;
      }
      let first = frames.length - 1;
      while (
        first > 0 &&
        keysAll(frames[first - 1]) &&
        values(frames[first - 1]) === values(frames[first])
      ) {
        first -= 1;
      }
      const offset = Number(frames[first]?.computedOffset ?? 1);
      if (offset >= 1) {
        return delay + active;
      }
      // Keyframe offsets are progress, not time. Under a cubic-bézier effect
      // easing (the CSS keywords included) whose progress only rises, the
      // time the held run starts is solved from the curve; under any other
      // easing (steps, linear() stops, an overshoot) the curve is read to the
      // full end.
      const easing = String(effect.getTiming().easing ?? 'linear').trim();
      const named: Record<string, number[]> = {
        linear: [0, 0, 1, 1],
        ease: [0.25, 0.1, 0.25, 1],
        'ease-in': [0.42, 0, 1, 1],
        'ease-out': [0, 0, 0.58, 1],
        'ease-in-out': [0.42, 0, 0.58, 1],
      };
      const match = /^cubic-bezier\(([^)]+)\)$/.exec(easing);
      const points =
        named[easing] ?? (match ? match[1].split(',').map(Number) : null);
      if (
        points == null ||
        points.length !== 4 ||
        !points.every(Number.isFinite) ||
        points[1] < 0 ||
        points[1] > 1 ||
        points[3] < 0 ||
        points[3] > 1
      ) {
        return delay + active;
      }
      const [x1, y1, x2, y2] = points;
      const bezier = (u: number, p1: number, p2: number) =>
        3 * (1 - u) * (1 - u) * u * p1 + 3 * (1 - u) * u * u * p2 + u * u * u;
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 60; i += 1) {
        const mid = (lo + hi) / 2;
        if (bezier(mid, y1, y2) < offset) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      return delay + bezier((lo + hi) / 2, x1, x2) * active;
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
   * end value, if its keyframes end in one and it plays forward under a
   * linear or cubic-bézier effect easing; otherwise its end time.
   */
  readonly curveEndMs: number;
  readonly easing: string;
  readonly keyframes: readonly Record<string, unknown>[];
  /** Where it was when held, ms. */
  readonly heldAtMs: number | null;
  /**
   * How much later than the held origin (the earliest start among the
   * animations the first hold took) it started, ms; negative for an earlier
   * start held by a later hold. A seek to t moves it to its own t - offsetMs,
   * so staggered starts stay staggered.
   */
  readonly offsetMs: number;
}

/**
 * Pauses every running animation in the document (optionally only those whose
 * target is inside `scope`) and returns what was held. Finished animations,
 * animations the page paused, and animations on a scroll or view timeline are
 * left as they are. Later `seekAnimations` calls move exactly the held set,
 * each by its offset from the held origin, and `releaseAnimations` resumes
 * only it. A second call adds to the held set: what the first held stays held
 * until the release, and offsets keep counting from the origin the first call
 * set (the earliest start it took), so offsets already returned stay true.
 * An animation the page cancels after the hold (retargeting a CSS transition
 * cancels it) leaves the held set: seeking, sampling and releasing skip it
 * rather than revive it.
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
    const now = Number(document.timeline.currentTime ?? performance.now());
    const all = document.getAnimations().filter(animation => {
      const target =
        (animation.effect as KeyframeEffect | null)?.target ?? null;
      return (
        animation.playState === 'running' &&
        animation.timeline instanceof DocumentTimeline &&
        (root == null ||
          (target != null && (root === target || root.contains(target))))
      );
    });
    // Seeking and sampling run a curve forward: an animation running
    // backward (`reverse()`, a negative playback rate) cannot be held and
    // read, so it is refused rather than misread.
    const backward = all.find(animation => animation.playbackRate < 0);
    if (backward != null) {
      throw new Error(
        `holdAnimations: ${describe((backward.effect as KeyframeEffect | null)?.target ?? null) ?? 'an animation'} runs backward (reverse() or a negative playback rate); hold and sample a forward run instead`,
      );
    }
    // Each animation's start on the document timeline, read before the pause
    // clears it (a pending play has no start time yet: it starts now).
    const starts = all.map(animation =>
      animation.startTime != null
        ? Number(animation.startTime)
        : now - Number(animation.currentTime ?? 0),
    );
    const held = all.map(animation => {
      animation.pause();
      // `pause()` only schedules the pause: the engine takes the hold time at
      // its next frame, a frame past where this read it. Setting the current
      // time completes a pending pause at once, here.
      // eslint-disable-next-line no-self-assign
      animation.currentTime = animation.currentTime;
      return animation;
    });
    // A later hold adds to the held set: what an earlier one held stays held
    // (it is paused, so it is not taken again above) until released.
    const w = window as unknown as {
      __harnessHeld?: Animation[];
      __harnessHeldStarts?: number[];
      __harnessHeldOrigin?: number;
    };
    w.__harnessHeld = [...(w.__harnessHeld ?? []), ...held];
    w.__harnessHeldStarts = [...(w.__harnessHeldStarts ?? []), ...starts];
    // Times count from the origin the first hold set (its earliest start)
    // until the release: a later hold, even of an animation that started
    // earlier (its offset is then negative), and dropping one never move it,
    // so every offsetMs already returned stays true.
    const origin = Number.isFinite(w.__harnessHeldOrigin ?? Number.NaN)
      ? (w.__harnessHeldOrigin as number)
      : Math.min(...starts);
    w.__harnessHeldOrigin = origin;
    const offsets = starts.map(start => start - origin);
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
        offsetMs: offsets[index],
      };
    });
  }, scopeHandle);
}

/**
 * Moves every held animation to `timeMs` from the held origin (delay
 * included): each to its own `timeMs - offsetMs`. A time at or past an
 * animation's end is clamped to END_INSET_MS before it: an animation without
 * `fill` stops applying its effect exactly at the end, and the frame wanted
 * there is the last one it presents. (Half a millisecond, not less: engines
 * round `currentTime` writes to their timer resolution.) Returns the time the
 * page then presents: `timeMs`, or the latest clamped end when every held
 * animation was clamped.
 */
export async function seekAnimations(
  page: Page,
  timeMs: number,
): Promise<number> {
  return page.evaluate(
    ({t, inset}) => {
      const w = window as unknown as {
        __harnessHeld?: Animation[];
        __harnessHeldStarts?: number[];
        __harnessHeldOrigin?: number;
      };
      // An animation the page cancelled since the hold (a CSS transition is
      // cancelled whenever the page retargets its property) leaves the held set:
      // applying or playing it again would revive what the page dropped.
      const kept = (w.__harnessHeld ?? []).flatMap((animation, index) =>
        animation.playState === 'idle'
          ? []
          : [{animation, start: (w.__harnessHeldStarts ?? [])[index] ?? 0}],
      );
      w.__harnessHeld = kept.map(k => k.animation);
      w.__harnessHeldStarts = kept.map(k => k.start);
      const origin = w.__harnessHeldOrigin ?? 0;
      let presented = -Infinity;
      kept.forEach(({animation, start}) => {
        const offset = start - origin;
        const end = Number(
          animation.effect?.getComputedTiming().endTime ?? Infinity,
        );
        // A faster rate runs more curve per timeline ms.
        const rate = animation.playbackRate || 1;
        const local = Math.min((t - offset) * rate, end - inset);
        animation.currentTime = local;
        presented = Math.max(presented, local / rate + offset);
      });
      return Number.isFinite(presented) ? presented : t;
    },
    {t: timeMs, inset: END_INSET_MS},
  );
}

/**
 * Resumes (default) or finishes every held animation: only those
 * `holdAnimations` paused, so an animation the page paused stays paused. An
 * animation that repeats forever has no end to finish at, so `finish`
 * resumes it instead. The held set is cleared even if one throws.
 */
export async function releaseAnimations(
  page: Page,
  {finish = false}: {finish?: boolean} = {},
): Promise<void> {
  await page.evaluate(shouldFinish => {
    const w = window as unknown as {
      __harnessHeld?: Animation[];
      __harnessHeldStarts?: number[];
      __harnessHeldOrigin?: number;
    };
    // An animation the page cancelled since the hold (a CSS transition is
    // cancelled whenever the page retargets its property) leaves the held set:
    // applying or playing it again would revive what the page dropped.
    const kept = (w.__harnessHeld ?? []).flatMap((animation, index) =>
      animation.playState === 'idle'
        ? []
        : [{animation, start: (w.__harnessHeldStarts ?? [])[index] ?? 0}],
    );
    w.__harnessHeld = kept.map(k => k.animation);
    w.__harnessHeldStarts = kept.map(k => k.start);
    try {
      for (const {animation} of kept) {
        const end = Number(
          animation.effect?.getComputedTiming().endTime ?? Infinity,
        );
        if (shouldFinish && Number.isFinite(end)) {
          animation.finish();
        } else {
          animation.play();
        }
      }
    } finally {
      w.__harnessHeld = [];
      w.__harnessHeldStarts = [];
      w.__harnessHeldOrigin = undefined;
    }
  }, finish);
}

export interface CurveSample {
  /** The requested time. */
  readonly t: number;
  /**
   * The time the sampled element presents: `t`, or just inside the end of
   * its own animations when the sample was taken at or past it (see
   * `seekAnimations`). Read from the element's own animations only (from
   * every held one if none targets it).
   */
  readonly presentedAt: number;
  /**
   * The same per channel group, from the element's animations of those
   * properties: a 300 ms move beside a 400 ms fade on one element is read
   * just inside 300 ms for the transform and at the requested time for the
   * opacity. `curveOf` reads oracles here.
   */
  readonly presentedAtFor: {
    readonly transform: number;
    readonly opacity: number;
  };
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
 * held origin, as for `seekAnimations`). Hold the animations first. An animation of the
 * individual `translate`, `rotate` or `scale` properties is included: they
 * are composed with `transform` into one matrix.
 */
export async function sampleCurve(
  locator: Locator,
  times: readonly number[],
): Promise<CurveSample[]> {
  const raw = await locator.evaluate(
    (element, {ts, inset}) => {
      const w = window as unknown as {
        __harnessHeld?: Animation[];
        __harnessHeldStarts?: number[];
        __harnessHeldOrigin?: number;
      };
      // An animation the page cancelled since the hold (a CSS transition is
      // cancelled whenever the page retargets its property) leaves the held set:
      // applying or playing it again would revive what the page dropped.
      const kept = (w.__harnessHeld ?? []).flatMap((animation, index) =>
        animation.playState === 'idle'
          ? []
          : [{animation, start: (w.__harnessHeldStarts ?? [])[index] ?? 0}],
      );
      w.__harnessHeld = kept.map(k => k.animation);
      w.__harnessHeldStarts = kept.map(k => k.start);
      const held = kept.map(k => k.animation);
      const origin = w.__harnessHeldOrigin ?? 0;
      if (held.length === 0) {
        throw new Error(
          'sampleCurve: no held animations (call holdAnimations first)',
        );
      }
      // The properties each held animation of this element animates. A
      // `::before` or `::after` animation is not the element's own: its
      // clock would label the element's samples with another box's time.
      const own = held.map(animation => {
        const effect = animation.effect as KeyframeEffect | null;
        if (effect?.target !== element || effect.pseudoElement != null) {
          return null;
        }
        const properties = new Set<string>();
        for (const keyframe of effect.getKeyframes()) {
          for (const key of Object.keys(keyframe)) {
            properties.add(key);
          }
        }
        return properties;
      });
      const TRANSFORM = ['transform', 'translate', 'rotate', 'scale'];
      return ts.map(t => {
        let presented = -Infinity;
        let presentedOwn = -Infinity;
        let presentedTransform = -Infinity;
        let presentedOpacity = -Infinity;
        held.forEach((animation, index) => {
          // Each at its own offset, just inside its end: see seekAnimations.
          const offset = kept[index].start - origin;
          const end = Number(
            animation.effect?.getComputedTiming().endTime ?? Infinity,
          );
          // A faster rate runs more curve per timeline ms.
          const rate = animation.playbackRate || 1;
          const local = Math.min((t - offset) * rate, end - inset);
          animation.currentTime = local;
          presented = Math.max(presented, local / rate + offset);
          const properties = own[index];
          if (properties == null) {
            return;
          }
          presentedOwn = Math.max(presentedOwn, local / rate + offset);
          if (TRANSFORM.some(p => properties.has(p))) {
            presentedTransform = Math.max(
              presentedTransform,
              local / rate + offset,
            );
          }
          if (properties.has('opacity')) {
            presentedOpacity = Math.max(
              presentedOpacity,
              local / rate + offset,
            );
          }
        });
        const or = (value: number, fallback: number) =>
          Number.isFinite(value) ? value : fallback;
        const presentedAt = or(presentedOwn, or(presented, t));
        const style = getComputedStyle(element);
        // translate · rotate · scale · transform, as CSS applies them (all
        // about the same transform origin, which `transform` excludes too).
        // A percentage resolves against the border box, unrounded
        // (`offsetWidth` rounds it); anything else it cannot resolve (a
        // `calc()`) is an error, not a guess.
        const px = (value: string) => parseFloat(value) || 0;
        const borderBox =
          style.boxSizing === 'border-box'
            ? {width: px(style.width), height: px(style.height)}
            : {
                width:
                  px(style.width) +
                  px(style.paddingLeft) +
                  px(style.paddingRight) +
                  px(style.borderLeftWidth) +
                  px(style.borderRightWidth),
                height:
                  px(style.height) +
                  px(style.paddingTop) +
                  px(style.paddingBottom) +
                  px(style.borderTopWidth) +
                  px(style.borderBottomWidth),
              };
        const length = (value: string, size: number) => {
          const match = /^(-?[\d.]+(?:e-?\d+)?)(px|%)$/.exec(value);
          if (match == null) {
            throw new Error(
              `sampleCurve: cannot resolve translate ${JSON.stringify(style.translate)}`,
            );
          }
          const amount = Number(match[1]);
          return match[2] === '%' ? (amount / 100) * size : amount;
        };
        const matrix = new DOMMatrix();
        if (style.translate !== 'none') {
          // "x", "x y" or "x y z"; a calc() holds spaces, so split at the
          // top level only.
          const parts = style.translate.match(/(?:calc\([^)]*\)|\S)+/g) ?? [];
          const [x = '0px', y = '0px'] = parts;
          matrix.translateSelf(
            length(x, borderBox.width),
            length(y, borderBox.height),
          );
        }
        if (style.rotate !== 'none') {
          // "45deg", "x 45deg" (or y, z) or "1 0 0 45deg": the angle is the
          // last token, the axis what comes before it (z when none).
          const tokens = style.rotate.split(' ');
          const angle = tokens.at(-1) ?? '0deg';
          const turns: Record<string, number> = {
            deg: 1,
            rad: 180 / Math.PI,
            grad: 0.9,
            turn: 360,
          };
          const unit = /[a-z]+$/.exec(angle)?.[0] ?? 'deg';
          const named: Record<string, [number, number, number]> = {
            x: [1, 0, 0],
            y: [0, 1, 0],
            z: [0, 0, 1],
          };
          const axis: [number, number, number] =
            tokens.length === 1
              ? [0, 0, 1]
              : tokens.length === 2 && named[tokens[0]] != null
                ? named[tokens[0]]
                : tokens.length === 4
                  ? [Number(tokens[0]), Number(tokens[1]), Number(tokens[2])]
                  : [Number.NaN, Number.NaN, Number.NaN];
          if (!axis.every(Number.isFinite)) {
            throw new Error(
              `sampleCurve: cannot resolve rotate ${JSON.stringify(style.rotate)}`,
            );
          }
          matrix.rotateAxisAngleSelf(
            ...axis,
            parseFloat(angle) * (turns[unit] ?? 1),
          );
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
          presentedAt,
          presentedAtFor: {
            transform: or(presentedTransform, presentedAt),
            opacity: or(presentedOpacity, presentedAt),
          },
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
    presentedAt: r.presentedAt,
    presentedAtFor: r.presentedAtFor,
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
    t:
      channel === 'opacity'
        ? s.presentedAtFor.opacity
        : s.presentedAtFor.transform,
    value: channel === 'opacity' ? s.opacity : s.transform[channel],
  }));
}
