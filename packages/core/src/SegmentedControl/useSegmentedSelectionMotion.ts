// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useSegmentedSelectionMotion.ts
 * @input The radiogroup, the selected value, the presentation and tracking
 *   flags; the animator, the UIKit table and the touch tracking
 * @output Exports `useSegmentedSelectionMotion`, `SegmentedSelectionMotion`,
 *   the layer custom properties and the segment and title selectors
 * @position SegmentedControl's touch layer
 *
 * SYNC: When modified, update:
 * - /packages/core/src/SegmentedControl/SegmentedControl.tsx (the pseudo-elements)
 * - /packages/core/src/SegmentedControl/SegmentedControlItem.tsx (the title marker)
 * - /packages/core/src/SegmentedControl/useSegmentedTouchTracking.ts
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefCallback,
  type RefObject,
} from 'react';
import {
  createMotionAnimator,
  type AnimateOptions,
  type Animator,
  type MotionCurve,
  type MotionHandle,
  type MotionValues,
  type SpringTransition,
} from '../motion/animator';
import {
  registerSegmentedTable,
  segmentedControl,
} from '../motion/uikit/segmented';
import {registerSpringsTable, springs} from '../motion/uikit/springs';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {observeResize} from '../utils/sharedResizeObserver';
import {titleOfSegment} from '../privateAttributes/segmentTitle.stylex';
import {cubicBezier} from '../motion/bezier';
import {parseCssEasing, parseMotionRoleValue} from '../motion/roles';
import {useSegmentedTouchTracking} from './useSegmentedTouchTracking';

/** The segments, in DOM order. */
export const SEGMENT_SELECTOR = '[role="radio"][data-value]';
/**
 * The selected face moves to another segment only when the lens's center is
 * this far past the boundary. The distance is a quarter of that segment's
 * width, at least 8 px.
 */
const FACE_HYSTERESIS_RATIO = 0.25;
const FACE_HYSTERESIS_MIN_PX = 8;

/** The selected surface's paint, copied into a layer's custom properties. */
export const SURFACE_PROPERTIES: ReadonlyArray<string> = [
  'background-color',
  'background-image',
  'background-position',
  'background-size',
  'background-repeat',
  'background-origin',
  'background-clip',
  'box-shadow',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-style',
  'border-right-style',
  'border-bottom-style',
  'border-left-style',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'backdrop-filter',
  '-webkit-backdrop-filter',
];

/**
 * The radiogroup's two pseudo-element layers: the lens (::before) and the
 * ::after, which under Reduced Motion shows the surface that fades out where
 * it is.
 */
export type Layer = 'lens' | 'after';

/** Box and visibility of a layer, besides its paint. */
export const LAYER_GEOMETRY: ReadonlyArray<string> = [
  'left',
  'top',
  'width',
  'height',
  'visibility',
];

/** The custom property on the radiogroup that sets `property` of `layer`. */
export function layerVariable(layer: Layer, property: string): string {
  return `--_segmented-${layer}-${property.replace(/^-+/, '')}`;
}

/**
 * What the destination segment shows while the lens carries its surface.
 * Written inline with priority so a theme's rule for the selected segment
 * cannot paint a second surface; borders keep their width so nothing moves.
 */
const HIDDEN_SURFACE: ReadonlyArray<readonly [string, string]> = [
  ['background-color', 'transparent'],
  ['background-image', 'none'],
  ['box-shadow', 'none'],
  ['border-top-color', 'transparent'],
  ['border-right-color', 'transparent'],
  ['border-bottom-color', 'transparent'],
  ['border-left-color', 'transparent'],
  ['backdrop-filter', 'none'],
  ['-webkit-backdrop-filter', 'none'],
];

/** A title's face: what a dragging finger moves between titles. */
interface TitleFace {
  readonly color: string;
  readonly fontWeight: string;
}

/** A box in the track's padding-box coordinates, in CSS px. */
interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Carried {
  /** The segment the lens is bound for: it lands there at rest. */
  readonly segment: HTMLElement;
  /**
   * The lens's layout box: the segment's, so it lands at translate 0 from
   * the segment and scale 1, the segment's own size.
   */
  readonly box: Box;
  /**
   * The segment whose surface the lens shows, hidden there meanwhile: the
   * selected one. A touch moves the lens before the new value comes back,
   * so until then this is still the old selection.
   */
  hidden: HTMLElement;
  /** The track's layout size when the box was measured. */
  readonly trackSize: {readonly width: number; readonly height: number};
}

/** A finger's touch, from landing to letting go. */
interface Touch {
  /** The track's geometry when the finger landed (read once). */
  readonly toTrackX: (clientX: number) => number;
  readonly boxes: ReadonlyMap<HTMLElement, Box>;
  /** The segment the finger landed on, if any (the tracker's begin target). */
  readonly origin: HTMLElement | null;
  /** Whether it landed on the selected segment (a drag carries the lens). */
  readonly carriesLens: boolean;
  /** A finger pressed: under Reduced Motion its release cross-fades. */
  readonly isFinger: boolean;
  /** The selected title's face and an unselected one, read at landing. */
  readonly faces: {
    readonly selected: TitleFace;
    readonly unselected: TitleFace;
  } | null;
}

/**
 * The motion a release starts after its commit's click runs. It aims at the
 * destination's box when the new value shows, because the titles' new weights
 * move the segments. Until the value comes back, it aims at the box measured
 * at landing.
 */
interface Pending {
  readonly destination: HTMLElement;
  /** The destination's box when the finger landed. */
  readonly box: Box;
  /** The held lens settles there; otherwise it slides from `from`. */
  readonly isHeld: boolean;
  /** The selected segment's box: where a tap's slide starts. */
  readonly from: Box | null;
  /** A finger released it: under Reduced Motion it cross-fades. */
  readonly touchRelease: boolean;
}

function faceOf(element: HTMLElement): TitleFace {
  const style = getComputedStyle(element);
  return {color: style.color, fontWeight: style.fontWeight};
}

/**
 * A hidden segment's own inline declarations (its `style`) for the properties
 * `hideSurface` overrides: value and priority, restored by `showSurface`.
 */
const ownSurface = new WeakMap<
  HTMLElement,
  ReadonlyArray<readonly [property: string, value: string, priority: string]>
>();

function hideSurface(segment: HTMLElement): void {
  if (!ownSurface.has(segment)) {
    ownSurface.set(
      segment,
      HIDDEN_SURFACE.map(([property]) => [
        property,
        segment.style.getPropertyValue(property),
        segment.style.getPropertyPriority(property),
      ]),
    );
  }
  for (const [property, value] of HIDDEN_SURFACE) {
    segment.style.setProperty(property, value, 'important');
  }
}

/** Gives a hidden segment its surface back, its own inline values included. */
function showSurface(segment: HTMLElement): void {
  const own = ownSurface.get(segment);
  if (own == null) {
    return;
  }
  ownSurface.delete(segment);
  for (const [property, value, priority] of own) {
    if (value === '') {
      segment.style.removeProperty(property);
    } else {
      segment.style.setProperty(property, value, priority);
    }
  }
}

/**
 * Paints `layer` with `segment`'s computed surface. All values are read
 * before any is written. A write to the track's style makes the next
 * computed-style read recompute. Interleaved reads and writes restyle the
 * control once per property.
 */
function paintLayer(
  track: HTMLElement,
  layer: Layer,
  segment: HTMLElement,
): void {
  const style = getComputedStyle(segment);
  const values = SURFACE_PROPERTIES.map(property =>
    style.getPropertyValue(property),
  );
  SURFACE_PROPERTIES.forEach((property, index) => {
    track.style.setProperty(layerVariable(layer, property), values[index]);
  });
}

/** Copies the lens's paint onto the ::after. */
function copyLensPaint(track: HTMLElement): void {
  for (const property of SURFACE_PROPERTIES) {
    track.style.setProperty(
      layerVariable('after', property),
      track.style.getPropertyValue(layerVariable('lens', property)),
    );
  }
}

/** Lays `layer` out on `box` and shows it. */
function placeLayer(track: HTMLElement, layer: Layer, box: Box): void {
  track.style.setProperty(layerVariable(layer, 'left'), `${box.x}px`);
  track.style.setProperty(layerVariable(layer, 'top'), `${box.y}px`);
  track.style.setProperty(layerVariable(layer, 'width'), `${box.width}px`);
  track.style.setProperty(layerVariable(layer, 'height'), `${box.height}px`);
  track.style.setProperty(layerVariable(layer, 'visibility'), 'visible');
}

/** Hides `layer` and drops its custom properties. */
function clearLayer(track: HTMLElement, layer: Layer): void {
  for (const property of [...LAYER_GEOMETRY, ...SURFACE_PROPERTIES]) {
    track.style.removeProperty(layerVariable(layer, property));
  }
}

/**
 * The scale an ancestor transform applies to the track's client rects. The
 * lens lays out untransformed. `offsetWidth` rounds to whole pixels, so a
 * fractional track width reads as a scale slightly off 1. Only a real
 * transform moves it further than that rounding.
 */
function scaleOf(track: HTMLElement, rect: DOMRect): number {
  if (track.offsetWidth <= 0 || rect.width <= 0) {
    return 1;
  }
  return Math.abs(rect.width - track.offsetWidth) <= 1
    ? 1
    : rect.width / track.offsetWidth;
}

/** Boxes relative to the track's padding box. */
function boxesIn(track: HTMLElement): (element: HTMLElement) => Box {
  const trackRect = track.getBoundingClientRect();
  const scale = scaleOf(track, trackRect);
  return element => {
    const rect = element.getBoundingClientRect();
    return {
      x: (rect.left - trackRect.left) / scale - track.clientLeft,
      y: (rect.top - trackRect.top) / scale - track.clientTop,
      width: rect.width / scale,
      height: rect.height / scale,
    };
  };
}

/** Maps a client x to the track's padding-box x, read once per touch. */
function trackXIn(track: HTMLElement): (clientX: number) => number {
  const rect = track.getBoundingClientRect();
  const scale = scaleOf(track, rect);
  return clientX => (clientX - rect.left) / scale - track.clientLeft;
}

function segmentsOf(track: HTMLElement): HTMLElement[] {
  return Array.from(track.querySelectorAll<HTMLElement>(SEGMENT_SELECTOR));
}

function isLaidOut(box: Box): boolean {
  return box.width > 0 && box.height > 0;
}

function center(box: Box): number {
  return box.x + box.width / 2;
}

/** Whether two boxes are the same to a quarter of a pixel. */
function isSameBox(a: Box, b: Box): boolean {
  return (
    Math.abs(a.x - b.x) < 0.25 &&
    Math.abs(a.y - b.y) < 0.25 &&
    Math.abs(a.width - b.width) < 0.25 &&
    Math.abs(a.height - b.height) < 0.25
  );
}

function isEnabledSegment(segment: HTMLElement): boolean {
  return (
    !segment.hasAttribute('disabled') &&
    segment.getAttribute('aria-disabled') !== 'true'
  );
}

const titleOf = titleOfSegment;

/** The theme's timing: a duration in seconds and its easing. */
interface ThemeTiming {
  readonly seconds: number;
  readonly ease: (progress: number) => number;
}

/**
 * The timing of `segment`'s own transition, which reads the theme's duration
 * and easing tokens. The values stay readable while a carry turns the
 * transition's property off. Null when the theme gives no duration.
 */
function themeTimingOf(segment: HTMLElement): ThemeTiming | null {
  const view = segment.ownerDocument.defaultView;
  if (view == null) {
    return null;
  }
  const style = view.getComputedStyle(segment);
  const ms = parseMotionRoleValue(
    'duration',
    style.transitionDuration.split(',')[0] ?? '',
  );
  const points = parseCssEasing(
    style.transitionTimingFunction.split(/,(?![^(]*\))/)[0] ?? '',
  );
  if (ms == null || ms <= 0 || points == null) {
    return null;
  }
  return {seconds: ms / 1000, ease: cubicBezier(points)};
}

/** A theme that gives the segments no transition: the lens lands at once. */
const INSTANT: ThemeTiming = {seconds: 0.001, ease: progress => progress};

/** A curve from `from` to `to` on `timing`. */
function timedCurve(
  from: number,
  to: number,
  timing: ThemeTiming,
): MotionCurve {
  const {seconds, ease} = timing;
  const at = (t: number) =>
    from + (to - from) * ease(Math.min(1, Math.max(0, t / seconds)));
  const step = Math.min(seconds / 100, 0.001);
  return {
    duration: seconds,
    at,
    velocity: t => {
      const before = Math.max(0, t - step);
      const after = Math.min(seconds, t + step);
      return (at(after) - at(before)) / (after - before);
    },
  };
}

/** What the control reads of its selection motion. */
export interface SegmentedSelection {
  /**
   * A press is down on the control (any pointer's), or its tap's click has
   * not run yet. The press commits through that click, so a focus move it
   * causes selects nothing.
   */
  readonly isPressing: () => boolean;
  /** A key went down: a focus move it causes is the keyboard's, and selects. */
  readonly keyPressed: () => void;
}

export interface SegmentedSelectionMotionOptions {
  /** The animator's clock (ms, document timeline); `performance.now()` by default. */
  readonly now?: () => number;
  /**
   * The animator for the radiogroup's ::after (the surface that fades out
   * under Reduced Motion); one of its own by default.
   */
  readonly afterAnimator?: Animator;
}

function defaultNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

/**
 * The selection motion of one SegmentedControl, as UIKit's segmented control
 * moves it. It lives outside React's render cycle. Nothing here sets state,
 * so a slide never re-renders anything.
 *
 * At rest, the selected segment paints its own surface, so themes style it
 * as before. For a slide, the lens takes over. The lens is the radiogroup's
 * ::before, painted from custom properties copied from the segment's
 * computed surface. The segment hides its own surface inline, so a theme
 * rule cannot keep it painted. The lens moves with `translate` and `scale`
 * on the compositor animator. Nothing lays out or paints per frame, and the
 * slide keeps moving while JavaScript is busy. The lens lays out on the
 * destination's box. It lands at translate 0 and scale 1 and hands the
 * surface back pixel for pixel. Its position and its size run on separate
 * springs, as UIKit's do. A change mid-flight starts from the presented
 * geometry and its velocities. The titles change with the selection, at
 * once.
 *
 * Under a finger:
 * - A theme role owns a pressed thumb's lift, so a press on the selected
 *   segment lifts nothing here.
 * - A drag from the selected segment carries the lens at its resting size.
 *   Its center chases the finger, at most `dragOvershoot` past the end
 *   segments.
 * - The selected title's color follows the lens's center. It moves to a
 *   neighbor only once the center is a quarter of that segment past the
 *   boundary. Every title keeps its weight until the lift.
 * - The lift commits the segment nearest the finger, through that segment's
 *   click. A lift outside the control commits nothing, and the lens settles
 *   back.
 * - A press on another segment leaves the lens in place until the lift.
 *   Meanwhile that segment shows the shared pressed overlay.
 * - A click that the item cancels sends the lens back at once. Otherwise the
 *   lens waits for the new value, which a parent can adopt later. It goes
 *   back only if the slide settles without the new value.
 * - A cancelled touch puts the lens back.
 *
 * Under a mouse or a pen, the same press commits the same segment, but the
 * theme owns the timing. A click, a key or a new value slides the lens on the
 * theme's duration and easing, as the segments' own transition does. A drag
 * from the selected segment carries the lens on the pointer itself.
 *
 * Under Reduced Motion, a held lens still follows the pointer: that is direct
 * movement, not a transition. Nothing else chases, travels or scales. The lens
 * fades in at the new segment while ::after, painted with the old surface,
 * fades out in place. With a fine pointer under Reduce Motion, a change shows
 * through the theme's transition.
 */
export class SegmentedSelectionMotion {
  private track: HTMLElement | null = null;
  private carried: Carried | null = null;
  /**
   * Segments whose surface the lens carried until a change turned it
   * elsewhere. They keep their surface hidden until the lens lands. A tap's
   * press paint can still fade on such a segment. That paint would cover the
   * lens, which sits under the segments' backgrounds, while the lens crosses
   * it.
   */
  private readonly abandoned = new Set<HTMLElement>();
  /** The segment showing the selected face under a dragging finger. */
  private facedSegment: HTMLElement | null = null;
  /** The frame request that keeps the face on the lens while it is carried. */
  private lensFrame: number | null = null;
  /** Titles wearing the other face's color during a drag. */
  private readonly faceOverrides = new Set<HTMLElement>();
  /** The motions the hand-back waits for. */
  private readonly running = new Set<MotionHandle>();
  /** A finger holds the lens: a drag from the selected segment carries it. */
  private isHeld = false;
  /**
   * The touch presentation applies (a coarse primary pointer), so every
   * change slides on UIKit's springs. When it is off, a change slides on the
   * theme's duration and easing, as the segments' transition does. A drag from
   * the selected segment carries the lens on the pointer itself.
   */
  private isPresenting = true;
  /**
   * Segments whose own transitions are off while a fine pointer's carry is
   * on screen, with their own inline values to give back.
   */
  private readonly stilled = new Map<HTMLElement, readonly [string, string]>();
  /** The frame request that gives the stilled segments their transitions back. */
  private thawFrame: number | null = null;
  private touch: Touch | null = null;
  /**
   * The value a touch already moved the lens to: the selection change that
   * follows (the controlled value coming back) re-aims the lens.
   */
  private committed: string | null = null;
  /**
   * The commit's click ran without a veto: the lens waits for the value
   * until the slide settles.
   */
  private isAwaitingValue = false;
  /** The motion a release starts once its commit's click has run. */
  private pending: Pending | null = null;
  /** The last release was a finger's (decline and re-aim follow it). */
  private releasedByFinger = true;
  /** The ::after shows the leaving surface (Reduced Motion). */
  private isLeavingShown = false;
  /** Bumped by every leaving fade; a finished fade clears only its own. */
  private leaving = 0;

  private readonly now: () => number;
  /** The ::after: the surface fading out under Reduced Motion. */
  private readonly after: Animator;

  constructor(
    private readonly animator: Animator = createMotionAnimator(null, {
      pseudoElement: '::before',
    }),
    options: SegmentedSelectionMotionOptions = {},
  ) {
    // The chase plays the shared `springs.fingerTracking` role, and the slide
    // plays the segmented role. Both register before the first animation,
    // because nothing registers on import. A second call does nothing.
    registerSpringsTable();
    registerSegmentedTable();
    this.now = options.now ?? defaultNow;
    this.after =
      options.afterAnimator ??
      createMotionAnimator(null, {
        pseudoElement: '::after',
        initial: {opacity: 0},
      });
  }

  /** Attaches the radiogroup whose pseudo-elements are the lens (null detaches). */
  attachTrack(element: HTMLElement | null): void {
    if (element !== this.track) {
      this.settle();
    }
    this.track = element;
    this.animator.attach(element);
    this.after.attach(element);
  }

  /** True while the lens carries the selected surface. */
  get isSliding(): boolean {
    return this.carried != null;
  }

  /** A press (any pointer's) is down on the control, from landing to letting go. */
  get isPressed(): boolean {
    return this.touch != null;
  }

  /**
   * Whether the touch presentation applies. Off, under a fine primary
   * pointer, a change slides on the theme's timing, and a drag from the
   * selected segment still carries the lens. A change of presentation hands
   * anything in flight back.
   */
  present(isPresenting: boolean): void {
    if (this.isPresenting === isPresenting) {
      return;
    }
    this.isPresenting = isPresenting;
    this.settle();
  }

  /** The segment that commits `value`, if the track has one. */
  segmentFor(track: HTMLElement, value: string): HTMLElement | null {
    return (
      segmentsOf(track).find(segment => segment.dataset.value === value) ?? null
    );
  }

  /** The selection moved from `from` to `to`; the DOM already shows `to`. */
  select(track: HTMLElement, from: string, to: string): void {
    if (this.track !== track) {
      return;
    }
    const origin = this.segmentFor(track, from);
    const destination = this.segmentFor(track, to);
    const isTouchCommit = this.committed === to;
    // The commit's own styles take over from a drag's borrowed faces.
    this.clearFaces();
    this.committed = null;
    this.isAwaitingValue = false;
    if (isTouchCommit) {
      if (this.pending?.destination === destination && destination != null) {
        // Adopted during the click: the lens moves now, on the box the
        // destination has with the new value shown.
        this.startPending(destination, boxesIn(track)(destination));
      }
      // The new selection now paints the surface the lens carries, and its
      // titles' weights may have moved the segments since the lens set off.
      const carried = this.carried;
      if (carried != null && carried.segment === destination) {
        if (carried.hidden !== destination) {
          showSurface(carried.hidden);
          paintLayer(track, 'lens', destination);
          hideSurface(destination);
          carried.hidden = destination;
        }
        this.reaim(track, destination);
      }
      return;
    }
    if (!this.slidesChanges()) {
      // A fine pointer under Reduce Motion: the theme's transition shows the
      // change.
      this.settle();
      return;
    }
    if (destination == null) {
      // Nothing is selected any more: no surface to carry.
      this.settle();
      return;
    }
    if (this.carried == null && origin == null) {
      // Nothing was selected: there is no surface to slide from.
      return;
    }
    const boxOf = boxesIn(track);
    const to_ = boxOf(destination);
    if (!isLaidOut(to_)) {
      this.settle();
      return;
    }
    const from_ = this.carried == null ? boxOf(origin as HTMLElement) : null;
    if (this.animator.reducedMotion() !== 'off') {
      this.crossFadeTo(destination, to_, from_, destination, false);
      return;
    }
    const at = this.carry(destination, to_, from_, destination);
    // A programmatic or keyboard change: the whole box slides.
    this.settleLens(destination, {at});
  }

  /**
   * Whether a change of value slides the lens. A fine pointer under Reduce
   * Motion leaves the change to the theme's transition.
   */
  private slidesChanges(): boolean {
    return this.isPresenting || this.animator.reducedMotion() === 'off';
  }

  /**
   * A press landed on `origin`, the segment the action-group tracker resolved
   * for it (null: none). It reads the track's geometry and title faces once.
   * Under Reduced Motion a finger's release cross-fades.
   */
  begin(track: HTMLElement, origin: HTMLElement | null, isFinger = true): void {
    const segments = segmentsOf(track);
    const boxOf = boxesIn(track);
    const boxes = new Map(segments.map(segment => [segment, boxOf(segment)]));
    const toTrackX = trackXIn(track);
    const selected =
      segments.find(
        segment => segment.getAttribute('aria-checked') === 'true',
      ) ?? null;
    const carriesLens = origin != null && origin === selected;
    const selectedTitle = selected != null ? titleOf(selected) : null;
    // An enabled segment's unselected face: a disabled title has its own.
    const other = segments.find(
      segment => segment !== selected && isEnabledSegment(segment),
    );
    const otherTitle = other != null ? titleOf(other) : null;
    const faces =
      selectedTitle != null && otherTitle != null
        ? {selected: faceOf(selectedTitle), unselected: faceOf(otherTitle)}
        : null;
    this.touch = {
      toTrackX,
      boxes,
      origin,
      carriesLens,
      isFinger,
      faces,
    };
  }

  /**
   * The finger moved to `clientX`. A drag from the selected segment carries
   * the lens at its resting size. A touch elsewhere leaves the lens alone,
   * and that segment shows the shared pressed overlay.
   */
  drag(clientX: number): void {
    const touch = this.touch;
    if (touch == null || !touch.carriesLens) {
      return;
    }
    this.hold();
    if (!this.isHeld) {
      return;
    }
    this.chase(clientX);
    this.followLens();
  }

  /**
   * The first move of a drag from the selected segment binds the lens there,
   * at its resting size. Under Reduced Motion too: the lens follows the hand,
   * and only the release cross-fades.
   */
  private hold(): void {
    const touch = this.touch;
    if (touch == null || touch.origin == null || this.isHeld) {
      return;
    }
    const box = touch.boxes.get(touch.origin) as Box;
    if (!isLaidOut(box)) {
      return;
    }
    this.carry(touch.origin, box, null, touch.origin);
    this.isHeld = true;
  }

  /**
   * The selected face follows the held lens: it goes to the segment under the
   * lens's presented center. Hysteresis around each boundary keeps a finger
   * that rests on a boundary from flipping it. This runs every frame while
   * the lens is held, so the face keeps up as the lens settles under a still
   * finger.
   */
  private followLens(): void {
    const touch = this.touch;
    const carried = this.carried;
    if (
      touch == null ||
      !touch.carriesLens ||
      !this.isHeld ||
      carried == null ||
      touch.origin == null
    ) {
      this.lensFrame = null;
      return;
    }
    const lensCenter = this.presented(carried.box, this.now()).center;
    const spans = [...touch.boxes.entries()]
      .filter(([segment]) => isEnabledSegment(segment))
      .sort((a, b) => a[1].x - b[1].x);
    const current = this.facedSegment ?? touch.origin;
    const at = spans.findIndex(([segment]) => segment === current);
    if (at >= 0) {
      const edge = (i: number) =>
        (spans[i][1].x + spans[i][1].width + spans[i + 1][1].x) / 2;
      let next = at;
      while (next + 1 < spans.length && lensCenter > edge(next)) {
        next += 1;
      }
      while (next > 0 && lensCenter < edge(next - 1)) {
        next -= 1;
      }
      if (next !== at) {
        const boundary = next > at ? edge(at) : edge(at - 1);
        const hysteresis = Math.max(
          FACE_HYSTERESIS_MIN_PX,
          FACE_HYSTERESIS_RATIO * spans[next][1].width,
        );
        if (Math.abs(lensCenter - boundary) >= hysteresis) {
          const segment = spans[next][0];
          this.showFaceAt(segment === touch.origin ? null : segment);
        }
      }
    }
    const view = this.track?.ownerDocument.defaultView;
    if (this.lensFrame == null && view != null) {
      this.lensFrame = view.requestAnimationFrame(() => {
        this.lensFrame = null;
        this.followLens();
      });
    }
  }

  /** The held lens's center chases the finger at `clientX`. */
  private chase(clientX: number): void {
    const touch = this.touch;
    const carried = this.carried;
    if (touch == null || carried == null) {
      return;
    }
    const centers = [...touch.boxes.values()].map(center);
    const reach = segmentedControl.dragOvershoot;
    const target = Math.min(
      Math.max(touch.toTrackX(clientX), Math.min(...centers) - reach),
      Math.max(...centers) + reach,
    );
    if (!this.isPresenting || this.animator.reducedMotion() !== 'off') {
      // A mouse or a pen holds the lens directly, as a finger does under
      // Reduce Motion. Each move writes the pointer's position.
      this.animator.set({x: target - center(carried.box)});
      return;
    }
    // Start each chase at the call. A chase from rest waits for the browser
    // to start it. Android Chrome sends the next move first, so the lens
    // would stick.
    const at = this.now();
    this.springLens(
      {x: target - center(carried.box)},
      this.springFrom({x: target - center(carried.box)}, 'tracking'),
      {at},
    );
  }

  /**
   * The finger let go on `target`, the segment the tracker resolved for it
   * (null: none, or a disabled one). Moves the lens there and returns its
   * value when it is not the selected one (the tracker's lift commits it
   * through its click), else null.
   */
  release(target: HTMLElement | null): string | null {
    const touch = this.touch;
    this.touch = null;
    if (touch == null) {
      return null;
    }
    const selected =
      [...touch.boxes.keys()].find(
        segment => segment.getAttribute('aria-checked') === 'true',
      ) ?? null;
    // A disabled segment never commits: the lens settles back on the
    // selection.
    const destination =
      (target != null && isEnabledSegment(target) ? target : null) ?? selected;
    if (destination == null) {
      this.clearFaces();
      if (this.isHeld) {
        this.isHeld = false;
        this.settle();
      }
      return null;
    }
    const box = touch.boxes.get(destination) as Box;
    const value =
      destination !== selected ? (destination.dataset.value ?? null) : null;
    // A drag's borrowed face stays only if the lift commits (the commit
    // takes it over).
    if (value == null) {
      this.clearFaces();
    }
    const isHeld = touch.carriesLens && this.isHeld;
    this.committed = value;
    this.isAwaitingValue = false;
    this.releasedByFinger = touch.isFinger;
    if (value == null) {
      if (isHeld) {
        // The held lens settles back on the selection.
        this.moveLensTo(
          destination,
          box,
          selected ?? destination,
          touch.isFinger,
        );
      }
      return null;
    }
    // The commit follows at once, through the segment's click; the lens
    // moves once it has run, on the box the destination has then. A held
    // lens settles there; a tap (or a drag that started elsewhere) slides
    // there from the selected segment.
    // A fine pointer under Reduce Motion moves only a held lens.
    if (isHeld || (selected != null && this.slidesChanges())) {
      this.pending = {
        destination,
        box,
        isHeld,
        from:
          !isHeld && selected != null
            ? (touch.boxes.get(selected) as Box)
            : null,
        touchRelease: touch.isFinger,
      };
    }
    return value;
  }

  /**
   * The commit's click for `value` has run. A click that the item's
   * `onClick` cancels sends the lens back at once. Otherwise the lens waits
   * for the value, which a parent can adopt later.
   */
  clicked(track: HTMLElement, value: string, isCancelled: boolean): void {
    if (this.committed !== value) {
      // Adopted during the click, or superseded.
      return;
    }
    if (isCancelled) {
      this.pending = null;
      this.decline(track, value);
      return;
    }
    this.isAwaitingValue = true;
    // React can render the click's change only after the event that
    // dispatched it ends: a click inside a touch handler is batched with it.
    // Wait one turn. If the value is adopted by then, the lens already moves
    // on the new box. Otherwise it aims at the box measured at landing and
    // re-aims when the value comes back.
    queueMicrotask(() => {
      if (this.committed === value && this.pending != null) {
        this.startPending(this.selectedIn(track));
      }
    });
  }

  /**
   * The value the finger let go on was not adopted. The item's `onClick`
   * cancelled it, or a controlled parent kept its value. The lens goes back
   * to the selected segment. The next change to that value slides as any
   * change does.
   */
  decline(track: HTMLElement, value: string): void {
    if (this.committed !== value) {
      return;
    }
    this.committed = null;
    this.isAwaitingValue = false;
    this.pending = null;
    this.clearFaces();
    const selected =
      segmentsOf(track).find(
        segment => segment.getAttribute('aria-checked') === 'true',
      ) ?? null;
    if (selected == null || this.carried == null) {
      this.settle();
      return;
    }
    const box = boxesIn(track)(selected);
    if (!isLaidOut(box)) {
      this.settle();
      return;
    }
    this.moveLensTo(selected, box, selected, this.releasedByFinger);
  }

  /** The touch was taken away (the page scrolled): the lens goes back. */
  cancel(): void {
    const touch = this.touch;
    this.touch = null;
    this.clearFaces();
    if (
      touch == null ||
      !touch.carriesLens ||
      touch.origin == null ||
      !this.isHeld
    ) {
      // Nothing was held: nothing to put back.
      return;
    }
    const box = touch.boxes.get(touch.origin) as Box;
    this.moveLensTo(touch.origin, box, touch.origin, touch.isFinger);
  }

  /** Hands the surface back to its segment now and hides the lens. */
  settle(): void {
    this.endLeaving();
    this.isHeld = false;
    this.pending = null;
    const carried = this.carried;
    if (carried != null) {
      this.carried = null;
      this.running.clear();
      this.animator.stop();
      this.after.stop();
      showSurface(carried.hidden);
      for (const segment of this.abandoned) {
        showSurface(segment);
      }
      this.abandoned.clear();
      if (this.track != null) {
        clearLayer(this.track, 'lens');
        clearLayer(this.track, 'after');
      }
      this.isLeavingShown = false;
    }
    // Once the surfaces are back on screen, so nothing fades in.
    this.thawTransitions();
  }

  /**
   * The control resized. The lens aims at boxes measured when its motion
   * began, so it hands the surface back rather than land somewhere stale.
   * Two cases keep the motion. In the first, the track keeps its measured
   * size: a new title weight resized a content-sized control before the box
   * was measured. In the second, a finger holds the lens.
   */
  resized(track: HTMLElement): void {
    const carried = this.carried;
    // A finger that holds the lens reflows the titles itself, because the
    // selected face moves to the title under it. The lens follows the finger,
    // and the commit measures the destination again.
    if (carried == null || this.touch != null) {
      return;
    }
    if (
      Math.abs(track.offsetWidth - carried.trackSize.width) < 0.5 &&
      Math.abs(track.offsetHeight - carried.trackSize.height) < 0.5
    ) {
      return;
    }
    this.settle();
  }

  /**
   * Ends everything in flight (unmount). The controller stays usable, so an
   * effect cleanup followed by a setup (StrictMode's extra mount) loses
   * nothing.
   */
  stop(): void {
    this.touch = null;
    if (this.lensFrame != null) {
      this.track?.ownerDocument.defaultView?.cancelAnimationFrame(
        this.lensFrame,
      );
      this.lensFrame = null;
    }
    this.committed = null;
    this.isAwaitingValue = false;
    this.clearFaces();
    this.settle();
    this.cancelThaw();
    this.restoreTransitions();
  }

  /**
   * A fine pointer's carry. The segments' own transitions go off while the
   * lens is on screen, so the borrowed surface does not fade out and back in.
   * Under a finger, the touch presentation already turns them off.
   */
  private stillTransitions(): void {
    const track = this.track;
    if (track == null) {
      return;
    }
    this.cancelThaw();
    for (const segment of segmentsOf(track)) {
      if (!this.stilled.has(segment)) {
        this.stilled.set(segment, [
          segment.style.getPropertyValue('transition-property'),
          segment.style.getPropertyPriority('transition-property'),
        ]);
      }
      segment.style.setProperty('transition-property', 'none', 'important');
    }
  }

  /**
   * Gives the stilled segments their transitions back two frames after the
   * hand-back, once the surfaces it gave back have been on screen.
   */
  private thawTransitions(): void {
    if (this.stilled.size === 0 || this.thawFrame != null) {
      return;
    }
    const view = this.track?.ownerDocument.defaultView;
    if (view == null) {
      this.restoreTransitions();
      return;
    }
    this.thawFrame = view.requestAnimationFrame(() => {
      this.thawFrame = view.requestAnimationFrame(() => {
        this.thawFrame = null;
        this.restoreTransitions();
      });
    });
  }

  private cancelThaw(): void {
    if (this.thawFrame != null) {
      this.track?.ownerDocument.defaultView?.cancelAnimationFrame(
        this.thawFrame,
      );
      this.thawFrame = null;
    }
  }

  private restoreTransitions(): void {
    for (const [segment, [value, priority]] of this.stilled) {
      if (value === '') {
        segment.style.removeProperty('transition-property');
      } else {
        segment.style.setProperty('transition-property', value, priority);
      }
    }
    this.stilled.clear();
  }

  /** The selected segment, as the DOM shows it now. */
  private selectedIn(track: HTMLElement): HTMLElement | null {
    return (
      segmentsOf(track).find(
        segment => segment.getAttribute('aria-checked') === 'true',
      ) ?? null
    );
  }

  /**
   * Starts the motion the release left pending: on `box` (the destination's
   * box now) or the box measured at landing, showing `paint`'s surface (the
   * selected segment's).
   */
  private startPending(paint: HTMLElement | null, box?: Box): void {
    const pending = this.pending;
    this.pending = null;
    if (pending == null) {
      return;
    }
    const to = box ?? pending.box;
    const surface = this.carried?.hidden ?? paint ?? pending.destination;
    if (pending.isHeld) {
      this.moveLensTo(pending.destination, to, surface, pending.touchRelease);
    } else if (pending.from != null) {
      this.slideTo(
        pending.destination,
        to,
        pending.from,
        surface,
        pending.touchRelease,
      );
    }
  }

  /**
   * Aims the lens at `destination`'s box as it is now: a value adopted
   * after its click (mid-flight) moves the segments with its titles' new
   * weights.
   */
  private reaim(track: HTMLElement, destination: HTMLElement): void {
    const carried = this.carried;
    if (carried == null) {
      return;
    }
    const box = boxesIn(track)(destination);
    if (!isLaidOut(box) || isSameBox(box, carried.box)) {
      return;
    }
    this.moveLensTo(destination, box, carried.hidden, this.releasedByFinger);
  }

  /**
   * Binds the lens for `segment`, with `box` as its layout box and `paint`'s
   * surface, the selected segment's. It keeps what is on screen. With nothing
   * carried, it starts from `from`, a segment's resting box. Otherwise it
   * starts from the presented geometry, re-based onto the new box with its
   * velocities.
   */
  private carry(
    segment: HTMLElement,
    box: Box,
    from: Box | null,
    paint: HTMLElement,
  ): number | undefined {
    const track = this.track;
    if (track == null) {
      return undefined;
    }
    if (!this.isPresenting) {
      // Before the surface is borrowed: it must not fade out.
      this.stillTransitions();
    }
    const previous = this.carried;
    let start: MotionValues;
    // Motion already on screen continues from this instant; a start from
    // rest waits for the browser to commit it (the animator's rule).
    let at: number | undefined;
    this.velocity = {};
    if (previous != null) {
      at = this.now();
      const presented = this.presented(previous.box, at);
      start = {
        x: presented.center - center(box),
        scaleX: presented.width / box.width,
        scaleY: presented.height / box.height,
      };
      this.velocity = {
        x: this.animator.getVelocity('x', at),
        scaleX:
          (this.animator.getVelocity('scaleX', at) * previous.box.width) /
          box.width,
        scaleY:
          (this.animator.getVelocity('scaleY', at) * previous.box.height) /
          box.height,
      };
    } else {
      const origin = from ?? box;
      start = {
        x: center(origin) - center(box),
        scaleX: origin.width / box.width,
        scaleY: origin.height / box.height,
      };
    }
    if (previous?.hidden !== paint) {
      if (previous != null) {
        this.abandoned.add(previous.hidden);
      }
      // A segment abandoned mid-flight still has its surface hidden: read
      // its paint with it shown.
      if (this.abandoned.has(paint)) {
        showSurface(paint);
      }
      paintLayer(track, 'lens', paint);
      hideSurface(paint);
      this.abandoned.delete(paint);
    }
    placeLayer(track, 'lens', box);
    this.carried = {
      segment,
      box,
      hidden: paint,
      trackSize: {width: track.offsetWidth, height: track.offsetHeight},
    };
    // Opaque, whatever a Reduce Motion fade left.
    this.animator.set({...start, opacity: 1});
    return at;
  }

  /** Velocities captured by the last `carry`, in the new box's units. */
  private velocity: Partial<Record<'x' | 'scaleX' | 'scaleY', number>> = {};

  /** A spring transition that keeps the captured velocities of `values`. */
  private springFrom(
    values: MotionValues,
    kind: 'selection' | 'tracking',
  ): SpringTransition {
    const spring =
      kind === 'selection'
        ? segmentedControl.selectionSpring
        : springs.fingerTracking;
    const velocity: Record<string, number> = {};
    for (const key of Object.keys(values) as (keyof typeof this.velocity)[]) {
      const v = this.velocity[key];
      if (v != null && v !== 0) {
        velocity[key] = v;
      }
    }
    // A captured velocity is spent by the first call that drives its channel.
    this.velocity = Object.fromEntries(
      Object.entries(this.velocity).filter(([key]) => !(key in values)),
    );
    return Object.keys(velocity).length > 0 ? {spring, velocity} : {spring};
  }

  /**
   * The lens settles at its resting place on `segment`. Under a finger it
   * springs on the slide spring. Under a fine pointer it takes the theme's
   * duration and easing, as the segments' own transition does.
   */
  private settleLens(segment: HTMLElement, options: AnimateOptions): void {
    const rest = {x: 0, scaleX: 1, scaleY: 1} as const;
    if (this.isPresenting) {
      this.springLens(rest, this.springFrom(rest, 'selection'), options);
      return;
    }
    this.velocity = {};
    const timing = themeTimingOf(segment) ?? INSTANT;
    const at = options.at;
    this.trackHandle(
      this.animator.play(
        {
          x: timedCurve(this.animator.get('x', at), 0, timing),
          scaleX: timedCurve(this.animator.get('scaleX', at), 1, timing),
          scaleY: timedCurve(this.animator.get('scaleY', at), 1, timing),
        },
        options,
      ),
    );
  }

  /** Springs the lens toward `values`. */
  private springLens(
    values: MotionValues,
    transition: SpringTransition,
    options?: AnimateOptions,
  ): void {
    this.trackHandle(this.animator.animate(values, transition, options));
  }

  /** The lens's presented center and size, from the animator. */
  private presented(
    box: Box,
    at: number,
  ): {center: number; width: number; height: number} {
    return {
      center: center(box) + this.animator.get('x', at),
      width: box.width * this.animator.get('scaleX', at),
      height: box.height * this.animator.get('scaleY', at),
    };
  }

  /**
   * The lens settles on `segment`, at its resting size. Under Reduced Motion
   * a finger's release (`touchRelease`) cross-fades on any primary pointer. A
   * mouse's or a pen's lands at once under a fine one.
   */
  private moveLensTo(
    segment: HTMLElement,
    box: Box,
    paint: HTMLElement,
    touchRelease: boolean,
  ): void {
    this.isHeld = false;
    if (!isLaidOut(box)) {
      this.settle();
      return;
    }
    if (this.animator.reducedMotion({touchRelease}) !== 'off') {
      this.crossFadeTo(
        segment,
        box,
        null,
        this.carried?.hidden ?? paint,
        touchRelease,
      );
      return;
    }
    const at = this.carry(segment, box, null, this.carried?.hidden ?? paint);
    this.settleLens(segment, {at});
  }

  /**
   * A tap's slide: from `from` to `segment` on the slide spring. Under Reduced
   * Motion there is no travel, and a finger's tap (`touchRelease`) fades.
   */
  private slideTo(
    segment: HTMLElement,
    box: Box,
    from: Box,
    paint: HTMLElement,
    touchRelease: boolean,
  ): void {
    if (!isLaidOut(box)) {
      this.settle();
      return;
    }
    if (this.animator.reducedMotion({touchRelease}) !== 'off') {
      this.crossFadeTo(
        segment,
        box,
        this.carried == null ? from : null,
        this.carried?.hidden ?? paint,
        touchRelease,
      );
      return;
    }
    const at = this.carry(
      segment,
      box,
      this.carried == null ? from : null,
      this.carried?.hidden ?? paint,
    );
    this.settleLens(segment, {at});
  }

  /**
   * Under Reduced Motion, the lens lands on `segment` and fades in there, as
   * an animator entrance. The surface on screen fades out in place on the
   * same clock. That surface is the lens when it was carried, else `from`'s
   * resting surface. The animator decides whether anything fades. On a fine
   * pointer, both change at once unless a touch released the change
   * (`touchRelease`).
   */
  private crossFadeTo(
    segment: HTMLElement,
    box: Box,
    from: Box | null,
    paint: HTMLElement,
    touchRelease: boolean,
  ): void {
    const track = this.track;
    if (track == null) {
      return;
    }
    // What is on screen before the lens is rebound.
    let leaving: Box | null = null;
    let opacity = 1;
    const previous = this.carried;
    if (previous != null) {
      const now = this.now();
      const presented = this.presented(previous.box, now);
      leaving = {
        x: presented.center - presented.width / 2,
        y: previous.box.y,
        width: presented.width,
        height: previous.box.height,
      };
      opacity = this.animator.get('opacity', now);
    } else if (from != null) {
      leaving = from;
    }
    this.isHeld = false;
    this.endLeaving();
    this.after.stop();
    clearLayer(track, 'after');
    this.isLeavingShown = false;
    const fades =
      leaving != null &&
      opacity > 0 &&
      this.animator.reducedMotion({touchRelease}) === 'crossfade';
    if (fades) {
      this.leave(track, previous != null, paint, leaving as Box, opacity, box);
    }
    const at = this.carry(segment, box, from, paint);
    this.velocity = {};
    this.trackHandle(
      this.animator.animate(
        {x: 0, scaleX: 1, scaleY: 1},
        {spring: segmentedControl.selectionSpring},
        {at, crossfadeAs: 'entrance', touchRelease},
      ),
    );
    if (fades) {
      this.fadeLeaving(box, leaving as Box, at, touchRelease);
    }
  }

  /**
   * Paints the ::after with the surface on screen (the lens's paint, or
   * `paint`'s resting surface) where it is (`from`, at `opacity`).
   */
  private leave(
    track: HTMLElement,
    fromLens: boolean,
    paint: HTMLElement,
    from: Box,
    opacity: number,
    box: Box,
  ): void {
    if (fromLens) {
      copyLensPaint(track);
    } else {
      paintLayer(track, 'after', paint);
    }
    placeLayer(track, 'after', {...from, y: box.y, height: box.height});
    this.isLeavingShown = true;
    this.after.set({x: 0, scaleX: 1, scaleY: 1, opacity});
  }

  /**
   * The ::after fades out in place while the lens fades in on `box`. As a
   * leaving travel, it fades on the animator's Reduce Motion clock. It lands
   * only once it is invisible.
   */
  private fadeLeaving(
    box: Box,
    from: Box,
    at: number | undefined,
    touchRelease: boolean,
  ): void {
    const id = ++this.leaving;
    const handle = this.after.animate(
      {x: center(box) - center(from), opacity: 0},
      {spring: segmentedControl.selectionSpring},
      {at, touchRelease},
    );
    void handle.finished.then(() => {
      if (this.leaving === id) {
        this.endLeaving();
      }
    });
  }

  private endLeaving(): void {
    if (!this.isLeavingShown) {
      return;
    }
    this.isLeavingShown = false;
    this.leaving++;
    this.after.stop();
    if (this.track != null) {
      clearLayer(this.track, 'after');
    }
  }

  /**
   * Waits for `handle`; the surface goes back when nothing is left. A
   * touch's value still waiting to come back when the motion settles goes
   * back instead: the settled slide bounds the wait.
   */
  private trackHandle(handle: MotionHandle): void {
    this.running.add(handle);
    void handle.finished.then(() => {
      this.running.delete(handle);
      if (this.running.size > 0 || this.isHeld || this.touch != null) {
        return;
      }
      const committed = this.committed;
      if (this.isAwaitingValue && committed != null && this.track != null) {
        this.decline(this.track, committed);
        return;
      }
      if (this.committed == null) {
        this.settle();
      }
    });
  }

  /**
   * Gives `segment`'s title the selected face and the selected segment's
   * title an unselected one (none for null or the selected segment), at once.
   */
  private showFaceAt(segment: HTMLElement | null): void {
    const touch = this.touch;
    const selected = touch?.origin ?? null;
    if (segment === this.facedSegment) {
      return;
    }
    this.clearFaces();
    if (
      touch?.faces == null ||
      selected == null ||
      segment == null ||
      segment === selected
    ) {
      return;
    }
    const title = titleOf(segment);
    const selectedTitle = titleOf(selected);
    if (title == null || selectedTitle == null) {
      return;
    }
    this.wearFace(title, touch.faces.selected);
    this.wearFace(selectedTitle, touch.faces.unselected);
    this.facedSegment = segment;
  }

  /**
   * Mid-drag, the face is the color alone. A weight swap changes the titles'
   * widths, which moves the segments under the finger and shakes the
   * boundary. The commit's own styles give the new weight at the lift.
   */
  private wearFace(title: HTMLElement, face: TitleFace): void {
    title.style.color = face.color;
    this.faceOverrides.add(title);
  }

  /** Every title back to its own face. */
  private clearFaces(): void {
    for (const title of this.faceOverrides) {
      title.style.removeProperty('color');
    }
    this.faceOverrides.clear();
    this.facedSegment = null;
  }
}

/**
 * Wires `SegmentedSelectionMotion` to a SegmentedControl. While enabled,
 * every change of `value` slides the selection in the commit that shows the
 * new value, so no frame shows it unanimated. A press drives the lens while
 * `isTracking`.
 */
export function useSegmentedSelectionMotion(
  trackRef: RefObject<HTMLElement | null>,
  value: string,
  isPresenting: boolean,
  isTracking: boolean,
): {
  readonly selection: SegmentedSelection;
  /** The radiogroup's callback ref: it attaches the animators to the node. */
  readonly attachTrack: RefCallback<HTMLElement>;
} {
  const [motion] = useState(() => new SegmentedSelectionMotion());
  const previousValueRef = useRef(value);
  // The lens is the radiogroup's own pseudo-elements. The animators attach to
  // it while the touch presentation applies or while a press can drag it,
  // which any pointer can.
  const isEnabled = isPresenting || isTracking;

  // Syncs the lens animators with the pointer presentation: a flip hands any
  // motion in flight back.
  useIsomorphicLayoutEffect(() => {
    motion.present(isPresenting);
  }, [isPresenting, motion]);

  useIsomorphicLayoutEffect(() => {
    const from = previousValueRef.current;
    previousValueRef.current = value;
    const track = trackRef.current;
    if (!isEnabled || track == null || from === value) {
      return;
    }
    motion.select(track, from, value);
  }, [isEnabled, motion, trackRef, value]);

  // Stops the animators that drive the radiogroup's pseudo-elements.
  useEffect(() => () => motion.stop(), [motion]);

  // Every pointer's press is tracked. The lift commits the segment nearest
  // the pointer, through that segment's click.
  const clickWait = useSegmentedTouchTracking(trackRef, motion, isTracking);

  // The animators attach to the radiogroup while enabled. The lens aims at
  // boxes measured when its motion began, so a resize hands the surface back.
  const attachTrack = useCallback(
    (track: HTMLElement | null) => {
      if (track == null || !isEnabled) {
        return undefined;
      }
      motion.attachTrack(track);
      const unobserve = observeResize(track, () => motion.resized(track));
      return () => {
        unobserve();
        motion.settle();
        motion.attachTrack(null);
      };
    },
    [isEnabled, motion],
  );

  const [selection] = useState<SegmentedSelection>(() => ({
    isPressing: () => motion.isPressed || clickWait.isAwaiting(),
    keyPressed: clickWait.end,
  }));
  return {selection, attachTrack};
}
