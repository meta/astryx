// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animator.ts
 * @input An element, target values, and a spring, momentum curves (coast.ts)
 *   or any closed-form curve
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
 * UIScrollView coast with an edge bounce, coast.ts), a curve handed to `play` (a spring chasing a moving
 * target, a fitted UIKit curve), or a Reduced Motion cross-fade. The curves are baked into
 * Web Animations keyframes on the individual transform properties (`translate`,
 * `rotate`, `scale`) and `opacity`, sampled adaptively until linear
 * interpolation between keyframes is within a fraction of a pixel, and played
 * with `easing: linear`. The browser then runs them on its compositor: they
 * keep advancing every frame while JavaScript is busy (`spec:AST-094` FR5).
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
 * mid-flight from the value on screen, and a new target starts from the
 * current value with the current velocity (`spec:AST-094` FR6). A gesture's release velocity
 * can be handed in explicitly instead.
 *
 * No frame shows a value the element is not at. While a curve runs, the
 * element's inline style holds the value the curve starts from (the value on
 * screen when it was built), so a frame painted before the compositor has the
 * curve (WebKit can receive a new curve a few updates late) shows the element
 * where it is, never where it is going. The keyframes hold the end state for a
 * while after the curve ends (END_HOLD_MS); the main thread retires a finished
 * animation as soon as it runs after the curve's end, writing the end values
 * inline in the same task that cancels it, so nothing moves. The hold matters
 * when the curve ends during a main-thread block: WebKit's compositor ends an
 * animation by falling back to the value its main thread last committed.
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
 * frame. `options.start` changes that per call: `'commit'` dates a retarget
 * by the browser's commit as well, and `'presented'` creates the animations
 * of a call from rest two frames later, once its element at rest has been
 * presented (a UI process that applies commits late); a retarget still starts
 * now, from the value and velocity on screen.
 * `handle.curve(property)` hands out the curve a call plays, so a
 * companion can follow it on the same clock.
 * `options.additive` retargets as UIKit does: the old curve keeps going and a
 * curve of the change between the targets is added on top, baked into one
 * animation (two animations on one property leave the compositor in both
 * engines), so the retarget keeps the velocity on screen.
 *
 * WebKit dates an animation created just before a block at its last frame
 * time before the block, where the first frame after it would show the
 * motion skipped into its curve; when the call's own task ran on more than
 * two frames, the call's first read of that start moves it to that read, so
 * WebKit delays the motion as Chromium's commit does (startAfterBlock). Every
 * call of that task moves together, and a shorter task or a read that other
 * tasks delay keeps the browser's start, so a sequence chained on a call's
 * end (a Reduce Motion cross-fade's second half) keeps its clock.
 *
 * Promotion: Mobile Safari runs an animation whose start time is set from
 * script on its compositor at its first commit only if the element (or the
 * pseudo-element) already has a compositing layer; without one, a block
 * right after that commit freezes it (iOS 26.2 simulator: 2 of 7 runs kept
 * moving, 0 of 5 on a ::before). Every animation the animator creates, and
 * every `set` (unless it passes `{promote: false}`), therefore promotes its
 * channels in the same task: inline
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
 * Reduced Motion (design:reduced-motion): with `prefers-reduced-motion:
 * reduce`, every `animate` and `play` (travel or opacity, on a spring or any
 * curve) is replaced, and nothing moves, scales or springs. The planner
 * (reducedMotionPlan.ts) decides what each call becomes; the animator
 * applies the plan and runs its landings:
 * - on a coarse primary pointer, or for a call started by a touch drag's
 *   release on any pointer (`touchRelease`), it becomes (DR2) an
 *   opacity-only cross-fade of `timing.reducedMotionCrossFadeMs` (200 ms)
 *   on `timing.curves.move`:
 *   - entering (opacity rises from 0 in the same call, or `crossfadeAs:
 *     'entrance'`): lands in its new place at once and fades in;
 *   - leaving (opacity falls to 0, or `crossfadeAs: 'exit'`): fades out in
 *     place, then lands;
 *   - an opacity change alone: fades to its value;
 *   - otherwise: dips (fades out, lands, fades back in);
 *   travel lands with a plain style write while the element is transparent,
 *   never as an animated transform; a busy main thread only keeps it
 *   transparent longer, and a dip fades back in from the landing; a later
 *   call that lands too carries a landing still waiting (two calls in one
 *   frame land together), and a later opacity change lands it at once;
 * - on any other primary pointer (DR3) it completes at once.
 * No call option and no role value lengthens the fade or keeps travel (DR4):
 * the fade's length is not a role.
 *
 * Momentum under Reduce Motion (`design:reduced-motion` DR2, DEC-2): a
 * decay's momentum continues the velocity a finger handed it on release
 * (UIScrollView's coast after a flick, with its bounce at an edge), so it
 * keeps its motion, as native momentum does: it is direct movement, not a
 * transition. A curve marked `isTransition` (coast()'s spring back from past
 * an edge), like a spring a component starts on release toward a target it
 * picks (a detent, a page), is a transition: it plays through the Reduce
 * Motion policy above, a cross-fade on a coarse pointer or after a touch
 * release (`touchRelease`) and at once elsewhere (DR2, DR3).
 *
 * Roles: every spring and curve the animator plays passes through
 * resolveMotion.ts, which names the motion role it plays (`springs.settle`
 * once `registerSpringsTable()` has run, the Reduce Motion fade's curve,
 * which the animator registers alone). The per-role tables stay internal
 * (`spec:AST-094` DEC-15), so a role plays its table value: nothing reads a
 * CSS variable or the element's style for it. A spring written inline at the call
 * site, and a table never registered, play as given; the fade's length is not
 * a role.
 *
 * A pseudo-element (`options.pseudoElement`, a dialog's `::backdrop`) has no
 * inline style: its end value is held by a static filling animation (after a
 * curve ends, and after `set`) until the next animation replaces it, and for
 * as long as the pseudo-element exists. The browser makes a `::backdrop`
 * again each time its dialog opens, without the hold, so a presentation
 * calls `set` with its starting value right after `showModal()`, in the same
 * task: a `set` before it lands on the backdrop the open replaces.
 *
 * SSR-safe: nothing touches `window` or `document` at module scope, and an
 * animator created without an element only keeps state until one is attached.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/animator.test.ts
 * - /packages/core/src/motion/reducedMotionPlan.ts (the Reduce Motion plan)
 * - /packages/core/src/motion/__tests__/animator.interaction.browser.spec.ts
 * - /packages/core/src/motion/resolveMotion.ts (the roles it resolves)
 * - /packages/core/src/motion/README.md
 */

import {cubicBezier} from './bezier';
import {solveSpring, toSpring, type SpringDescription} from './spring';
import {resolveMotion} from './resolveMotion';
import {
  reducedMotionCrossFade,
  registerReducedMotionCrossFade,
} from './uikit/timing';
import {planReducedMotion, type ReducedMotionView} from './reducedMotionPlan';

/**
 * A value the animator can drive.
 */
export type MotionProperty =
  'x' | 'y' | 'rotate' | 'scaleX' | 'scaleY' | 'opacity';

/**
 * Values by property; `scale` sets `scaleX` and `scaleY` together.
 */
export type MotionValues = Partial<Record<MotionProperty | 'scale', number>>;

/**
 * A spring and the velocity it starts with.
 */
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
 * Options of `animate` and `play`: the spring, a release velocity, the Reduced
 * Motion handling.
 */
export interface AnimateOptions {
  /**
   * Start time on the document timeline (ms, `performance.now()` clock).
   * Defaults to now. Pass one value to several animators to put their
   * animations on one clock.
   */
  at?: number;
  /**
   * The call starts from the release of a touch drag (a sheet let go, a swipe
   * back released). Under Reduced Motion it then cross-fades whatever the
   * primary pointer (design:reduced-motion DR2), where another call on a
   * fine primary pointer completes at once (DR3). The gesture host knows;
   * nothing is inferred from the last pointer.
   */
  touchRelease?: boolean;
  /**
   * Which way the substituted cross-fade goes when the call's own opacity
   * does not say (a sheet slides in or out without fading): `'entrance'`
   * lands the travel at once and fades the opacity in from 0; `'exit'` fades
   * it out in place, then lands the travel and returns the opacity to its
   * value. The call's targets stay the end state; without Reduced Motion this
   * changes nothing.
   */
  crossfadeAs?: 'entrance' | 'exit';
  /**
   * When the call's animations start. By default a call from rest starts
   * when the browser commits it, and a call that continues motion on screen
   * (a retarget) starts now, from the value on screen. Ignored with `at`.
   * - `'commit'`: a call that continues motion also starts when the browser
   *   commits it, dated by the browser rather than by the main thread, as a
   *   call from rest is.
   * - `'presented'`: a call from rest leaves its element at rest and creates
   *   its animations two frames later, once the frame that carries the
   *   element at rest has been presented; they then start at their commit. A
   *   busy UI process delays the motion instead of skipping into it, for two
   *   frames more before an idle start. Any other change to the animator
   *   before then creates the animations first, in call order. A call that
   *   continues motion on screen (a retarget) starts now, as by default.
   */
  start?: 'commit' | 'presented';
  /**
   * A call that retargets a curve on screen adds to it instead of replacing
   * it, as UIKit's animations do: the old curve keeps going (past its end, at
   * its target) and a spring of the difference between the two targets runs
   * from 0 on top, in the same animation. Its value and velocity at the call
   * are the old curve's, so whichever frame first shows it (WebKit can apply
   * a new curve tens of ms late), nothing steps back. Ignored for a property
   * at rest or still waiting for the browser's start, for a property given a
   * velocity, and under Reduced Motion. Use it for a played curve that starts
   * at rest (an eased reversal) while the property moves; a spring retarget
   * on the same spring moves the same either way, and a curve that already
   * continues the velocity on screen must not add to it.
   */
  additive?: boolean;
}

/**
 * Any closed-form curve to play on the compositor (`Animator.play`, and a
 * release's coast through `Animator.decay`): a spring chasing a moving
 * target, a piecewise curve, a fitted UIKit curve. Times are seconds from
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

/**
 * Options of `createAnimator`.
 */
/** How `set` puts values in place. */
export interface SetOptions {
  /**
   * Whether the write promotes its channels to a compositing layer, as a
   * drag's per-frame writes need so each is a composite only (default
   * true). `false` writes the values and nothing else: a one-off switch that
   * must not give its element a layer, such as a veil under a sticky header
   * switched during a programmatic scroll (on iOS 26.2, a layer there blanks
   * the header's painted items for about two frames). A channel another
   * motion keeps promoted stays promoted, and a channel with other motion
   * still running gets its animation's layer as usual.
   */
  promote?: boolean;
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
  /**
   * Runs a callback in the next animation frame; `requestAnimationFrame` by
   * default. A call from rest reads the start the browser gave it there.
   */
  requestFrame?: (callback: () => void) => void;
}

/**
 * One `animate` / `decay` call's animations.
 */
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
  /**
   * The curve this call started on `property` (`scale` reads `scaleX`),
   * in seconds from the call's start: what the keyframes play. Null for a
   * property the call does not move, or moves without travel (Reduced
   * Motion). Map it onto a companion property with `mapProgress`, and play
   * that on the same clock.
   */
  curve(property: MotionProperty | 'scale'): MotionCurve | null;
  /** New targets for this call's properties, keeping their velocity. */
  retarget(
    to: MotionValues,
    transition?: SpringTransition,
    options?: AnimateOptions,
  ): MotionHandle;
  /** Freezes this call's properties at their presentation values. */
  stop(): void;
}

/**
 * A compositor animator bound to one element (see the file header).
 */
export interface Animator {
  /**
   * What Reduced Motion makes of a call on this element right now:
   * `'off'` (motion plays), `'crossfade'` (an opacity-only fade: a coarse
   * pointer, or `touchRelease`) or `'instant'` (any other pointer). For
   * feedback that has no fade of its own (a press lift, a lens chasing the
   * finger): skip it unless `'off'`.
   */
  reducedMotion(options?: {
    touchRelease?: boolean;
  }): 'off' | 'crossfade' | 'instant';
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
  set(values: MotionValues, options?: SetOptions): void;
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
   * or scale as travel, which the policy replaces (design:reduced-motion: a
   * cross-fade after a touch, an immediate change otherwise). Its handle has
   * no spring of its own: `retarget` needs one.
   */
  play(
    curves: Partial<Record<MotionProperty | 'scale', MotionCurve>>,
    options?: AnimateOptions,
  ): MotionHandle;
  /**
   * Plays momentum curves as given, on the translate axes only: a released
   * scroll view's coast and edge bounce, which `coast()` (coast.ts) builds
   * from a finger's release velocity. Under Reduce Motion momentum keeps
   * its motion: it continues a throw, direct movement (design:reduced-motion
   * DR2, DEC-2). A curve marked `isTransition` (coast()'s spring back from
   * past an edge) is a transition and plays through the Reduce Motion
   * policy, as `animate` does. Anything else (a fade, a slide a tap starts)
   * is a transition too: play it with `play` or `animate`. Pass
   * `touchRelease` when a touch drag's release starts it, so a spring back
   * cross-fades on any pointer (DR2). Only a surface that coasts imports the
   * coast math and the scroll table.
   */
  decay(
    curves: Partial<Record<'x' | 'y', MotionCurve>>,
    options?: Pick<AnimateOptions, 'at' | 'touchRelease'>,
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
  /** A Reduce Motion fade: an interruption finishes it instead of freezing it. */
  readonly isFade?: true;
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
  /**
   * Its animations were created in the running task: the browser cannot have
   * started them yet, so nothing reads their start time until it ends.
   */
  fresh: boolean;
  readonly segments: Segment[];
  readonly animations: Animation[];
  readonly channels: Set<Channel>;
  resolved: boolean;
  /**
   * The first frame after the call has run: a start read later is the
   * browser's, whatever it says (startAfterBlock).
   */
  framed?: boolean;
  /** The task it was made in, with every call made in that task. */
  task?: TaskMark;
  /** A later call in the same task that took over its curves. */
  adoptedBy?: StartGroup;
  readonly resolve: (start: number) => void;
  readonly started: Promise<number>;
}

/** An atRest() call waiting for its curves to end. */
interface RestWait {
  timer: ReturnType<typeof setTimeout> | null;
  settle: () => void;
}

interface HandleState {
  resolve: (finished: boolean) => void;
  settled: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Reduced Motion travel that lands with a plain style write while the
 * element is fully transparent (never an animated transform), then, in a
 * dip, the fade back in.
 */
interface Landing {
  /**
   * The call that settles when the landing (and its fade back in) ends; a
   * call that joins the dip takes it over, and the call it replaces is
   * carried.
   */
  owner: HandleState;
  /** ms after the call's start. */
  readonly at: number;
  readonly values: Map<MotionProperty, number>;
  /**
   * The fade back in that follows the landing (a dip); `isBorrowed` when it
   * returns to the stylesheet's opacity, which owns it again once it ends.
   */
  fadeIn: {
    readonly to: number;
    readonly ms: number;
    readonly isBorrowed?: boolean;
  } | null;
  /** The opacity written with the landing (an exit by role). */
  restore: number | null;
  /**
   * The restore returns to the stylesheet's opacity (an exit by role on a
   * surface no call owns opacity on): the stylesheet owns it again.
   */
  restoreIsBorrowed?: boolean;
  /** Earlier calls whose landings this one carries: they land with it. */
  readonly carried: HandleState[];
  /** Whose move each value is: a carried value keeps its own call. */
  readonly owners: Map<MotionProperty, HandleState>;
  timer: ReturnType<typeof setTimeout> | null;
  /** When it is due on the document timeline, once the call has started. */
  due: number | null;
}

/** What Reduced Motion makes of a call: its segments, and any landing. */
interface ReducedPlan {
  readonly next: Partial<Record<MotionProperty, Segment | null>>;
  /** Values that stay where they are until the landing writes them. */
  readonly holds: Partial<Record<MotionProperty, number>>;
  readonly landing: Omit<
    Landing,
    'owner' | 'timer' | 'carried' | 'owners' | 'due'
  > | null;
  /** The stylesheet opacity a dip borrowed (no call owns opacity). */
  readonly borrowed?: number | null;
  /** The call joins the waiting dip (see the planner's `joins`). */
  readonly joins?: boolean;
}

const PROPERTIES: ReadonlyArray<MotionProperty> = [
  'x',
  'y',
  'rotate',
  'scaleX',
  'scaleY',
  'opacity',
];

/** The axes momentum moves: `decay` takes only these (DR2, DEC-2). */
const DECAY_PROPERTIES: ReadonlyArray<'x' | 'y'> = ['x', 'y'];

const IDENTITY: Record<MotionProperty, number> = {
  x: 0,
  y: 0,
  rotate: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
};

/**
 * Within this of its target a curve is over (in the property's own unit). A
 * curve built outside the animator (a progress curve) settles where a call
 * would with this as its epsilon.
 */
export const SETTLE_THRESHOLD: Record<MotionProperty, number> = {
  x: 0.05,
  y: 0.05,
  rotate: 0.01,
  scaleX: 0.0001,
  scaleY: 0.0001,
  opacity: 0.001,
};

/**
 * Keyframes are added until linear interpolation is within this: a quarter of
 * a device pixel (this quarter of a CSS pixel, divided by the device pixel
 * ratio where it is above 1), a twentieth of a degree, a 2000th of the size,
 * about one step of an 8-bit alpha. Every one is below what a moving element
 * can show.
 */
const SAMPLE_TOLERANCE: Record<MotionProperty, number> = {
  x: 0.25,
  y: 0.25,
  rotate: 0.05,
  scaleX: 0.0005,
  scaleY: 0.0005,
  opacity: 0.004,
};

/** Keyframes start on this grid (ms) and are split where the curve needs it. */
const SAMPLE_GRID_MS = 1000 / 30;

/** A curve that has not settled by then (an undamped spring) snaps. */
const MAX_DURATION_MS = 30_000;

/**
 * How long a task must run on past its first call from rest before that
 * counts as a block (WebKit; startAfterBlock): two frames at 60 Hz.
 */
// Browser start times are frame times and a task's end a live clock, so only a block longer than a frame plus the task's own length can be told apart from that quantization.
const LATE_START_MS = 34;

/**
 * The task calls from rest are made in, shared by every call made in it
 * (every animator's), so one motion's parts that are separate calls start
 * together (startAfterBlock).
 */
interface TaskMark {
  /**
   * When its first call from rest created animations: the call itself, or a
   * presented call's second frame.
   */
  readonly first: number;
  /** When the task ended, at its first microtask. */
  ended?: number;
  /** The start every call of a blocked task moves to, set by its first read. */
  at?: number;
}

/** The task the current calls from rest are made in, until it ends. */
let openTask: TaskMark | null = null;

/** The mark of the running task, opened by its first call from rest. */
function markTask(time: number, clock: () => number): TaskMark {
  if (openTask == null) {
    const task: TaskMark = {first: time};
    openTask = task;
    queueMicrotask(() => {
      task.ended = clock();
      openTask = null;
    });
  }
  return openTask;
}

/** Above this many keyframes the tolerance is relaxed. */
const MAX_KEYFRAMES = 1200;
/**
 * The keyframes hold the end state this long after a curve ends. An engine
 * whose compositor ends an animation while the main thread is blocked falls
 * back to the value its main thread last committed, the curve's start
 * (WebKit on Linux); the hold keeps the end state on screen through any such
 * block. It only stretches the last keyframe. The main thread retires the
 * animation as soon as it runs after the curve's end.
 *
 * Why a tail inside the curve's own animation, with a bound (measured Oct 24
 * 2026; do not replace it without these proofs):
 * - WebKit on Linux (WebKitGTK and WPE) ignores `fill` on its compositor:
 *   a 400 ms move that ends during a 1 s main-thread block snaps back to the
 *   block-start position 13 ms after its end, with `fill: forwards` or with
 *   no fill, and holds with this tail. iOS 26.2 Mobile Safari holds the end
 *   in all three forms, so there the tail is unneeded but harmless (measured
 *   Oct 25 2026). The browser proof "a spring that ends inside the block
 *   keeps showing its end state" catches it.
 * - A separate static animation of the end state under the curve would hold
 *   it without a bound, but two animations on one property push Chromium to
 *   run the curve on the main thread: the 1 s block proof moved in 0 of 57
 *   frames, the start-before-a-block proof failed, and seeking the curve
 *   broke.
 */
export const END_HOLD_MS = 60_000;

/** How often a paused animation is looked at again for retiring, ms. */
const RETIRE_RECHECK_MS = 100;

/**
 * The soonest a running animation's end is looked for again, ms: a frame at
 * 60 Hz. WebKit moves an animation's currentTime once per frame, so a look
 * within a frame reads the frame's time, a fraction of a ms short of the end,
 * and a timer for that fraction would fire again before anything moved.
 */
const END_RECHECK_MS = 1000 / 60;

/** How long an element stays promoted after its last motion, ms. */
export const PROMOTION_LINGER_MS = 500;

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

/**
 * Whether the user asked for reduced motion (`prefers-reduced-motion:
 * reduce`), read at the moment of the call: the preference the animator uses
 * by default for its Reduce Motion substitution. A component never reads it
 * to pick a curve of its own: its motion settings do not override the
 * policy (design:reduced-motion DR4); `animator.reducedMotion()` or
 * `reducedMotionFade()` gives the policy's answer. False without a window
 * (server rendering).
 */
export function defaultPrefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Whether the primary pointer is coarse: `(pointer: coarse)`. */
export function defaultIsCoarsePointer(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  );
}

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
 * // finger lifts at 1200 px/s heading for the detent at 0 (a component
 * // passes the spring of its motion role):
 * animator.animate({y: 0}, {spring: {response: 0.45, dampingRatio: 0.9}, velocity: {y: 1200}});
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
  // Reduced Motion reads the person's settings and nothing else: no option
  // overrides them (design:reduced-motion DR4).
  const prefersReducedMotion = defaultPrefersReducedMotion;
  const isCoarsePointer = defaultIsCoarsePointer;
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
  /** Calls from rest whose start still waits for the browser's commit. */
  const pendingGroups = new Set<StartGroup>();
  /** atRest() calls still waiting; dispose settles them. */
  const restWaits = new Set<RestWait>();
  /** A detach that settles as an unmount at the end of the task, unless an attach follows. */
  let unmountQueued = false;
  /**
   * The node the latest attach(null) detached, while its unmount is pending:
   * a waiting Reduce Motion move lands there, so that node is left visible
   * where it was going.
   */
  let lastDetached: HTMLElement | null = null;
  /** Runs `write` with the pending unmount's node as the target. */
  const onLastDetached = (write: () => void) => {
    const current = target;
    target = target ?? lastDetached;
    try {
      write();
    } finally {
      target = current;
    }
  };
  /** The call being committed, when it starts from rest. */
  let callGroup: StartGroup | null = null;
  /** Channels promoted to the element's compositing layer (will-change). */
  const promoted = new Set<Channel>();
  /** The element's own inline will-change, restored when promotion ends. */
  let ownWillChange: string | null = null;
  /** The stylesheet's will-change when there is no inline value. */
  let sheetWillChange = '';
  /**
   * Whether sheetWillChange holds a read of the element's current style: it
   * is read in the task after the element is attached, and again after each
   * demotion, so a promotion (a drag's first move) reads no style in its
   * own task.
   */
  let sheetWillChangeRead = false;
  /** The pending read of sheetWillChange, cancelled with its element. */
  let sheetReadTimer: ReturnType<typeof setTimeout> | null = null;
  let demoteTimer: ReturnType<typeof setTimeout> | null = null;
  /** A pseudo-element is promoted through a custom property on its host. */
  const promotionProperty =
    pseudoElement == null
      ? null
      : `--astryx-motion-will-change-${pseudoElement.replace(/^:+/, '')}`;
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

  /**
   * A curve whose call the browser has not started yet: still at its start
   * on screen (valueAt), already moving in the model (velocityAt).
   */
  const isHeld = (segment: Segment) =>
    segment.group != null && !segment.group.resolved;

  /** The curve itself at `time`: what the keyframes play. */
  const curveAt = (property: MotionProperty, time: number): number => {
    const segment = segments.get(property);
    if (segment == null) {
      return resting[property];
    }
    if (time >= segment.start + segment.duration) {
      return segment.target;
    }
    return segment.at(Math.max(0, time - segment.start));
  };

  /**
   * The value on screen at `time`. A curve the browser has not started is at
   * its start up to now; a later time reads the curve from its provisional
   * start, the model's best guess until the browser's start moves it (a
   * companion that samples a curve ahead follows its shape).
   */
  const valueAt = (property: MotionProperty, time: number): number => {
    const segment = segments.get(property);
    if (segment != null && isHeld(segment) && time <= now()) {
      // Nothing has moved on screen until the browser starts the call.
      return segment.at(0);
    }
    return curveAt(property, time);
  };

  const velocityAt = (property: MotionProperty, time: number): number => {
    const held = segments.get(property);
    if (held != null && isHeld(held)) {
      // Still at its start on screen, but moving in the model: a retarget
      // carries the velocity the curve has reached by now, so a flick whose
      // moves all land before the browser starts any keeps its speed.
      return held.speed(Math.max(0, time - held.start));
    }
    const segment = segmentAt(property, time);
    if (segment == null || time < segment.start) {
      return 0;
    }
    return segment.speed(time - segment.start);
  };

  // The curve just before a jump at absolute time `time`.
  const valueBefore = (property: MotionProperty, time: number): number =>
    curveAt(property, time - 1e-6);

  // -- writing --------------------------------------------------------------

  const finalValue = (property: MotionProperty): number =>
    segments.get(property)?.target ?? resting[property];

  const writeInline = (
    channel: Channel,
    value: (property: MotionProperty) => number,
    release = true,
  ) => {
    if (target == null || pseudoElement != null) {
      return;
    }
    touched.add(channel);
    const text = inlineText(channel, value);
    // An unchanged value is not written: a style write invalidates the
    // element, and WebKit can repaint sticky content stale when that lands in
    // the frame a scroll commits.
    if (target.style.getPropertyValue(channel) !== text) {
      target.style.setProperty(channel, text);
    }
    if (release && text === IDENTITY_TEXT[channel]) {
      // Identity leaves the element when nothing else would move it.
      releaseIdentity(channel);
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
    const value = (t: number) => curveAt(property, t);
    const breaks = segment.jumps
      .map(j => segment.start + j)
      .filter(t => t > begin && t < end);
    const edges = [begin, ...breaks, end];
    for (let e = 0; e + 1 < edges.length; e++) {
      const a = edges[e];
      const b = edges[e + 1];
      // A 30 Hz grid, each interval split until the chord is within the
      // tolerance at its quarter points.
      const steps = Math.max(1, Math.ceil((b - a) / SAMPLE_GRID_MS));
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
    // An element's inline style takes the value on screen below, so its old
    // animation can go first. A pseudo-element has none: its old animation
    // keeps holding the value until the new one exists (same task, no frame in
    // between).
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
    const moving = properties.filter(p => segments.has(p));
    if (
      moving.length === 0 ||
      target == null ||
      typeof target.animate !== 'function'
    ) {
      writeInline(channel, finalValue);
    } else {
      // The value on screen as the curve starts: what a frame painted before
      // the compositor has the curve shows. The end is written at retire.
      writeInline(channel, p => valueAt(p, time));
    }
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
    // A channel rebuilt by an explicit call (set, rebase, a retarget of
    // another axis) while one of its curves still waits for the browser's
    // start keeps that start: no explicit start for this animation.
    const waiting =
      callGroup ??
      moving
        .map(p => (segments.get(p) as Segment).group)
        .find(group => group != null && !group.resolved) ??
      null;
    // The keyframes start where the animation will: at the waiting call's
    // own time, which its start moves to the browser's (resolveGroup), so a
    // write later in the task keeps the screen on the model's clock.
    const from = waiting?.provisional ?? time;
    const end = Math.min(
      from + MAX_DURATION_MS,
      Math.max(
        ...moving.map(
          p =>
            (segments.get(p) as Segment).start +
            (segments.get(p) as Segment).duration,
        ),
      ),
    );
    if (end <= from) {
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
          const index = group.segments.indexOf(segment);
          if (index >= 0) {
            group.segments.splice(index, 1);
          }
          group.adoptedBy = callGroup;
          segment.group = callGroup;
          // Re-dated to this call's time: it starts at the commit too, not
          // the work between the two calls into its curve.
          segment.start += callGroup.provisional - group.provisional;
          callGroup.segments.push(segment);
        }
      }
    }
    // Read where the keyframes are baked: a page moved to another screen
    // bakes its next motion for that screen.
    const devicePixel = 1 / Math.max(1, globalThis.devicePixelRatio || 1);
    const collect = (scale: number) => {
      const times = new Set<number>([from, end]);
      for (const property of moving) {
        const tolerance =
          SAMPLE_TOLERANCE[property] *
          scale *
          (property === 'x' || property === 'y' ? devicePixel : 1);
        for (const t of sampleTimes(property, from, end, tolerance)) {
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
        if (t > from && t <= end) {
          jumpTimes.add(t);
          all.add(t);
        }
      }
    }
    const times = [...all].sort((a, b) => a - b);
    const span = end - from + END_HOLD_MS;
    const keyframes: Keyframe[] = [];
    for (const t of times) {
      const offset = (t - from) / span;
      if (jumpTimes.has(t)) {
        keyframes.push({
          offset,
          [channel]: format(channel, p => valueBefore(p, t)),
        });
      }
      keyframes.push({
        offset,
        [channel]: format(channel, p =>
          t >= end ? finalValue(p) : curveAt(p, t),
        ),
      });
    }
    keyframes.push({offset: 1, [channel]: format(channel, finalValue)});
    promote(channel);
    const animation = target.animate(keyframes, {
      duration: span,
      // The last keyframes hold the end state (END_HOLD_MS); filling both
      // ways also keeps it where an engine honors the fill on its compositor.
      // The main thread retires the animation once it runs after the end,
      // writing the end inline in that task, so that changes no pixel.
      fill: 'both',
      easing: 'linear',
      ...(pseudoElement != null ? {pseudoElement} : {}),
    });
    if (waiting != null) {
      // From rest: no start time, so the browser starts the animation when
      // it commits it (StartGroup); the keyframes are sampled from `from`,
      // the call's own start.
      waiting.animations.push(animation);
      waiting.channels.add(channel);
      // A cancel before the first frame rejects its ready promise.
      (animation as Partial<Animation>).ready?.catch(() => {});
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
   * running state: an element's end values are written inline in the task
   * that cancels it; a pseudo-element's end value moves to a static holding
   * animation, created before the long one goes.
   *
   * Why a timer at the curve's end: no browser event reports that an
   * animation's time has reached a point inside its effect, and its
   * `finished` comes only after the END_HOLD_MS tail, which would keep the
   * element promoted and the animation alive for a minute. The timer is set
   * on the curve's own clock and re-armed while a sampler pauses or seeks the
   * animation, so it never retires a held one.
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
            animation.playState === 'paused'
              ? RETIRE_RECHECK_MS
              : Math.max(remaining, END_RECHECK_MS),
          ),
        );
        return;
      }
      running.delete(channel);
      // A pseudo-element holds its resting value, unless the stylesheet
      // takes it back now (a borrowed dip that has ended).
      const handsBack =
        channel === 'opacity' &&
        borrowedOpacity != null &&
        ![...landings].some(landing => landing.fadeIn?.isBorrowed === true);
      if (pseudoElement != null && !handsBack) {
        hold(channel, now());
      } else {
        // The end goes inline in the task that cancels the animation. Whether
        // an identity end may leave the element is judged after the cancel:
        // until then the end-state tail still holds the end, so the computed
        // style would hide a stylesheet value (an opacity 0) under it.
        writeInline(channel, finalValue, false);
      }
      // A call from rest the browser never started (finished from outside
      // before its first frame, a sampler's finish()): read its start from the
      // animation before the cancel takes it, and with nothing left to wait
      // on the call keeps its own clock, so its landing is still armed.
      const waiting = [...pendingGroups].filter(group =>
        group.animations.includes(animation),
      );
      for (const group of waiting) {
        syncGroup(group);
      }
      animation.cancel();
      for (const group of waiting) {
        resolveGroup(group, group.provisional);
      }
      releaseIdentity(channel);
      flushReleases();
    };
    retireTimers.set(channel, setTimeout(retire, Math.max(0, end - now())));
  };

  /** The element's own (stylesheet) opacity, read once when a dip starts. */
  const ownOpacity = (): number => {
    const view = target?.ownerDocument.defaultView;
    const value =
      target == null
        ? NaN
        : Number.parseFloat(
            view
              ?.getComputedStyle(target, pseudoElement ?? null)
              .getPropertyValue('opacity') ?? '',
          );
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
  };

  /**
   * Whether the animator holds an opacity of its own on the element: an inline
   * value it wrote, or a pseudo-element's holding animation (a `set` over a
   * stylesheet that hides or dims it). A dip returns to that value.
   */
  const writesOwnOpacity = (): boolean =>
    pseudoElement == null
      ? (target?.style.getPropertyValue('opacity') ?? '') !== ''
      : running.has('opacity');

  /**
   * Gives the element's opacity back to its stylesheet: an element's inline
   * value goes; a pseudo-element, which has no inline style, loses the
   * animation holding its value.
   */
  const releaseOwnOpacity = () => {
    if (pseudoElement == null) {
      target?.style.removeProperty('opacity');
      return;
    }
    const held = running.get('opacity');
    running.delete('opacity');
    held?.cancel();
  };

  /**
   * Lands every Reduce Motion move still waiting, at once, on the current
   * element: its travel, and the opacity its fade was heading to (the
   * stylesheet's again for a borrowed one). Its calls settle `finished`.
   */
  const landPending = (finished: boolean) => {
    if (landings.size === 0) {
      return;
    }
    const changed = new Set<MotionProperty>();
    let handedBack = false;
    for (const landing of [...landings]) {
      endLanding(landing);
      for (const [property, value] of landing.values) {
        segments.delete(property);
        resting[property] = value;
        changed.add(property);
      }
      if (landing.fadeIn != null || landing.restore != null) {
        const borrowed =
          landing.fadeIn?.isBorrowed === true ||
          landing.restoreIsBorrowed === true;
        segments.delete('opacity');
        resting.opacity = borrowed
          ? IDENTITY.opacity
          : (landing.fadeIn?.to ?? landing.restore ?? IDENTITY.opacity);
        changed.add('opacity');
        if (borrowed) {
          borrowedOpacity = null;
          handedBack = true;
        }
      }
      for (const owner of [landing.owner, ...landing.carried]) {
        carriedOwners.delete(owner);
        if (!owner.settled) {
          settle(owner, finished);
        }
      }
    }
    commit(changed, now());
    if (handedBack) {
      // The stylesheet owns its opacity again: no value stays inline.
      releaseOwnOpacity();
    }
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
    releaseOwnOpacity();
  };

  /**
   * A channel at identity with no animation of its own leaves the element:
   * its inline value is removed, unless the stylesheet would then move the
   * element, in which case the identity stays inline. Runs when such a value
   * is written and again when a motion ends.
   */
  const releaseIdentity = (channel: Channel) => {
    if (target == null || running.has(channel)) {
      return;
    }
    if (channel === 'opacity' && borrowedOpacity != null) {
      if ([...landings].some(landing => landing.fadeIn?.isBorrowed === true)) {
        // At the bottom of the dip, before it lands and fades back in.
        return;
      }
      // A dip on the stylesheet's opacity ended: the stylesheet owns it again.
      borrowedOpacity = null;
      segments.delete('opacity');
      resting.opacity = IDENTITY.opacity;
      releaseOwnOpacity();
      return;
    }
    if (pseudoElement != null) {
      return;
    }
    if (target.style.getPropertyValue(channel) !== IDENTITY_TEXT[channel]) {
      return;
    }
    // Read with every other channel the same commit leaves at identity: one
    // style read for the element, not one per channel (flushReleases).
    releasing.add(channel);
    if (!releaseQueued) {
      releaseQueued = true;
      queueMicrotask(flushReleases);
    }
  };

  /** Channels left at identity whose stylesheet value is still to be read. */
  const releasing = new Set<Channel>();
  let releaseQueued = false;

  /**
   * Removes the identity values written since the last flush, reads the
   * stylesheet once for all of them, and puts back the ones it would move:
   * a single forced style read per element and commit, where a read per
   * channel used to force one each.
   */
  const flushReleases = () => {
    releaseQueued = false;
    const element = target;
    const channels = [...releasing].filter(
      channel =>
        !running.has(channel) &&
        element?.style.getPropertyValue(channel) === IDENTITY_TEXT[channel],
    );
    releasing.clear();
    if (element == null || channels.length === 0) {
      return;
    }
    for (const channel of channels) {
      element.style.removeProperty(channel);
    }
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    for (const channel of channels) {
      const underneath = style?.getPropertyValue(channel);
      if (underneath != null && !isIdentityText(channel, underneath)) {
        element.style.setProperty(channel, IDENTITY_TEXT[channel]);
      }
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
    if (ownWillChange == null) {
      ownWillChange = element.style.willChange;
      // Without an inline value, the stylesheet's reasons stay alongside the
      // promotion's. They were read in the task after the element was
      // attached; a promotion that comes first (an element attached in this
      // task that moves at once) reads them now.
      if (ownWillChange === '' && !sheetWillChangeRead) {
        readSheetWillChange(element);
      }
    }
    const base = ownWillChange !== '' ? ownWillChange : sheetWillChange;
    const own = base === 'auto' ? '' : base;
    const reasons = own
      .split(',')
      .map(reason => reason.trim())
      .filter(reason => reason !== '' && !promoted.has(reason as Channel));
    element.style.willChange = [...reasons, ...promoted].join(', ');
  };

  /** Reads the element's own will-change while no promotion of ours is written. */
  const readSheetWillChange = (element: HTMLElement) => {
    sheetWillChange =
      element.ownerDocument.defaultView
        ?.getComputedStyle(element)
        .getPropertyValue('will-change') ?? '';
    sheetWillChangeRead = true;
  };

  /**
   * Reads sheetWillChange in a task of its own, so a later promotion reads no
   * style in its own task. Skipped while a promotion of ours is written,
   * which the read would see (demote asks again), and for a node out of the
   * document. A pseudo-element's promotion is its own property, with
   * nothing to read.
   */
  const readSheetWillChangeLater = () => {
    cancelSheetWillChangeRead();
    sheetWillChangeRead = false;
    if (target == null || promotionProperty != null) {
      return;
    }
    const element = target;
    sheetReadTimer = setTimeout(() => {
      sheetReadTimer = null;
      // A node out of the document has no style to read, and reading one
      // still costs a style pass: a shared animator (animatorFor) is never
      // detached, so its node can leave with this read waiting. Skipped, the
      // read waits for a promotion that needs it.
      if (target === element && promoted.size === 0 && element.isConnected) {
        readSheetWillChange(element);
      }
    }, 0);
  };

  const cancelSheetWillChangeRead = () => {
    if (sheetReadTimer != null) {
      clearTimeout(sheetReadTimer);
      sheetReadTimer = null;
    }
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
      // Its stylesheet may have changed its will-change since.
      readSheetWillChangeLater();
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
    start?: AnimateOptions['start'],
  ): StartGroup | null => {
    if (target == null || typeof target.animate !== 'function') {
      return null;
    }
    const channels = new Set<Channel>();
    for (const property of properties) {
      channels.add(CHANNEL_OF[property]);
    }
    if (at != null) {
      // An explicit clock is the caller's, except a clock no later than a
      // call from rest on these channels still waiting for the browser's
      // start (an event timestamp, such as a drop's, for the reorder that
      // rebases it): the new call joins that call, and the browser's start
      // moves both. A later clock is a later call, often a frame or more
      // later while the browser has not started the first: it keeps its own
      // clock, since joining would sample its curve from the earlier call's
      // time and hold its first value for the gap.
      for (const channel of channels) {
        for (const property of CHANNELS[channel]) {
          const group = segments.get(property)?.group;
          if (group != null && !group.resolved && at <= group.provisional) {
            return group;
          }
        }
      }
      return null;
    }
    // A call that continues motion starts now unless it asks for the
    // browser's start (`commit`). `presented` asks only for a call from rest:
    // an element still moving is not at rest, so a retarget starts now, from
    // the value and velocity on screen (spec:AST-094 FR6).
    for (const channel of start === 'commit' ? [] : channels) {
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
      fresh: false,
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
    presented = false,
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
    if (presented && group != null && requestFrame != null) {
      // At rest until then: the animations, and the layer they promote, come
      // two frames later. Promoting now, a layer at rest for two frames, left
      // a stale paint of the element's rest in WebKit on iOS 26.2 (a title in
      // a scroller inside a clipped card) after the motion ended.
      // Each call waits its own two frames: one queued after another change
      // flushed the queue, or after an earlier call's first frame, still
      // waits its two.
      const call = {group, changed};
      deferredCalls.push(call);
      requestFrame(() => requestFrame(() => flushDeferredThrough(call)));
      return;
    }
    startCall(group, changed, time);
  };

  /** Calls with `start: 'presented'` waiting for their second frame. */
  const deferredCalls: {group: StartGroup; changed: MotionProperty[]}[] = [];

  /** Creates the animations of the given waiting calls, in call order. */
  const startDeferred = (
    calls: {group: StartGroup; changed: MotionProperty[]}[],
  ) => {
    for (const {group, changed} of calls) {
      // Not a channel that holds the curve of a later call still waiting: a
      // later presented call that took a property over starts that channel
      // with its own two frames. Every other property starts here, whatever
      // its segment's group: a value Reduce Motion writes at once, or lands
      // under a dip, has no curve of this call's.
      const own: MotionProperty[] = [];
      let handedTo: StartGroup | null = null;
      for (const property of changed) {
        const holder = CHANNELS[CHANNEL_OF[property]]
          .map(other => segments.get(other)?.group)
          .find(
            waiting =>
              waiting != null &&
              waiting !== group &&
              deferredCalls.some(call => call.group === waiting),
          );
        if (holder == null) {
          own.push(property);
          continue;
        }
        // A curve of this call's in that channel never ran: the element held
        // it at its start. It starts with the later call, which creates the
        // channel, dated from that call's start, so the model reads what the
        // screen shows.
        const segment = segments.get(property);
        if (segment != null && segment.group === group) {
          segment.start += holder.provisional - group.provisional;
          segment.group = holder;
          holder.segments.push(segment);
          group.segments.splice(group.segments.indexOf(segment), 1);
          handedTo = holder;
        }
      }
      if (own.length === 0 && handedTo != null) {
        // Everything this call still plays starts with the later call.
        const adopter = handedTo;
        group.adoptedBy = adopter;
        void adopter.started.then(start => resolveGroup(group, start));
        continue;
      }
      // From the call's own time: the curve starts at the browser's commit.
      startCall(group, own, group.provisional);
    }
  };

  /** Creates the animations of every waiting call, in call order. */
  const flushDeferred = () => {
    startDeferred(deferredCalls.splice(0));
  };

  /**
   * A call's second frame: it starts, with every call queued before it (in
   * call order), unless another change created it already.
   */
  const flushDeferredThrough = (call: {
    group: StartGroup;
    changed: MotionProperty[];
  }) => {
    const index = deferredCalls.indexOf(call);
    if (index >= 0) {
      startDeferred(deferredCalls.splice(0, index + 1));
    }
  };

  const startCall = (
    group: StartGroup | null,
    changed: MotionProperty[],
    time: number,
  ) => {
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
    group.fresh = true;
    // The task that creates the animations, not the call's: a presented
    // call's is its second frame's callback, wherever in its frame the call
    // was made.
    group.task = markTask(now(), now);
    queueMicrotask(() => {
      group.fresh = false;
    });
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
    requestFrame?.(() => {
      syncGroup(group);
      group.framed = true;
    });
    ready.then(
      () => syncGroup(group),
      () => settleCancelled(group),
    );
  };

  /**
   * A call whose first animation was cancelled before its first frame: if a
   * later call in the same task took over its curves, it starts with that
   * call; otherwise it never started.
   */
  const settleCancelled = (group: StartGroup) => {
    if (group.resolved) {
      return;
    }
    let adopter = group.adoptedBy;
    while (adopter?.adoptedBy != null) {
      adopter = adopter.adoptedBy;
    }
    if (adopter != null && adopter !== group) {
      void adopter.started.then(start => resolveGroup(group, start));
      return;
    }
    // A same-task write replaced the animation the call waited on: the call
    // still starts with the browser's start of the ones that remain.
    if (awaitStart(group)) {
      return;
    }
    resolveGroup(group, group.provisional);
  };

  /**
   * Waits for the browser's start of a call through one of its animations
   * still playing; false when none is left to wait on.
   */
  const awaitStart = (group: StartGroup): boolean => {
    const live = group.animations.find(
      animation => animation.playState !== 'idle',
    );
    const ready = (live as Partial<Animation> | undefined)?.ready;
    if (ready == null || typeof ready.then !== 'function') {
      return false;
    }
    ready.then(
      () => syncGroup(group),
      () => settleCancelled(group),
    );
    return true;
  };

  const syncGroup = (group: StartGroup) => {
    if (group.resolved) {
      return;
    }
    for (const animation of group.animations) {
      if (animation.startTime != null) {
        resolveGroup(
          group,
          startAfterBlock(group, Number(animation.startTime)),
        );
        return;
      }
    }
    // Finished from outside before the browser started it (a sampler's
    // finish() on a held animation): nothing is left to wait on, so the call
    // keeps its own clock, and a later call on an explicit clock does not
    // join it and wait for a start that never comes.
    if (
      group.animations.length > 0 &&
      group.animations.every(
        animation =>
          animation.playState === 'finished' || animation.playState === 'idle',
      ) &&
      group.animations.some(animation => animation.playState === 'finished')
    ) {
      resolveGroup(group, group.provisional);
      return;
    }
    // No start yet (paused before its first frame by a harness or a page,
    // or resumed with play() and still pending): neither `ready` nor the
    // first frame will look again, so keep looking each frame until the call
    // has a start, or its animations finish (its own clock) or are cancelled.
    if (
      group.animations.some(
        animation =>
          animation.startTime == null && animation.playState !== 'idle',
      )
    ) {
      requestFrame?.(() => syncGroup(group));
    }
  };

  /**
   * Reads the start of every call whose first frame may have been committed:
   * not those created in the running task, whose start the browser cannot
   * have set (reading it there can cost a style update per call).
   */
  const syncPending = () => {
    for (const group of pendingGroups) {
      if (!group.fresh) {
        syncGroup(group);
      }
    }
    syncFinished();
  };

  /**
   * An animation finished from outside (a test utility's or devtools'
   * `finish()`) shows its end state while the model still reads its curve:
   * the curve ends now in the model too, so the next call starts from what
   * is on screen.
   */
  const syncFinished = () => {
    for (const [channel, animation] of running) {
      if (animation.playState !== 'finished') {
        continue;
      }
      const time = now();
      for (const property of CHANNELS[channel]) {
        const segment = segments.get(property);
        if (segment == null || time >= segment.start + segment.duration) {
          continue;
        }
        segments.delete(property);
        resting[property] = segment.target;
      }
    }
  };

  /**
   * The start of a call from rest, on the frame that commits it. Chromium,
   * like Core Animation, starts a pending animation when it commits it, so a
   * main-thread block later in the call's task delays the motion; WebKit
   * dates it at its last frame time before that task, so the first frame
   * after the block would show it skipped into its curve. When the task ran
   * on more than LATE_START_MS past its first call, a start the browser put
   * by the task's first animations (a presented call's second frame, not the
   * call) and more than LATE_START_MS before the call's first read (its
   * `ready`, once the task has ended, or the first frame after it) moves to
   * that read, with every animation of the call, and every call of the task
   * moves to the same read. A shorter task, or a read other tasks delay,
   * keeps the browser's start.
   */
  const startAfterBlock = (group: StartGroup, start: number): number => {
    const timeline =
      typeof document === 'undefined'
        ? null
        : (document.timeline?.currentTime as number | null | undefined);
    // A start well after the animations were created is the browser's
    // commit of them.
    if (
      timeline == null ||
      group.framed === true ||
      start > (group.task?.first ?? group.provisional) + LATE_START_MS
    ) {
      return start;
    }
    const {task} = group;
    // A read in the task's first microtasks comes after its end too.
    const ended = task?.ended ?? now();
    if (task == null || ended - task.first <= LATE_START_MS) {
      return start;
    }
    // Read once the task has ended (its `ready`) or in the first frame after
    // it, both after the block; the task's other calls take the same read.
    const at = task.at ?? Math.max(now(), timeline);
    if (at - start <= LATE_START_MS) {
      return start;
    }
    task.at = at;
    for (const animation of group.animations) {
      if (animation.playState !== 'idle') {
        animation.startTime = at;
      }
    }
    return at;
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
          () => settleAtEnd(owner),
          Math.max(0, Math.max(start, ...ends) - now()),
        );
      }
    }
    group.resolve(start);
  };

  // -- handles --------------------------------------------------------------

  const lastSpring = new WeakMap<HandleState, SpringDescription>();

  const interrupt = (property: MotionProperty, time: number) => {
    cancelLanding(property);
    const segment = segments.get(property);
    if (segment == null) {
      return;
    }
    if (
      time < segment.start + segment.duration &&
      !carriedOwners.has(segment.owner)
    ) {
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

  /**
   * A handle whose curves have reached their end on the wall clock finishes,
   * unless a sampler holds one of its animations (paused, or sought back):
   * then it waits on that animation's own time, as retiring does
   * (scheduleRetire), so `finished` never resolves under motion still on
   * screen.
   */
  const settleAtEnd = (owner: HandleState) => {
    owner.timer = null;
    let wait = 0;
    for (const [channel, animation] of running) {
      if (
        !CHANNELS[channel].some(
          property => segments.get(property)?.owner === owner,
        )
      ) {
        continue;
      }
      const remaining = remainingCurve(animation);
      if (remaining != null && remaining > 0) {
        wait = Math.max(
          wait,
          animation.playState === 'paused'
            ? RETIRE_RECHECK_MS
            : Math.max(remaining, END_RECHECK_MS),
        );
      }
    }
    if (wait > 0) {
      owner.timer = setTimeout(() => settleAtEnd(owner), wait);
      return;
    }
    settle(owner, true);
  };

  const makeHandle = (
    owner: HandleState,
    properties: MotionProperty[],
    finished: Promise<boolean>,
    time: number,
    group: StartGroup | null = null,
    settlesWithLanding = false,
  ): MotionHandle => {
    const ends = properties.map(p => {
      const segment = segments.get(p);
      return segment != null && segment.owner === owner
        ? segment.start + segment.duration
        : time;
    });
    const end = Math.max(time, ...ends);
    if (settlesWithLanding) {
      // The landing it joined settles it.
    } else if (properties.length === 0 || end <= time) {
      settle(owner, true);
    } else {
      // Interruptions settle false as they happen (interrupt); reaching the
      // end untouched is completion.
      owner.timer = setTimeout(
        () => settleAtEnd(owner),
        Math.max(0, end - now()),
      );
    }
    // The call's own curves, as it started them.
    const curves = new Map<MotionProperty, Segment>();
    for (const property of properties) {
      const segment = segments.get(property);
      if (segment != null && segment.owner === owner) {
        curves.set(property, segment);
      }
    }
    const handle: MotionHandle = {
      properties,
      finished,
      started: group?.started ?? Promise.resolve(time),
      curve: property => {
        const segment = curves.get(property === 'scale' ? 'scaleX' : property);
        if (segment == null) {
          return null;
        }
        return {
          duration: segment.duration / 1000,
          at: t =>
            t * 1000 >= segment.duration
              ? segment.target
              : segment.at(Math.max(0, t * 1000)),
          velocity: t =>
            t * 1000 >= segment.duration ? 0 : segment.speed(t * 1000),
        };
      },
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
      // The call's own curves, and its travel still waiting to land under
      // Reduce Motion: a catch freezes both where they are on screen
      // (AST-094 FR6), travel first so the fade's landing no longer carries
      // it, as `animator.stop()` does.
      stop: () =>
        animator.stop(
          PROPERTIES.filter(
            p =>
              properties.includes(p) &&
              (segments.get(p)?.owner === owner ||
                [...landings].some(
                  landing =>
                    landing.values.has(p) &&
                    (landing.owners.get(p) ?? landing.owner) === owner,
                )),
          ),
        ),
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
    // The motion role it plays: its table value (DEC-15).
    const resolved = resolveMotion(target, spring);
    const curve = solveSpring(toSpring(resolved), {from, to, velocity});
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
      spring: resolved,
    };
  };

  /** The retarget of `additive`: the old curve plus a spring of the difference. */
  const additiveSegment = (
    owner: HandleState,
    property: MotionProperty,
    start: number,
    to: number,
    spring: SpringDescription,
    old: Segment,
  ): Segment => {
    const oldEnd = old.start + old.duration;
    const resolved = resolveMotion(target, spring);
    const delta = solveSpring(toSpring(resolved), {
      from: 0,
      to: to - old.target,
      velocity: 0,
    });
    const deltaMs = Math.min(
      MAX_DURATION_MS,
      delta.settleTime(SETTLE_THRESHOLD[property]) * 1000,
    );
    const ownAt = (t: number) =>
      t >= deltaMs ? to - old.target : delta.value(t / 1000);
    const oldAt = (time: number) =>
      time >= oldEnd ? old.target : old.at(Math.max(0, time - old.start));
    return {
      start,
      duration: Math.min(MAX_DURATION_MS, Math.max(oldEnd - start, deltaMs)),
      target: to,
      at: t => oldAt(start + t) + ownAt(t),
      speed: t =>
        (start + t >= oldEnd ? 0 : old.speed(start + t - old.start)) +
        (t >= deltaMs ? 0 : delta.velocity(t / 1000)),
      jumps: old.jumps
        .map(jump => old.start + jump - start)
        .filter(jump => jump > 0),
      owner,
      spring: resolved,
    };
  };

  /**
   * `additive` for a played curve: the old curve plus the new curve's shape,
   * scaled to the difference between the two targets.
   */
  const additiveCurveSegment = (
    owner: HandleState,
    start: number,
    curve: MotionCurve,
    old: Segment,
  ): Segment => {
    const from = curve.at(0);
    const to = curve.at(curve.duration);
    const scale = (to - old.target) / (to - from);
    const ms = Math.min(MAX_DURATION_MS, curve.duration * 1000);
    const oldEnd = old.start + old.duration;
    const oldAt = (time: number) =>
      time >= oldEnd ? old.target : old.at(Math.max(0, time - old.start));
    return {
      start,
      duration: Math.min(MAX_DURATION_MS, Math.max(oldEnd - start, ms)),
      target: to,
      at: t =>
        oldAt(start + t) +
        (t >= ms ? to - old.target : (curve.at(t / 1000) - from) * scale),
      speed: t =>
        (start + t >= oldEnd ? 0 : old.speed(start + t - old.start)) +
        (t >= ms ? 0 : curve.velocity(t / 1000) * scale),
      jumps: old.jumps
        .map(jump => old.start + jump - start)
        .filter(jump => jump > 0),
      owner,
    };
  };

  const fadeSegment = (
    owner: HandleState,
    start: number,
    stops: ReadonlyArray<{at: number; value: number}>,
    jumps: ReadonlyArray<number> = [],
  ): Segment => {
    registerReducedMotionCrossFade();
    const ease = cubicBezier(
      resolveMotion(target, reducedMotionCrossFade.curve),
    );
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
    flushReleases();
  };

  /** Reduced Motion landings still waiting for the element to be transparent. */
  const landings = new Set<Landing>();
  /** Calls a later call's landing carries: an interrupt does not settle them. */
  const carriedOwners = new Set<HandleState>();

  /**
   * A later write to `property` takes it from any landing. A write to opacity
   * decides what shows, so a landing still waiting writes its travel at once
   * rather than never, and its calls settle as interrupted.
   */
  const cancelLanding = (property: MotionProperty) => {
    for (const landing of [...landings]) {
      if (property === 'opacity') {
        endLanding(landing);
        landNow(landing);
      } else if (landing.values.delete(property)) {
        // Set or stopped before it landed: the call whose move it was did
        // not finish (a carried value is an earlier call's).
        const moved = landing.owners.get(property) ?? landing.owner;
        landing.owners.delete(property);
        if (!moved.settled) {
          settle(moved, false);
        }
      }
    }
  };

  const landNow = (landing: Landing) => {
    const changed: MotionProperty[] = [];
    for (const [property, value] of landing.values) {
      segments.delete(property);
      resting[property] = value;
      changed.push(property);
    }
    if (changed.length > 0) {
      commit(changed, now());
    }
    for (const owner of [landing.owner, ...landing.carried]) {
      carriedOwners.delete(owner);
      if (!owner.settled) {
        settle(owner, false);
      }
    }
  };

  /**
   * A later Reduced Motion call that lands too carries the landings still
   * waiting: their travel lands with its own, which wins where both move a
   * property, and their calls settle when it lands. So two calls in one
   * frame (a drag cancel's position and scale) both land.
   */
  const adoptLandings = (
    plan: NonNullable<ReducedPlan['landing']>,
    properties: ReadonlyArray<MotionProperty>,
  ): {carried: HandleState[]; owners: Map<MotionProperty, HandleState>} => {
    const carried: HandleState[] = [];
    const owners = new Map<MotionProperty, HandleState>();
    for (const landing of [...landings]) {
      for (const [property, value] of landing.values) {
        const moved = landing.owners.get(property) ?? landing.owner;
        if (!properties.includes(property) && !plan.values.has(property)) {
          plan.values.set(property, value);
          owners.set(property, moved);
        } else if (!moved.settled) {
          // This call takes the property over: the earlier move never lands.
          settle(moved, false);
        }
      }
      carried.push(landing.owner, ...landing.carried);
      endLanding(landing);
    }
    for (const owner of carried) {
      carriedOwners.add(owner);
    }
    return {carried, owners};
  };

  /**
   * A call joins the newest waiting dip: it takes the landing over and
   * settles when the dip ends, and the call it replaces lands with it. Each
   * value keeps the call whose move it is.
   */
  const joinWaitingDip = (owner: HandleState) => {
    const dip = [...landings].reverse().find(landing => landing.fadeIn != null);
    if (dip == null) {
      settle(owner, true);
      return;
    }
    for (const property of dip.values.keys()) {
      if (!dip.owners.has(property)) {
        dip.owners.set(property, dip.owner);
      }
    }
    dip.carried.push(dip.owner);
    carriedOwners.add(dip.owner);
    dip.owner = owner;
  };

  /** Where opacity is heading: past a waiting landing's fade back in. */
  const opacityHeading = (): number => {
    let to = finalValue('opacity');
    for (const landing of landings) {
      if (landing.fadeIn != null) {
        to = landing.fadeIn.to;
      } else if (landing.restore != null) {
        to = landing.restore;
      }
    }
    return to;
  };

  const endLanding = (landing: Landing) => {
    if (landing.timer != null) {
      clearTimeout(landing.timer);
    }
    landings.delete(landing);
  };

  /** Arms a landing from the call's start (the browser's, for a call from rest). */
  const scheduleLanding = (
    owner: HandleState,
    started: Promise<number>,
    plan: NonNullable<ReducedPlan['landing']>,
    adopted: ReturnType<typeof adoptLandings> | null,
  ) => {
    const owners = new Map<MotionProperty, HandleState>();
    for (const property of plan.values.keys()) {
      owners.set(property, adopted?.owners.get(property) ?? owner);
    }
    const landing: Landing = {
      ...plan,
      owner,
      carried: adopted?.carried ?? [],
      owners,
      timer: null,
      due: null,
    };
    landings.add(landing);
    // The handle settles when the landing (and its fade back in) is done.
    if (owner.timer != null) {
      clearTimeout(owner.timer);
      owner.timer = null;
    }
    void started.then(start => {
      if (!landings.has(landing)) {
        return;
      }
      landing.due = start + landing.at;
      landing.timer = setTimeout(
        () => land(landing),
        Math.max(0, landing.due - now()),
      );
    });
  };

  /**
   * Writes the travel while the element is transparent: a plain style write,
   * never an animation (DR2: opacity only), so it is never shown in the wrong
   * place. In a dip the fade back in starts from here and takes what is left
   * of the cross-fade, so the dip ends when it was due even when a busy main
   * thread runs this timer late; past the whole fade back in (100 ms late or
   * more) the element appears at once where it landed, with no animation,
   * and the call settles then.
   */
  const land = (landing: Landing) => {
    landings.delete(landing);
    landing.timer = null;
    const time = now();
    const changed: MotionProperty[] = [];
    for (const [property, value] of landing.values) {
      segments.delete(property);
      resting[property] = value;
      changed.push(property);
    }
    let end = time;
    // The fade back in takes what is left of the cross-fade: a timer that a
    // busy main thread runs late shortens it, so the dip still ends when it
    // was due (design:reduced-motion DR2, 200 ms or less), and the element is
    // never shown before it lands. Past the whole fade back in nothing is
    // left: the element appears at once, a plain write with no fade for the
    // browser to start a frame later, so the call settles showing it.
    const late = landing.due == null ? 0 : Math.max(0, time - landing.due);
    const appears = landing.fadeIn != null && late >= landing.fadeIn.ms;
    if (landing.fadeIn != null && !appears) {
      const ms = landing.fadeIn.ms - late;
      segments.set(
        'opacity',
        fadeSegment(landing.owner, time, [
          {at: 0, value: valueAt('opacity', time)},
          {at: ms, value: landing.fadeIn.to},
        ]),
      );
      changed.push('opacity');
      end = time + ms;
    } else if (landing.fadeIn != null) {
      segments.delete('opacity');
      resting.opacity =
        landing.fadeIn.isBorrowed === true
          ? IDENTITY.opacity
          : landing.fadeIn.to;
      changed.push('opacity');
    } else if (landing.restore != null) {
      segments.delete('opacity');
      resting.opacity =
        landing.restoreIsBorrowed === true ? IDENTITY.opacity : landing.restore;
      changed.push('opacity');
    }
    commit(changed, time);
    if (
      landing.restoreIsBorrowed === true ||
      (appears && landing.fadeIn?.isBorrowed === true)
    ) {
      // The stylesheet owns its opacity again.
      releaseOwnOpacity();
    } else if (landing.fadeIn?.isBorrowed === true) {
      // The fade back in returns to the stylesheet's opacity: it owns it
      // again once the fade ends (releaseIdentity).
      borrowedOpacity = landing.fadeIn.to;
    }
    // The calls it carries are done: their travel has landed.
    for (const carried of landing.carried) {
      carriedOwners.delete(carried);
      if (!carried.settled) {
        settle(carried, true);
      }
    }
    const {owner} = landing;
    if (owner.settled) {
      return;
    }
    if (end <= time) {
      settle(owner, true);
    } else {
      owner.timer = setTimeout(
        () => settleAtEnd(owner),
        Math.max(0, end - now()),
      );
    }
  };

  /**
   * A call that sets a value still waiting to land takes it over: the earlier
   * move never lands, and its call settles interrupted. Once nothing waiting
   * is left, a call that names its own opacity replaces an earlier fade back
   * in or restore too, so a caught dismissal fades straight back up instead
   * of dipping. Whatever still waits is carried by the new plan.
   */
  const takeOverLandings = (
    properties: ReadonlyArray<MotionProperty>,
    namesOpacity: boolean,
  ) => {
    for (const property of properties) {
      if (property !== 'opacity') {
        cancelLanding(property);
      }
    }
    if (!namesOpacity) {
      // A dip left with nothing to land (a move taken back) fades straight
      // back in from where it is, rather than finishing its dip.
      for (const landing of [...landings]) {
        if (landing.values.size === 0 && landing.fadeIn != null) {
          endLanding(landing);
          land(landing);
        }
      }
      return;
    }
    for (const landing of [...landings]) {
      // A waiting call that named its own opacity loses it to this call: it
      // never reaches that opacity, so it settles interrupted even though its
      // travel still lands.
      for (const owner of [landing.owner, ...landing.carried]) {
        if (namedOpacity.has(owner) && !owner.settled) {
          settle(owner, false);
        }
      }
      if (landing.values.size > 0) {
        continue;
      }
      endLanding(landing);
      if (
        landing.fadeIn?.isBorrowed === true ||
        landing.restoreIsBorrowed === true
      ) {
        // The call's own opacity owns it now, not the stylesheet's.
        borrowedOpacity = null;
      }
      for (const owner of [landing.owner, ...landing.carried]) {
        carriedOwners.delete(owner);
        if (!owner.settled) {
          settle(owner, false);
        }
      }
    }
  };

  /** Reduce Motion calls that named their own opacity. */
  const namedOpacity = new WeakSet<HandleState>();

  /**
   * Where opacity was heading before a call took the waiting landings over:
   * an entrance by role that catches an exit fades back to what the exit
   * would have restored.
   */
  let headingBeforeTakeOver: number | null = null;

  /** What the Reduce Motion planner reads of this animator. */
  const planView: ReducedMotionView = {
    valueAt,
    opacityHeading: () => headingBeforeTakeOver ?? opacityHeading(),
    ownOpacity: () => ownOpacity(),
    writesOwnOpacity: () => writesOwnOpacity(),
    get borrowedOpacity() {
      return borrowedOpacity;
    },
    get hasOpacityCurve() {
      return segments.has('opacity');
    },
    get restingOpacity() {
      return resting.opacity;
    },
    get hasPendingLanding() {
      return landings.size > 0;
    },
    get hasWaitingDip() {
      return [...landings].some(landing => landing.fadeIn != null);
    },
  };

  /**
   * Reduced Motion (see the file header): the planner's plan
   * (reducedMotionPlan.ts) as this call's segments.
   */
  const reducedMotion = (
    owner: HandleState,
    time: number,
    targets: Partial<Record<MotionProperty, number>>,
    properties: MotionProperty[],
    fade: boolean,
    role?: 'entrance' | 'exit',
  ): ReducedPlan => {
    const heading = opacityHeading();
    // An entrance or an exit by role drives the opacity as a named one does.
    takeOverLandings(properties, targets.opacity != null || role != null);
    if (targets.opacity != null) {
      namedOpacity.add(owner);
    }
    headingBeforeTakeOver = heading;
    let plan: ReturnType<typeof planReducedMotion>;
    try {
      plan = planReducedMotion(planView, time, targets, properties, fade, role);
    } finally {
      headingBeforeTakeOver = null;
    }
    const next: Partial<Record<MotionProperty, Segment | null>> = {};
    for (const property of plan.atOnce) {
      next[property] = null;
    }
    if (plan.opacityFade != null) {
      next.opacity = fadeSegment(owner, time, plan.opacityFade);
    }
    return {
      next,
      holds: plan.holds,
      landing: plan.landing,
      borrowed: plan.borrowed,
      joins: plan.joins,
    };
  };

  const animator: Animator = {
    get element() {
      return target;
    },

    reducedMotion(reducedOptions = {}) {
      if (!prefersReducedMotion()) {
        return 'off';
      }
      return isCoarsePointer() || reducedOptions.touchRelease === true
        ? 'crossfade'
        : 'instant';
    },

    attach(next) {
      if (next === target) {
        return;
      }
      flushDeferred();
      if (next == null) {
        // Unmount, unless a node replaces this one in the same task (React's
        // replacement order: attach(null), then the new node): nothing is
        // left to animate, so at the end of the task every other handle
        // settles as interrupted, every atRest() wait settles and no
        // completion timer outlives the element, as in dispose()
        // (architecture:react-component-runtime INV5). A replacement keeps
        // them all: the motion goes on on the new node.
        lastDetached = target;
        if (!unmountQueued) {
          unmountQueued = true;
          queueMicrotask(() => {
            if (!unmountQueued) {
              return;
            }
            unmountQueued = false;
            // A Reduce Motion move still waiting lands where it was going, as
            // in dispose(), on the node just detached too: a dip's fade out
            // left its low opacity inline there, so a later attach of that
            // node (a Suspense or Activity reveal) shows it landed and
            // visible. Its calls settle as interrupted.
            onLastDetached(() => {
              landPending(false);
              // The landing's commit rebuilt every channel it touched on the
              // detached node, any axis still moving included: leave that
              // node with no animation, timer or promotion.
              for (const animation of running.values()) {
                animation.cancel();
              }
              running.clear();
              for (const timer of retireTimers.values()) {
                clearTimeout(timer);
              }
              retireTimers.clear();
              demote();
              // demote() asks for a fresh will-change read of the node it
              // demotes; a detached node gets none.
              cancelSheetWillChangeRead();
            });
            lastDetached = null;
            const time = now();
            for (const property of PROPERTIES) {
              interrupt(property, time);
            }
            for (const wait of [...restWaits]) {
              wait.settle();
            }
          });
        }
      } else {
        // A node in place of the one just detached: no unmount.
        unmountQueued = false;
        lastDetached = null;
      }
      // After the landing's commit, which can promote the element again.
      demote();
      // A pseudo-element holds an identity with a static animation, which the
      // cancel below drops: note the channels to hold again on the next node
      // (never a borrowed opacity, which is the stylesheet's).
      const isOpacityBorrowed =
        borrowedOpacity != null ||
        [...landings].some(landing => landing.restoreIsBorrowed === true);
      const pseudoHeld =
        pseudoElement == null || target == null
          ? null
          : new Set(
              (Object.keys(CHANNELS) as Channel[]).filter(
                channel =>
                  running.has(channel) &&
                  !(channel === 'opacity' && isOpacityBorrowed) &&
                  CHANNELS[channel].every(
                    p => !segments.has(p) && resting[p] === IDENTITY[p],
                  ),
              ),
            );
      for (const animation of running.values()) {
        animation.cancel();
      }
      running.clear();
      for (const timer of retireTimers.values()) {
        clearTimeout(timer);
      }
      retireTimers.clear();
      if (isOpacityBorrowed) {
        // A running borrowed dip (or an exit by role returning to the
        // stylesheet) stays in the model through any attach, so a pending
        // move still lands while the element is invisible; only the
        // outgoing element gets its stylesheet's opacity back.
        releaseOwnOpacity();
      }
      // Identities the outgoing node holds inline over a stylesheet that
      // differs, kept through a detach for the node that comes next.
      if (target != null) {
        const outgoing = target;
        heldIdentity =
          pseudoHeld ??
          new Set(
            (Object.keys(CHANNELS) as Channel[]).filter(
              channel =>
                outgoing.style.getPropertyValue(channel) ===
                IDENTITY_TEXT[channel],
            ),
          );
      }
      const held = heldIdentity;
      target = next;
      // A new node: its own will-change is read again.
      cancelSheetWillChangeRead();
      sheetWillChangeRead = false;
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
          // where the new node's stylesheet still differs); a pseudo-element's
          // is held again.
          if (pseudoElement != null) {
            hold(channel, time);
          } else {
            writeInline(channel, property => resting[property]);
          }
        }
      }
      flushReleases();
      readSheetWillChangeLater();
    },

    get(property, time = now()) {
      syncPending();
      return valueAt(property === 'scale' ? 'scaleX' : property, time);
    },

    getVelocity(property, time = now()) {
      syncPending();
      return velocityAt(property === 'scale' ? 'scaleX' : property, time);
    },

    set(values, setOptions = {}) {
      syncPending();
      flushDeferred();
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
      if (setOptions.promote !== false) {
        for (const property of Object.keys(next) as MotionProperty[]) {
          promote(CHANNEL_OF[property]);
        }
      }
      commit(Object.keys(next) as MotionProperty[], time);
    },

    animate(to, transition, animateOptions = {}) {
      syncPending();
      if (animateOptions.start !== 'presented') {
        flushDeferred();
      }
      const time = animateOptions.at ?? now();
      const targets = expand(to);
      const velocities = expand(transition.velocity ?? {});
      const {owner, finished} = newOwner();
      lastSpring.set(owner, transition.spring);
      const properties = Object.keys(targets) as MotionProperty[];
      const next: Partial<Record<MotionProperty, Segment | null>> = {};
      let plan: ReducedPlan | null = null;

      if (prefersReducedMotion()) {
        plan = reducedMotion(
          owner,
          time,
          targets,
          properties,
          isCoarsePointer() || animateOptions.touchRelease === true,
          animateOptions.crossfadeAs,
        );
        Object.assign(next, plan.next);
      } else {
        for (const property of properties) {
          const running =
            animateOptions.additive === true && velocities[property] == null
              ? segmentAt(property, time)
              : null;
          if (running != null && !isHeld(running)) {
            next[property] = additiveSegment(
              owner,
              property,
              time,
              targets[property] as number,
              transition.spring,
              running,
            );
            continue;
          }
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
        animateOptions.start,
      );
      const adopted =
        plan?.landing != null
          ? adoptLandings(plan.landing, Object.keys(next) as MotionProperty[])
          : null;
      const changed: MotionProperty[] = [];
      for (const [property, segment] of Object.entries(next) as [
        MotionProperty,
        Segment | null,
      ][]) {
        interrupt(property, time);
        changed.push(property);
        if (segment == null) {
          // Read before the segment goes: valueAt falls back to resting.
          const value =
            plan?.holds[property] ??
            targets[property] ??
            valueAt(property, time);
          segments.delete(property);
          resting[property] = value;
        } else {
          segments.set(property, segment);
        }
      }
      commitCall(
        group,
        owner,
        changed,
        time,
        animateOptions.start === 'presented' && animateOptions.at == null,
      );
      if (plan?.borrowed != null) {
        // The dip's own commit cleared it; the borrow lasts the dip.
        borrowedOpacity = plan.borrowed;
      }
      if (plan?.joins === true) {
        joinWaitingDip(owner);
      }
      const handle =
        plan?.joins === true
          ? makeHandle(owner, ['opacity'], finished, time, group, true)
          : makeHandle(owner, changed, finished, time, group);
      if (plan?.landing != null) {
        scheduleLanding(owner, handle.started, plan.landing, adopted);
      }
      return handle;
    },

    play(curves, playOptions = {}) {
      syncPending();
      if (playOptions.start !== 'presented') {
        flushDeferred();
      }
      const time = playOptions.at ?? now();
      const {owner, finished} = newOwner();
      const byProperty: Partial<Record<MotionProperty, MotionCurve>> = {};
      // `scale` first, so an explicit `scaleX` or `scaleY` beside it wins.
      const entries = (
        Object.entries(curves) as [
          MotionProperty | 'scale',
          MotionCurve | undefined,
        ][]
      ).sort(([a], [b]) => Number(b === 'scale') - Number(a === 'scale'));
      for (const [key, curve] of entries) {
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
      const plan = prefersReducedMotion()
        ? reducedMotion(
            owner,
            time,
            targets,
            properties,
            isCoarsePointer() || playOptions.touchRelease === true,
            playOptions.crossfadeAs,
          )
        : null;
      const next: Partial<Record<MotionProperty, Segment | null>> = {
        ...plan?.next,
      };
      for (const property of properties) {
        if (property in next) {
          continue;
        }
        const curve = byProperty[property] as MotionCurve;
        const running =
          playOptions.additive === true ? segmentAt(property, time) : null;
        if (
          running != null &&
          !isHeld(running) &&
          curve.duration > 0 &&
          Math.abs(curve.at(curve.duration) - curve.at(0)) > 1e-9
        ) {
          next[property] = additiveCurveSegment(owner, time, curve, running);
          continue;
        }
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
        playOptions.start,
      );
      const adopted =
        plan?.landing != null
          ? adoptLandings(plan.landing, Object.keys(next) as MotionProperty[])
          : null;
      const changed: MotionProperty[] = [];
      for (const [property, segment] of Object.entries(next) as [
        MotionProperty,
        Segment | null,
      ][]) {
        interrupt(property, time);
        changed.push(property);
        if (segment == null) {
          // Read before the segment goes: valueAt falls back to resting.
          const value =
            plan?.holds[property] ??
            targets[property] ??
            valueAt(property, time);
          segments.delete(property);
          resting[property] = value;
        } else {
          segments.set(property, segment);
        }
      }
      commitCall(
        group,
        owner,
        changed,
        time,
        playOptions.start === 'presented' && playOptions.at == null,
      );
      if (plan?.borrowed != null) {
        // The dip's own commit cleared it; the borrow lasts the dip.
        borrowedOpacity = plan.borrowed;
      }
      if (plan?.joins === true) {
        joinWaitingDip(owner);
      }
      const handle =
        plan?.joins === true
          ? makeHandle(owner, ['opacity'], finished, time, group, true)
          : makeHandle(owner, changed, finished, time, group);
      if (plan?.landing != null) {
        scheduleLanding(owner, handle.started, plan.landing, adopted);
      }
      return handle;
    },

    decay(curves, decayOptions = {}) {
      syncPending();
      flushDeferred();
      const time = decayOptions.at ?? now();
      // Under Reduce Motion only momentum keeps moving (DR2, DEC-2): a curve
      // that is a transition plays as `animate` does, a cross-fade or at once.
      const reduce = prefersReducedMotion();
      const transitions: MotionValues = {};
      for (const property of DECAY_PROPERTIES) {
        const curve = curves[property];
        if (reduce && curve?.isTransition === true) {
          transitions[property] = curve.at(curve.duration);
        }
      }
      const transitioned =
        Object.keys(transitions).length > 0
          ? animator.animate(transitions, REDUCED_TRANSITION, {
              at: time,
              touchRelease: decayOptions.touchRelease,
            })
          : null;
      const {owner, finished} = newOwner();
      // Momentum moves the translate axes only (DR2's throw exception).
      const properties = DECAY_PROPERTIES.filter(
        property =>
          curves[property] != null && transitions[property] === undefined,
      );
      if (transitioned != null && properties.length === 0) {
        return transitioned;
      }
      const group = beginGroup(time, properties, decayOptions.at);
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
      commitCall(group, owner, properties, time);
      const handle = makeHandle(owner, properties, finished, time, group);
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
        started: Promise.all([handle.started, faded.started]).then(
          ([coasting]) => coasting,
        ),
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
      syncPending();
      flushDeferred();
      const time = now();
      const list = properties == null ? PROPERTIES : expandList(properties);
      const changed: MotionProperty[] = [];
      // A borrowed dip, or an exit by role that returns to the stylesheet.
      const wasBorrowed =
        borrowedOpacity != null ||
        [...landings].some(landing => landing.restoreIsBorrowed === true);
      // Read before the landings go: a dip's fade back in, an exit's restore.
      const heading = opacityHeading();
      for (const property of list) {
        cancelLanding(property);
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
            : heading;
        interrupt(property, time);
        segments.delete(property);
        resting[property] = value;
        changed.push(property);
      }
      commit(changed, time);
      if (wasBorrowed && changed.includes('opacity')) {
        releaseOwnOpacity();
      }
    },

    rebase(deltas, rebaseOptions = {}) {
      syncPending();
      flushDeferred();
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
        // A curve still waiting for the browser's start stays in its call:
        // it starts with that call's commit.
        const group =
          segment.group != null && !segment.group.resolved
            ? segment.group
            : undefined;
        const replace = (next: Segment) => {
          if (group != null) {
            const index = group.segments.indexOf(segment);
            if (index >= 0) {
              group.segments[index] = next;
            } else {
              group.segments.push(next);
            }
          }
          segments.set(property, next);
        };
        if (segment.spring != null) {
          const from = valueAt(property, time) + delta;
          const velocity = velocityAt(property, time);
          const curve = solveSpring(toSpring(segment.spring), {
            from,
            to: segment.target,
            velocity,
          });
          replace({
            start: group?.provisional ?? time,
            ...(group != null ? {group} : {}),
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
          replace({
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
          () => settleAtEnd(owner),
          Math.max(0, end - now()),
        );
      }
    },

    async atRest(properties) {
      const list = properties == null ? PROPERTIES : expandList(properties);
      return new Promise<void>(resolve => {
        const wait: RestWait = {timer: null, settle: () => {}};
        const done = () => {
          if (wait.timer != null) {
            clearTimeout(wait.timer);
          }
          restWaits.delete(wait);
          resolve();
        };
        wait.settle = done;
        restWaits.add(wait);
        const check = () => {
          wait.timer = null;
          syncPending();
          const time = now();
          let end = time;
          for (const property of list) {
            const segment = segments.get(property);
            if (segment != null) {
              end = Math.max(end, segment.start + segment.duration);
            }
          }
          if (landings.size > 0) {
            // A Reduced Motion landing is still to come.
            wait.timer = setTimeout(check, 16);
          } else if (end <= time) {
            done();
          } else {
            // A retarget or a later start moves the end: look again then.
            wait.timer = setTimeout(check, end - time);
          }
        };
        check();
      });
    },

    dispose() {
      flushDeferred();
      // A Reduce Motion move still waiting to land is written at its end
      // state, so the element is left visible where it was going (the node
      // just detached, when an unmount is pending); its call and the calls
      // it carries settle as interrupted.
      if (target == null && unmountQueued) {
        target = lastDetached;
      }
      lastDetached = null;
      unmountQueued = false;
      landPending(false);
      // Nothing moves any more: every atRest() wait settles.
      for (const wait of [...restWaits]) {
        wait.settle();
      }
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
      demote();
      cancelSheetWillChangeRead();
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
