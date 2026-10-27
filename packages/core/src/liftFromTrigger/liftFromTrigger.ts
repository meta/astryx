// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file liftFromTrigger.ts
 * @input An element to lift (the source) and, beside it, a surface that
 *   grows out of the press (a menu's popover); the caller's springs, scale
 *   rule and tint; the rect morph
 *   (motion/rectMorph.ts); the layer runtime's input hold, exit copy,
 *   viewport gutter and declared inset
 * @output Exports createLiftFromTrigger: lift a source out of the page above a tinted
 *   backdrop, grow a surface out of the press beside it, shrink the surface
 *   back into the press, and return the source to its place; and liftCopy:
 *   a copy of a source's picture in a viewer's host, for a zoom
 * @position The one lift-from-trigger presentation, internal to core and
 *   opt-in: only a surface that chooses it uses it (ContextMenu's touch
 *   invocation; a viewer's zoom from a thumbnail). Layer stays generic: the
 *   top layer, dismissal, the input hold and the shared exit copy are its;
 *   this module only uses them
 *
 * UIKit's context menu lifts the long-pressed view out of the page: it grows
 * on from the size the press gave it to its lifted size, a shadow rising
 * under it, above a backdrop that tints the page; the menu grows out of the
 * finger beside it, and when the menu closes it shrinks back into the finger
 * while the view returns to its place and the backdrop clears.
 *
 * Here the source itself lifts, not a copy: it becomes a manual popover in
 * the top layer, laid out at its own size where it stood, so no clipping,
 * transformed or stacking ancestor cuts or covers it, while one empty
 * placeholder holds its spot in the page, which does not move. What the
 * browser's popover style would change (border, padding, colors, overflow) is
 * kept as it was laid out, and the source takes no hits while lifted (a tap
 * on it is a tap on the backdrop). Inheritance follows the DOM, so the page's
 * theme still reaches it. The placeholder goes after the source, so the
 * source keeps its place among its siblings; in a list it is an `li` that
 * is not a list item, so the list stays valid and keeps its numbers. The tint is the `::backdrop` of
 * a lift layer at the end of the body that covers the viewport and takes the
 * page's touches (its color and the gutter's spacing resolved where the
 * source is); the shadow is a box in the layer that follows the source on a
 * rect morph of its own (an animated `::backdrop` of the source would
 * restyle and lay out the page on every frame). The layer also holds an empty box
 * at the lifted rect for a surface to be placed against: anchor positioning
 * follows transforms, so a box inside the source would move with it. Nothing
 * of the lift is in the DOM at rest; while lifted it adds four elements, the
 * layer, the shadow, the box and the placeholder
 * (`architecture:component-style-authoring` INV7, `spec:AST-017` FR60), and
 * its close plays on the layer runtime's one exit copy
 * (`placeLayerExitCopy`).
 *
 * A zoom from a thumbnail into a viewer lifts a copy instead
 * (`architecture:layer-runtime` INV15's clone): the copy has to show between
 * the viewer's backdrop and its photo, which a source in the top layer cannot
 * (it would cover the whole viewer, or sit under its backdrop). liftCopy puts
 * one copy of the source's picture in the viewer's host at the source's box,
 * inert and hidden from assistive technology, and hides the source where it
 * stands (it keeps its layout, so no placeholder); the viewer moves the copy
 * on the rect morph, which turns an interrupted motion around from the rect
 * on screen, and a drop shows the source again and takes the copy away.
 *
 * Every motion is `translate`, `scale` or `opacity` on the compositor
 * (spec:AST-094 FR5): the source and the surface on the rect morph, which
 * interrupts itself with the velocity on screen (FR6), the shadow on one of
 * its own along the same path; the tint as a spring-sampled Web Animation of
 * the layer's `::backdrop`. A tap or
 * a drag that lands while the lift and the surface grow reaches nothing
 * (the input hold, FR35); the close holds the layer until the source
 * is back, the surface's exit is done and every press on the layer has
 * lifted. Its timers and document listeners end with it (FR24). Reduce
 * Motion is the animator's (design:reduced-motion): opacity only.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/liftFromTrigger/liftFromTrigger.test.ts
 * - /packages/core/src/liftFromTrigger/__tests__/liftFromTrigger.interaction.browser.spec.ts
 */

import type {LayerInset} from '../Layer/LayerContext';
import {placeLayerExitCopy} from '../Layer/layerExitCopy';
import {layerInsetProperties} from '../Layer/layerInset';
import {layerViewportInset} from '../Layer/layerViewportInset.stylex';
import {holdInput} from '../Layer/inputHold';
import type {MotionHandle} from '../motion/animator';
import {progressCurve} from '../motion/progress';
import {
  createRectMorph,
  lerpPath,
  type MorphPath,
  type MorphRect,
  type RectMorph,
} from '../motion/rectMorph';
import {reducedMotionFade} from '../motion/reducedMotion';
import {resolveMotion} from '../motion/resolveMotion';
import {
  SETTLING_EPSILON,
  solveSpring,
  toSpring,
  type SpringDescription,
} from '../motion/spring';
import {
  liftFromTriggerRect,
  type LiftFromTriggerScaleRule,
  type LiftFromTriggerViewport,
} from './liftFromTriggerGeometry';

/**
 * How long the layer waits, once the last pointer that went down on it has
 * lifted, for that touch's click before it hides anyway (a long press sends
 * none).
 */
const CLICK_AFTER_LIFT_MS = 350;

/** The springs of a lift: the caller's. */
export interface LiftFromTriggerMotion {
  /** The source grows to its lifted rect on it, and the tint fades in. */
  readonly lift: SpringDescription;
  /** The source returns to its place on it. */
  readonly drop: SpringDescription;
  /** The tint clears on it. */
  readonly clear: SpringDescription;
  /** The shadow rises on it. */
  readonly shadowIn: SpringDescription;
  /** The shadow fades on it. */
  readonly shadowOut: SpringDescription;
  /** A surface grows out of the press on it. */
  readonly surfaceIn: SpringDescription;
  /** A surface shrinks back into the press on it. */
  readonly surfaceOut: SpringDescription;
}

export interface LiftFromTriggerOptions {
  readonly motion: LiftFromTriggerMotion;
  /** How far the source grows. */
  readonly scale: LiftFromTriggerScaleRule;
  /**
   * The width a surface grows out of, centered on the press (its height
   * keeps the surface's aspect); a point by default.
   */
  readonly surfaceStartWidth?: number;
  /**
   * The rect the source grows on from, viewport px: where a press feedback
   * left it. Its box as laid out by default.
   */
  readonly from?: MorphRect;
  /**
   * Called once the lift has read the page and before it writes to it: lets
   * go of what the source was doing (a press feedback's scale), so letting go
   * doesn't restyle the page before the lift reads it.
   */
  readonly release?: () => void;
  /** The tint, a CSS color resolved where the source is. */
  readonly tint?: string;
  /** The shadow under the lifted source, a CSS box shadow. */
  readonly shadow?: string;
  /** The inset an app declares for a bar over an edge (LayerProvider). */
  readonly inset?: LayerInset;
  /** A finger lifted on the backdrop where it went down. */
  readonly onBackdropTap?: () => void;
  /**
   * Marks the lift's elements: the layer, its placeholder
   * (`<attribute>-placeholder`) and a surface's exit copy
   * (`<attribute>-exit`).
   */
  readonly attribute?: string;
}

/** Where a lift landed. */
export interface LiftFromTriggerResult {
  /** The source's box as laid out, viewport px. */
  readonly source: MorphRect;
  /** The rect it lands on. */
  readonly lifted: MorphRect;
  /** The viewport and the layer runtime's gutter it lifted in. */
  readonly viewport: LiftFromTriggerViewport;
  /**
   * An empty box at the lifted rect, in the layer: what a surface is placed
   * against (an anchor inside the source would move with the source's
   * transform, which anchor positioning follows).
   */
  readonly anchor: HTMLElement;
}

export interface LiftFromTrigger {
  /**
   * Lifts `source`: returns where it lands, or null without the popover API
   * (nothing changes then). A lift already up ends at once.
   */
  lift(
    source: HTMLElement,
    options: LiftFromTriggerOptions,
  ): LiftFromTriggerResult | null;
  /**
   * Grows `surface` (a popover laid out at rest, or an element inside one)
   * out of `press` (client px) into its box, or, without a press, fades it
   * in where it rests; and holds the lift until the lift and the surface
   * settle (spec:AST-094 FR35). A no-op when nothing is lifted.
   */
  presentSurface(
    surface: HTMLElement,
    press?: {x: number; y: number} | null,
  ): void;
  /**
   * The surface is closing: its exit copy shrinks back into the press from
   * wherever it stands. Call it while the surface still shows.
   */
  dismissSurface(surface: HTMLElement): void;
  /** Returns the source to its place; the layer leaves once it is back. */
  drop(): void;
  /** Ends everything at once and leaves the page as it was. */
  dispose(): void;
  /** Whether a source is lifted. */
  isLifted(): boolean;
}

/** Where a copy goes, and how it is marked. */
export interface LiftCopyOptions {
  /**
   * The element the copy goes in (a viewer's container): positioned, so the
   * copy is laid out against its box; its stacking decides what the copy
   * shows over and under.
   */
  readonly host: HTMLElement;
  /** The picture for a source that shows none. */
  readonly src?: string;
  /** Marks the copy. @default 'data-astryx-lift-copy' */
  readonly attribute?: string;
}

/** A copy of a source's picture, lifted into a host while the source hides. */
export interface LiftedCopy {
  /**
   * The copy: an image in the host, laid out at the source's box (aspect
   * fill, its corners), inert and hidden from assistive technology. Move it
   * on the rect morph (`createRectMorph(copy.element)`).
   */
  readonly element: HTMLImageElement;
  /** The source's box, client px, where the copy is laid out. */
  readonly box: MorphRect;
  /**
   * Takes the copy away and shows the source again, as it was, once the last
   * copy of it drops: at the landing, or on unmount (nothing is left either
   * way). A second call does nothing.
   */
  drop(): void;
}

type SavedStyle = [property: string, value: string, priority: string][];

interface LiftedSurface {
  readonly element: HTMLElement;
  readonly morph: RectMorph;
  readonly path: MorphPath;
  readonly press: {x: number; y: number};
  presenting: MotionHandle | null;
  dismissing: MotionHandle | null;
}

interface LiftState {
  readonly generation: number;
  readonly options: LiftFromTriggerOptions;
  /** The springs, resolved where the source is at the lift. */
  readonly motion: LiftFromTriggerMotion;
  readonly attribute: string;
  readonly source: HTMLElement;
  readonly sourceRect: MorphRect;
  readonly lifted: MorphRect;
  readonly layer: HTMLElement;
  readonly placeholder: HTMLElement | null;
  readonly saved: SavedStyle;
  readonly transition: [value: string, priority: string];
  readonly morph: RectMorph;
  readonly growing: MotionHandle;
  /** The tint's color, held on the layer's `::backdrop`. */
  readonly layerFill: Animation | null;
  /**
   * The shadow under the source: a box in the layer laid out where the
   * source is, which follows it frame for frame and fades on its own spring.
   */
  readonly shadow: HTMLElement;
  shadowAnimation: Animation | null;
  /**
   * Holds the source morph's clock at one instant (null lets it run), so the
   * shadow reads the motion at the very moment the morph does.
   */
  readonly holdClock: (at: number | null) => void;
  /** The layer's own waits and listeners, released with it (FR24). */
  readonly waits: AbortController;
  untilPointersLift: () => Promise<void>;
  tint: Animation | null;
  surface: LiftedSurface | null;
  releaseGrowHold: (() => void) | null;
  releaseHold: (() => void) | null;
  isSourceLifted: boolean;
}

const px = (value: string | undefined) => Number.parseFloat(value ?? '') || 0;

/**
 * Sets `values` on `element` inline, `!important`, recording what was there
 * for `restore`.
 */
function setInline(
  element: HTMLElement,
  values: Record<string, string>,
  saved: SavedStyle,
): void {
  for (const [property, value] of Object.entries(values)) {
    saved.push([
      property,
      element.style.getPropertyValue(property),
      element.style.getPropertyPriority(property),
    ]);
    element.style.setProperty(property, value, 'important');
  }
}

function restore(element: HTMLElement, saved: SavedStyle): void {
  for (let i = saved.length - 1; i >= 0; i--) {
    const [property, value, priority] = saved[i];
    if (value === '') {
      element.style.removeProperty(property);
    } else {
      element.style.setProperty(property, value, priority);
    }
  }
}

/** Web Animation keyframes along `spring` from 0 to 1, sampled at 60 Hz. */
function springKeyframes(
  element: Element,
  spring: SpringDescription,
  frame: (progress: number) => Keyframe,
): {keyframes: Keyframe[]; duration: number} {
  const curve = solveSpring(toSpring(resolveMotion(element, spring)), {
    from: 0,
    to: 1,
  });
  const seconds = Math.max(curve.settleTime(SETTLING_EPSILON), 1 / 60);
  const steps = Math.max(2, Math.ceil(seconds * 60));
  const keyframes: Keyframe[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * seconds;
    keyframes.push({
      ...frame(i === steps ? 1 : curve.value(t)),
      offset: i / steps,
    });
  }
  return {keyframes, duration: seconds * 1000};
}

/**
 * Web Animation keyframes for a box laid out on `box` that travels from
 * `from` to `to` on `travel` (starting with progress velocity `velocity`, as
 * the rect morph does) while its opacity goes from `fade[0]` to `fade[1]` on
 * `fadeSpring`, sampled at 60 Hz until both settle: one compositor animation
 * of `transform` and `opacity`, frame for frame with the source's own morph.
 */
function shadowKeyframes(
  box: MorphRect,
  from: MorphRect,
  to: MorphRect,
  travel: SpringDescription | null,
  fade: readonly [number, number],
  fadeSpring: SpringDescription,
  velocity = 0,
): {keyframes: Keyframe[]; duration: number} {
  const move = travel == null ? null : progressCurve(travel, {velocity});
  const opacity = progressCurve(fadeSpring);
  const seconds = Math.max(move?.duration ?? 0, opacity.duration, 1 / 60);
  const steps = Math.max(2, Math.ceil(seconds * 60));
  const keyframes: Keyframe[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * seconds;
    const p = i === steps || move == null ? 1 : move.at(t);
    const q = i === steps ? 1 : opacity.at(t);
    const rect = {
      x: from.x + (to.x - from.x) * p,
      y: from.y + (to.y - from.y) * p,
      width: from.width + (to.width - from.width) * p,
    };
    const scale = box.width > 0 ? rect.width / box.width : 1;
    keyframes.push({
      transform: `translate(${(rect.x - box.x).toFixed(3)}px, ${(rect.y - box.y).toFixed(3)}px) scale(${scale.toFixed(5)})`,
      opacity: String(
        Math.min(Math.max(fade[0] + (fade[1] - fade[0]) * q, 0), 1),
      ),
      offset: i / steps,
    });
  }
  return {keyframes, duration: seconds * 1000};
}

/** Plays `keyframes` on `element`, or only their ends under Reduce Motion. */
function playShadow(
  element: HTMLElement,
  {keyframes, duration}: {keyframes: Keyframe[]; duration: number},
  reduced: ReturnType<typeof reducedMotionFade>,
): Animation | null {
  if (typeof element.animate !== 'function') {
    return null;
  }
  return element.animate(
    reduced == null
      ? keyframes
      : [keyframes[0], keyframes[keyframes.length - 1]],
    {
      duration: reduced?.duration ?? duration,
      easing: reduced?.easing ?? 'linear',
      fill: 'forwards',
    },
  );
}

/**
 * The radius of the shape `source` shows: its own, or that of its only
 * element child when that child fills it.
 */
function shapeRadius(source: HTMLElement): string {
  const view = source.ownerDocument.defaultView;
  const own = view?.getComputedStyle(source).borderRadius ?? '';
  if (px(own) > 0 || source.children.length === 0) {
    return own;
  }
  const outer = source.getBoundingClientRect();
  for (const child of source.children) {
    const inner = child.getBoundingClientRect();
    if (
      Math.abs(inner.width - outer.width) <= 1 &&
      Math.abs(inner.height - outer.height) <= 1
    ) {
      return view?.getComputedStyle(child).borderRadius ?? own;
    }
  }
  return own;
}

/**
 * Resolves CSS values where `element` is (its theme, its color scheme): on an
 * empty, undisplayed child it removes again, so the element's own style and
 * the page's layout stay as they were. A pair is a fallback and a value a
 * browser may reject.
 */
function probe(
  element: HTMLElement,
  values: Record<string, string | readonly [fallback: string, value: string]>,
): Record<string, string> {
  const doc = element.ownerDocument;
  const child = doc.createElement('span');
  child.style.setProperty('display', 'none');
  for (const [property, value] of Object.entries(values)) {
    if (typeof value === 'string') {
      child.style.setProperty(property, value);
    } else {
      child.style.setProperty(property, value[0]);
      child.style.setProperty(property, value[1]);
    }
  }
  element.append(child);
  const style = doc.defaultView?.getComputedStyle(child);
  const resolved: Record<string, string> = {};
  for (const property of Object.keys(values)) {
    resolved[property] = style?.getPropertyValue(property) ?? '';
  }
  child.remove();
  return resolved;
}

/**
 * The lift's springs as they resolve at `element` (a spring that is a motion
 * role, through its role), read once: plain springs, which nothing reads
 * from the page again.
 */
function resolvedMotion(
  element: Element,
  motion: LiftFromTriggerMotion,
): LiftFromTriggerMotion {
  const resolve = (spring: SpringDescription): SpringDescription => ({
    ...resolveMotion(element, spring),
  });
  return {
    lift: resolve(motion.lift),
    drop: resolve(motion.drop),
    clear: resolve(motion.clear),
    shadowIn: resolve(motion.shadowIn),
    shadowOut: resolve(motion.shadowOut),
    surfaceIn: resolve(motion.surfaceIn),
    surfaceOut: resolve(motion.surfaceOut),
  };
}

/** Plays `keyframes` on `element`'s `::backdrop`, holding the end. */
function animateBackdrop(
  element: HTMLElement,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): Animation | null {
  if (typeof element.animate !== 'function') {
    return null;
  }
  try {
    return element.animate(keyframes, {
      fill: 'forwards',
      ...options,
      pseudoElement: '::backdrop',
    });
  } catch {
    // No `::backdrop` animations: the lift shows without its decoration.
    return null;
  }
}

/** The `::backdrop` opacity `element` shows now, or `fallback`. */
function backdropOpacity(element: HTMLElement, fallback: number): number {
  try {
    const shown = Number.parseFloat(
      getComputedStyle(element, '::backdrop').opacity,
    );
    return Number.isFinite(shown) ? shown : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Fades `element`'s `::backdrop` to `to` on `spring`, from `from` or what it
 * shows; `reduced` is the Reduce Motion fade when read already. Opacity
 * alone, so the compositor plays it.
 */
function fadeBackdrop(
  element: HTMLElement,
  to: number,
  spring: SpringDescription,
  {
    from = backdropOpacity(element, to === 1 ? 0 : 1),
    reduced = reducedMotionFade(element),
  }: {from?: number; reduced?: ReturnType<typeof reducedMotionFade>} = {},
): Animation | null {
  if (reduced != null) {
    return animateBackdrop(
      element,
      [{opacity: String(from)}, {opacity: String(to)}],
      {duration: reduced.duration, easing: reduced.easing},
    );
  }
  const {keyframes, duration} = springKeyframes(element, spring, p => ({
    opacity: String(from + (to - from) * p),
  }));
  return animateBackdrop(element, keyframes, {duration});
}

/**
 * The lift layer: covers the viewport from the top layer and takes the
 * page's touches while the source is up; its `::backdrop` is the tint.
 */
function createLayer(doc: Document, attribute: string): HTMLElement {
  const layer = doc.createElement('span');
  layer.setAttribute('popover', 'manual');
  layer.setAttribute('aria-hidden', 'true');
  layer.setAttribute(attribute, '');
  Object.assign(layer.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    maxWidth: 'none',
    maxHeight: 'none',
    margin: '0',
    padding: '0',
    border: '0',
    backgroundColor: 'transparent',
    color: 'inherit',
    overflow: 'visible',
    pointerEvents: 'auto',
    touchAction: 'none',
  });
  return layer;
}

/**
 * The element that holds a source's spot: an `li` in a list, so the list
 * keeps only `li` children (HTML's content model for `ul`, `ol` and `menu`),
 * and a `span` elsewhere.
 */
function placeholderTag(source: HTMLElement): 'li' | 'span' {
  const parent = source.parentElement?.localName;
  return parent === 'ul' || parent === 'ol' || parent === 'menu'
    ? 'li'
    : 'span';
}

/**
 * The placeholder that holds a source's spot in the page while it is lifted:
 * empty, hidden, at its laid-out size, with its margins and its place in a
 * flex or grid container. It is never a list item itself, so it takes no
 * number and the items after it keep theirs, and the page's own rules for
 * its tag (an `li`'s minimum height, its padding) never change its size.
 */
function placeholderStyle(
  computed: CSSStyleDeclaration,
  box: MorphRect,
): Partial<CSSStyleDeclaration> {
  const shown = computed.getPropertyValue('display');
  const display =
    shown === 'inline'
      ? 'inline-block'
      : shown === 'contents' || shown === 'none'
        ? 'block'
        : shown.includes('list-item')
          ? shown.includes('inline')
            ? 'inline-block'
            : 'block'
          : shown;
  return {
    display,
    boxSizing: 'border-box',
    width: `${box.width}px`,
    height: `${box.height}px`,
    minWidth: '0',
    minHeight: '0',
    maxWidth: 'none',
    maxHeight: 'none',
    padding: '0',
    border: '0',
    marginTop: computed.marginTop,
    marginRight: computed.marginRight,
    marginBottom: computed.marginBottom,
    marginLeft: computed.marginLeft,
    flexGrow: computed.flexGrow,
    flexShrink: computed.flexShrink,
    flexBasis: computed.flexBasis,
    alignSelf: computed.alignSelf,
    justifySelf: computed.justifySelf,
    order: computed.order,
    gridRowStart: computed.gridRowStart,
    gridRowEnd: computed.gridRowEnd,
    gridColumnStart: computed.gridColumnStart,
    gridColumnEnd: computed.gridColumnEnd,
    cssFloat: computed.cssFloat,
    verticalAlign: computed.verticalAlign,
    visibility: 'hidden',
    pointerEvents: 'none',
  };
}

/** The properties the browser's popover style sets, kept as laid out. */
const KEPT_PROPERTIES = [
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
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'color',
  'background-color',
  'overflow-x',
  'overflow-y',
] as const;

/** Creates a lift; one per component that offers it. */
export function createLiftFromTrigger(): LiftFromTrigger {
  let state: LiftState | null = null;
  let generation = 0;

  const releaseGrowHold = (current: LiftState) => {
    current.releaseGrowHold?.();
    current.releaseGrowHold = null;
  };

  // Puts the source back in the page as it was laid out.
  const settleSource = (current: LiftState) => {
    if (!current.isSourceLifted) {
      return;
    }
    current.isSourceLifted = false;
    const {source} = current;
    current.shadowAnimation?.cancel();
    current.shadowAnimation = null;
    current.morph.dispose();
    if (source.matches(':popover-open')) {
      source.hidePopover();
    }
    source.removeAttribute('popover');
    restore(source, current.saved);
    current.placeholder?.remove();
    // The restored values apply before the source's own transitions return,
    // so none of them animates.
    void source.ownerDocument.defaultView?.getComputedStyle(source).width;
    const [value, priority] = current.transition;
    if (value === '') {
      source.style.removeProperty('transition');
    } else {
      source.style.setProperty('transition', value, priority);
    }
  };

  const endSurface = (current: LiftState) => {
    const surface = current.surface;
    current.surface = null;
    surface?.morph.dispose();
  };

  const hideLayer = (current: LiftState) => {
    releaseGrowHold(current);
    current.releaseHold?.();
    current.releaseHold = null;
    current.waits.abort();
    current.tint?.cancel();
    current.tint = null;
    current.layerFill?.cancel();
    const {layer} = current;
    if (layer.matches(':popover-open')) {
      layer.hidePopover();
    }
    layer.remove();
  };

  const end = (current: LiftState) => {
    endSurface(current);
    settleSource(current);
    hideLayer(current);
    if (state === current) {
      state = null;
    }
  };

  // Every pointer that went down on the layer and is still down (the tint
  // while it presents, the hold's shield while it closes), read from the
  // document so an inert target hides none; and whether the last one to lift
  // still owes its click (a touch's click comes after its pointer's up).
  const watchPointers = (current: LiftState) => {
    const {layer, waits} = current;
    const doc = layer.ownerDocument;
    const pointers = new Set<number>();
    let isClickPending = false;
    const options = {capture: true, signal: waits.signal};
    doc.addEventListener(
      'pointerdown',
      event => {
        if (event.composedPath().includes(layer)) {
          pointers.add(event.pointerId);
        }
      },
      options,
    );
    const up = (event: PointerEvent) => {
      if (pointers.delete(event.pointerId) && event.type === 'pointerup') {
        isClickPending = true;
      }
    };
    doc.addEventListener('pointerup', up, options);
    doc.addEventListener('pointercancel', up, options);
    doc.addEventListener(
      'click',
      () => {
        isClickPending = false;
      },
      options,
    );
    // Settles once no pointer is down on the layer and the last one's click
    // has landed too, or shortly after (a long press sends none).
    return async (): Promise<void> =>
      new Promise(resolve => {
        const wait = () => {
          if (waits.signal.aborted) {
            return;
          }
          if (pointers.size > 0) {
            const lifted = () => {
              if (pointers.size > 0) {
                return;
              }
              doc.removeEventListener('pointerup', lifted, true);
              doc.removeEventListener('pointercancel', lifted, true);
              wait();
            };
            doc.addEventListener('pointerup', lifted, options);
            doc.addEventListener('pointercancel', lifted, options);
            return;
          }
          if (!isClickPending) {
            resolve();
            return;
          }
          const timer = setTimeout(finish, CLICK_AFTER_LIFT_MS);
          waits.signal.addEventListener('abort', () => clearTimeout(timer), {
            once: true,
          });
          function finish() {
            doc.removeEventListener('click', finish, true);
            clearTimeout(timer);
            isClickPending = false;
            wait();
          }
          doc.addEventListener('click', finish, options);
        };
        wait();
      });
  };

  const lift = (
    source: HTMLElement,
    options: LiftFromTriggerOptions,
  ): LiftFromTriggerResult | null => {
    if (state != null) {
      end(state);
    }
    if (typeof source.showPopover !== 'function' || !source.isConnected) {
      return null;
    }
    const attribute = options.attribute ?? 'data-astryx-lift';
    const doc = source.ownerDocument;
    const view = doc.defaultView;
    const computed = view?.getComputedStyle(source);
    if (computed == null) {
      return null;
    }
    // The lift reads everything before it writes to the page, so the page
    // restyles and lays out once for it.
    // The source as laid out (a scale on it, the press feedback's, is about
    // its center).
    const shown = source.getBoundingClientRect();
    const width = source.offsetWidth || shown.width;
    const height = source.offsetHeight || shown.height;
    const sourceRect: MorphRect = {
      x: shown.left + (shown.width - width) / 2,
      y: shown.top + (shown.height - height) / 2,
      width,
      height,
    };
    const from = options.from ?? sourceRect;
    // What it keeps of its look and its layout.
    const kept: Record<string, string> = {};
    for (const property of KEPT_PROPERTIES) {
      kept[property] = computed.getPropertyValue(property);
    }
    const isInFlow =
      computed.position !== 'absolute' && computed.position !== 'fixed';
    const placeholderValues = isInFlow
      ? placeholderStyle(computed, sourceRect)
      : null;
    const direction = computed.direction === 'rtl' ? 'rtl' : 'ltr';
    const radius = shapeRadius(source);
    const motion = resolvedMotion(source, options.motion);
    const reduced = reducedMotionFade(source);
    // The tint, the shadow and the layer runtime's gutter (spec:AST-059,
    // with the inset an app declares), resolved where the source is.
    const probed = probe(source, {
      ...Object.fromEntries(
        Object.entries(layerInsetProperties(options.inset)).map(
          ([property, value]) => [property, String(value)],
        ),
      ),
      'background-color': options.tint ?? 'var(--color-overlay)',
      'box-shadow': options.shadow ?? 'var(--shadow-high)',
      'padding-top': [
        `calc(${layerViewportInset.gutterBlockStartFallback})`,
        `calc(${layerViewportInset.gutterBlockStart})`,
      ],
      'padding-bottom': [
        `calc(${layerViewportInset.gutterBlockEndFallback})`,
        `calc(${layerViewportInset.gutterBlockEnd})`,
      ],
      'padding-left': [
        `calc(${layerViewportInset.gutterInlineFallback})`,
        `calc(${layerViewportInset.gutterInline})`,
      ],
    });
    const tint = probed['background-color'];
    const shadow = probed['box-shadow'];
    const viewport: LiftFromTriggerViewport = {
      width: doc.documentElement.clientWidth || view?.innerWidth || 0,
      height: view?.innerHeight ?? doc.documentElement.clientHeight,
      gutter: {
        top: px(probed['padding-top']),
        bottom: px(probed['padding-bottom']),
        inline: px(probed['padding-left']),
      },
      direction,
    };
    const lifted = liftFromTriggerRect(sourceRect, viewport, options.scale);
    // Writes from here on.
    options.release?.();
    const layer = createLayer(doc, attribute);
    doc.body.append(layer);
    const shadowEl = doc.createElement('span');
    shadowEl.setAttribute(`${attribute}-shadow`, '');
    Object.assign(shadowEl.style, {
      position: 'absolute',
      left: `${sourceRect.x}px`,
      top: `${sourceRect.y}px`,
      width: `${sourceRect.width}px`,
      height: `${sourceRect.height}px`,
      borderRadius: radius,
      boxShadow: shadow,
      opacity: '0',
      pointerEvents: 'none',
      // Its keyframes scale about the top-left corner, as the source's do.
      transformOrigin: '0 0',
    });
    layer.append(shadowEl);
    const anchor = doc.createElement('span');
    anchor.setAttribute(`${attribute}-anchor`, '');
    Object.assign(anchor.style, {
      position: 'absolute',
      left: `${lifted.x}px`,
      top: `${lifted.y}px`,
      width: `${lifted.width}px`,
      height: `${lifted.height}px`,
      pointerEvents: 'none',
    });
    layer.append(anchor);
    let placeholder: HTMLElement | null = null;
    if (placeholderValues != null) {
      placeholder = doc.createElement(placeholderTag(source));
      placeholder.setAttribute(`${attribute}-placeholder`, '');
      placeholder.setAttribute('aria-hidden', 'true');
      Object.assign(placeholder.style, placeholderValues);
    }
    generation += 1;
    const transition: [string, string] = [
      source.style.getPropertyValue('transition'),
      source.style.getPropertyPriority('transition'),
    ];
    const saved: SavedStyle = [];
    // No transition of its own reacts to the lift's values.
    source.style.setProperty('transition', 'none', 'important');
    setInline(
      source,
      {
        // Longhands only: each is put back as it was.
        position: 'fixed',
        left: `${sourceRect.x}px`,
        top: `${sourceRect.y}px`,
        right: 'auto',
        bottom: 'auto',
        width: `${sourceRect.width}px`,
        height: `${sourceRect.height}px`,
        'min-width': '0',
        'min-height': '0',
        'max-width': 'none',
        'max-height': 'none',
        'margin-top': '0',
        'margin-right': '0',
        'margin-bottom': '0',
        'margin-left': '0',
        'box-sizing': 'border-box',
        ...kept,
        'pointer-events': 'none',
      },
      saved,
    );
    if (placeholder != null) {
      source.after(placeholder);
    }
    source.setAttribute('popover', 'manual');
    const waits = new AbortController();
    // The source grows out of where the press left it into its lifted rect,
    // laid out at its own size, so its content scales as UIKit's snapshot
    // does. Under Reduce Motion it lands at once and fades in.
    let heldAt: number | null = null;
    const holdClock = (at: number | null) => {
      heldAt = at;
    };
    const morph = createRectMorph(source, {
      now: () => heldAt ?? performance.now(),
    });
    // The layer first: the source shows above its tint.
    layer.showPopover();
    source.showPopover();
    holdClock(performance.now());
    const growing = morph.present(
      lerpPath(from, lifted, {box: sourceRect, scale: 'uniform'}),
      motion.lift,
      {crossfadeAs: 'entrance'},
    );
    holdClock(null);
    // The tint: the layer's `::backdrop`, its color held there.
    const layerFill = animateBackdrop(
      layer,
      [
        {backgroundColor: tint, opacity: '0'},
        {backgroundColor: tint, opacity: '0'},
      ],
      {duration: 0},
    );
    // The shadow rises with the source: it follows the source's path on the
    // lift's spring and fades in on its own, from the frame the source starts
    // in, as one compositor animation (an animated `::backdrop` of the source
    // would restyle and lay out the page on every frame). Under Reduce Motion
    // it fades in where the source lands.
    const rise = playShadow(
      shadowEl,
      reduced == null
        ? shadowKeyframes(
            sourceRect,
            from,
            lifted,
            motion.lift,
            [0, 1],
            motion.shadowIn,
          )
        : shadowKeyframes(
            sourceRect,
            lifted,
            lifted,
            null,
            [0, 1],
            motion.shadowIn,
          ),
      reduced,
    );
    void growing.started.then(at => {
      if (rise != null && current.shadowAnimation === rise) {
        rise.startTime = at;
      }
    });
    const current: LiftState = {
      generation,
      options,
      motion,
      attribute,
      source,
      sourceRect,
      lifted,
      layer,
      placeholder,
      saved,
      transition,
      morph,
      growing,
      layerFill,
      shadow: shadowEl,
      shadowAnimation: rise,
      holdClock,
      waits,
      untilPointersLift: async () => {},
      tint: fadeBackdrop(layer, 1, motion.lift, {from: 0, reduced}),
      surface: null,
      releaseGrowHold: null,
      releaseHold: null,
      isSourceLifted: true,
    };
    state = current;
    // Taps on the backdrop: only a pointer that went down on the layer lifts
    // there (WebKit hands the layer the lift of the finger that opened the
    // menu).
    let backdropPointer: number | null = null;
    const listen = {signal: waits.signal};
    layer.addEventListener(
      'pointerdown',
      event => {
        backdropPointer = event.isPrimary ? event.pointerId : null;
      },
      listen,
    );
    layer.addEventListener(
      'pointerup',
      event => {
        const wentDownHere = backdropPointer === event.pointerId;
        backdropPointer = null;
        if (wentDownHere) {
          current.options.onBackdropTap?.();
        }
      },
      listen,
    );
    layer.addEventListener(
      'pointercancel',
      () => {
        backdropPointer = null;
      },
      listen,
    );
    current.untilPointersLift = watchPointers(current);
    // No touch reaches the layer, or anything under it, while the source
    // grows (spec:AST-094 FR35); a surface extends the hold to its own
    // growth.
    current.releaseGrowHold = holdInput(layer, {
      scope: 'viewport',
      until: growing.finished,
    });
    return {source: sourceRect, lifted, viewport, anchor};
  };

  // The lift layer takes no touch until the lift and the surface settle
  // (spec:AST-094 FR35). The hold's shield joins the top layer after the
  // surface, so it covers it too; keys and assistive technology stay live.
  const holdWhileGrowing = (
    current: LiftState,
    surfaceSettled: Promise<unknown>,
  ) => {
    releaseGrowHold(current);
    const until = Promise.all([current.growing.finished, surfaceSettled]);
    current.releaseGrowHold = holdInput(current.layer, {
      scope: 'viewport',
      until,
    });
  };

  const presentSurface = (
    surfaceElement: HTMLElement,
    pressAt?: {x: number; y: number} | null,
  ) => {
    const current = state;
    if (current == null || !current.isSourceLifted) {
      return;
    }
    const element =
      surfaceElement.closest<HTMLElement>('[popover]') ?? surfaceElement;
    endSurface(current);
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const box: MorphRect = {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    };
    // Without a press it fades in where it rests, and a close shrinks it
    // into the lifted source's center.
    const press = pressAt ?? {
      x: current.lifted.x + current.lifted.width / 2,
      y: current.lifted.y + current.lifted.height / 2,
    };
    const startWidth = Math.min(
      current.options.surfaceStartWidth ?? 0,
      box.width,
    );
    const startHeight = (startWidth * box.height) / box.width;
    const start: MorphRect =
      pressAt == null
        ? box
        : {
            x: press.x - startWidth / 2,
            y: press.y - startHeight / 2,
            width: startWidth,
            height: startHeight,
          };
    const path = lerpPath(start, box, {
      box,
      scale: 'uniform',
      opacity: [0, 1],
    });
    // The hold's shield shows before the growth writes anything, so showing
    // it restyles only the shield, not the page the growth just changed.
    let surfaceSettled = () => {};
    holdWhileGrowing(
      current,
      new Promise<void>(resolve => {
        surfaceSettled = resolve;
      }),
    );
    const morph = createRectMorph(element);
    const presenting = morph.present(path, current.motion.surfaceIn, {
      crossfadeAs: 'entrance',
    });
    void presenting.finished.then(surfaceSettled, surfaceSettled);
    current.surface = {
      element,
      morph,
      path,
      press: {x: press.x, y: press.y},
      presenting,
      dismissing: null,
    };
  };

  const dismissSurface = (surfaceElement: HTMLElement) => {
    const current = state;
    if (current == null) {
      return;
    }
    const element =
      surfaceElement.closest<HTMLElement>('[popover]') ?? surfaceElement;
    // A close of a surface that no longer shows (a second tap on the fading
    // tint) leaves the running exit alone.
    const shown = element.getBoundingClientRect();
    if (shown.width <= 0 || shown.height <= 0) {
      return;
    }
    let surface = current.surface;
    if (surface == null || surface.element !== element) {
      // A surface that showed without growing: it shrinks from rest into the
      // source's center.
      endSurface(current);
      const box: MorphRect = {
        x: shown.left,
        y: shown.top,
        width: shown.width,
        height: shown.height,
      };
      const press = {
        x: current.lifted.x + current.lifted.width / 2,
        y: current.lifted.y + current.lifted.height / 2,
      };
      const startWidth = Math.min(
        current.options.surfaceStartWidth ?? 0,
        box.width,
      );
      const startHeight = (startWidth * box.height) / box.width;
      surface = {
        element,
        morph: createRectMorph(element),
        path: lerpPath(
          {
            x: press.x - startWidth / 2,
            y: press.y - startHeight / 2,
            width: startWidth,
            height: startHeight,
          },
          box,
          {box, scale: 'uniform', opacity: [0, 1]},
        ),
        press,
        presenting: null,
        dismissing: null,
      };
      current.surface = surface;
    }
    // The layer runtime's exit copy (inert, unnamed, in the top layer where
    // the surface is drawn), taken while it still shows. Without a top layer
    // there is no copy, and the close is immediate.
    const copy = placeLayerExitCopy(element, `${current.attribute}-exit`);
    if (copy == null) {
      return;
    }
    surface.dismissing = surface.morph.dismiss(
      surface.path,
      current.motion.surfaceOut,
      {target: copy, crossfadeAs: 'exit'},
    );
  };

  const drop = () => {
    const current = state;
    if (current == null || !current.isSourceLifted) {
      return;
    }
    releaseGrowHold(current);
    const {layer, motion, source, sourceRect, lifted} = current;
    // The tint clears from what it shows now, read before its rise stops.
    const tintFrom = backdropOpacity(layer, 1);
    current.tint?.cancel();
    current.tint = fadeBackdrop(layer, 0, motion.clear, {from: tintFrom});
    // The source returns to its place from wherever it is now, with its
    // velocity; its shadow follows it back frame for frame (the same start,
    // the same velocity along the way back) and fades on its own spring.
    // Under Reduce Motion both fade where they are.
    // One instant for the shadow's reading and the morph's own, and the
    // morph's velocity there (from the rect it presents a millisecond
    // before: the morph keeps its own clock, synced to its animations').
    const at = performance.now();
    current.holdClock(at - 1);
    const before = current.morph.presentedRect() ?? lifted;
    current.holdClock(at);
    const presented = current.morph.presentedRect() ?? lifted;
    const shadowEl = current.shadow;
    const shownOpacity =
      Number.parseFloat(
        shadowEl.ownerDocument.defaultView?.getComputedStyle(shadowEl)
          .opacity ?? '',
      ) || 0;
    current.shadowAnimation?.cancel();
    const reducedFade = reducedMotionFade(source);
    // That velocity as progress along the way back (from where it is drawn
    // to the source's place), as the morph reads it.
    const span = presented.width - sourceRect.width;
    const widthVelocity = (presented.width - before.width) * 1000;
    const backVelocity = Math.abs(span) > 1e-6 ? -widthVelocity / span : 0;
    current.shadowAnimation = playShadow(
      shadowEl,
      shadowKeyframes(
        sourceRect,
        presented,
        reducedFade == null ? sourceRect : presented,
        reducedFade == null ? motion.drop : null,
        [shownOpacity, 0],
        motion.shadowOut,
        backVelocity,
      ),
      reducedFade,
    );
    const returning = current.morph.dismiss(
      lerpPath(sourceRect, lifted, {box: sourceRect, scale: 'uniform'}),
      motion.drop,
      {target: source, crossfadeAs: 'exit'},
    );
    current.holdClock(null);
    const exit = current.surface?.dismissing;
    const settled = Promise.all([returning.finished, exit?.finished]);
    void settled.then(() => {
      if (state !== current) {
        return;
      }
      endSurface(current);
      settleSource(current);
      // Under Reduce Motion the source faded out where it stood: it fades
      // back in at its place.
      const back = reducedMotionFade(source);
      if (back != null && typeof source.animate === 'function') {
        source.animate([{opacity: 0}, {opacity: 1}], {
          duration: back.duration,
          easing: back.easing,
        });
      }
    });
    // The close holds the layer: nothing reaches the page under it until the
    // source is back, the surface's exit is done and every press on the
    // layer has lifted.
    const ended = settled.then(async () => current.untilPointersLift());
    current.releaseHold?.();
    current.releaseHold = holdInput(layer, {
      scope: 'layer',
      until: ended,
    });
    void ended.then(() => {
      if (state === current) {
        end(current);
      }
    });
  };

  return {
    lift,
    presentSurface,
    dismissSurface,
    drop,
    dispose: () => {
      if (state != null) {
        end(state);
      }
    },
    isLifted: () => state?.isSourceLifted === true,
  };
}

/**
 * Sources a copy hides: how many copies hold each, and the visibility it had
 * inline before the first, which it gets back when the last drops.
 */
const hiddenSources = new WeakMap<
  HTMLElement,
  {holders: number; visibility: [value: string, priority: string]}
>();

/** Hides `source` where it stands until the returned call lets go. */
function hideSource(source: HTMLElement): () => void {
  const held = hiddenSources.get(source);
  if (held == null) {
    hiddenSources.set(source, {
      holders: 1,
      visibility: [
        source.style.getPropertyValue('visibility'),
        source.style.getPropertyPriority('visibility'),
      ],
    });
    source.style.setProperty('visibility', 'hidden', 'important');
  } else {
    held.holders += 1;
  }
  let isReleased = false;
  return () => {
    const entry = hiddenSources.get(source);
    if (isReleased || entry == null) {
      return;
    }
    isReleased = true;
    entry.holders -= 1;
    if (entry.holders > 0) {
      return;
    }
    hiddenSources.delete(source);
    const [value, priority] = entry.visibility;
    if (value === '') {
      source.style.removeProperty('visibility');
    } else {
      source.style.setProperty('visibility', value, priority);
    }
  };
}

/** The picture a source shows: an image's own, or the first one inside it. */
function pictureOf(source: HTMLElement): string {
  const image =
    source instanceof HTMLImageElement
      ? source
      : source.querySelector<HTMLImageElement>('img');
  return image?.currentSrc || image?.src || '';
}

/**
 * Lifts a copy of `source`'s picture into `host` for a zoom
 * (`architecture:layer-runtime` INV15's clone): one image laid out at the
 * source's box (aspect fill, its corners), inert and hidden from assistive
 * technology, while the source hides where it stands. The caller moves the
 * copy on the rect morph and drops it at the landing. Null, with nothing
 * changed, for a source that is not in the page or has no box.
 */
export function liftCopy(
  source: HTMLElement,
  {host, src, attribute = 'data-astryx-lift-copy'}: LiftCopyOptions,
): LiftedCopy | null {
  if (!source.isConnected || !host.isConnected) {
    return null;
  }
  // Reads before writes: the page lays out once for the copy.
  const shown = source.getBoundingClientRect();
  if (shown.width <= 0 || shown.height <= 0) {
    return null;
  }
  const box: MorphRect = {
    x: shown.left,
    y: shown.top,
    width: shown.width,
    height: shown.height,
  };
  // The host's padding box is the copy's containing block.
  const origin = host.getBoundingClientRect();
  const left = box.x - origin.left - host.clientLeft + host.scrollLeft;
  const top = box.y - origin.top - host.clientTop + host.scrollTop;
  const radius = shapeRadius(source);
  const picture = pictureOf(source) || src || '';
  const copy = source.ownerDocument.createElement('img');
  copy.src = picture;
  copy.alt = '';
  copy.setAttribute('aria-hidden', 'true');
  copy.setAttribute('inert', '');
  copy.setAttribute(attribute, '');
  Object.assign(copy.style, {
    position: 'absolute',
    left: `${left}px`,
    top: `${top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    // Exactly the box, whatever the host's styles say about images.
    margin: '0',
    padding: '0',
    border: '0',
    maxWidth: 'none',
    maxHeight: 'none',
    boxSizing: 'border-box',
    objectFit: 'cover',
    borderRadius: radius,
    pointerEvents: 'none',
  });
  host.append(copy);
  const release = hideSource(source);
  let isDropped = false;
  return {
    element: copy,
    box,
    drop: () => {
      if (isDropped) {
        return;
      }
      isDropped = true;
      copy.remove();
      release();
    },
  };
}
