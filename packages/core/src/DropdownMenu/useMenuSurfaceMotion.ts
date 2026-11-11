// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useMenuSurfaceMotion.ts
 * @input React, the layer runtime's presentation hold, and
 *   menuSurfaceMotion.ts, loaded on demand
 * @output Exports `useMenuSurfaceMotion`: the calls DropdownMenu makes as a
 *   trigger is touched, as the menu opens and as it starts to close
 * @position Internal to DropdownMenu; glue between the component and
 *   menuSurfaceMotion.ts.
 *
 * A finger's or a pen's open grows the menu out of its trigger, a tap's open
 * included. The menu shrinks back into it as it starts to close. A mouse,
 * the keyboard and Reduce Motion keep the layer's own entrance. The grow's
 * code loads at the first touch on the page or on a trigger. A page no finger
 * touches never loads it. When the menu opens before that code arrives, the
 * surface stays clear until it does, then grows. A load that fails, or takes
 * longer than an entrance, shows the menu with the layer's own entrance
 * instead. A failed load is tried again at the next open.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/DropdownMenu/DropdownMenu.tsx
 * - /packages/core/src/DropdownMenu/DropdownMenuTouchGrow.test.tsx
 */

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {holdInput} from '../Layer/inputHold';
import {createPresentationHold} from '../Layer/presentationHold';
import {prefersReducedMotion} from '../motion/reducedMotionPreference';
import {isCoarsePointer} from '../utils/coarsePointer';
import {subscribeInput} from '../utils/inputStream';
import {sharedState} from '../utils/sharedRealm';
import type * as MenuSurfaceMotionModule from './menuSurfaceMotion';
import type {MenuSurfaceGeometry, MenuSurfaceMotion} from './menuSurfaceMotion';

type MotionModule = typeof MenuSurfaceMotionModule;

async function importOwnMotion(): Promise<MotionModule> {
  return import('./menuSurfaceMotion');
}

/**
 * The grow's code, once per page for every copy of Core: the loaded module,
 * the load in flight, and the import a test can replace. A change to the
 * module's calls bumps the version, so each copy then keeps its own.
 */
const motionCode = sharedState(
  'dropdown-menu/use-menu-surface-motion/code',
  1,
  () => ({
    loaded: null as MotionModule | null,
    loading: null as Promise<MotionModule> | null,
    importMotion: importOwnMotion,
  }),
);

/**
 * Starts loading the grow's code, once per page. A failed load is forgotten,
 * so the next open tries again.
 */
async function loadMotion(): Promise<MotionModule> {
  motionCode.loading ??= motionCode.importMotion().then(
    module => {
      motionCode.loaded = module;
      return module;
    },
    (error: unknown) => {
      motionCode.loading = null;
      throw error;
    },
  );
  return motionCode.loading;
}

/**
 * How long an open waits for the grow's code before it shows the menu with
 * the layer's own entrance, ms: about one entrance.
 */
export const MENU_GROW_LOAD_WAIT_MS = 250;

/** @internal For tests: forgets the loaded code. */
export function resetMenuSurfaceMotionForTest(): void {
  motionCode.loaded = null;
  motionCode.loading = null;
  motionCode.importMotion = importOwnMotion;
}

/** @internal For tests: replaces how the grow's code loads. */
export function setMenuSurfaceMotionImportForTest(
  load: () => Promise<MotionModule>,
): void {
  motionCode.importMotion = load;
}

/**
 * Loads the grow's code at the first touch anywhere on the page. A finger
 * usually scrolls before it taps a menu, so the code is there for that tap.
 * Returns the unsubscribe.
 */
function loadAtFirstTouch(view: Window): () => void {
  // Under a fine primary pointer the trigger's own touch loads it.
  if (
    motionCode.loaded != null ||
    motionCode.loading != null ||
    !isCoarsePointer(view)
  ) {
    return () => {};
  }
  const unsubscribe = subscribeInput(view, 'touchstart', () => {
    unsubscribe();
    void loadMotion().catch(() => {});
  });
  return unsubscribe;
}

function boxOf(element: Element): MenuSurfaceGeometry['surface'] {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export interface MenuSurfaceMotionCalls {
  /** Call at a finger's or a pen's press on the trigger. */
  preload: () => void;
  /**
   * Call as the menu opens, before it paints. `isTouch` says whether a finger
   * or a pen opened it, in the touch presentation. `holdEntrance` holds input
   * during the layer's own entrance, which a late load falls back to.
   */
  present: (
    surface: HTMLElement | null,
    source: HTMLElement | null,
    isTouch: boolean,
    holdEntrance?: () => void,
  ) => void;
  /** Call as the menu starts to close, while the browser still shows it. */
  closeStart: () => void;
}

/**
 * Holds input under a coarse primary pointer from now until the grow's first
 * frame, where the grow takes its own hold. Frame callbacks run in the order
 * they were asked for, so call this after the grow's `enter`. Returns the
 * early release.
 */
function holdUntilGrowFrame(surface: HTMLElement): () => void {
  const view = surface.ownerDocument.defaultView;
  if (!isCoarsePointer(view)) {
    return () => {};
  }
  const growFrame = new Promise<void>(resolve => {
    if (typeof view?.requestAnimationFrame === 'function') {
      view.requestAnimationFrame(() => resolve());
    } else {
      resolve();
    }
  });
  return holdInput(surface, {until: growFrame, scope: 'viewport'});
}

export function useMenuSurfaceMotion(): MenuSurfaceMotionCalls {
  const motionRef = useRef<{
    element: HTMLElement;
    motion: MenuSurfaceMotion;
  } | null>(null);
  // Whether the presentation in progress grows, held from the open until its
  // close begins (Layer/presentationHold).
  const [touchHold] = useState(() => createPresentationHold<boolean>());
  // The open that waits for the grow's code, if any, and how it ends.
  const waitingRef = useRef<{
    surface: HTMLElement;
    end: () => void;
  } | null>(null);
  // The hold that keeps taps off the page until the grow's first frame.
  const growFrameHoldRef = useRef<(() => void) | null>(null);
  const endGrowFrameHold = useCallback(() => {
    growFrameHoldRef.current?.();
    growFrameHoldRef.current = null;
  }, []);

  const release = useCallback(() => {
    motionRef.current?.motion.dispose();
    motionRef.current = null;
  }, []);
  // Effect: releases the motion's compositor animations, any exit copy still
  // on screen and the hold until the grow's first frame, at unmount.
  useEffect(
    () => () => {
      release();
      endGrowFrameHold();
    },
    [endGrowFrameHold, release],
  );
  // Effect: the page's first touch loads the grow's code.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    return loadAtFirstTouch(window);
  }, []);

  const motionFor = useCallback(
    (module: MotionModule, element: HTMLElement) => {
      const current = motionRef.current;
      if (current?.element === element) {
        return current.motion;
      }
      current?.motion.dispose();
      const motion = module.createMenuSurfaceMotion(element);
      motionRef.current = {element, motion};
      return motion;
    },
    [],
  );

  const preload = useCallback(() => {
    void loadMotion().catch(() => {});
  }, []);

  const present = useCallback(
    (
      surface: HTMLElement | null,
      source: HTMLElement | null,
      isTouch: boolean,
      holdEntrance: () => void = () => {},
    ) => {
      // Under Reduce Motion the layer's own entrance plays: it only fades in,
      // where the menu rests.
      const grows =
        isTouch &&
        surface != null &&
        source != null &&
        !prefersReducedMotion(surface);
      touchHold.take(grows);
      waitingRef.current?.end();
      waitingRef.current = null;
      endGrowFrameHold();
      if (!grows || surface == null || source == null) {
        release();
        return;
      }
      const measure = () => ({surface: boxOf(surface), source: boxOf(source)});
      if (motionCode.loaded != null) {
        motionFor(motionCode.loaded, surface).enter(measure);
        // Taps stay off the page until the menu shows, at the grow's first
        // frame.
        growFrameHoldRef.current = holdUntilGrowFrame(surface);
        return;
      }
      // The grow's code is still loading: keep the surface clear until it
      // arrives, so the menu never shows at full size first. Under a coarse
      // primary pointer a touch in the meantime reaches nothing, as during
      // the grow itself.
      // The finger that opened it cannot reach a row it cannot see.
      surface.style.setProperty('opacity', '0');
      surface.style.setProperty('animation-name', 'none');
      surface.style.setProperty('pointer-events', 'none');
      const pending = loadMotion();
      const view = surface.ownerDocument.defaultView;
      const releaseHold = isCoarsePointer(view)
        ? holdInput(surface, {until: pending, scope: 'viewport'})
        : () => {};
      const show = () => {
        surface.style.removeProperty('opacity');
        surface.style.removeProperty('animation-name');
      };
      const waiting = {
        surface,
        end: () => {
          releaseHold();
          view?.clearTimeout(cap);
          surface.style.removeProperty('pointer-events');
        },
      };
      // Past the cap, or on a failed load, the menu shows as a mouse's does,
      // and it plays no shrink.
      const giveUp = () => {
        if (waitingRef.current === waiting) {
          waitingRef.current = null;
          waiting.end();
          show();
          // The entrance takes input as the menu's own entrance does.
          holdEntrance();
          touchHold.take(false);
        }
      };
      const cap = view?.setTimeout(giveUp, MENU_GROW_LOAD_WAIT_MS);
      waitingRef.current = waiting;
      void pending.then(module => {
        if (waitingRef.current !== waiting) {
          return;
        }
        waitingRef.current = null;
        surface.style.removeProperty('opacity');
        motionFor(module, surface).enter(measure);
        // The wait's hold hands over to one that lasts until the grow's first
        // frame, so no tap reaches the page in between.
        growFrameHoldRef.current = holdUntilGrowFrame(surface);
        waiting.end();
      }, giveUp);
    },
    [endGrowFrameHold, motionFor, release, touchHold],
  );

  const closeStart = useCallback(() => {
    endGrowFrameHold();
    // A close before the code arrived has nothing on screen to shrink, and
    // its wait and hold end.
    const waiting = waitingRef.current;
    if (waiting != null) {
      waitingRef.current = null;
      waiting.end();
      waiting.surface.style.removeProperty('opacity');
      waiting.surface.style.removeProperty('animation-name');
    }
    if (touchHold.current() === true) {
      motionRef.current?.motion.exit();
    }
    touchHold.release();
  }, [endGrowFrameHold, touchHold]);

  return useMemo(
    () => ({preload, present, closeStart}),
    [preload, present, closeStart],
  );
}
