// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useZoomCore.ts
 * @input A stage element ref (clipping and centring the photo), the current
 *   item's key, and the zoom and fit callbacks
 * @output Exports `useZoomCore`: Lightbox's zoom stage for every pointer. It
 *   writes the photo's transform through the compositor animator and plays
 *   the eased settle and the keyboard's zoom and pan
 * @position Lightbox's shared zoom stage, internal. useZoomStage.ts drives
 *   its pointer paths; the geometry is in zoomStage.ts.
 *
 * SYNC: When modified, update useZoomStage.ts, zoomStage.ts, Lightbox.tsx
 * and __tests__/LightboxZoomModes.interaction.browser.spec.ts.
 */

import {useCallback, useMemo, useRef, useState, type RefObject} from 'react';
import type {Point} from '../gestures/types';
import {useAttachment} from '../hooks/useAttachment';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {
  createMotionAnimator,
  type Animator,
  type MotionCurve,
} from '../motion/animator';
import {mapProgress, mapRange} from '../motion/progress';
import {resolveMotion} from '../motion/resolveMotion';
import {readThemeTiming, type ThemeTimingTokens} from '../motion/themeTiming';
import {registerReducedMotionCrossFade} from '../motion/uikit/timing';
import {zoomMedia} from '../motion/uikit/zoomMedia';
import {observeResize} from '../utils/sharedResizeObserver';
import {
  IDENTITY,
  RELEASED_ZOOM,
  doubleClickTarget,
  doubleTapScaleFor,
  isZoomed,
  maxScaleFor,
  pannedBy,
  releasedZoomTarget,
  restingTransform,
  settleCurves,
  transformForResize,
  type StagePoint,
  type ZoomGeometry,
  type ZoomTransform,
} from './zoomStage';

/** Set on the stage while a finger or the mouse drags a zoomed photo. */
export const ZOOM_DRAGGING_ATTRIBUTE = 'data-zoom-dragging';

export interface UseZoomCoreOptions {
  /** The stage: the photo's clipping parent, which centres it. */
  stageRef: RefObject<HTMLElement | null>;
  /** Changes when another item shows; the photo returns to the fitted size. */
  itemKey: unknown;
  /** The photo became zoomed or returned to the fitted size. */
  onZoomedChange: (isZoomed: boolean) => void;
  /**
   * The photo left or came back to its fitted size on screen. It reads false
   * from a gesture's first move or a settle's start, and true once a settle
   * back lands.
   */
  onFitChange?: (isAtFit: boolean) => void;
}

/** Whether a shown transform is the fitted size, to within a pixel. */
function isAtFit(transform: ZoomTransform): boolean {
  return (
    Math.abs(transform.scale - 1) < 1e-3 &&
    Math.abs(transform.x) < 0.5 &&
    Math.abs(transform.y) < 0.5
  );
}

/** What Lightbox calls: the photo's ref and the keyboard's zoom and pan. */
export interface ZoomStage {
  /** Callback ref for the photo element the stage moves and scales. */
  readonly contentRef: (element: HTMLElement | null) => void;
  /** Whether the photo is zoomed now. */
  isZoomed(): boolean;
  /** Keyboard: zoom in 2x about the stage's centre, or out when zoomed. */
  toggle(): void;
  zoomIn(): void;
  zoomOut(): void;
  /** Keyboard: move a zoomed photo by (dx, dy) px, kept inside the stage. */
  panBy(dx: number, dy: number): void;
  /**
   * A mouse's or a pen's double-click at a client point: 2× about it, or
   * back when zoomed. Lightbox calls it on the browser's `dblclick`, which
   * keeps the system's double-click speed.
   */
  doubleClickAt(clientX: number, clientY: number): void;
}

/** The core as the gestures (useZoomStage.ts) drive it. */
export interface ZoomCore {
  /** The API Lightbox calls (one object for the component's lifetime). */
  readonly api: ZoomStage;
  readonly animator: Animator;
  /** The last measured geometry (null until a step measures it). */
  readonly geometryRef: {current: ZoomGeometry | null};
  /** Where the photo is going: the last written value or the settle's end. */
  readonly targetRef: {current: ZoomTransform};
  readonly zoomedRef: {current: boolean};
  readonly optionsRef: {current: UseZoomCoreOptions};
  /** Reads the stage and the photo (layout): when a step begins. */
  measure(): ZoomGeometry | null;
  /** Client px to stage px, from the last measure. */
  toStage(point: Point): StagePoint;
  /** Where the photo shows now (its presentation value). */
  current(): ZoomTransform;
  /** Shows the photo at `transform` at once. */
  write(transform: ZoomTransform): void;
  /** Where the photo is going, when an animation the core did not start ends there. */
  setTarget(transform: ZoomTransform): void;
  setZoomed(next: boolean): void;
  /**
   * UIScrollView's eased settle (a release past a limit, a zoom to a rect).
   * With `released` it plays Lightbox's released 200 ms ease-out instead,
   * the keyboard's (see RELEASED_ZOOM). With `tapped` it plays the theme's
   * move easing and medium duration, as a finger's double tap does. Under
   * Reduce Motion the animator's default applies. That is a fade in place on
   * a touch screen or for a finger's release (`touchRelease`), and at once
   * otherwise.
   */
  settleTo(
    geometry: ZoomGeometry,
    target: ZoomTransform,
    options?: {touchRelease?: boolean; released?: boolean; tapped?: boolean},
  ): void;
}

/** A tap-started zoom plays the theme's move easing over its medium duration. */
const TAP_ZOOM_TIMING: ThemeTimingTokens = {
  durations: ['--duration-medium'],
  easing: '--ease-move',
};

/**
 * The zoom a tap starts. Each channel follows the same eased progress, so the
 * tapped point stays in place all the way.
 */
function tapCurves(
  from: ZoomTransform,
  to: ZoomTransform,
  progress: MotionCurve,
): {
  readonly x: MotionCurve;
  readonly y: MotionCurve;
  readonly scale: MotionCurve;
} {
  const along = (a: number, b: number) =>
    mapProgress(progress, mapRange([0, 1], [a, b], {clamp: false}));
  return {
    x: along(from.x, to.x),
    y: along(from.y, to.y),
    scale: along(from.scale, to.scale),
  };
}

/**
 * Lightbox's zoom stage. Every zoom step runs on the compositor as baked
 * keyframes, with no React render and no layout read after a step begins. A
 * keyboard step continues from where the photo is going, so presses during a
 * settle add up. React hears only discrete changes (`onZoomedChange`).
 */
export function useZoomCore(options: UseZoomCoreOptions): ZoomCore {
  // One animator for the component's lifetime; the photo's ref attaches it.
  const [animator] = useState(() => createMotionAnimator(null));
  const optionsRef = useRef(options);
  useIsomorphicLayoutEffect(() => {
    optionsRef.current = options;
  });
  const contentElementRef = useRef<HTMLElement | null>(null);
  const geometryRef = useRef<ZoomGeometry | null>(null);
  /** Client px of the stage's top-left corner when last measured. */
  const originRef = useRef<Point>({x: 0, y: 0});
  const zoomedRef = useRef(false);
  const targetRef = useRef<ZoomTransform>(IDENTITY);

  const contentRef = useCallback(
    (element: HTMLElement | null) => {
      contentElementRef.current = element;
      animator.attach(element);
    },
    [animator],
  );

  // Layout reads happen here only: when a gesture or a keyboard zoom begins.
  // Sizes are read unrounded (offset sizes round to whole pixels, an error
  // a deep zoom would multiply): the stage's box and the photo's used size.
  // The stage centres the photo, so its fitted box follows from the two.
  const measure = useCallback((): ZoomGeometry | null => {
    const stage = optionsRef.current.stageRef.current;
    const content = contentElementRef.current;
    const view = stage?.ownerDocument.defaultView;
    if (stage == null || content == null || view == null) {
      return null;
    }
    const rect = stage.getBoundingClientRect();
    // The stage has no border or scrollbar: its box is its content box.
    const width = rect.width > 0 ? rect.width : stage.clientWidth;
    const height = rect.height > 0 ? rect.height : stage.clientHeight;
    const used = view.getComputedStyle(content);
    const fitWidth = parseFloat(used.width) || content.offsetWidth;
    const fitHeight = parseFloat(used.height) || content.offsetHeight;
    if (!(width > 0 && height > 0 && fitWidth > 0 && fitHeight > 0)) {
      return null;
    }
    originRef.current = {
      x: rect.left + stage.clientLeft,
      y: rect.top + stage.clientTop,
    };
    // By tag, not `instanceof`: a viewer rendered into another window has
    // that window's element classes.
    const naturalWidth =
      content.tagName === 'IMG'
        ? (content as HTMLImageElement).naturalWidth
        : 0;
    const natural = naturalWidth > 0 ? naturalWidth : fitWidth;
    const doubleTapScale = doubleTapScaleFor(
      width,
      height,
      fitWidth,
      fitHeight,
    );
    const geometry: ZoomGeometry = {
      width,
      height,
      fit: {
        x: (width - fitWidth) / 2,
        y: (height - fitHeight) / 2,
        width: fitWidth,
        height: fitHeight,
      },
      minScale: 1,
      maxScale: maxScaleFor(
        natural,
        fitWidth,
        view.devicePixelRatio || 1,
        doubleTapScale,
      ),
      doubleTapScale,
    };
    geometryRef.current = geometry;
    return geometry;
  }, []);

  const toStage = useCallback(
    (point: Point): StagePoint => ({
      x: point.x - originRef.current.x,
      y: point.y - originRef.current.y,
    }),
    [],
  );

  const current = useCallback(
    (): ZoomTransform => ({
      x: animator.get('x'),
      y: animator.get('y'),
      scale: animator.get('scale'),
    }),
    [animator],
  );

  const atFitRef = useRef(true);
  const setAtFit = useCallback((next: boolean) => {
    if (atFitRef.current !== next) {
      atFitRef.current = next;
      optionsRef.current.onFitChange?.(next);
    }
  }, []);

  const write = useCallback(
    (transform: ZoomTransform) => {
      targetRef.current = transform;
      animator.set({x: transform.x, y: transform.y, scale: transform.scale});
      setAtFit(isAtFit(transform));
    },
    [animator, setAtFit],
  );

  const setTarget = useCallback((transform: ZoomTransform) => {
    targetRef.current = transform;
  }, []);

  const setZoomed = useCallback((next: boolean) => {
    if (zoomedRef.current !== next) {
      zoomedRef.current = next;
      optionsRef.current.onZoomedChange(next);
    }
  }, []);

  const settleTo = useCallback(
    (
      geometry: ZoomGeometry,
      target: ZoomTransform,
      {
        touchRelease = false,
        released = false,
        tapped = false,
      }: {touchRelease?: boolean; released?: boolean; tapped?: boolean} = {},
    ) => {
      const from = current();
      animator.stop();
      // A Reduce Motion cross-fade stopped mid-dip would leave the photo dim,
      // since the next dip returns to the frozen opacity. So every settle
      // starts from full opacity, and ends there.
      if (animator.get('opacity') !== 1) {
        animator.set({opacity: 1});
      }
      targetRef.current = target;
      setZoomed(isZoomed(geometry, target));
      if (
        from.x === target.x &&
        from.y === target.y &&
        from.scale === target.scale
      ) {
        setAtFit(isAtFit(target));
        return;
      }
      // The photo is off its fitted size while it moves, back at it only
      // once a settle there lands.
      setAtFit(false);
      // Registers the reduced-motion cross-fade once; later calls do nothing.
      registerReducedMotionCrossFade();
      // A pinch's settle plays the `timing.curves.move` role, and the mouse's
      // and the keyboard's zoom plays the released ease-out. A tap starts no
      // gesture, so its zoom plays the theme's move easing and medium
      // duration, read where the stage that took the tap is.
      const stageElement = optionsRef.current.stageRef.current;
      const curves = released
        ? settleCurves(from, target, RELEASED_ZOOM.curve, RELEASED_ZOOM.seconds)
        : tapped && stageElement != null
          ? tapCurves(
              from,
              target,
              readThemeTiming(stageElement, TAP_ZOOM_TIMING),
            )
          : settleCurves(
              from,
              target,
              resolveMotion(stageElement, zoomMedia.settle.curve),
            );
      const handle = animator.play(
        {x: curves.x, y: curves.y, scale: curves.scale},
        {touchRelease},
      );
      if (isAtFit(target)) {
        void handle.finished.then(landed => {
          if (landed && targetRef.current === target) {
            setAtFit(true);
          }
        });
      }
    },
    [animator, current, setAtFit, setZoomed],
  );

  // Another item: back to the fitted size before it paints. Lightbox resets
  // its own zoomed state during that render.
  useIsomorphicLayoutEffect(() => {
    animator.stop();
    animator.set({x: 0, y: 0, scale: 1, opacity: 1});
    targetRef.current = IDENTITY;
    zoomedRef.current = false;
    geometryRef.current = null;
    setAtFit(true);
  }, [animator, options.itemKey, setAtFit]);

  // A rotation or resize keeps the same photo point centred at the same
  // on-screen size (the shared resize observer).
  const onResize = useCallback(() => {
    const before = geometryRef.current;
    if (before == null || !zoomedRef.current) {
      return;
    }
    const after = measure();
    if (after == null) {
      return;
    }
    animator.stop();
    const next = transformForResize(before, after, targetRef.current);
    write(next);
    setZoomed(isZoomed(after, next));
  }, [animator, measure, setZoomed, write]);
  // The stage mounts with the viewer's first media, which can come after the
  // viewer, as in a gallery mounted closed while its photos load.
  // `useAttachment` follows the element after every commit.
  const onResizeRef = useRef(onResize);
  useIsomorphicLayoutEffect(() => {
    onResizeRef.current = onResize;
  });
  useAttachment(
    options.stageRef,
    stage => observeResize(stage, () => onResizeRef.current()),
    null,
  );

  // The keyboard works on where the photo is going, like UIKit's model
  // values: a press during a settle continues from that settle's end.
  const zoomIn = useCallback(() => {
    const geometry = measure();
    if (geometry == null || zoomedRef.current) {
      return;
    }
    settleTo(geometry, releasedZoomTarget(geometry, targetRef.current), {
      released: true,
    });
  }, [measure, settleTo]);

  const zoomOut = useCallback(() => {
    const geometry = measure();
    if (geometry == null || !zoomedRef.current) {
      return;
    }
    settleTo(
      geometry,
      restingTransform(geometry, {...IDENTITY, scale: geometry.minScale}),
      {released: true},
    );
  }, [measure, settleTo]);

  const api = useMemo(
    (): ZoomStage => ({
      contentRef,
      isZoomed: () => zoomedRef.current,
      toggle: () => (zoomedRef.current ? zoomOut() : zoomIn()),
      zoomIn,
      zoomOut,
      panBy: (dx: number, dy: number) => {
        const geometry = measure();
        if (geometry == null || !zoomedRef.current) {
          return;
        }
        settleTo(geometry, pannedBy(geometry, targetRef.current, dx, dy), {
          released: true,
        });
      },
      doubleClickAt: (clientX: number, clientY: number) => {
        const geometry = measure();
        if (geometry == null) {
          return;
        }
        const point = toStage({x: clientX, y: clientY});
        settleTo(geometry, doubleClickTarget(geometry, current(), point), {
          released: true,
        });
      },
    }),
    [contentRef, current, measure, settleTo, toStage, zoomIn, zoomOut],
  );

  // One object for the component's lifetime: every member is stable.
  return useMemo(
    () => ({
      api,
      animator,
      geometryRef,
      targetRef,
      zoomedRef,
      optionsRef,
      measure,
      toStage,
      current,
      write,
      setTarget,
      setZoomed,
      settleTo,
    }),
    [
      api,
      animator,
      measure,
      toStage,
      current,
      write,
      setTarget,
      setZoomed,
      settleTo,
    ],
  );
}
