// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animator.ts
 * @input An element, target values, and a spring, a decay or any closed-form
 *   curve
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
 * closed-form curve: a spring (spring.ts), a UIScrollView coast with an edge
 * bounce (decay.ts), a curve handed to `play` (a spring chasing a moving
 * target, a fitted UIKit curve), or a Reduced Motion cross-fade. The curves are baked into
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
 * Start time: a call that starts from rest (nothing on its channels moving,
 * no `options.at`) gets no start time, so the browser starts it when it
 * commits it, as Core Animation starts an animation at its transaction's
 * commit: a main-thread block before that frame delays the motion instead of
 * skipping into it. Everything the call starts, and every
 * call from rest in the same task, starts at that one time, which
 * `handle.started` reports. A call that continues motion on
 * screen (a retarget, a catch) keeps an explicit start at the call time, or
 * `options.at` to line several animators up, so the new curve continues
 * from the frame on screen. Keyframes are sampled from the call's start, so
 * a value that keeps moving through a rebuild stays on its curve to the
 * frame.
 *
 * WebKit starts an animation created just before a block at its last frame
 * time before the block, so there the motion still skips into its curve;
 * Chromium starts it after the block.
 *
 * Promotion: Mobile Safari runs an animation whose start time is set from
 * script on its compositor at its first commit only if the element (or the
 * pseudo-element) already has a compositing layer; without one, a block
 * right after that commit freezes it (iOS 26.2 simulator: 2 of 7 runs kept
 * moving, 0 of 5 on a ::before). Every animation the animator creates, and
 * every `set`, therefore promotes its channels in the same task: inline
 * `will-change` on the element, merged with the element's own, or the custom
 * property `--astryx-motion-will-change-<pseudo>` on the host for a
 * pseudo-element, whose style opts in with
 * `will-change: var(--astryx-motion-will-change-before, auto)`. That is
 * enough (5 of 5, and 4 of 4 through the animator); promotion ends
 * PROMOTION_LINGER_MS after the last motion.
 *
 * Known limits, iOS Safari (measured on the iOS 26.2 simulator):
 * - a block in the task that starts a motion delays it: it starts when the
 *   browser commits it, after the block;
 * - an animation created in the task that first displays a dialog stays on
 *   the main thread: start it in the next animation frame;
 * - after a long block, an animation frame's timestamp is when the frame was
 *   due, so passing it as `at` starts the curve in the past: keep the default
 *   clock;
 * - WebKit does not promote the siblings a moving layer will cross, so a
 *   moving layer below content can paint over it: give it `z-index: -1`
 *   inside a parent with `isolation: isolate`;
 * - a tap-driven start can show its first moving frame two to four frames
 *   into the curve (simulator, not yet confirmed on a device).
 *
 * Reduced Motion (law M5): with `prefers-reduced-motion: reduce`, UIKit's
 * Reduce Motion with Prefer Cross-Fade Transitions replaces travel with a
 * cross-fade. An `animate` or `play` that moves something (x, y, rotate,
 * scale) by default (`reducedMotion: 'crossfade'`):
 * - entering (opacity rises in the same call, or `crossfadeAs: 'entrance'`):
 *   jumps to the new place and fades in;
 * - leaving (opacity falls, or `crossfadeAs: 'exit'`): fades out in place,
 *   then jumps;
 * - otherwise: dips (fades out, jumps at the midpoint, fades back in).
 * The fade runs `timing.reducedMotionCrossFadeMs` on `timing.curves.easeInOut`
 * (a navigation push or pop), or on the spring given as `crossfade` (a sheet,
 * a full-screen modal or an alert fades on its presentation spring).
 * `'instant'` jumps without a fade; `'keep'` plays the motion unchanged (for
 * direct manipulation that UIKit keeps under Reduce Motion). Decays keep their
 * motion: they follow a finger's throw.
 *
 * A pseudo-element (`options.pseudoElement`, a dialog's `::backdrop`) has no
 * inline style: its end value is held by a static filling animation (after a
 * curve ends, and after `set`) until the next animation replaces it.
 *
 * SSR-safe: nothing touches `window` or `document` at module scope, and an
 * animator created without an element only keeps state until one is attached.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/animator.test.ts
 * - /packages/core/src/motion/__tests__/animator.interaction.browser.spec.ts
 * - /packages/core/src/motion/README.md
 */

import {cubicBezier} from './bezier';
import {solveDecay} from './decay';
import {
  solveSpring,
  toSpring,
  type SpringCurve,
  type SpringDescription,
} from './spring';
import {scroll} from './uikit/scroll';
import {timing} from './uikit/timing';

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

export interface DecayOptions {
  /** Per-millisecond velocity factor; UIScrollView's normal rate by default. */
  rate?: number;
  /** Edges: a coast crossing one hands its velocity to `bounce`. */
  bounds?: Partial<Record<MotionProperty, {min: number; max: number}>>;
  /** The edge spring; `scroll.bounce` by default. */
  bounce?: SpringDescription;
}

export interface AnimateOptions {
  /**
   * Start time on the document timeline (ms, `performance.now()` clock).
   * Defaults to now. Pass one value to several animators to put their
   * animations on one clock.
   */
  at?: number;
  /** Reduced Motion substitution; see the file header. */
  reducedMotion?: 'crossfade' | 'instant' | 'keep';
  /**
   * The substituted cross-fade's curve. By default a timed fade
   * (`timing.reducedMotionCrossFadeMs` on easeInOut: UIKit's navigation
   * cross-fade); with a spring the fade follows it, as UIKit fades a sheet, a
   * full-screen modal or an alert on the presentation's own spring.
   */
  crossfade?: SpringDescription;
  /**
   * Which way the substituted cross-fade goes when the call's own opacity
   * does not say (a sheet slides in or out without fading): `'entrance'`
   * lands the travel at once and fades the opacity in from 0; `'exit'` fades
   * it out in place, then lands the travel and returns the opacity to its
   * value. The call's targets stay the end state; without Reduced Motion this
   * changes nothing.
   */
  crossfadeAs?: 'entrance' | 'exit';
}

/**
 * Any closed-form curve to play on the compositor (`Animator.play`): a
 * spring chasing a moving target, a piecewise curve, a fitted UIKit curve.
 * Times are seconds from the curve's start; the value at `duration` is the
 * end state. Start it at the property's presentation value (`get`) to
 * continue without a jump.
 */
export interface MotionCurve {
  /** Length, s. */
  readonly duration: number;
  /** Value `t` seconds after the start (0 ≤ t ≤ duration). */
  at(t: number): number;
  /** Velocity `t` seconds after the start, units/s. */
  velocity(t: number): number;
}

export interface AnimatorOptions {
  /**
   * Animates a pseudo-element of the element instead (`'::backdrop'` of a
   * native dialog). A pseudo-element has no inline style, so a static filling
   * animation holds its value after a curve ends and after `set`.
   */
  pseudoElement?: string;
  /** Starting values; identity by default. Never read from the DOM. */
  initial?: MotionValues;
  /** Clock in ms on the document timeline's time base. */
  now?: () => number;
  /** The Reduced Motion preference; `prefers-reduced-motion` by default. */
  prefersReducedMotion?: () => boolean;
  /**
   * Runs a callback in the next animation frame; `requestAnimationFrame` by
   * default. A call from rest reads the start the browser gave it there.
   */
  requestFrame?: (callback: () => void) => void;
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
  /**
   * When the motion started on the document timeline (ms): for a call from
   * rest, the time the browser committed it (a block before the first frame
   * moves it later); otherwise the call time, or `at`.
   */
  readonly started: Promise<number>;
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
   * Plays given curves (`scale` drives both axes), baked like a spring:
   * presentation values, velocities, `stop`, `finished` and the shared
   * clock work the same, and a later `animate` starts from the curve's
   * value and velocity. Reduced Motion treats a curve that moves x, y, rotate
   * or scale as travel (`reducedMotion`, `'crossfade'` by default). Its
   * handle has no spring of its own: `retarget` needs one.
   */
  play(
    curves: Partial<Record<MotionProperty | 'scale', MotionCurve>>,
    options?: AnimateOptions,
  ): MotionHandle;
  /** Coasts with `velocity` like a released scroll view. */
  decay(
    velocity: MotionValues,
    options?: DecayOptions & Pick<AnimateOptions, 'at'>,
  ): MotionHandle;
  /**
   * Moves properties by the given amounts at once, as when a layout shift
   * moves the element under them: a property moving on a spring keeps its
   * spring, velocity and target (the curve restarts from the shifted value);
   * any other moving curve shifts whole, its end included; a resting
   * property takes the offset and stays.
   */
  rebase(deltas: MotionValues, options?: Pick<AnimateOptions, 'at'>): void;
  /** Freezes properties (all by default) at their presentation values. */
  stop(properties?: ReadonlyArray<MotionProperty | 'scale'>): void;
  /**
   * Resolves once none of `properties` (every property by default) is moving:
   * after the last curve ends, whoever started it, retargets included.
   */
  atRest(properties?: ReadonlyArray<MotionProperty | 'scale'>): Promise<void>;
  /** Cancels everything and detaches. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Curves
// ---------------------------------------------------------------------------

interface Segment {
  /**
   * Start on the document timeline, ms. A call started from rest moves it to
   * the time the browser committed the animation (StartGroup).
   */
  start: number;
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
  readonly owner: HandleState;
  /** The call's start group while its start waits for the commit. */
  group?: StartGroup;
  /** The spring driving it, when one does (`rebase` keeps it). */
  spring?: SpringDescription;
}

/**
 * A call started from rest. Its animations are created without a start time,
 * so the browser starts them when it commits them, as Core Animation starts
 * an animation at its transaction's commit: a main-thread block before that
 * frame delays the motion instead of skipping into it. Until then the curves
 * read from the call time; once the browser's start is known they move to it.
 */
interface StartGroup {
  readonly provisional: number;
  readonly segments: Segment[];
  readonly animations: Animation[];
  readonly channels: Set<Channel>;
  resolved: boolean;
  readonly resolve: (start: number) => void;
  readonly started: Promise<number>;
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
const SETTLE_THRESHOLD: Record<MotionProperty, number> = {
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

/** How long an element stays promoted after its last motion, ms. */
export const PROMOTION_LINGER_MS = 500;

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

const shared = new WeakMap<HTMLElement, Map<string, Animator>>();

/**
 * The one animator for `element` (and `options.pseudoElement`), created on
 * first use. Code that animates one element from several places (a swipe on
 * x, a removal on y) shares it, so their curves compose in one `translate`
 * track and retargeting one axis leaves the other on its curve; two
 * animators on one element would overwrite each other. `options` apply
 * when it is created; later calls get the same animator. Never `attach` it
 * elsewhere or `dispose` it: it lives as long as the element.
 * @experimental
 */
export function animatorFor(
  element: HTMLElement,
  options: AnimatorOptions = {},
): Animator {
  let byPseudo = shared.get(element);
  if (byPseudo == null) {
    byPseudo = new Map();
    shared.set(element, byPseudo);
  }
  const key = options.pseudoElement ?? '';
  let animator = byPseudo.get(key);
  if (animator == null) {
    animator = createAnimator(element, options);
    byPseudo.set(key, animator);
  }
  return animator;
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

function defaultPrefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

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
  const requestFrame =
    options.requestFrame ??
    (typeof requestAnimationFrame === 'function'
      ? (callback: () => void) => {
          requestAnimationFrame(() => callback());
        }
      : null);
  const pseudoElement = options.pseudoElement;
  const prefersReducedMotion =
    options.prefersReducedMotion ?? defaultPrefersReducedMotion;
  const resting: Record<MotionProperty, number> = {
    ...IDENTITY,
    ...expand(options.initial ?? {}),
  };
  const segments = new Map<MotionProperty, Segment>();
  const running = new Map<Channel, Animation>();
  /** Drops a finished, still-filling animation once the main thread runs. */
  const retireTimers = new Map<Channel, ReturnType<typeof setTimeout>>();
  const touched = new Set<Channel>();
  let target: HTMLElement | null = null;
  /** Calls from rest whose start still waits for the browser's commit. */
  const pendingGroups = new Set<StartGroup>();
  /** The call being committed, when it starts from rest. */
  let callGroup: StartGroup | null = null;
  /** Channels promoted to the element's compositing layer (will-change). */
  const promoted = new Set<Channel>();
  /** The element's own inline will-change, restored when promotion ends. */
  let ownWillChange: string | null = null;
  let demoteTimer: ReturnType<typeof setTimeout> | null = null;
  /** A pseudo-element is promoted through a custom property on its host. */
  const promotionProperty =
    pseudoElement == null
      ? null
      : `--astryx-motion-will-change-${pseudoElement.replace(/^:+/, '')}`;

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
    if (target == null || pseudoElement != null) {
      return;
    }
    touched.add(channel);
    target.style.setProperty(channel, format(channel, value));
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

  /** A pseudo-element's resting value, held by a static filling animation. */
  const hold = (channel: Channel, time: number) => {
    if (target == null) {
      return;
    }
    const value = format(channel, finalValue);
    const animation = target.animate([{[channel]: value}, {[channel]: value}], {
      duration: 1,
      fill: 'both',
      pseudoElement,
    });
    animation.startTime = time;
    running.set(channel, animation);
  };

  const rebuild = (channel: Channel, time: number) => {
    const previous = running.get(channel);
    running.delete(channel);
    clearTimeout(retireTimers.get(channel));
    retireTimers.delete(channel);
    // An element's inline style holds the end state, so its old animation can
    // go first. A pseudo-element has none: its old animation keeps holding the
    // value until the new one exists (same task, no frame in between).
    if (pseudoElement == null) {
      previous?.cancel();
    }
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
    if (target == null || typeof target.animate !== 'function') {
      previous?.cancel();
      return;
    }
    if (moving.length === 0) {
      if (pseudoElement != null) {
        hold(channel, time);
      }
      previous?.cancel();
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
      if (pseudoElement != null) {
        hold(channel, time);
      }
      previous?.cancel();
      return;
    }
    if (callGroup != null) {
      // A curve of an earlier call still waiting for its first frame is
      // rebaked here: it starts with this call's commit.
      for (const property of moving) {
        const segment = segments.get(property) as Segment;
        const group = segment.group;
        if (group != null && group !== callGroup && !group.resolved) {
          group.segments.splice(group.segments.indexOf(segment), 1);
          segment.group = callGroup;
          callGroup.segments.push(segment);
        }
      }
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
    promote(channel);
    const animation = target.animate(keyframes, {
      duration: span,
      // The last keyframes hold the end state (END_HOLD_MS); filling both
      // ways also keeps it where an engine honors the fill on its compositor.
      // The main thread drops the animation once it runs after the end; the
      // inline style already holds the same values, so that changes no pixel.
      fill: 'both',
      easing: 'linear',
      ...(pseudoElement != null ? {pseudoElement} : {}),
    });
    if (callGroup != null) {
      // From rest: no start time, so the browser starts the animation when
      // it commits it (StartGroup); the keyframes are sampled from `time`,
      // the call's own start.
      callGroup.animations.push(animation);
      callGroup.channels.add(channel);
    } else {
      // One clock: the keyframes were sampled from `time`.
      animation.startTime = time;
    }
    running.set(channel, animation);
    previous?.cancel();
    scheduleRetire(channel, animation, end);
  };

  /**
   * Once the main thread runs after the curve's end, the animation leaves the
   * running state: an element's inline style already shows the end values; a
   * pseudo-element's end value moves to a static holding animation, created
   * before the long one goes.
   */
  const scheduleRetire = (
    channel: Channel,
    animation: Animation,
    end: number,
  ) => {
    clearTimeout(retireTimers.get(channel));
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
      running.delete(channel);
      if (pseudoElement != null) {
        hold(channel, now());
      }
      animation.cancel();
    };
    retireTimers.set(channel, setTimeout(retire, Math.max(0, end - now())));
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

  // -- promotion -------------------------------------------------------------

  /** Writes the promoted channels as will-change (or the pseudo's property). */
  const writePromotion = (element: HTMLElement) => {
    const list = [...promoted].join(', ');
    if (promotionProperty != null) {
      if (list === '') {
        element.style.removeProperty(promotionProperty);
      } else {
        element.style.setProperty(promotionProperty, list);
      }
      return;
    }
    if (list === '') {
      element.style.willChange = ownWillChange ?? '';
      ownWillChange = null;
      return;
    }
    ownWillChange ??= element.style.willChange;
    const own = ownWillChange === 'auto' ? '' : ownWillChange;
    element.style.willChange = own === '' ? list : `${own}, ${list}`;
  };

  /**
   * Gives the element (or its pseudo-element) a compositing layer for
   * `channel` from the task that starts the motion: Mobile Safari runs an
   * animation whose start time is set from script on its compositor at its
   * first commit only if the element already has a layer.
   */
  const promote = (channel: Channel) => {
    if (target == null) {
      return;
    }
    if (!promoted.has(channel)) {
      promoted.add(channel);
      writePromotion(target);
    }
    scheduleDemote();
  };

  /** Ends promotion PROMOTION_LINGER_MS after the last motion ends. */
  const scheduleDemote = () => {
    if (demoteTimer != null) {
      clearTimeout(demoteTimer);
    }
    let end = now();
    for (const segment of segments.values()) {
      end = Math.max(end, segment.start + segment.duration);
    }
    demoteTimer = setTimeout(
      () => {
        demoteTimer = null;
        const time = now();
        const moving = [...segments.values()].some(
          segment => time < segment.start + segment.duration,
        );
        if (moving || pendingGroups.size > 0) {
          scheduleDemote();
          return;
        }
        demote();
      },
      Math.max(0, end - now()) + PROMOTION_LINGER_MS,
    );
  };

  const demote = () => {
    if (demoteTimer != null) {
      clearTimeout(demoteTimer);
      demoteTimer = null;
    }
    if (promoted.size === 0) {
      return;
    }
    promoted.clear();
    if (target != null) {
      writePromotion(target);
    }
  };

  // -- starting from rest ---------------------------------------------------

  /**
   * A call starts from rest when nothing on the channels it drives is moving
   * (a curve still waiting for its first frame counts as rest) and nothing
   * pins its clock (`at`). Returns its start group, or null for an explicit
   * start.
   */
  const beginGroup = (
    time: number,
    properties: Iterable<MotionProperty>,
    at: number | undefined,
  ): StartGroup | null => {
    if (at != null || target == null || typeof target.animate !== 'function') {
      return null;
    }
    const channels = new Set<Channel>();
    for (const property of properties) {
      channels.add(CHANNEL_OF[property]);
    }
    for (const channel of channels) {
      for (const property of CHANNELS[channel]) {
        const segment = segments.get(property);
        if (
          segment != null &&
          time < segment.start + segment.duration &&
          (segment.group == null || segment.group.resolved)
        ) {
          return null;
        }
      }
    }
    let resolve: (start: number) => void = () => {};
    const started = new Promise<number>(r => {
      resolve = r;
    });
    return {
      provisional: time,
      segments: [],
      animations: [],
      channels: new Set(),
      resolved: false,
      resolve,
      started,
    };
  };

  /** Commits a call's changes, from rest when it has a start group. */
  const commitCall = (
    group: StartGroup | null,
    owner: HandleState,
    changed: MotionProperty[],
    time: number,
  ) => {
    if (group != null) {
      for (const property of changed) {
        const segment = segments.get(property);
        if (segment != null && segment.owner === owner) {
          segment.group = group;
          group.segments.push(segment);
        }
      }
    }
    callGroup = group;
    try {
      commit(changed, time);
    } finally {
      callGroup = null;
    }
    if (group == null) {
      return;
    }
    if (group.animations.length === 0) {
      resolveGroup(group, group.provisional); // nothing to start
      return;
    }
    pendingGroups.add(group);
    for (const animation of group.animations) {
      // A cancel before the first frame rejects each one's ready promise.
      (animation as Partial<Animation>).ready?.catch(() => {});
    }
    const ready = (group.animations[0] as Partial<Animation>).ready;
    if (ready == null || typeof ready.then !== 'function') {
      resolveGroup(group, group.provisional); // no pending start to wait for
      return;
    }
    // The browser sets the start: at the frame that commits the animations,
    // or when its compositor starts them (Chromium). Read it in that first
    // frame, ahead of anything that might pause or seek the animations, and
    // when `ready` settles.
    requestFrame?.(() => syncGroup(group));
    ready.then(
      () => syncGroup(group),
      () => resolveGroup(group, group.provisional), // cancelled: never started
    );
  };

  const syncGroup = (group: StartGroup) => {
    if (group.resolved) {
      return;
    }
    for (const animation of group.animations) {
      if (animation.startTime != null) {
        resolveGroup(group, Number(animation.startTime));
        return;
      }
    }
  };

  /** Reads the start of every call whose first frame has been committed. */
  const syncPending = () => {
    for (const group of pendingGroups) {
      syncGroup(group);
    }
  };

  /** Moves a call from rest onto the time the browser started it. */
  const resolveGroup = (group: StartGroup, start: number) => {
    if (group.resolved) {
      return;
    }
    group.resolved = true;
    pendingGroups.delete(group);
    for (const animation of group.animations) {
      // One clock for the whole call; a cancelled one stays cancelled (a
      // start time would play it again).
      if (animation.startTime == null && animation.playState !== 'idle') {
        animation.startTime = start;
      }
    }
    const delta = start - group.provisional;
    if (delta !== 0) {
      for (const segment of group.segments) {
        segment.start += delta;
      }
      for (const channel of group.channels) {
        const animation = running.get(channel);
        if (animation == null || !group.animations.includes(animation)) {
          continue;
        }
        const ends = CHANNELS[channel].flatMap(p => {
          const segment = segments.get(p);
          return segment == null ? [] : [segment.start + segment.duration];
        });
        if (ends.length > 0) {
          scheduleRetire(channel, animation, Math.max(...ends));
        }
      }
      for (const owner of new Set(group.segments.map(s => s.owner))) {
        if (owner.settled || owner.timer == null) {
          continue;
        }
        clearTimeout(owner.timer);
        const ends = group.segments
          .filter(segment => segment.owner === owner)
          .map(segment => segment.start + segment.duration);
        owner.timer = setTimeout(
          () => {
            owner.timer = null;
            settle(owner, true);
          },
          Math.max(0, Math.max(start, ...ends) - now()),
        );
      }
    }
    group.resolve(start);
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
    group: StartGroup | null = null,
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
      started: group?.started ?? Promise.resolve(time),
      value: (property, at = now()) => {
        syncPending();
        return valueAt(property, at);
      },
      velocity: (property, at = now()) => {
        syncPending();
        return velocityAt(property, at);
      },
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
      spring,
    };
  };

  const fadeSegment = (
    owner: HandleState,
    start: number,
    stops: ReadonlyArray<{at: number; value: number}>,
    jumps: ReadonlyArray<number> = [],
  ): Segment => {
    const ease = cubicBezier(timing.curves.easeInOut);
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
    for (const channel of channels) {
      rebuild(channel, time);
    }
  };

  /**
   * Reduced Motion: travel becomes UIKit's cross-fade (see the file header).
   * Returns each property's new segment, or null to put it in place at once.
   */
  const crossfade = (
    owner: HandleState,
    time: number,
    targets: Partial<Record<MotionProperty, number>>,
    properties: MotionProperty[],
    mode: 'crossfade' | 'instant',
    fadeSpring?: SpringDescription,
    role?: 'entrance' | 'exit',
  ): Partial<Record<MotionProperty, Segment | null>> => {
    const next: Partial<Record<MotionProperty, Segment | null>> = {};
    const opacityNow = valueAt('opacity', time);
    const opacityTo = targets.opacity ?? opacityNow;
    let entering = opacityTo > opacityNow + 1e-6;
    let leaving = opacityTo < opacityNow - 1e-6;
    // The fade runs fadeFrom -> fadeTo; an exit by role then returns the
    // opacity to its value (`restore`) when the travel lands.
    let fadeFrom = opacityNow;
    let fadeTo = opacityTo;
    let restore: number | null = null;
    if (!entering && !leaving && role === 'entrance') {
      entering = true;
      fadeFrom = 0;
    } else if (!entering && !leaving && role === 'exit') {
      leaving = true;
      fadeTo = 0;
      restore = opacityTo;
    }
    // The fade, and when the travel lands (ms after `time`): at once for an
    // entrance, after the fade out for an exit, at the bottom of a dip.
    let opacity: Segment | null = null;
    let landsAt = 0;
    if (mode === 'crossfade' && fadeSpring == null) {
      const fade = timing.reducedMotionCrossFadeMs;
      if (entering || leaving) {
        opacity =
          restore == null
            ? fadeSegment(owner, time, [
                {at: 0, value: fadeFrom},
                {at: fade, value: fadeTo},
              ])
            : fadeSegment(
                owner,
                time,
                [
                  {at: 0, value: fadeFrom},
                  {at: fade, value: fadeTo},
                  {at: fade, value: restore},
                ],
                [fade],
              );
        landsAt = entering ? 0 : fade;
      } else {
        opacity = fadeSegment(owner, time, [
          {at: 0, value: opacityNow},
          {at: fade / 2, value: 0},
          {at: fade, value: opacityTo},
        ]);
        landsAt = fade / 2;
      }
    } else if (mode === 'crossfade' && fadeSpring != null) {
      const spring = toSpring(fadeSpring);
      const settle = (curve: SpringCurve) =>
        Math.min(
          MAX_DURATION_MS / 2,
          curve.settleTime(SETTLE_THRESHOLD.opacity) * 1000,
        );
      if (entering || leaving) {
        const curve = solveSpring(spring, {from: fadeFrom, to: fadeTo});
        const duration = settle(curve);
        const end = restore ?? fadeTo;
        opacity = {
          start: time,
          duration,
          target: end,
          at: t =>
            restore != null && t >= duration ? restore : curve.value(t / 1000),
          speed: t =>
            restore != null && t >= duration ? 0 : curve.velocity(t / 1000),
          jumps: restore != null ? [duration] : [],
          owner,
        };
        landsAt = entering ? 0 : duration;
      } else {
        const out = solveSpring(spring, {from: opacityNow, to: 0});
        const back = solveSpring(spring, {from: 0, to: opacityTo});
        const half = settle(out);
        opacity = {
          start: time,
          duration: half + settle(back),
          target: opacityTo,
          at: t =>
            t < half ? out.value(t / 1000) : back.value((t - half) / 1000),
          speed: t =>
            t < half
              ? out.velocity(t / 1000)
              : back.velocity((t - half) / 1000),
          jumps: [],
          owner,
        };
        landsAt = half;
      }
    }
    for (const property of properties) {
      if (!TRAVEL.includes(property)) {
        continue;
      }
      next[property] =
        landsAt === 0
          ? null // in place at once
          : jumpSegment(
              owner,
              time,
              valueAt(property, time),
              targets[property] as number,
              landsAt,
            );
    }
    next.opacity = opacity;
    return next;
  };

  const animator: Animator = {
    get element() {
      return target;
    },

    attach(next) {
      if (next === target) {
        return;
      }
      demote();
      for (const animation of running.values()) {
        animation.cancel();
      }
      running.clear();
      for (const timer of retireTimers.values()) {
        clearTimeout(timer);
      }
      retireTimers.clear();
      target = next;
      if (target == null) {
        return;
      }
      const time = now();
      for (const channel of Object.keys(CHANNELS) as Channel[]) {
        const properties = CHANNELS[channel];
        const isDefault = properties.every(
          p => !segments.has(p) && resting[p] === IDENTITY[p],
        );
        if (!isDefault) {
          rebuild(channel, time);
        }
      }
    },

    get(property, time = now()) {
      syncPending();
      return valueAt(property === 'scale' ? 'scaleX' : property, time);
    },

    getVelocity(property, time = now()) {
      syncPending();
      return velocityAt(property === 'scale' ? 'scaleX' : property, time);
    },

    set(values) {
      syncPending();
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
      // Direct manipulation: the layer makes each write a composite only.
      for (const property of Object.keys(next) as MotionProperty[]) {
        promote(CHANNEL_OF[property]);
      }
      commit(Object.keys(next) as MotionProperty[], time);
    },

    animate(to, transition, animateOptions = {}) {
      syncPending();
      const time = animateOptions.at ?? now();
      const targets = expand(to);
      const velocities = expand(transition.velocity ?? {});
      const {owner, finished} = newOwner();
      lastSpring.set(owner, transition.spring);
      const properties = Object.keys(targets) as MotionProperty[];
      const mode = animateOptions.reducedMotion ?? 'crossfade';
      const travels = properties.filter(
        p =>
          TRAVEL.includes(p) &&
          Math.abs((targets[p] as number) - valueAt(p, time)) > 1e-9,
      );
      const reduce =
        mode !== 'keep' && travels.length > 0 && prefersReducedMotion();
      const next: Partial<Record<MotionProperty, Segment | null>> = {};

      if (reduce) {
        Object.assign(
          next,
          crossfade(
            owner,
            time,
            targets,
            properties,
            mode === 'instant' ? 'instant' : 'crossfade',
            animateOptions.crossfade,
            animateOptions.crossfadeAs,
          ),
        );
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

      const group = beginGroup(
        time,
        Object.keys(next) as MotionProperty[],
        animateOptions.at,
      );
      const changed: MotionProperty[] = [];
      for (const [property, segment] of Object.entries(next) as [
        MotionProperty,
        Segment | null,
      ][]) {
        interrupt(property, time);
        changed.push(property);
        if (segment == null) {
          segments.delete(property);
          resting[property] = targets[property] ?? valueAt(property, time);
        } else {
          segments.set(property, segment);
        }
      }
      commitCall(group, owner, changed, time);
      return makeHandle(owner, changed, finished, time, group);
    },

    play(curves, playOptions = {}) {
      syncPending();
      const time = playOptions.at ?? now();
      const {owner, finished} = newOwner();
      const byProperty: Partial<Record<MotionProperty, MotionCurve>> = {};
      for (const [key, curve] of Object.entries(curves) as [
        MotionProperty | 'scale',
        MotionCurve | undefined,
      ][]) {
        if (curve == null) {
          continue;
        }
        if (!Number.isFinite(curve.duration) || curve.duration < 0) {
          throw new RangeError(
            `animator: a curve needs a finite duration ≥ 0 (got ${curve.duration})`,
          );
        }
        for (const property of expandList([key])) {
          byProperty[property] = curve;
        }
      }
      const properties = Object.keys(byProperty) as MotionProperty[];
      const targets: Partial<Record<MotionProperty, number>> = {};
      for (const property of properties) {
        const curve = byProperty[property] as MotionCurve;
        targets[property] = curve.at(curve.duration);
      }
      const mode = playOptions.reducedMotion ?? 'crossfade';
      const travels = properties.some(
        p =>
          TRAVEL.includes(p) &&
          ((byProperty[p] as MotionCurve).duration > 0 ||
            Math.abs((targets[p] as number) - valueAt(p, time)) > 1e-9),
      );
      const next: Partial<Record<MotionProperty, Segment | null>> =
        mode !== 'keep' && travels && prefersReducedMotion()
          ? crossfade(
              owner,
              time,
              targets,
              properties,
              mode === 'instant' ? 'instant' : 'crossfade',
              playOptions.crossfade,
              playOptions.crossfadeAs,
            )
          : {};
      for (const property of properties) {
        if (property in next) {
          continue;
        }
        const curve = byProperty[property] as MotionCurve;
        next[property] =
          curve.duration === 0
            ? null
            : {
                start: time,
                duration: Math.min(MAX_DURATION_MS, curve.duration * 1000),
                target: targets[property] as number,
                at: t => curve.at(t / 1000),
                speed: t => curve.velocity(t / 1000),
                jumps: [],
                owner,
              };
      }
      const group = beginGroup(
        time,
        Object.keys(next) as MotionProperty[],
        playOptions.at,
      );
      const changed: MotionProperty[] = [];
      for (const [property, segment] of Object.entries(next) as [
        MotionProperty,
        Segment | null,
      ][]) {
        interrupt(property, time);
        changed.push(property);
        if (segment == null) {
          segments.delete(property);
          resting[property] = targets[property] ?? valueAt(property, time);
        } else {
          segments.set(property, segment);
        }
      }
      commitCall(group, owner, changed, time);
      return makeHandle(owner, changed, finished, time, group);
    },

    decay(velocity, decayOptions = {}) {
      syncPending();
      const time = decayOptions.at ?? now();
      const velocities = expand(velocity);
      const {owner, finished} = newOwner();
      const rate = decayOptions.rate ?? scroll.decelerationRate.normal;
      const bounce = toSpring(decayOptions.bounce ?? scroll.bounce);
      const properties = Object.keys(velocities) as MotionProperty[];
      const group = beginGroup(time, properties, decayOptions.at);
      for (const property of properties) {
        const from = valueAt(property, time);
        const v0 = velocities[property] as number;
        const bounds = decayOptions.bounds?.[property];
        const threshold = SETTLE_THRESHOLD[property];
        interrupt(property, time);
        let segment: Segment | null;
        if (bounds != null && (from < bounds.min || from > bounds.max)) {
          // Released past an edge: straight back with the release velocity.
          const edge = from < bounds.min ? bounds.min : bounds.max;
          const curve = solveSpring(bounce, {from, to: edge, velocity: v0});
          segment = {
            start: time,
            duration: Math.min(
              MAX_DURATION_MS,
              curve.settleTime(threshold) * 1000,
            ),
            target: edge,
            at: t => curve.value(t / 1000),
            speed: t => curve.velocity(t / 1000),
            jumps: [],
            owner,
          };
        } else {
          const coast = solveDecay({from, velocity: v0, rate});
          const edge =
            bounds == null
              ? null
              : coast.rest < bounds.min
                ? bounds.min
                : coast.rest > bounds.max
                  ? bounds.max
                  : null;
          const hit = edge == null ? null : coast.timeToReach(edge);
          if (edge != null && hit != null) {
            // The coast reaches the edge: the edge spring takes its velocity.
            const contact = hit * 1000;
            const spring = solveSpring(bounce, {
              from: edge,
              to: edge,
              velocity: coast.velocity(hit),
            });
            segment = {
              start: time,
              duration: Math.min(
                MAX_DURATION_MS,
                contact + spring.settleTime(threshold) * 1000,
              ),
              target: edge,
              at: t =>
                t < contact
                  ? coast.value(t / 1000)
                  : spring.value((t - contact) / 1000),
              speed: t =>
                t < contact
                  ? coast.velocity(t / 1000)
                  : spring.velocity((t - contact) / 1000),
              jumps: [],
              owner,
            };
          } else {
            const rest = edge ?? coast.rest;
            segment =
              v0 === 0
                ? null
                : {
                    start: time,
                    duration: Math.min(
                      MAX_DURATION_MS,
                      coast.settleTime(threshold * 2) * 1000,
                    ),
                    target: rest,
                    at: t => coast.value(t / 1000),
                    speed: t => coast.velocity(t / 1000),
                    jumps: [],
                    owner,
                  };
          }
        }
        if (segment == null) {
          segments.delete(property);
          resting[property] = from;
        } else {
          segments.set(property, segment);
        }
      }
      commitCall(group, owner, properties, time);
      return makeHandle(owner, properties, finished, time, group);
    },

    stop(properties) {
      syncPending();
      const time = now();
      const list = properties == null ? PROPERTIES : expandList(properties);
      const changed: MotionProperty[] = [];
      for (const property of list) {
        if (!segments.has(property)) {
          continue;
        }
        const value = valueAt(property, time);
        interrupt(property, time);
        segments.delete(property);
        resting[property] = value;
        changed.push(property);
      }
      commit(changed, time);
    },

    rebase(deltas, rebaseOptions = {}) {
      syncPending();
      const time = rebaseOptions.at ?? now();
      const changed: MotionProperty[] = [];
      const owners = new Set<HandleState>();
      for (const [property, delta] of Object.entries(expand(deltas)) as [
        MotionProperty,
        number,
      ][]) {
        if (delta === 0) {
          continue;
        }
        changed.push(property);
        const segment = segmentAt(property, time);
        if (segment == null) {
          resting[property] = valueAt(property, time) + delta;
          segments.delete(property);
          continue;
        }
        owners.add(segment.owner);
        if (segment.spring != null) {
          const from = valueAt(property, time) + delta;
          const velocity = velocityAt(property, time);
          const curve = solveSpring(toSpring(segment.spring), {
            from,
            to: segment.target,
            velocity,
          });
          segments.set(property, {
            start: time,
            duration: Math.min(
              MAX_DURATION_MS,
              curve.settleTime(SETTLE_THRESHOLD[property]) * 1000,
            ),
            target: segment.target,
            at: t => curve.value(t / 1000),
            speed: t => curve.velocity(t / 1000),
            jumps: [],
            owner: segment.owner,
            spring: segment.spring,
          });
        } else {
          segments.set(property, {
            ...segment,
            target: segment.target + delta,
            at: t => segment.at(t) + delta,
          });
        }
      }
      commit(changed, time);
      // The handles that own the rebased curves finish at their new ends.
      for (const owner of owners) {
        if (owner.settled || owner.timer == null) {
          continue;
        }
        clearTimeout(owner.timer);
        let end = time;
        for (const segment of segments.values()) {
          if (segment.owner === owner) {
            end = Math.max(end, segment.start + segment.duration);
          }
        }
        owner.timer = setTimeout(
          () => {
            owner.timer = null;
            settle(owner, true);
          },
          Math.max(0, end - now()),
        );
      }
    },

    async atRest(properties) {
      const list = properties == null ? PROPERTIES : expandList(properties);
      return new Promise<void>(resolve => {
        const check = () => {
          syncPending();
          const time = now();
          let end = time;
          for (const property of list) {
            const segment = segments.get(property);
            if (segment != null) {
              end = Math.max(end, segment.start + segment.duration);
            }
          }
          if (end <= time) {
            resolve();
          } else {
            // A retarget or a later start moves the end: look again then.
            setTimeout(check, end - time);
          }
        };
        check();
      });
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
      demote();
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
