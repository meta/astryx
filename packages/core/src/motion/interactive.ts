// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file interactive.ts
 * @input An animator channel to drive (a sheet's `y`, a row's `x`), the
 *   layers that follow it, and the gesture's rules: a track rule (finger →
 *   position and drag state) and a release rule (where a release lands and
 *   on what motion)
 * @output Exports createInteractiveTransition (grab, track, release, to,
 *   presented) and the rule and layer types
 * @position Touch core of the motion foundation, on the animator (animator.ts)
 *   and the progress helpers (progress.ts). A component's gesture code
 *   imports it statically (BottomSheet's useSheetGestures), so it loads with
 *   the component: touch code takes no lazy chunk
 *
 * One driver for every transition a finger scrubs and a release settles: a
 * sheet between detents, a list row's swipe actions, a toast swiped away, an
 * interactive pop, a photo dragged to close. Internal to core: components'
 * gesture code uses it, and it is not exported from the package.
 *
 * - The release is decided once, at the release (spec:AST-094 FR36), by the
 *   component's own rule: a sheet settles on the position nearest where the
 *   release projects, and one moving back toward where its drag began
 *   cancels (spec:AST-094 FR37); a row keeps spec:AST-057's rule. The settle continues the finger's velocity.
 *   The velocity is spec:AST-100's tracker's (a pan's `velocity()`): the
 *   caller passes it in, and the driver never estimates one.
 *
 * - The driver is one animator channel, in its own units. Velocities are in
 *   those units per second. A rule converts at its own boundary (a pop's
 *   progress is `position / width`).
 * - Rules are data: pure functions, tested against their UIKit measurements.
 *   The track rule turns the finger's travel into where the driver goes and
 *   the drag's own state (a confirmed full swipe); the release rule turns
 *   where the gesture let go, and that state, into a target and a motion.
 * - Layers follow the driver: a map layer is a pure map of the driver's
 *   value (a scrim's opacity of the sheet's `y`); a state layer follows the
 *   drag's state on its own spring (a full swipe's confirm look).
 * - A release, or a programmatic move (`to`), plays one progress curve: the
 *   driver along `from + (to − from) · p`, each map layer along its map of
 *   that, all on one explicit `at`, so they stay in lockstep by construction.
 * - A grab takes over from what is on screen: the presented values of the
 *   driver and of every layer, read at one `now` and written with `set`.
 *   Opacity is left alone unless a layer's own channel is opacity, so a grab
 *   during a reduced-motion cross-fade does not freeze a half-faded surface.
 * - Reduced motion is the animator's: a release passes `touchRelease`, and an
 *   outcome that removes the surface fades it out in place (`crossfadeAs:
 *   'exit'`, on the driver only). A state change while the finger is down is
 *   a dip on a coarse pointer and at once on a fine one (`touchRelease:
 *   false`). Tracking with `set` stays 1:1 (design:reduced-motion).
 *
 * SYNC: When modified, update interactive.test.ts.
 */

import {
  SETTLE_THRESHOLD,
  type AnimateOptions,
  type Animator,
  type MotionCurve,
  type MotionHandle,
  type MotionProperty,
} from './animator';
import {mapProgress, progressCurve} from './progress';
import {resolveMotion} from './resolveMotion';
import type {SpringDescription} from './spring';

/**
 * A timed motion: a duration and an easing of progress, for the theme's
 * timing under a mouse (no spring).
 */
export interface TimingMotion {
  readonly durationMs: number;
  readonly easing: (progress: number) => number;
}

/**
 * What a release or a programmatic move plays: a spring (a role of the
 * UIKit table or an inline spring) or a timed motion.
 */
export type TransitionMotion = SpringDescription | TimingMotion;

/**
 * Where a gesture let go, in driver units: the driver's presented position,
 * the finger's raw travel and its velocity per second.
 */
export interface ReleaseInput {
  readonly position: number;
  readonly finger: number;
  readonly velocity: number;
}

/**
 * Where a release lands and how it gets there.
 */
export interface ReleaseOutcome<Outcome extends string = string> {
  /** The driver's target, in driver units. */
  readonly target: number;
  /** The motion it lands on. */
  readonly motion: TransitionMotion;
  /** What the landing means to the component ('detent:1', 'dismiss', 'open'…). */
  readonly outcome: Outcome;
  /** The hand-off velocity, when the rule caps it; else the input's. */
  readonly velocity?: number;
  /** The landing removes the surface: under reduced motion it fades out in place. */
  readonly exits?: boolean;
}

/**
 * A release rule: pure and total. `context.track` is the drag's state at
 * the lift.
 */
export type ReleaseRule<
  Outcome extends string = string,
  Context = object,
  State = undefined,
> = (
  input: ReleaseInput,
  context: Context & {readonly track: State},
) => ReleaseOutcome<Outcome>;

/**
 * A track rule: the finger's raw travel and the drag's state give where the
 * driver goes and the next state. Without `follow` the driver is written
 * 1:1; with it, the driver springs toward `position` (a row running ahead of
 * a confirmed full swipe).
 */
export type TrackRule<State> = (
  finger: number,
  state: State,
) => {
  readonly position: number;
  readonly state: State;
  readonly follow?: SpringDescription;
};

/**
 * A layer that follows the driver's value through a pure map.
 */
export interface MapLayer {
  readonly animator: Animator;
  readonly property: MotionProperty;
  map(driver: number): number;
}

/**
 * A layer that follows the drag's state: when `value(state)` changes it
 * springs there from its presented value. Never on a map layer's channel.
 */
export interface StateLayer<State> {
  readonly animator: Animator;
  readonly property: MotionProperty;
  value(state: State): number;
  readonly spring: SpringDescription;
}

export type CompanionLayer<State> = MapLayer | StateLayer<State>;

/**
 * Options of a programmatic move (`to`).
 */
export interface MoveOptions {
  /** The starting velocity, driver units per second (default 0). */
  readonly velocity?: number;
  /** Which way a reduced-motion cross-fade goes (a present, a dismiss). */
  readonly crossfadeAs?: AnimateOptions['crossfadeAs'];
  /** The move starts from the release of a touch drag. */
  readonly touchRelease?: boolean;
  /** The clock of the move (default now). */
  readonly now?: number;
  /**
   * Start on the browser's commit instead of `now`: the driver and every
   * layer play from rest with no start time, so the browser starts them all
   * on the frame it commits them, as Core Animation starts a presentation at
   * its transaction's commit, and a long task after the call delays the move
   * instead of skipping into it. Only for a move from rest on every animator
   * (a present, a dismiss): a driver already moving starts on its own clock.
   */
  readonly startAtCommit?: boolean;
}

/**
 * A running release or move: the driver's handle (null when it settled at
 * once) and a promise for the driver and every layer.
 */
export interface TransitionRun {
  readonly handle: MotionHandle | null;
  readonly finished: Promise<boolean>;
}

export interface InteractiveTransition<Outcome extends string, Context, State> {
  /** The drag's state (the track rule's). */
  readonly state: State;
  /**
   * A finger takes it: the driver and every layer stay where they are drawn
   * (their presented values at `now`, written with `set`), and the drag
   * state starts over. Returns the driver's presented position.
   */
  grab(now?: number): number;
  /**
   * A move. With a track rule, `input` is the finger's raw travel; without
   * one it is the driver's position, written 1:1. Map layers follow the
   * driver; a state layer springs when its value changes.
   */
  track(input: number): void;
  /** The finger lets go: run the release rule and play its outcome. */
  release(
    input: Omit<ReleaseInput, 'position'>,
    context: Context,
    now?: number,
  ): TransitionRun & {
    readonly outcome: Outcome;
    readonly target: number;
    readonly exits: boolean;
  };
  /** A programmatic move (present, dismiss, a keyboard command). */
  to(
    target: number,
    motion: TransitionMotion,
    options?: MoveOptions,
  ): TransitionRun;
  /** The driver's presentation value and velocity at `now`. */
  presented(now?: number): {position: number; velocity: number};
  /** Stops the run and any follow, leaving everything where it is drawn. */
  stop(): void;
}

/** Where a move is close enough to its target to land at once (driver units). */
const LAND_EPSILON = 1e-3;

/** A follow switches to 1:1 writes once the driver is this close (px). */
const FOLLOW_CATCH_UP = 0.5;

function isTiming(motion: TransitionMotion): motion is TimingMotion {
  return (
    typeof (motion as TimingMotion).durationMs === 'number' &&
    typeof (motion as TimingMotion).easing === 'function'
  );
}

/** The 0 → 1 progress of a timed motion, velocity by central difference. */
function timingProgress({durationMs, easing}: TimingMotion): MotionCurve {
  const duration = Math.max(0, durationMs) / 1000;
  const at = (t: number) =>
    duration <= 0 || t >= duration ? 1 : easing(Math.max(0, t) / duration);
  return {
    duration,
    at,
    velocity: t => {
      if (duration <= 0 || t >= duration) {
        return 0;
      }
      const h = Math.min(0.0005, duration / 4);
      const a = Math.max(0, t - h);
      const b = Math.min(duration, t + h);
      return b > a ? (at(b) - at(a)) / (b - a) : 0;
    },
  };
}

function isStateLayer<State>(
  layer: CompanionLayer<State>,
): layer is StateLayer<State> {
  return typeof (layer as StateLayer<State>).value === 'function';
}

const now = () => performance.now();

/**
 * One interactive transition: the driver channel, the layers that follow it
 * and the gesture's rules. See the file header.
 */
export function createInteractiveTransition<
  Outcome extends string,
  Context = object,
  State = undefined,
>(config: {
  driver: {animator: Animator; property: MotionProperty};
  layers?: ReadonlyArray<CompanionLayer<State>>;
  track?: {rule: TrackRule<State>; initial: State};
  rule: ReleaseRule<Outcome, Context, State>;
}): InteractiveTransition<Outcome, Context, State> {
  const {driver, rule} = config;
  const layers = config.layers ?? [];
  const mapLayers = layers.filter(
    (layer): layer is MapLayer => !isStateLayer(layer),
  );
  const stateLayers = layers.filter(isStateLayer);
  let state = config.track?.initial as State;
  // A follow in progress: its pending target (coalesced to one retarget a
  // frame) and the frame that applies it.
  let following: {target: number; spring: SpringDescription} | null = null;
  let catchingUp = false;
  let frame: number | null = null;

  const write = (position: number) => {
    driver.animator.set({[driver.property]: position});
    for (const layer of mapLayers) {
      layer.animator.set({[layer.property]: layer.map(position)});
    }
  };
  const cancelFrame = () => {
    if (frame != null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  };
  // Once a frame while the driver follows: retarget its spring once, and
  // write the map layers from where the driver is drawn.
  const onFrame = () => {
    frame = null;
    const position = driver.animator.get(driver.property);
    for (const layer of mapLayers) {
      layer.animator.set({[layer.property]: layer.map(position)});
    }
    if (following != null) {
      const target = following.target;
      if (catchingUp && Math.abs(position - target) <= FOLLOW_CATCH_UP) {
        // Caught up after a back-out: 1:1 from here.
        following = null;
        catchingUp = false;
        write(target);
        return;
      }
      driver.animator.animate(
        {[driver.property]: target},
        {spring: following.spring},
        {touchRelease: false},
      );
      frame = requestAnimationFrame(onFrame);
    }
  };
  const updateStateLayers = (previous: State, next: State) => {
    for (const layer of stateLayers) {
      const value = layer.value(next);
      if (value !== layer.value(previous)) {
        layer.animator.animate(
          {[layer.property]: value},
          {spring: layer.spring},
          {touchRelease: false},
        );
      }
    }
  };

  const play = (
    target: number,
    motion: TransitionMotion,
    {
      velocity = 0,
      crossfadeAs,
      touchRelease = false,
      now: at = now(),
      startAtCommit = false,
    }: MoveOptions,
  ): TransitionRun => {
    cancelFrame();
    following = null;
    catchingUp = false;
    const from = driver.animator.get(driver.property, at);
    const distance = target - from;
    if (Math.abs(distance) < LAND_EPSILON) {
      write(target);
      return {handle: null, finished: Promise.resolve(true)};
    }
    const progress = isTiming(motion)
      ? timingProgress(motion)
      : progressCurve(resolveMotion(driver.animator.element, motion), {
          velocity: velocity / distance,
          // Settled where the animator settles this channel: within its
          // threshold of the target, not a share of the distance.
          epsilon: SETTLE_THRESHOLD[driver.property] / Math.abs(distance),
        });
    const along = (p: number) => from + distance * p;
    const clock = startAtCommit ? {} : {at};
    const handle = driver.animator.play(
      {[driver.property]: mapProgress(progress, along)},
      {...clock, touchRelease, ...(crossfadeAs == null ? {} : {crossfadeAs})},
    );
    const finishing = [handle.finished];
    for (const layer of mapLayers) {
      finishing.push(
        layer.animator.play(
          {[layer.property]: mapProgress(progress, p => layer.map(along(p)))},
          {...clock, touchRelease},
        ).finished,
      );
    }
    return {
      handle,
      finished: Promise.all(finishing).then(all => all.every(Boolean)),
    };
  };

  return {
    get state() {
      return state;
    },
    grab(time = now()) {
      cancelFrame();
      following = null;
      catchingUp = false;
      const position = driver.animator.get(driver.property, time);
      const held = layers.map(
        layer => [layer, layer.animator.get(layer.property, time)] as const,
      );
      driver.animator.set({[driver.property]: position});
      for (const [layer, value] of held) {
        layer.animator.set({[layer.property]: value});
      }
      if (config.track != null) {
        state = config.track.initial;
      }
      return position;
    },
    track(input) {
      if (config.track == null) {
        cancelFrame();
        following = null;
        write(input);
        return;
      }
      const previous = state;
      const step = config.track.rule(input, state);
      state = step.state;
      updateStateLayers(previous, state);
      if (step.follow != null) {
        following = {target: step.position, spring: step.follow};
        catchingUp = false;
      } else if (following != null) {
        // A back-out: keep springing toward the finger until it is caught up.
        following = {target: step.position, spring: following.spring};
        catchingUp = true;
      } else {
        write(step.position);
        return;
      }
      frame ??= requestAnimationFrame(onFrame);
    },
    release(input, context, time = now()) {
      const position = driver.animator.get(driver.property, time);
      const landing = rule(
        {position, finger: input.finger, velocity: input.velocity},
        {...context, track: state},
      );
      const exits = landing.exits === true;
      const run = play(landing.target, landing.motion, {
        velocity: landing.velocity ?? input.velocity,
        touchRelease: true,
        ...(exits ? {crossfadeAs: 'exit' as const} : {}),
        now: time,
      });
      return {...run, outcome: landing.outcome, target: landing.target, exits};
    },
    to(target, motion, options = {}) {
      return play(target, motion, options);
    },
    presented(time = now()) {
      return {
        position: driver.animator.get(driver.property, time),
        velocity: driver.animator.getVelocity(driver.property, time),
      };
    },
    stop() {
      cancelFrame();
      following = null;
      catchingUp = false;
      const time = now();
      const position = driver.animator.get(driver.property, time);
      driver.animator.set({[driver.property]: position});
      for (const layer of layers) {
        layer.animator.set({
          [layer.property]: layer.animator.get(layer.property, time),
        });
      }
    },
  };
}
