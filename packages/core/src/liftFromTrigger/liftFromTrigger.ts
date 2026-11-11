// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file liftFromTrigger.ts
 * @input A source to lift, a surface to grow beside it, the viewport and the
 *   layer runtime's gutter, and the caller's springs, scale rule, tint and
 *   attribute
 * @output createLiftFromTrigger, which lifts a source and fades a surface in
 *   beside it; liftFromTriggerScale, liftFromTriggerRect and
 *   surfacePlacement: a lifted source's growth, its place inside the gutter,
 *   and a surface's side
 * @position The one lift-from-trigger presentation, internal and opt-in.
 *   README.md says what a lift adds to the page and how it moves
 *
 * SYNC: When modified, update liftFromTrigger.test.ts and
 * __tests__/liftFromTrigger.interaction.browser.spec.ts.
 */

import type {LayerInset} from '../Layer/LayerContext';
import {layerInsetProperties} from '../Layer/layerInset';
import {layerViewportInset} from '../Layer/layerViewportInset.stylex';
import {holdInput} from '../Layer/inputHold';
import {
  createMotionEngine,
  type Animator,
  type MotionHandle,
} from '../motion/animator';
import {
  createRectMorph,
  lerpPath,
  type MorphRect,
  type RectMorph,
} from '../motion/rectMorph';
import {reducedMotionFade} from '../motion/reducedMotion';
import {resolveMotion} from '../motion/resolveMotion';
import type {SpringDescription} from '../motion/spring';
import {type InputEventMap, subscribeInput} from '../utils/inputStream';

/**
 * How long the layer waits for a touch's click after the last pointer on it
 * lifts. A long press sends no click, so the layer then hides anyway.
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
  /** A surface fades in on it. */
  readonly surfaceIn: SpringDescription;
}

export interface LiftFromTriggerOptions {
  readonly motion: LiftFromTriggerMotion;
  /** How far the source grows. */
  readonly scale: LiftFromTriggerScaleRule;
  /**
   * The rect the source grows on from, viewport px: where a press feedback
   * left it. Its box as laid out by default.
   */
  readonly from?: MorphRect;
  /**
   * Called after the lift reads the page and before it writes to it. It lets
   * go of what the source was doing, such as a press feedback's scale. The
   * release then cannot restyle the page before the lift reads it.
   */
  readonly release?: () => void;
  /**
   * Called once the layer shows and before the source's writes, with where
   * the source lands. A surface shown here sits above the tint. Its reads find
   * the page as it was, apart from the shown layer and what `release` changed.
   * The source then lifts above it. `presentSurface`, `drop` and `dispose` do
   * nothing inside it, since the lift records its state once it returns.
   */
  readonly onLayerShown?: (lifted: LiftFromTriggerResult) => void;
  /**
   * Inline styles the source takes while it is lifted, such as a plate behind
   * a source with no surface of its own. The lift pins them with its own and
   * puts them back with them, once the source is back in the page.
   */
  readonly pin?: Readonly<Record<string, string>>;
  /** The tint, a CSS color resolved where the source is. */
  readonly tint?: string;
  /** The inset an app declares for a bar over an edge (LayerProvider). */
  readonly inset?: LayerInset;
  /** A finger lifted on the backdrop where it went down. */
  readonly onBackdropTap?: () => void;
  /**
   * Marks the lift's elements, a private attribute the caller owns: the
   * layer, its anchor box (`<attribute>-anchor`) and its placeholder
   * (`<attribute>-placeholder`).
   */
  readonly attribute: string;
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
   * An empty box at the lifted rect, in the layer, for a surface to be
   * placed against. Anchor positioning follows transforms, so an anchor
   * inside the source would move with it.
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
   * Fades `surface` in where it rests: a popover laid out at rest, or an
   * element inside one. The lift holds input until the lift and the surface
   * settle, so a tap during the entrance reaches nothing. A no-op when
   * nothing is lifted.
   */
  presentSurface(surface: HTMLElement): void;
  /** Returns the source to its place; the layer leaves once it is back. */
  drop(): void;
  /** Ends everything at once and leaves the page as it was. */
  dispose(): void;
  /** Whether a source is lifted. */
  isLifted(): boolean;
}

/**
 * The layer runtime's viewport gutter on each edge, in CSS px
 * (Layer/layerViewportInset.stylex.ts). It is the spacing step or the edge's
 * safe-area inset, whichever is larger. It adds the inset an app declares for
 * a bar over that edge.
 */
export interface LiftFromTriggerGutter {
  readonly top: number;
  readonly bottom: number;
  readonly inline: number;
}

/**
 * The viewport a source lifts in, CSS px, the layer runtime's gutter, and the
 * page's direction (a surface's alignment is logical).
 */
export interface LiftFromTriggerViewport {
  readonly width: number;
  readonly height: number;
  readonly gutter: LiftFromTriggerGutter;
  readonly direction?: 'ltr' | 'rtl';
}

/** How far a lifted source grows. */
export interface LiftFromTriggerScaleRule {
  /** The largest factor it grows by. */
  readonly maxScale: number;
  /** Below `maxScale`, it grows by this many px on its larger side. */
  readonly scaleUpPoints: number;
}

/** Where a surface sits against the lifted source. */
export interface SurfacePlacement {
  /**
   * `none` when the surface fits on neither side: the caller then leaves it to
   * the layer runtime's own fallback.
   */
  readonly side: 'above' | 'below' | 'none';
  readonly alignment: 'start' | 'center' | 'end';
}

/**
 * The factor a `width` × `height` source grows by: up to `rule.maxScale`, by
 * `rule.scaleUpPoints` on its larger side. It is never wider or taller than
 * the viewport less its gutters, which can make the factor less than 1.
 */
export function liftFromTriggerScale(
  width: number,
  height: number,
  viewport: LiftFromTriggerViewport,
  rule: LiftFromTriggerScaleRule,
): number {
  const side = Math.max(width, height);
  if (side <= 0) {
    return 1;
  }
  const {gutter} = viewport;
  const fitsWidth =
    width > 0 ? (viewport.width - 2 * gutter.inline) / width : Infinity;
  const fitsHeight =
    height > 0
      ? (viewport.height - gutter.top - gutter.bottom) / height
      : Infinity;
  return Math.min(
    rule.maxScale,
    (side + rule.scaleUpPoints) / side,
    fitsWidth,
    fitsHeight,
  );
}

/**
 * The lifted source's rect: `source` scaled by `liftFromTriggerScale` about its center,
 * then moved inside the viewport's gutter if it crosses it.
 */
export function liftFromTriggerRect(
  source: MorphRect,
  viewport: LiftFromTriggerViewport,
  rule: LiftFromTriggerScaleRule,
): MorphRect {
  const {gutter} = viewport;
  const scale = liftFromTriggerScale(
    source.width,
    source.height,
    viewport,
    rule,
  );
  const width = source.width * scale;
  const height = source.height * scale;
  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), Math.max(min, max));
  const top = gutter.top;
  const bottom = viewport.height - gutter.bottom;
  return {
    x: clamp(
      source.x + source.width / 2 - width / 2,
      gutter.inline,
      viewport.width - gutter.inline - width,
    ),
    y: clamp(source.y + source.height / 2 - height / 2, top, bottom - height),
    width,
    height,
  };
}

/**
 * A surface's place: below the lifted source when `surfaceHeight` fits
 * between it, `gap` and the bottom gutter. Else it goes above, when it fits
 * under the top gutter. With room on neither side it answers `none`. It
 * centers on the source, or sits flush with the source's edge when the source
 * is held against a side of the viewport.
 */
export function surfacePlacement(
  lifted: MorphRect,
  surfaceHeight: number,
  viewport: LiftFromTriggerViewport,
  gap: number,
): SurfacePlacement {
  const {gutter} = viewport;
  const bottom = viewport.height - gutter.bottom;
  const fitsBelow = lifted.y + lifted.height + gap + surfaceHeight <= bottom;
  const fitsAbove = lifted.y - gap - surfaceHeight >= gutter.top;
  const side = fitsBelow ? 'below' : fitsAbove ? 'above' : 'none';
  const epsilon = 0.5;
  const atLeft = lifted.x <= gutter.inline + epsilon;
  const atRight =
    lifted.x + lifted.width >= viewport.width - gutter.inline - epsilon;
  // Flush with the edge the source is held against; the alignment is
  // logical, so a right-to-left page swaps the physical sides.
  const isRtl = viewport.direction === 'rtl';
  const alignment = atLeft
    ? isRtl
      ? 'end'
      : 'start'
    : atRight
      ? isRtl
        ? 'start'
        : 'end'
      : 'center';
  return {side, alignment};
}

/**
 * The border box's size as laid out, from the computed style, to the
 * fraction of a pixel. Null when the style holds no used size in px, as for
 * an inline box. `offsetWidth` and `offsetHeight` round.
 */
function layoutSize(
  computed: CSSStyleDeclaration,
  axis: 'width' | 'height',
): number | null {
  const value = computed.getPropertyValue(axis);
  const size = value.endsWith('px') ? Number.parseFloat(value) : Number.NaN;
  if (!Number.isFinite(size)) {
    return null;
  }
  if (computed.boxSizing === 'border-box') {
    return size;
  }
  const sides = axis === 'width' ? ['left', 'right'] : ['top', 'bottom'];
  let extra = 0;
  for (const side of sides) {
    extra +=
      (Number.parseFloat(computed.getPropertyValue(`padding-${side}`)) || 0) +
      (Number.parseFloat(computed.getPropertyValue(`border-${side}-width`)) ||
        0);
  }
  return size + extra;
}

type SavedStyle = [property: string, value: string, priority: string][];

interface LiftedSurface {
  readonly element: HTMLElement;
  readonly morph: RectMorph;
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
  /** The layer's own waits and listeners, released with it. */
  readonly waits: AbortController;
  untilPointersLift: () => Promise<void>;
  /**
   * The tint's animator: the opacity of the layer's `::backdrop`. The
   * stylesheet shows the backdrop opaque, so a risen tint holds nothing.
   */
  readonly tints: Animator;
  /** The tint's fade on `tints`. */
  tint: MotionHandle | null;
  surface: LiftedSurface | null;
  releaseGrowHold: (() => void) | null;
  releaseHold: (() => void) | null;
  isSourceLifted: boolean;
  isDropping: boolean;
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

/**
 * Resolves CSS values where `element` is, in its theme and color scheme. It
 * reads them on an empty, undisplayed child and removes the child again. So
 * the element's own style and the page's layout stay as they were. A pair is
 * a fallback and a value a browser may reject.
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
 * The lift's springs as they resolve at `element`, read once. A spring that
 * is a motion role resolves through its role. The result is plain springs,
 * and nothing reads the page for them again.
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
    surfaceIn: resolve(motion.surfaceIn),
  };
}

/** Holds `color` as the background of `element`'s `::backdrop`. */
function holdBackdropColor(
  element: HTMLElement,
  color: string,
): Animation | null {
  if (typeof element.animate !== 'function') {
    return null;
  }
  try {
    return element.animate(
      [{backgroundColor: color}, {backgroundColor: color}],
      {duration: 0, fill: 'forwards', pseudoElement: '::backdrop'},
    );
  } catch {
    // No `::backdrop` animations: the lift shows without its tint.
    return null;
  }
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
    // A one-finger pan scrolls nothing under the lift, but a pinch still
    // zooms the page.
    touchAction: 'pinch-zoom',
  });
  return layer;
}

/**
 * The element that holds a source's spot: an `li` in a list, and a `span`
 * elsewhere. HTML lets `ul`, `ol` and `menu` hold only `li` children.
 */
function placeholderTag(source: HTMLElement): 'li' | 'span' {
  const parent = source.parentElement?.localName;
  return parent === 'ul' || parent === 'ol' || parent === 'menu'
    ? 'li'
    : 'span';
}

/**
 * The placeholder that holds a source's spot while it is lifted. It is empty
 * and hidden, at the source's laid-out size, margins and place in a flex or
 * grid container. It is never a list item, so it takes no number and the
 * items after it keep theirs. The page's own rules for its tag, such as an
 * `li`'s minimum height or padding, never change its size.
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

/**
 * The properties the browser's popover style sets, and the corner radii, kept
 * as laid out. The placeholder after the source ends a `:last-child` match,
 * which can round a row's corners.
 */
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
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
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
    current.morph.dispose();
    if (source.matches(':popover-open')) {
      source.hidePopover();
    }
    source.removeAttribute('popover');
    restore(source, current.saved);
    current.placeholder?.remove();
    // The restored values apply before the source's own transitions return,
    // so none of them animates. A style read, not a geometry one, so it lays
    // nothing out.
    void source.ownerDocument.defaultView?.getComputedStyle(source)
      .transitionProperty;
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
    current.tints.dispose();
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

  // Every pointer still down that went down on the layer: on the tint as it
  // presents, or the shield as it closes. The watch reads them from the
  // window's input stream. So an inert target hides none, and neither does an
  // app that stops them on the way down. It also knows whether the last one
  // to lift still owes its click. A touch's click comes after its pointer's
  // up.
  const watchPointers = (current: LiftState) => {
    const {layer, waits} = current;
    const view = layer.ownerDocument.defaultView;
    const pointers = new Set<number>();
    let isClickPending = false;
    // Each subscription ends with the layer, or earlier by its returned stop.
    const listen = <K extends keyof InputEventMap>(
      type: K,
      listener: (event: InputEventMap[K]) => void,
    ): (() => void) => {
      if (view == null || waits.signal.aborted) {
        return () => {};
      }
      const stop = subscribeInput(view, type, listener);
      waits.signal.addEventListener('abort', stop, {once: true});
      return stop;
    };
    listen('pointerdown', event => {
      if (event.composedPath().includes(layer)) {
        pointers.add(event.pointerId);
      }
    });
    const up = (event: PointerEvent) => {
      if (pointers.delete(event.pointerId) && event.type === 'pointerup') {
        isClickPending = true;
      }
    };
    listen('pointerup', up);
    listen('pointercancel', up);
    listen('click', () => {
      isClickPending = false;
    });
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
              stopUp();
              stopCancel();
              wait();
            };
            const stopUp = listen('pointerup', lifted);
            const stopCancel = listen('pointercancel', lifted);
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
          const stopClick = listen('click', finish);
          function finish() {
            stopClick();
            clearTimeout(timer);
            isClickPending = false;
            wait();
          }
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
    const {attribute} = options;
    const doc = source.ownerDocument;
    const view = doc.defaultView;
    const computed = view?.getComputedStyle(source);
    if (computed == null) {
      return null;
    }
    // The lift reads everything before it writes to the page, so the page
    // restyles and lays out once for it.
    // The source as laid out. A scale on it, the press feedback's, is about
    // its center. The size keeps the fraction of a pixel: a source pinned
    // narrower than its layout wraps its text.
    const shown = source.getBoundingClientRect();
    const width =
      layoutSize(computed, 'width') ?? (source.offsetWidth || shown.width);
    const height =
      layoutSize(computed, 'height') ?? (source.offsetHeight || shown.height);
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
    const motion = resolvedMotion(source, options.motion);
    // The tint and the layer runtime's gutter, with the inset an app
    // declares, resolved where the source is.
    const probed = probe(source, {
      ...Object.fromEntries(
        Object.entries(layerInsetProperties(options.inset)).map(
          ([property, value]) => [property, String(value)],
        ),
      ),
      'background-color': options.tint ?? 'var(--color-overlay)',
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
    // The layer first: the source shows above its tint. The popover makes
    // its `::backdrop` new, so the tint starts clear in the same task.
    const tints = createMotionEngine(layer, {
      pseudoElement: '::backdrop',
      base: {opacity: 1},
    });
    layer.showPopover();
    tints.set({opacity: 0});
    // A surface shown now reads the page before the source's writes, so its
    // reads stay cheap.
    options.onLayerShown?.({source: sourceRect, lifted, viewport, anchor});
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
        ...options.pin,
        'pointer-events': 'none',
      },
      saved,
    );
    if (placeholder != null) {
      source.after(placeholder);
    }
    source.setAttribute('popover', 'manual');
    const waits = new AbortController();
    // The source grows from where the press left it into its lifted rect. It
    // stays laid out at its own size, so its content scales as UIKit's
    // snapshot does. Under Reduce Motion it lands at once and fades in.
    const morph = createRectMorph(source);
    source.showPopover();
    const growing = morph.present(
      lerpPath(from, lifted, {box: sourceRect, scale: 'uniform'}),
      {spring: motion.lift},
      {crossfadeAs: 'entrance'},
    );
    // The tint: the layer's `::backdrop`, its color held there.
    const layerFill = holdBackdropColor(layer, tint);
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
      waits,
      untilPointersLift: async () => {},
      tints,
      tint: tints.animate({opacity: 1}, {spring: motion.lift}),
      surface: null,
      releaseGrowHold: null,
      releaseHold: null,
      isSourceLifted: true,
      isDropping: false,
    };
    state = current;
    // Taps on the backdrop count only for a pointer that went down on the
    // layer. WebKit hands the layer the lift of the finger that opened the
    // menu.
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
    // grows; a surface extends the hold to its own growth.
    current.releaseGrowHold = holdInput(layer, {
      scope: 'viewport',
      until: growing.finished,
    });
    return {source: sourceRect, lifted, viewport, anchor};
  };

  // The lift layer takes no touch until the lift and the surface settle.
  // The hold's shield joins the top layer after the
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

  const presentSurface = (surfaceElement: HTMLElement) => {
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
    const path = lerpPath(box, box, {
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
    const presenting = morph.present(
      path,
      {spring: current.motion.surfaceIn},
      {crossfadeAs: 'entrance'},
    );
    void presenting.finished.then(surfaceSettled, surfaceSettled);
    current.surface = {element, morph};
  };

  const drop = () => {
    const current = state;
    // A second drop would retarget the return and settle it at once.
    if (current == null || !current.isSourceLifted || current.isDropping) {
      return;
    }
    current.isDropping = true;
    releaseGrowHold(current);
    const {layer, motion, source, sourceRect, lifted} = current;
    // The tint clears from what it shows now, with its velocity.
    current.tint = current.tints.animate({opacity: 0}, {spring: motion.clear});
    // The source returns to its place from wherever it is now, with its
    // velocity. Under Reduce Motion it fades where it is.
    const returning = current.morph.dismiss(
      lerpPath(sourceRect, lifted, {box: sourceRect, scale: 'uniform'}),
      {spring: motion.drop},
      {target: source, crossfadeAs: 'exit'},
    );
    const settled = returning.finished;
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
    // The close holds the layer, so nothing reaches the page under it. The
    // hold ends when the source is back and every press has lifted.
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
    drop,
    dispose: () => {
      if (state != null) {
        end(state);
      }
    },
    isLifted: () => state?.isSourceLifted === true,
  };
}
