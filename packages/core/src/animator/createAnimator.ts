// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file createAnimator.ts
 * @input An element; the internal motion animator (motion/animator.ts), the
 *   `springs.stateChange` motion role and the momentum coast (motion/coast.ts)
 * @output The public animator (`spec:AST-107` FR3, FR6): `createAnimator`,
 *   the `AnimatorHandle` it returns, and their value types
 * @position Public entry point, re-exported from the package root. The
 *   `useAnimator` hook (hooks/useAnimator.ts) is a thin wrapper over it.
 *
 * A product animates one element with the motion Core uses. Every `animate`
 * plays the `springs.stateChange` motion role (`spec:AST-094` FR4), `decay`
 * coasts any channel on UIScrollView's normal deceleration (FR4:
 * fixed), and Reduce Motion is planned for every call
 * (`design:reduced-motion` DR1–DR3). The handle hands
 * out values and these methods only; the motion module beneath it stays
 * internal (`spec:AST-107` FR4). Importing this module does no DOM work, so
 * it is safe on the server.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/animator/createAnimator.test.ts
 * - /packages/core/src/animator/createAnimator.doc.mjs
 * - /packages/core/src/hooks/useAnimator.ts
 */

import {
  createMotionAnimator,
  SETTLE_THRESHOLD,
  type Animator as MotionAnimator,
  type MotionCurve,
  type MotionProperty,
  type MotionValues,
} from '../motion/animator';
import {coast} from '../motion/coast';
import {solveDecay} from '../motion/decay';
import {registerSpringsTable, springs} from '../motion/uikit/springs';

/**
 * A channel the animator drives: `x` and `y` translate the element (px),
 * `scale` scales it about its transform origin (1 is its size), `rotate`
 * turns it (degrees, clockwise) and `opacity` fades it (0 to 1).
 */
export type AnimatorChannel = 'x' | 'y' | 'scale' | 'rotate' | 'opacity';

/**
 * Values by channel. A velocity uses the same keys, in units per second:
 * px/s, scale per second, deg/s, opacity per second.
 */
export type AnimatorValues = Partial<Record<AnimatorChannel, number>>;

/** Every channel's value (or velocity), as `get` and `getVelocity` read it. */
export type AnimatorSnapshot = Readonly<Record<AnimatorChannel, number>>;

/** Options of `AnimatorHandle.animate`. */
export interface AnimatorAnimateOptions {
  /**
   * Each channel's velocity at the start, such as a drag's release velocity.
   * A channel without one keeps the
   * velocity it has on screen, so an `animate` that interrupts another
   * carries on smoothly.
   */
  velocity?: AnimatorValues;
}

/**
 * A release velocity for `AnimatorHandle.decay`, per channel, in its units
 * per second: px/s for `x` and `y`, degrees per second for `rotate`, and
 * per second for `scale` and `opacity`.
 */
export type AnimatorDecayVelocity = AnimatorValues;

/**
 * Animates one element. Each method acts on the channels it is given and
 * leaves the others where they are.
 */
export interface AnimatorHandle {
  /**
   * Springs the given channels to `target` on the `springs.stateChange`
   * motion role, from wherever they are on screen. The promise resolves when
   * they arrive, or as soon as a later `animate`, `decay`, `set` or `stop`
   * takes any of them over.
   */
  animate(
    target: AnimatorValues,
    options?: AnimatorAnimateOptions,
  ): Promise<void>;
  /**
   * Coasts the given channels from a release velocity, slowing as a scroll
   * view's momentum does, and resolves when they stop (or when another call
   * takes them over). The distance follows from the velocity alone: there are
   * no bounds, except that opacity stops at 0 or 1.
   */
  decay(velocity: AnimatorDecayVelocity): Promise<void>;
  /**
   * Puts the given channels at these values at once, ending their motion:
   * the per-frame write of a drag.
   */
  set(values: AnimatorValues): void;
  /** Every channel's value on screen now. */
  get(): AnimatorSnapshot;
  /** Every channel's velocity on screen now, in units per second. */
  getVelocity(): AnimatorSnapshot;
  /** Halts every channel where it is on screen. */
  stop(): void;
}

/** What `createAnimator` returns: the handle, and `destroy`. */
export interface Animator extends AnimatorHandle {
  /**
   * Stops every motion and lets go of the element; the element keeps the
   * values it shows. The animator does nothing after this.
   */
  destroy(): void;
}

const CHANNELS: ReadonlyArray<AnimatorChannel> = [
  'x',
  'y',
  'scale',
  'rotate',
  'opacity',
];

/** The values of the channels the public API names, and nothing else. */
function motionValues(values: AnimatorValues | undefined): MotionValues {
  const out: MotionValues = {};
  if (values == null) {
    return out;
  }
  for (const channel of CHANNELS) {
    const value = values[channel];
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[channel] = value;
    }
  }
  return out;
}

/**
 * A coast from `from` at `velocity` on the momentum decay a scroll view
 * uses (`spec:AST-108` FR4: fixed, whatever the theme), ending at rest; an
 * opacity coast stops at 0 or 1.
 */
function momentum(
  from: number,
  velocity: number,
  threshold: number,
  isUnit: boolean,
): MotionCurve {
  const glide = solveDecay({from, velocity});
  const edge = !isUnit ? null : glide.rest < 0 ? 0 : glide.rest > 1 ? 1 : null;
  const hit = edge == null ? null : glide.timeToReach(edge);
  const duration = hit ?? glide.settleTime(threshold);
  const end = edge ?? glide.rest;
  return {
    duration,
    at: t => (t >= duration ? end : glide.value(t)),
    velocity: t => (t >= duration ? 0 : glide.velocity(t)),
  };
}

function snapshot(
  read: (channel: AnimatorChannel) => number,
): AnimatorSnapshot {
  return {
    x: read('x'),
    y: read('y'),
    scale: read('scale'),
    rotate: read('rotate'),
    opacity: read('opacity'),
  };
}

/**
 * Resolves once every motion of one call has finished, or as soon as any of
 * them is interrupted (`finished` resolves `false`): a later call that takes
 * over one channel ends the whole call where it stopped, as one `animate`
 * does (`spec:AST-107` FR3), while the other channels move on.
 */
async function settledOrTakenOver(
  moving: ReadonlyArray<Promise<boolean>>,
): Promise<void> {
  if (moving.length === 0) {
    return;
  }
  await new Promise<void>(resolve => {
    let left = moving.length;
    for (const finished of moving) {
      void finished.then(completed => {
        left -= 1;
        if (!completed || left === 0) {
          resolve();
        }
      });
    }
  });
}

/**
 * An animator whose element is attached later, through `attach`: the one
 * construction `createAnimator` and `useAnimator` share, so the hook has no
 * behavior of its own (`spec:AST-107` FR6). Not exported from the package.
 */
export function createAttachableAnimator(): {
  readonly animator: Animator;
  readonly attach: (element: HTMLElement | null) => void;
} {
  const motion: MotionAnimator = createMotionAnimator(null);
  // Calls do nothing while no element is attached (before the ref attaches,
  // or after it lets go) and after destroy; animate and decay resolve at once.
  let element: HTMLElement | null = null;
  let destroyed = false;
  const inactive = () => destroyed || element == null;
  const animator: Animator = {
    async animate(target, options) {
      const to = motionValues(target);
      if (inactive() || Object.keys(to).length === 0) {
        return;
      }
      // The role registry is written on first use, never on import.
      registerSpringsTable();
      const velocity = motionValues(options?.velocity);
      await motion.animate(to, {
        spring: springs.stateChange,
        ...(Object.keys(velocity).length > 0 ? {velocity} : {}),
      }).finished;
    },
    async decay(velocity) {
      if (inactive()) {
        return;
      }
      const given = motionValues(velocity);
      // The translate axes coast as a throw, which Reduce Motion lets
      // continue; the others coast as a transition, which it replaces
      // (design:reduced-motion DR2).
      const translate = coast(motion, {x: given.x, y: given.y});
      const others: Partial<Record<MotionProperty | 'scale', MotionCurve>> = {};
      for (const channel of ['scale', 'rotate', 'opacity'] as const) {
        const v0 = given[channel];
        if (v0 != null) {
          const property = channel === 'scale' ? 'scaleX' : channel;
          others[channel] = momentum(
            motion.get(property),
            v0,
            SETTLE_THRESHOLD[property],
            channel === 'opacity',
          );
        }
      }
      const moving: Promise<boolean>[] = [];
      if (Object.keys(translate).length > 0) {
        moving.push(motion.decay(translate).finished);
      }
      if (Object.keys(others).length > 0) {
        moving.push(motion.play(others).finished);
      }
      await settledOrTakenOver(moving);
    },
    set(values) {
      if (!inactive()) {
        motion.set(motionValues(values));
      }
    },
    get() {
      return snapshot(channel => motion.get(channel));
    },
    getVelocity() {
      return snapshot(channel => motion.getVelocity(channel));
    },
    stop() {
      if (!inactive()) {
        motion.stop();
      }
    },
    destroy() {
      if (!destroyed) {
        destroyed = true;
        // Halts every channel where it shows, so the element keeps those
        // values and nothing reads as moving, then lets go of it.
        motion.stop();
        motion.dispose();
      }
    },
  };
  return {
    animator,
    attach: next => {
      if (!destroyed) {
        element = next;
        motion.attach(next);
      }
    },
  };
}

/**
 * Animates `element` with the motion Core uses: `animate` springs channels
 * to a target on the state-change motion, `decay` coasts them from a
 * release velocity, `set` jumps them, `get` and `getVelocity` read them,
 * `stop` halts them, and `destroy` lets the element go. Under Reduce Motion
 * every call is planned (`design:reduced-motion`): a move becomes a short
 * cross-fade on a touch screen and lands at once with a mouse.
 *
 * Use one animator per element: two on one element overwrite each other.
 *
 * @example
 * ```
 * const card = document.querySelector('.card');
 * const animator = createAnimator(card);
 * await animator.animate({x: 0, rotate: 0}, {velocity: {x: -900}});
 * animator.decay({x: 2400});
 * animator.destroy();
 * ```
 */
export function createAnimator(element: HTMLElement): Animator {
  const {animator, attach} = createAttachableAnimator();
  attach(element);
  return animator;
}
