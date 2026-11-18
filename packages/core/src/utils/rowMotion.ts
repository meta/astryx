// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file rowMotion.ts
 * @input The motion foundation's animator
 * @output The moves a reorder makes on list rows, through one animator per
 *   element (`animatorFor`). `animateRow` starts a recorded spring.
 *   `motionOf` and `isMoving` read the running one. `releaseMotion` clears
 *   the identity inline values once it rests. `motionNow` is the motion
 *   clock
 * @position Internal utility for List's reorder (List/listReorderEngine.tsx
 *   and List/ListReorderTouch.ts). Every motion goes through the motion
 *   foundation's shared per-element `animatorFor`, so a drop and a slide
 *   never drive one row through two animators.
 *
 * FLIP, compositor only. When a commit moves a row, its old place is put back
 * with an inverse `translate` in the same frame. The animator springs it
 * home. A row moved again mid-motion keeps its velocity.
 *
 * SYNC: When modified, update List/listReorderEngine.tsx and
 * List/ListReorderTouch.ts.
 */

import {
  animatorFor,
  isIdentityText,
  motionNow,
  type MotionHandle,
} from '../motion/animator';
import type {SpringDescription} from '../motion/spring';

type RowProperty = 'y' | 'rotate' | 'opacity';

/** A motion started through this module: its handle and the spring it runs. */
export interface RowMotion {
  handle: MotionHandle;
  spring: SpringDescription;
}

/** The running motion of each element, per property, until it rests. */
const motions = new WeakMap<HTMLElement, Map<RowProperty, RowMotion>>();

/** The element's shared animator (one per element, for all its motions). */
export {animatorFor, motionNow};

/** Whether a motion started here still runs on the element. */
export function isMoving(element: HTMLElement): boolean {
  return (motions.get(element)?.size ?? 0) > 0;
}

/**
 * The motion running on the element's `property`, started here, with the
 * spring it runs on; undefined once it rests.
 */
export function motionOf(
  element: HTMLElement,
  property: RowProperty = 'y',
): RowMotion | undefined {
  return motions.get(element)?.get(property);
}

function track(
  element: HTMLElement,
  properties: ReadonlyArray<RowProperty>,
  handle: MotionHandle,
  spring: SpringDescription,
): MotionHandle {
  let running = motions.get(element);
  if (running == null) {
    running = new Map();
    motions.set(element, running);
  }
  const motion = {handle, spring};
  for (const property of properties) {
    running.set(property, motion);
  }
  const record = running;
  void handle.finished.then(() => {
    for (const property of properties) {
      if (record.get(property) === motion) {
        record.delete(property);
      }
    }
  });
  return handle;
}

/**
 * Starts a spring on the element's shared animator and records it, so a
 * later move reads its curve (`motionOf`). For a drop, or a slide to make
 * room.
 */
export function animateRow(
  element: HTMLElement,
  to: Partial<Record<RowProperty, number>>,
  spring: SpringDescription,
  options: {
    at?: number;
    velocity?: Partial<Record<RowProperty, number>>;
  },
): MotionHandle {
  const properties = Object.keys(to) as RowProperty[];
  return track(
    element,
    properties,
    animatorFor(element).animate(
      to,
      {spring, velocity: options.velocity},
      {at: options.at},
    ),
    spring,
  );
}

/**
 * Clears the element's identity inline values once it rests, so a resting
 * row carries no `translate`. A transform makes it a containing block for
 * fixed descendants. The animator stays: other code may hold it, and its
 * state still reads the resting value. Nothing is cleared while a newer
 * motion runs on the element.
 */
export function releaseMotion(
  element: HTMLElement,
  ...properties: ReadonlyArray<'translate' | 'rotate' | 'opacity'>
): void {
  if (isMoving(element)) {
    return;
  }
  for (const property of properties) {
    // Other code may hold the same channel off rest, such as a swipe's x on
    // `translate`. Only identity values are ours to clear.
    if (isIdentityText(property, element.style.getPropertyValue(property))) {
      element.style.removeProperty(property);
    }
  }
}
