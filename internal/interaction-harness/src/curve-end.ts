// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file curve-end.ts
 * @input The Web Animations API in the page
 * @output `defineCurveEnd`, a page function that installs
 *   `window.__harnessCurveEnd(animation)` once: the local time (ms, delay
 *   included) where the animation's effect stops changing; and
 *   `window.__harnessTiming(effect)`, the effect's timing, read without a
 *   style update inside a rendering trace.
 * @position Shared by ./curves.ts (holds, `waitForRest`) and ./busy.ts
 *   (`blockMainThread`'s `during`), so both read an animation's held tail the
 *   same way. Not exported from the package: a page function, evaluated in
 *   the page.
 *
 * SYNC: When modified, update ./curves.ts (installCurveEnd) and ./busy.ts
 *   (blockMainThread).
 */

/**
 * Installs `window.__harnessCurveEnd(animation)` in the page, once. An
 * animation whose keyframes end in a run of identical values (an end value
 * held so that a later interruption can read it) ends where that run starts,
 * when it plays forward under a linear or cubic-bézier effect easing (the time
 * the run starts is solved from the curve); any other ends at its end time. A
 * page function: it closes over nothing.
 */
export function defineCurveEnd(): void {
  const w = window as unknown as {
    __harnessCurveEnd?: (animation: Animation) => number;
    __harnessTiming?: (
      effect: AnimationEffect | null | undefined,
    ) => ComputedEffectTiming | null;
  };
  // An effect's timing as getComputedTiming() reports it. Inside a rendering
  // trace it is worked out from getTiming() instead: getComputedTiming()
  // updates a running animation on demand, which restyles its target in the
  // next frame (and lays out an anchored one), exactly what a trace counts.
  w.__harnessTiming ??= effect => {
    if (effect == null) {
      return null;
    }
    if (
      (window as unknown as {__harnessRenderingTrace?: boolean})
        .__harnessRenderingTrace !== true
    ) {
      return effect.getComputedTiming();
    }
    const timing = effect.getTiming();
    const duration = typeof timing.duration === 'number' ? timing.duration : 0;
    const iterations = Number(timing.iterations ?? 1);
    const delay = Number(timing.delay ?? 0);
    const endDelay = Number(timing.endDelay ?? 0);
    const activeDuration =
      duration === 0 || iterations === 0 ? 0 : duration * iterations;
    const derived: ComputedEffectTiming = {
      ...timing,
      duration,
      iterations,
      delay,
      endDelay,
      activeDuration,
      endTime: Math.max(delay + activeDuration + endDelay, 0),
    };
    return derived;
  };
  if (w.__harnessCurveEnd) {
    return;
  }
  const timingOf = w.__harnessTiming;
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
    const timing = timingOf(effect);
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
}
