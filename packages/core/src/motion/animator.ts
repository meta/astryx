// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animator.ts
 * @input An element, target values, and a spring or momentum curves
 * @output Exports `createAnimator`: a compositor animator for translate,
 *   rotate, scale and opacity, with presentation values and velocities read
 *   from the analytic curves, velocity-preserving retargeting, freeze-in-place
 *   `stop`, completion promises, a shared clock, and UIKit's Reduced Motion
 *   substitution; plus its option, handle and transition types
 * @position Motion foundation (DOM). Internal to core: components use it for
 *   every touch-presentation animation; not exported from the package entry
 *
 * HOW IT RUNS
 *
 * Each animated value (x, y, rotate, scaleX, scaleY, opacity) follows a
 * closed-form curve: a spring (spring.ts), momentum curves its caller built (a
 * UIScrollView coast with an edge bounce, coast.ts), or a Reduced Motion
 * cross-fade. The curves are baked into
 * Web Animations keyframes on the individual transform properties (`translate`,
 * `rotate`, `scale`) and `opacity`, sampled adaptively until linear
 * interpolation between keyframes is within a fraction of a pixel, and played
 * with `easing: linear`. The browser then runs them on its compositor: they
 * keep advancing every frame while JavaScript is busy (law M1).
 *
 * Why keyframes and not one `linear()` easing: measured in Chromium, both
 * forms are composited and equally precise for the same samples, but WebKit's
 * Core Animation path refuses to accelerate an effect whose easing is
 * `linear()` with points (KeyframeEffect::canBeAccelerated) unless its newer
 * threaded animations are on, so on older iOS Safari a `linear()` spring would
 * run on the main thread. Linear segments between keyframes map directly onto
 * a Core Animation keyframe animation. Why the individual properties and not
 * `transform`: each can be animated, retargeted or driven by a finger on its
 * own (a drag writes `translate` while `scale` keeps springing), with no
 * additive composition, which neither engine composites.
 *
 * The page never reads the DOM to know where something is: `get` and
 * `getVelocity` evaluate the curves at a time on the document timeline's
 * clock (`performance.now()` by default), so a finger can grab anything
 * mid-flight from the value on screen (M2), and a new target starts from the
 * current value with the current velocity (M3). A gesture's release velocity
 * can be handed in explicitly instead.
 *
 * End state without a flicker frame: the element's inline style always holds
 * the values the animations END on, and the keyframes hold that end state for
 * a while after the curve ends (END_HOLD_MS). The main thread drops a finished
 * animation as soon as it runs after the curve's end; the inline style already
 * shows the same values, so nothing moves. The hold matters when the curve
 * ends during a main-thread block: WebKit's compositor ends an animation by
 * falling back to the value its main thread last committed, which is
 * mid-flight.
 *
 * Shared clock: every animation an `animate` / `decay` call starts gets the
 * same explicit `startTime` (the call time, or `options.at` to line several
 * animators up). Keyframes are sampled from that time, so a value that keeps
 * moving through a rebuild stays on its curve to the frame.
 *
 * Reduced Motion (`design:reduced-motion` DR2–DR4). With
 * `prefers-reduced-motion: reduce`, every `animate` call is a transition:
 * - on a coarse primary pointer (DR2) it changes opacity only and finishes
 *   within 200 ms. A move that enters (opacity rises in the same call) jumps
 *   to the new place and fades in; one that leaves (opacity falls) fades out
 *   in place, then jumps; any other move dips (fades out, jumps at the
 *   midpoint, fades back in). An opacity-only change fades. The fade runs
 *   `timing.reducedMotionCrossFadeMs`, capped at 200 ms, on
 *   `timing.curves.move`;
 * - on any other pointer (DR3) it completes at once; an opacity the call does
 *   not name keeps what it was doing.
 * No call changes this: nothing keeps travel or a spring, and nothing skips
 * the touch cross-fade (DR4). On a coarse pointer, a fade the call does not
 * name ends where it was heading. Decays keep their
 * motion: momentum that continues a throw is direct movement, as scrolling
 * keeps decelerating under iOS Reduce Motion (`design:reduced-motion` DR2,
 * DEC-2).
 *
 * SSR-safe: nothing touches `window` or `document` at module scope, and an
 * animator created without an element only keeps state until one is attached.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/animator.test.ts
 * - /packages/core/src/motion/README.md
 */

import {cubicBezier} from './bezier';
import {solveSpring, toSpring, type SpringDescription} from './spring';
import {reducedMotionCrossFade} from './uikit/timing';

/** A value the animator can drive. */
export type MotionProperty =
  'x' | 'y' | 'rotate' | 'scaleX' | 'scaleY' | 'opacity';

/** Values by property; `scale` sets `scaleX` and `scaleY` together. */
export type MotionValues = Partial<Record<MotionProperty | 'scale', number>>;

export interface SpringTransition {
  /** The spring, in any vocabulary of the constants table. */
  spring: SpringDescription;
  /**
   * Initial velocities in units per second (px/s, deg/s, 1/s), for example a
   * gesture's release velocity. A property without one keeps the velocity it
   * has on screen.
   */
  velocity?: MotionValues;
}

/**
 * A curve a release starts, to play on the compositor: a released scroll
 * view's coast and its edge bounce (`coast.ts`). Momentum keeps moving under
 * Reduce Motion (design:reduced-motion DR2, DEC-2); a curve marked
 * `isTransition` (a spring back from past an edge) cross-fades as `animate`
 * does. Every other motion goes through `animate`. Times are seconds from
 * the curve's start; the value at `duration` is the end state. Start it at
 * the property's presentation value (`get`) to continue without a jump.
 */
export interface MotionCurve {
  /** Length, s. */
  readonly duration: number;
  /** Value `t` seconds after the start (0 ≤ t ≤ duration). */
  at(t: number): number;
  /** Velocity `t` seconds after the start, units/s. */
  velocity(t: number): number;
  /**
   * A transition started on release rather than a throw's momentum (a
   * spring back from past an edge): under Reduce Motion it is no coast and
   * cross-fades like `animate` (`design:reduced-motion` DR2).
   */
  readonly isTransition?: boolean;
}

export interface AnimateOptions {
  /**
   * Start time on the document timeline (ms, `performance.now()` clock).
   * Defaults to now. Pass one value to several animators to put their
   * animations on one clock.
   */
  at?: number;
}

export interface AnimatorOptions {
  /** Starting values; identity by default. Never read from the DOM. */
  initial?: MotionValues;
  /** Clock in ms on the document timeline's time base. */
  now?: () => number;
  /** The Reduced Motion preference; `prefers-reduced-motion` by default. */
  prefersReducedMotion?: () => boolean;
  /** Whether the primary pointer is coarse; `(pointer: coarse)` by default. */
  isCoarsePointer?: () => boolean;
}

/** One `animate` / `decay` call's animations. */
export interface MotionHandle {
  /** The properties this call drives. */
  readonly properties: ReadonlyArray<MotionProperty>;
  /**
   * True when every property reached the end of this call's curve, false
   * as soon as any of them is retargeted, stopped or set before that.
   */
  readonly finished: Promise<boolean>;
  /** Presentation value of a property at `time` (default now). */
  value(property: MotionProperty, time?: number): number;
  /** Presentation velocity of a property at `time`, units/s. */
  velocity(property: MotionProperty, time?: number): number;
  /** New targets for this call's properties, keeping their velocity. */
  retarget(
    to: MotionValues,
    transition?: SpringTransition,
    options?: AnimateOptions,
  ): MotionHandle;
  /** Freezes this call's properties at their presentation values. */
  stop(): void;
}

export interface Animator {
  /** The element the animator writes to, if attached. */
  readonly element: HTMLElement | null;
  /**
   * Attaches (or detaches, with null) the element. Attaching writes the
   * current state and resumes running curves from now.
   */
  attach(element: HTMLElement | null): void;
  /** Presentation value at `time` (default now), from the curve. */
  get(property: MotionProperty | 'scale', time?: number): number;
  /** Presentation velocity at `time` (default now), units/s. */
  getVelocity(property: MotionProperty | 'scale', time?: number): number;
  /**
   * Puts values in place now, ending their animations: the per-frame write
   * of a drag (one style write per channel, no animation when nothing else
   * on the channel is moving).
   */
  set(values: MotionValues): void;
  /** Springs to `to` from the presentation values. */
  animate(
    to: MotionValues,
    transition: SpringTransition,
    options?: AnimateOptions,
  ): MotionHandle;
  /**
   * Plays the curves a release starts, one per property: a released scroll
   * view's coast and edge bounce, which `coast()` (coast.ts) builds. Under
   * Reduced Motion momentum still plays (a throw continues the finger), and
   * a curve marked `isTransition` cross-fades as `animate` does. Only a
   * surface that coasts imports the coast math and the scroll table.
   */
  decay(
    curves: Partial<Record<MotionProperty, MotionCurve>>,
    options?: Pick<AnimateOptions, 'at'>,
  ): MotionHandle;
  /** Freezes properties (all by default) at their presentation values. */
  stop(properties?: ReadonlyArray<MotionProperty | 'scale'>): void;
  /** Cancels everything and detaches. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Curves
// ---------------------------------------------------------------------------

interface Segment {
  /** Start on the document timeline, ms. */
  readonly start: number;
  /** Length in ms (finite). */
  readonly duration: number;
  /** Value from the end on. */
  readonly target: number;
  /** Value `t` ms after the start (0 ≤ t ≤ duration). */
  at(t: number): number;
  /** Velocity `t` ms after the start, units/s. */
  speed(t: number): number;
  /** Times (ms after the start) where the value jumps; `at` is right-continuous. */
  readonly jumps: ReadonlyArray<number>;
  /** Constant between jumps: sampled at its jumps only. */
  readonly steps?: true;
  /** A Reduce Motion fade: an interruption finishes it instead of freezing it. */
  readonly isFade?: true;
  readonly owner: HandleState;
}

interface HandleState {
  resolve: (finished: boolean) => void;
  settled: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

const PROPERTIES: ReadonlyArray<MotionProperty> = [
  'x',
  'y',
  'rotate',
  'scaleX',
  'scaleY',
  'opacity',
];

const IDENTITY: Record<MotionProperty, number> = {
  x: 0,
  y: 0,
  rotate: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
};

/** Within this of its target a curve is over (in the property's own unit). */
export const SETTLE_THRESHOLD: Record<MotionProperty, number> = {
  x: 0.05,
  y: 0.05,
  rotate: 0.01,
  scaleX: 0.0001,
  scaleY: 0.0001,
  opacity: 0.001,
};

/** Keyframes are added until linear interpolation is within this. */
const SAMPLE_TOLERANCE: Record<MotionProperty, number> = {
  x: 0.05,
  y: 0.05,
  rotate: 0.02,
  scaleX: 0.0002,
  scaleY: 0.0002,
  opacity: 0.002,
};

/** A curve that has not settled by then (an undamped spring) snaps. */
const MAX_DURATION_MS = 30_000;
/** Above this many keyframes the tolerance is relaxed. */
const MAX_KEYFRAMES = 1200;
/**
 * The keyframes hold the end state this long after a curve ends. An engine
 * whose compositor ends an animation while the main thread is blocked falls
 * back to the value its main thread last committed, mid-flight (WebKit); the
 * hold keeps the end state on screen through such a block. The main thread
 * drops the animation as soon as it runs after the curve's end.
 */
export const END_HOLD_MS = 5000;

/** How often a paused animation is looked at again for retiring, ms. */
const RETIRE_RECHECK_MS = 100;

const TRAVEL: ReadonlyArray<MotionProperty> = [
  'x',
  'y',
  'rotate',
  'scaleX',
  'scaleY',
];

type Channel = 'translate' | 'rotate' | 'scale' | 'opacity';

const CHANNELS: Record<Channel, ReadonlyArray<MotionProperty>> = {
  translate: ['x', 'y'],
  rotate: ['rotate'],
  scale: ['scaleX', 'scaleY'],
  opacity: ['opacity'],
};

const CHANNEL_OF: Record<MotionProperty, Channel> = {
  x: 'translate',
  y: 'translate',
  rotate: 'rotate',
  scaleX: 'scale',
  scaleY: 'scale',
  opacity: 'opacity',
};

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

function format(
  channel: Channel,
  value: (property: MotionProperty) => number,
): string {
  switch (channel) {
    case 'translate':
      return `${round(value('x'), 3)}px ${round(value('y'), 3)}px`;
    case 'rotate':
      return `${round(value('rotate'), 4)}deg`;
    case 'scale':
      return `${round(value('scaleX'), 5)} ${round(value('scaleY'), 5)}`;
    case 'opacity':
      return `${round(Math.min(1, Math.max(0, value('opacity'))), 4)}`;
  }
}

/**
 * The inline text for a channel: `format`, except that an identity transform
 * is written `none`. Any other value, `translate: 0px 0px` included, makes
 * the element the containing block of its `position: fixed` descendants and
 * a stacking context, so a motion back to identity would leave a fixed child
 * moved with its parent; Mobile Safari also lets no finger scroll a list
 * inside an element left at `scale: 1`. At rest the identity leaves the
 * element entirely when its stylesheet agrees (`releaseIdentity`).
 */
function inlineText(
  channel: Channel,
  value: (property: MotionProperty) => number,
): string {
  const at = (property: MotionProperty, identity: number, digits: number) =>
    round(value(property), digits) === identity;
  switch (channel) {
    case 'translate':
      return at('x', 0, 3) && at('y', 0, 3) ? 'none' : format(channel, value);
    case 'rotate':
      return at('rotate', 0, 4) ? 'none' : format(channel, value);
    case 'scale':
      return at('scaleX', 1, 5) && at('scaleY', 1, 5)
        ? 'none'
        : format(channel, value);
    case 'opacity':
      return format(channel, value);
  }
}

/** What `inlineText` writes for each channel at identity. */
const IDENTITY_TEXT: Record<Channel, string> = {
  translate: 'none',
  rotate: 'none',
  scale: 'none',
  opacity: '1',
};

/** Whether a computed value (or an unset one) is the channel's identity. */
function isIdentityText(channel: Channel, text: string): boolean {
  const value = text.trim();
  if (value === '' || value === 'none') {
    return true;
  }
  const numbers = value.split(/\s+/).map(part => Number.parseFloat(part));
  if (numbers.some(number => !Number.isFinite(number))) {
    return false;
  }
  const identity = channel === 'scale' || channel === 'opacity' ? 1 : 0;
  return numbers.every(number => Math.abs(number - identity) < 1e-6);
}

function expand(values: MotionValues): Partial<Record<MotionProperty, number>> {
  const out: Partial<Record<MotionProperty, number>> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value == null || !Number.isFinite(value)) {
      continue;
    }
    if (key === 'scale') {
      out.scaleX ??= value;
      out.scaleY ??= value;
    } else if ((PROPERTIES as ReadonlyArray<string>).includes(key)) {
      out[key as MotionProperty] = value;
    }
  }
  return out;
}

function defaultNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function matchesMedia(query: string): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(query).matches
  );
}

function defaultPrefersReducedMotion(): boolean {
  return matchesMedia('(prefers-reduced-motion: reduce)');
}

function defaultIsCoarsePointer(): boolean {
  return matchesMedia('(pointer: coarse)');
}

/** The longest a Reduced Motion cross-fade may run (`design:reduced-motion` DR2). */
const REDUCED_MOTION_MAX_FADE_MS = 200;

/**
 * The transition `decay` hands a Reduce Motion transition curve to: under
 * Reduce Motion `animate` plays no spring (a cross-fade, or at once), so the
 * spring itself is never solved.
 */
const REDUCED_TRANSITION: SpringTransition = {
  spring: {duration: 0.5, bounce: 0},
};

/**
 * Creates an animator for `element` (or for an element attached later).
 *
 * @example
 * ```
 * const animator = createAnimator(sheet);
 * // finger lifts at 1200 px/s heading for the detent at 0:
 * animator.animate({y: 0}, {spring: springs.sheetDetent, velocity: {y: 1200}});
 * // the finger lands again: where is it right now?
 * const y = animator.get('y', event.timeStamp);
 * animator.stop(['y']);
 * ```
 */
export function createAnimator(
  element: HTMLElement | null,
  options: AnimatorOptions = {},
): Animator {
  const now = options.now ?? defaultNow;
  const prefersReducedMotion =
    options.prefersReducedMotion ?? defaultPrefersReducedMotion;
  const isCoarsePointer = options.isCoarsePointer ?? defaultIsCoarsePointer;
  const resting: Record<MotionProperty, number> = {
    ...IDENTITY,
    ...expand(options.initial ?? {}),
  };
  const segments = new Map<MotionProperty, Segment>();
  const running = new Map<Channel, Animation>();
  /** Drops a finished, still-filling animation once the main thread runs. */
  const retireTimers = new Map<Channel, ReturnType<typeof setTimeout>>();
  const touched = new Set<Channel>();
  /**
   * The stylesheet's opacity a Reduce Motion dip borrowed because no call
   * owned opacity; the dip runs from and back to it, then hands it back.
   */
  let borrowedOpacity: number | null = null;
  let target: HTMLElement | null = null;
  /** Channels whose identity the last node held inline (see `attach`). */
  let heldIdentity = new Set<Channel>();

  // -- reading the curves ---------------------------------------------------

  const segmentAt = (
    property: MotionProperty,
    time: number,
  ): Segment | null => {
    const segment = segments.get(property);
    if (segment == null) {
      return null;
    }
    if (time >= segment.start + segment.duration) {
      return null;
    }
    return segment;
  };

  const valueAt = (property: MotionProperty, time: number): number => {
    const segment = segments.get(property);
    if (segment == null) {
      return resting[property];
    }
    if (time >= segment.start + segment.duration) {
      return segment.target;
    }
    return segment.at(Math.max(0, time - segment.start));
  };

  const velocityAt = (property: MotionProperty, time: number): number => {
    const segment = segmentAt(property, time);
    if (segment == null || time < segment.start) {
      return 0;
    }
    return segment.speed(time - segment.start);
  };

  // A value just before a jump at absolute time `time`.
  const valueBefore = (property: MotionProperty, time: number): number =>
    valueAt(property, time - 1e-6);

  // -- writing --------------------------------------------------------------

  const finalValue = (property: MotionProperty): number =>
    segments.get(property)?.target ?? resting[property];

  const writeInline = (
    channel: Channel,
    value: (property: MotionProperty) => number,
  ) => {
    if (target == null) {
      return;
    }
    touched.add(channel);
    const text = inlineText(channel, value);
    if (text === IDENTITY_TEXT[channel]) {
      // Identity leaves the element when nothing else would move it.
      target.style.setProperty(channel, text);
      releaseIdentity(channel);
    } else {
      target.style.setProperty(channel, text);
    }
  };

  const sampleTimes = (
    property: MotionProperty,
    from: number,
    to: number,
    tolerance: number,
  ): number[] => {
    const segment = segments.get(property);
    if (segment == null) {
      return [];
    }
    const begin = Math.max(from, segment.start);
    const end = Math.min(to, segment.start + segment.duration);
    if (end <= begin) {
      return [];
    }
    const times: number[] = [begin];
    const value = (t: number) => valueAt(property, t);
    const breaks = segment.jumps
      .map(j => segment.start + j)
      .filter(t => t > begin && t < end);
    if (segment.steps) {
      return [begin, ...breaks, end];
    }
    const edges = [begin, ...breaks, end];
    for (let e = 0; e + 1 < edges.length; e++) {
      const a = edges[e];
      const b = edges[e + 1];
      // A 120 Hz grid, each interval split until the chord is within the
      // tolerance at its quarter points.
      const steps = Math.max(1, Math.ceil((b - a) / (1000 / 120)));
      const split = (t0: number, t1: number, depth: number) => {
        const v0 = value(t0);
        const v1 =
          t1 === b && breaks.includes(b) ? valueBefore(property, b) : value(t1);
        let worst = 0;
        for (const f of [0.25, 0.5, 0.75]) {
          const t = t0 + (t1 - t0) * f;
          worst = Math.max(worst, Math.abs(value(t) - (v0 + (v1 - v0) * f)));
        }
        if (worst > tolerance && depth < 10 && t1 - t0 > 0.25) {
          const mid = (t0 + t1) / 2;
          split(t0, mid, depth + 1);
          split(mid, t1, depth + 1);
        } else {
          times.push(t1);
        }
      };
      for (let i = 0; i < steps; i++) {
        split(a + ((b - a) * i) / steps, a + ((b - a) * (i + 1)) / steps, 0);
      }
    }
    return times;
  };

  const rebuild = (channel: Channel, time: number) => {
    running.get(channel)?.cancel();
    running.delete(channel);
    clearTimeout(retireTimers.get(channel));
    retireTimers.delete(channel);
    const properties = CHANNELS[channel];
    // Settled curves become resting values.
    for (const property of properties) {
      const segment = segments.get(property);
      if (segment != null && time >= segment.start + segment.duration) {
        resting[property] = segment.target;
        segments.delete(property);
      }
    }
    writeInline(channel, finalValue);
    const moving = properties.filter(p => segments.has(p));
    if (
      target == null ||
      moving.length === 0 ||
      typeof target.animate !== 'function'
    ) {
      return;
    }
    const end = Math.min(
      time + MAX_DURATION_MS,
      Math.max(
        ...moving.map(
          p =>
            (segments.get(p) as Segment).start +
            (segments.get(p) as Segment).duration,
        ),
      ),
    );
    if (end <= time) {
      return;
    }
    const collect = (scale: number) => {
      const times = new Set<number>([time, end]);
      for (const property of moving) {
        for (const t of sampleTimes(
          property,
          time,
          end,
          SAMPLE_TOLERANCE[property] * scale,
        )) {
          times.add(t);
        }
      }
      return times;
    };
    let scale = 1;
    let all = collect(scale);
    while (all.size > MAX_KEYFRAMES && scale < 64) {
      scale *= 2;
      all = collect(scale);
    }
    // Jumps become two keyframes at one offset: the value just before, then
    // the value after. A jump on the last frame (fade out, then move) too.
    const jumpTimes = new Set<number>();
    for (const property of moving) {
      const segment = segments.get(property) as Segment;
      for (const j of segment.jumps) {
        const t = segment.start + j;
        if (t > time && t <= end) {
          jumpTimes.add(t);
          all.add(t);
        }
      }
    }
    const times = [...all].sort((a, b) => a - b);
    const span = end - time + END_HOLD_MS;
    const keyframes: Keyframe[] = [];
    for (const t of times) {
      const offset = (t - time) / span;
      if (jumpTimes.has(t)) {
        keyframes.push({
          offset,
          [channel]: format(channel, p => valueBefore(p, t)),
        });
      }
      keyframes.push({
        offset,
        [channel]: format(channel, p =>
          t >= end ? finalValue(p) : valueAt(p, t),
        ),
      });
    }
    keyframes.push({offset: 1, [channel]: format(channel, finalValue)});
    const animation = target.animate(keyframes, {
      duration: span,
      // The last keyframes hold the end state (END_HOLD_MS); filling both
      // ways also keeps it where an engine honors the fill on its compositor.
      // The main thread drops the animation once it runs after the end; the
      // inline style already holds the same values, so that changes no pixel.
      fill: 'both',
      easing: 'linear',
    });
    // One clock: the keyframes were sampled from `time`.
    animation.startTime = time;
    running.set(channel, animation);
    const retire = () => {
      retireTimers.delete(channel);
      if (running.get(channel) !== animation) {
        return;
      }
      // Paused or sought (a sampler holding it): retire when its own time
      // reaches the curve's end, never from the wall clock.
      const remaining = remainingCurve(animation);
      if (remaining != null && remaining > 0) {
        retireTimers.set(
          channel,
          setTimeout(
            retire,
            animation.playState === 'paused' ? RETIRE_RECHECK_MS : remaining,
          ),
        );
        return;
      }
      animation.cancel();
      running.delete(channel);
      releaseIdentity(channel);
    };
    retireTimers.set(channel, setTimeout(retire, Math.max(0, end - now())));
  };

  /**
   * A channel at identity with no animation of its own leaves the element:
   * its inline value is removed, unless the stylesheet would then move the
   * element, in which case the identity stays inline. Runs when such a value
   * is written and again when a motion ends.
   */
  /** The element's own (stylesheet) opacity, read once when a dip starts. */
  const ownOpacity = (): number => {
    const view = target?.ownerDocument.defaultView;
    const value =
      target == null
        ? NaN
        : Number.parseFloat(
            view?.getComputedStyle(target).getPropertyValue('opacity') ?? '',
          );
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
  };

  /**
   * Ends a borrowed dip on the element it ran on: the stylesheet owns its
   * opacity again (an unmount or a new element never keeps the borrow).
   */
  const handBackBorrow = () => {
    if (borrowedOpacity == null) {
      return;
    }
    borrowedOpacity = null;
    segments.delete('opacity');
    resting.opacity = IDENTITY.opacity;
    target?.style.removeProperty('opacity');
  };

  const releaseIdentity = (channel: Channel) => {
    if (target == null || running.has(channel)) {
      return;
    }
    if (channel === 'opacity' && borrowedOpacity != null) {
      const dip = segments.get('opacity');
      if (dip != null && now() < dip.start + dip.duration) {
        // The dip is still running (a rebuild wrote its end value first).
        return;
      }
      // A dip on the stylesheet's opacity ended: the stylesheet owns it again.
      borrowedOpacity = null;
      segments.delete('opacity');
      resting.opacity = IDENTITY.opacity;
      target.style.removeProperty('opacity');
      return;
    }
    const text = target.style.getPropertyValue(channel);
    if (text !== IDENTITY_TEXT[channel]) {
      return;
    }
    target.style.removeProperty(channel);
    const view = target.ownerDocument.defaultView;
    const underneath = view?.getComputedStyle(target).getPropertyValue(channel);
    if (underneath != null && !isIdentityText(channel, underneath)) {
      target.style.setProperty(channel, text);
    }
  };

  /**
   * Curve time an animation still has to play on its own clock (its keyframes
   * hold the end for END_HOLD_MS after the curve), or null where the engine
   * does not report it; a paused animation always has some left.
   */
  const remainingCurve = (animation: Animation): number | null => {
    const timing = animation.effect?.getTiming?.();
    const current = animation.currentTime;
    if (timing == null || current == null) {
      return animation.playState === 'paused' ? Infinity : null;
    }
    const left = Number(timing.duration) - END_HOLD_MS - Number(current);
    return animation.playState === 'paused' ? Math.max(left, 1) : left;
  };

  // -- handles --------------------------------------------------------------

  const lastSpring = new WeakMap<HandleState, SpringDescription>();

  const interrupt = (property: MotionProperty, time: number) => {
    const segment = segments.get(property);
    if (segment == null) {
      return;
    }
    if (time < segment.start + segment.duration) {
      settle(segment.owner, false);
    }
  };

  const settle = (owner: HandleState, finished: boolean) => {
    if (owner.settled) {
      return;
    }
    owner.settled = true;
    if (owner.timer != null) {
      clearTimeout(owner.timer);
      owner.timer = null;
    }
    owner.resolve(finished);
  };

  const makeHandle = (
    owner: HandleState,
    properties: MotionProperty[],
    finished: Promise<boolean>,
    time: number,
  ): MotionHandle => {
    const ends = properties.map(p => {
      const segment = segments.get(p);
      return segment != null && segment.owner === owner
        ? segment.start + segment.duration
        : time;
    });
    const end = Math.max(time, ...ends);
    if (properties.length === 0 || end <= time) {
      settle(owner, true);
    } else {
      // Interruptions settle false as they happen (interrupt); reaching the
      // end untouched is completion.
      owner.timer = setTimeout(
        () => {
          owner.timer = null;
          settle(owner, true);
        },
        Math.max(0, end - now()),
      );
    }
    const handle: MotionHandle = {
      properties,
      finished,
      value: (property, at = now()) => valueAt(property, at),
      velocity: (property, at = now()) => velocityAt(property, at),
      retarget: (to, transition, retargetOptions) => {
        const spring = transition?.spring ?? lastSpring.get(owner);
        if (spring == null) {
          throw new Error('animator: retarget needs a spring');
        }
        return animator.animate(to, {...transition, spring}, retargetOptions);
      },
      stop: () =>
        animator.stop(properties.filter(p => segments.get(p)?.owner === owner)),
    };
    return handle;
  };

  const newOwner = (): {owner: HandleState; finished: Promise<boolean>} => {
    let resolve: (finished: boolean) => void = () => {};
    const finished = new Promise<boolean>(r => {
      resolve = r;
    });
    return {owner: {resolve, settled: false, timer: null}, finished};
  };

  // -- segment factories ------------------------------------------------------

  const springSegment = (
    owner: HandleState,
    property: MotionProperty,
    start: number,
    to: number,
    spring: SpringDescription,
    velocity: number,
  ): Segment | null => {
    const from = valueAt(property, start);
    if (from === to && velocity === 0) {
      return null;
    }
    const curve = solveSpring(toSpring(spring), {from, to, velocity});
    const duration = Math.min(
      MAX_DURATION_MS,
      curve.settleTime(SETTLE_THRESHOLD[property]) * 1000,
    );
    return {
      start,
      duration,
      target: to,
      at: t => curve.value(t / 1000),
      speed: t => curve.velocity(t / 1000),
      jumps: [],
      owner,
    };
  };

  const fadeSegment = (
    owner: HandleState,
    start: number,
    stops: ReadonlyArray<{at: number; value: number}>,
    jumps: ReadonlyArray<number> = [],
  ): Segment => {
    const ease = cubicBezier(reducedMotionCrossFade.curve);
    const duration = stops[stops.length - 1].at;
    const at = (t: number) => {
      for (let i = 0; i + 1 < stops.length; i++) {
        const a = stops[i];
        const b = stops[i + 1];
        if (t < b.at || i + 2 === stops.length) {
          if (b.at === a.at) {
            return b.value;
          }
          const p = Math.min(1, Math.max(0, (t - a.at) / (b.at - a.at)));
          return a.value + (b.value - a.value) * ease(p);
        }
      }
      return stops[stops.length - 1].value;
    };
    return {
      start,
      duration,
      target: stops[stops.length - 1].value,
      at,
      speed: t =>
        ((at(t + 0.5) - at(Math.max(0, t - 0.5))) / (t >= 0.5 ? 1 : 0.5 + t)) *
        1000,
      jumps,
      owner,
      isFade: true,
    };
  };

  const jumpSegment = (
    owner: HandleState,
    start: number,
    from: number,
    to: number,
    after: number,
  ): Segment => ({
    start,
    duration: after,
    target: to,
    at: t => (t < after ? from : to),
    speed: () => 0,
    jumps: [after],
    steps: true,
    owner,
  });

  // -- the animator -----------------------------------------------------------

  const commit = (changed: Iterable<MotionProperty>, time: number) => {
    const channels = new Set<Channel>();
    for (const property of changed) {
      channels.add(CHANNEL_OF[property]);
    }
    if (channels.has('opacity')) {
      borrowedOpacity = null;
    }
    for (const channel of channels) {
      rebuild(channel, time);
    }
  };

  const animator: Animator = {
    get element() {
      return target;
    },

    attach(next) {
      if (next === target) {
        return;
      }
      if (next == null) {
        // Unmount: nothing is left to animate, so every handle settles as
        // interrupted and no completion timer outlives the element, as in
        // dispose() (architecture:react-component-runtime INV5).
        const time = now();
        for (const property of PROPERTIES) {
          interrupt(property, time);
        }
      }
      for (const animation of running.values()) {
        animation.cancel();
      }
      running.clear();
      for (const timer of retireTimers.values()) {
        clearTimeout(timer);
      }
      retireTimers.clear();
      if (borrowedOpacity != null) {
        // A running borrowed dip stays in the model through any attach, so a
        // pending move still lands while the element is invisible; only the
        // outgoing element gets its stylesheet's opacity back.
        target?.style.removeProperty('opacity');
      }
      // Identities the outgoing node holds inline over a stylesheet that
      // differs, kept through a detach for the node that comes next.
      if (target != null) {
        const outgoing = target;
        heldIdentity = new Set(
          (Object.keys(CHANNELS) as Channel[]).filter(
            channel =>
              outgoing.style.getPropertyValue(channel) ===
              IDENTITY_TEXT[channel],
          ),
        );
      }
      const held = heldIdentity;
      target = next;
      if (target == null) {
        return;
      }
      heldIdentity = new Set();
      const time = now();
      // A borrowed dip that ended while detached hands the opacity back
      // instead of writing the borrowed value inline.
      const dip = segments.get('opacity');
      if (
        borrowedOpacity != null &&
        (dip == null || time >= dip.start + dip.duration)
      ) {
        borrowedOpacity = null;
        segments.delete('opacity');
        resting.opacity = IDENTITY.opacity;
      }
      for (const channel of Object.keys(CHANNELS) as Channel[]) {
        const properties = CHANNELS[channel];
        const isDefault = properties.every(
          p => !segments.has(p) && resting[p] === IDENTITY[p],
        );
        if (!isDefault) {
          rebuild(channel, time);
        } else if (held.has(channel)) {
          // An identity the animator held inline over a stylesheet that
          // differs goes onto the new node too (writeInline keeps it only
          // where the new node's stylesheet still differs).
          writeInline(channel, property => resting[property]);
        }
      }
    },

    get(property, time = now()) {
      return valueAt(property === 'scale' ? 'scaleX' : property, time);
    },

    getVelocity(property, time = now()) {
      return velocityAt(property === 'scale' ? 'scaleX' : property, time);
    },

    set(values) {
      const time = now();
      const next = expand(values);
      for (const [property, value] of Object.entries(next) as [
        MotionProperty,
        number,
      ][]) {
        interrupt(property, time);
        segments.delete(property);
        resting[property] = value;
      }
      commit(Object.keys(next) as MotionProperty[], time);
    },

    animate(to, transition, animateOptions = {}) {
      const time = animateOptions.at ?? now();
      const targets = expand(to);
      const velocities = expand(transition.velocity ?? {});
      const {owner, finished} = newOwner();
      lastSpring.set(owner, transition.spring);
      const properties = Object.keys(targets) as MotionProperty[];
      const reduce = prefersReducedMotion();
      const instant = reduce && !isCoarsePointer();
      const travels = properties.some(
        p =>
          TRAVEL.includes(p) &&
          Math.abs((targets[p] as number) - valueAt(p, time)) > 1e-9,
      );
      const next: Partial<Record<MotionProperty, Segment | null>> = {};
      const retimed = new Set<MotionProperty>();
      // A fade the call does not name ends where it was heading.
      const opacityTo = targets.opacity ?? finalValue('opacity');

      // A dip on a touch screen when no call owns opacity starts from and
      // returns to the element's own opacity, not the model's 1.
      // A dip already borrowing it does not make the call own it.
      const previousBorrow = borrowedOpacity;
      // An opacity the animator left inline (a `set` over a stylesheet that
      // hides or dims the element) is owned too: a dip returns to it.
      const ownsOpacity =
        targets.opacity != null ||
        (borrowedOpacity == null &&
          (segments.has('opacity') ||
            resting.opacity !== IDENTITY.opacity ||
            (target?.style.getPropertyValue('opacity') ?? '') !== ''));
      const borrowed =
        reduce && !instant && travels && !ownsOpacity
          ? (borrowedOpacity ?? ownOpacity())
          : null;
      if (reduce) {
        const fade = Math.min(
          reducedMotionCrossFade.durationMs,
          REDUCED_MOTION_MAX_FADE_MS,
        );
        const opacityNow = segments.has('opacity')
          ? valueAt('opacity', time)
          : (borrowed ?? valueAt('opacity', time));
        const fadeTo = borrowed ?? opacityTo;
        const entering = fadeTo > opacityNow + 1e-6;
        const leaving = fadeTo < opacityNow - 1e-6;
        // Travel lands only while the element is invisible: at once when it
        // already is, at the end of a fade out to 0, and otherwise at the
        // bottom of a dip (DR2), so an overlapping call never moves it while
        // it shows.
        const isInvisible = opacityNow <= 1e-6;
        const fadesOut = fadeTo <= 1e-6;
        // An earlier call's travel still waiting for its dip: this call's
        // fade replaces that dip, so the travel lands at this fade's own
        // invisible moment instead of while the element shows.
        const pendingJumps = TRAVEL.filter(property => {
          if (properties.includes(property)) {
            return false;
          }
          const segment = segments.get(property);
          return (
            segment?.steps === true && time < segment.start + segment.duration
          );
        });
        const dips =
          (travels || pendingJumps.length > 0) && !isInvisible && !fadesOut;
        for (const property of properties) {
          if (!TRAVEL.includes(property)) {
            continue;
          }
          const from = valueAt(property, time);
          const toValue = targets[property] as number;
          if (instant || isInvisible || from === toValue) {
            next[property] = null; // in place at once (and fade in)
          } else if (fadesOut) {
            next[property] = jumpSegment(owner, time, from, toValue, fade); // fade out, then move
          } else {
            next[property] = jumpSegment(owner, time, from, toValue, fade / 2); // dip
          }
        }
        if (instant) {
          if (targets.opacity != null) {
            next.opacity = null;
          }
        } else if (!dips && (entering || leaving)) {
          next.opacity = fadeSegment(owner, time, [
            {at: 0, value: opacityNow},
            {at: fade, value: opacityTo},
          ]);
        } else if (dips) {
          next.opacity = fadeSegment(owner, time, [
            {at: 0, value: opacityNow},
            {at: fade / 2, value: 0},
            {at: fade, value: borrowed ?? opacityTo},
          ]);
        } else if (targets.opacity != null) {
          next.opacity = null; // already there
        }
        if (!instant) {
          const landAt = isInvisible ? 0 : fadesOut ? fade : fade / 2;
          for (const property of pendingJumps) {
            retimed.add(property);
            const segment = segments.get(property) as Segment;
            next[property] = jumpSegment(
              segment.owner,
              time,
              valueAt(property, time),
              segment.target,
              landAt,
            );
          }
        }
      } else {
        for (const property of properties) {
          const velocity = velocities[property] ?? velocityAt(property, time);
          next[property] = springSegment(
            owner,
            property,
            time,
            targets[property] as number,
            transition.spring,
            velocity,
          );
        }
      }

      const changed: MotionProperty[] = [];
      for (const [property, segment] of Object.entries(next) as [
        MotionProperty,
        Segment | null,
      ][]) {
        // A re-timed jump keeps its own call's handle running.
        if (!retimed.has(property)) {
          interrupt(property, time);
        }
        changed.push(property);
        if (segment == null) {
          segments.delete(property);
          resting[property] =
            property === 'opacity'
              ? opacityTo
              : (targets[property] ?? valueAt(property, time));
        } else {
          segments.set(property, segment);
        }
      }
      commit(changed, time);
      // A call that does not own opacity keeps a running borrowed dip's
      // borrow, whatever it does itself (moves nothing, springs after a
      // preference or pointer change), so the dip still hands the
      // stylesheet's opacity back when it ends.
      // A borrow exists only while its dip runs: a call that found the
      // element already invisible (a stylesheet opacity of 0) dips nothing
      // and borrows nothing.
      borrowedOpacity =
        borrowed != null && next.opacity != null
          ? borrowed
          : targets.opacity == null
            ? previousBorrow
            : null;
      return makeHandle(owner, changed, finished, time);
    },

    decay(curves, decayOptions = {}) {
      const time = decayOptions.at ?? now();
      // Under Reduce Motion only momentum keeps moving (DR2, DEC-2): a curve
      // that is a transition plays as `animate` does, a cross-fade or at once.
      const reduce = prefersReducedMotion();
      const transitions: MotionValues = {};
      for (const property of PROPERTIES) {
        const curve = curves[property];
        if (reduce && curve?.isTransition === true) {
          transitions[property] = curve.at(curve.duration);
        }
      }
      const transitioned =
        Object.keys(transitions).length > 0
          ? animator.animate(transitions, REDUCED_TRANSITION, {at: time})
          : null;
      const {owner, finished} = newOwner();
      const properties = PROPERTIES.filter(
        property =>
          curves[property] != null && transitions[property] === undefined,
      );
      if (transitioned != null && properties.length === 0) {
        return transitioned;
      }
      for (const property of properties) {
        const curve = curves[property] as MotionCurve;
        interrupt(property, time);
        if (!(curve.duration > 0)) {
          segments.delete(property);
          resting[property] = curve.at(0);
          continue;
        }
        segments.set(property, {
          start: time,
          duration: Math.min(MAX_DURATION_MS, curve.duration * 1000),
          target: curve.at(curve.duration),
          at: t => curve.at(t / 1000),
          speed: t => curve.velocity(t / 1000),
          jumps: [],
          owner,
        });
      }
      commit(properties, time);
      const handle = makeHandle(owner, properties, finished, time);
      if (transitioned == null) {
        return handle;
      }
      // One handle for the whole release: the cross-faded axes too.
      const faded = transitioned;
      const owns = (property: MotionProperty) =>
        faded.properties.includes(property);
      return {
        ...handle,
        properties: [...handle.properties, ...faded.properties],
        finished: Promise.all([handle.finished, faded.finished]).then(
          ([coasted, done]) => coasted && done,
        ),
        value: (property, at) =>
          owns(property)
            ? faded.value(property, at)
            : handle.value(property, at),
        velocity: (property, at) =>
          owns(property)
            ? faded.velocity(property, at)
            : handle.velocity(property, at),
        stop: () => {
          handle.stop();
          faded.stop();
        },
      };
    },

    stop(properties) {
      const time = now();
      const list = properties == null ? PROPERTIES : expandList(properties);
      const changed: MotionProperty[] = [];
      const wasBorrowed = borrowedOpacity != null;
      for (const property of list) {
        const segment = segments.get(property);
        if (segment == null) {
          continue;
        }
        // A Reduce Motion fade is never left half done: it finishes, and a
        // dip on the stylesheet's opacity hands that opacity back.
        const value = !segment.isFade
          ? valueAt(property, time)
          : wasBorrowed
            ? IDENTITY.opacity
            : segment.target;
        interrupt(property, time);
        segments.delete(property);
        resting[property] = value;
        changed.push(property);
      }
      // A finished fade takes the travel waiting for it along, at the same
      // instant: a pending jump never lands later, in view.
      if (changed.includes('opacity')) {
        for (const property of TRAVEL) {
          const segment = segments.get(property);
          if (
            list.includes(property) ||
            segment?.steps !== true ||
            time >= segment.start + segment.duration
          ) {
            continue;
          }
          interrupt(property, time);
          segments.delete(property);
          resting[property] = segment.target;
          changed.push(property);
        }
      }
      commit(changed, time);
      if (wasBorrowed && changed.includes('opacity')) {
        target?.style.removeProperty('opacity');
      }
    },

    dispose() {
      const time = now();
      for (const property of PROPERTIES) {
        interrupt(property, time);
      }
      for (const animation of running.values()) {
        animation.cancel();
      }
      running.clear();
      for (const timer of retireTimers.values()) {
        clearTimeout(timer);
      }
      retireTimers.clear();
      handBackBorrow();
      target = null;
    },
  };

  animator.attach(element);
  return animator;
}

function expandList(
  properties: ReadonlyArray<MotionProperty | 'scale'>,
): MotionProperty[] {
  const out = new Set<MotionProperty>();
  for (const property of properties) {
    if (property === 'scale') {
      out.add('scaleX');
      out.add('scaleY');
    } else {
      out.add(property);
    }
  }
  return [...out];
}
