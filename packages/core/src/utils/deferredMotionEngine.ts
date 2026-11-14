// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file deferredMotionEngine.ts
 * @input An element's vertical translate, written before and after the
 *   shared touch runtime loads
 * @output `createDeferredMotionEngine`: places the element by its
 *   `translate` until the runtime loads, then hands the same place to a
 *   motion engine from the runtime
 * @position Shared by the date and time wheels' strip and Chat's keyboard
 *   ride. It imports the animator's types only, so a component that reads it
 *   statically does not pull in the deferred touch runtime
 */

import type {Animator} from '../motion/animator';
import {getTouchRuntime} from './touchRuntime';

export interface DeferredMotionEngine {
  /** The element it writes to, if attached. */
  readonly element: HTMLElement | null;
  /** Attaches (or detaches, with null) the element. */
  attach(element: HTMLElement | null): void;
  /** The vertical translate shown at `time` (default now), px. */
  getY(time?: number): number;
  /** Puts the element at `y` at once, ending any motion. */
  setY(y: number, options?: {promote?: boolean}): void;
  /**
   * The motion engine, once the runtime has loaded; null before. The first
   * call after the load creates it at the place the element shows.
   */
  engine(): Animator | null;
  dispose(): void;
}

/** The `translate` value for a vertical offset, as the animator writes it. */
function translateValue(y: number): string {
  const shown = Number(y.toFixed(3));
  return shown === 0 ? 'none' : ['0px', `${shown}px`].join(' ');
}

export function createDeferredMotionEngine(): DeferredMotionEngine {
  let element: HTMLElement | null = null;
  let placedY = 0;
  let engine: Animator | null = null;
  const current = (): Animator | null => {
    if (engine == null) {
      const create = getTouchRuntime()?.createMotionEngine;
      if (create != null) {
        engine = create(null);
        engine.attach(element);
        engine.set({y: placedY}, {promote: false});
      }
    }
    return engine;
  };
  return {
    get element() {
      return element;
    },
    attach(next) {
      element = next;
      const running = current();
      if (running != null) {
        running.attach(next);
      } else if (next != null) {
        next.style.translate = translateValue(placedY);
      }
    },
    getY(time) {
      return current()?.get('y', time) ?? placedY;
    },
    setY(y, options) {
      const running = current();
      if (running != null) {
        running.set({y}, options);
        return;
      }
      placedY = y;
      if (element != null) {
        element.style.translate = translateValue(y);
      }
    },
    engine: current,
    dispose() {
      engine?.dispose();
    },
  };
}
