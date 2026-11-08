// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file liftFromTrigger.ts
 * @input A source to lift, a surface to grow beside it, and the caller's
 *   springs, scale rule, tint and attribute
 * @output createLiftFromTrigger, which lifts a source and grows a surface at
 *   the press; and liftCopy, a copy of a source's picture for a zoom
 * @position The one lift-from-trigger presentation, internal and opt-in.
 *   README.md says what a lift adds to the page and how it moves
 *
 * SYNC: When modified, update liftFromTrigger.test.ts and
 * __tests__/liftFromTrigger.interaction.browser.spec.ts.
 */

import type {LayerInset} from '../Layer/LayerContext';
import {placeLayerExitCopy} from '../Layer/layerExitCopy';
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
  type MorphPath,
  type MorphRect,
  type RectMorph,
} from '../motion/rectMorph';
import {reducedMotionFade} from '../motion/reducedMotion';
import {resolveMotion} from '../motion/resolveMotion';
import type {SpringDescription} from '../motion/spring';
import {
  liftFromTriggerRect,
  type LiftFromTriggerScaleRule,
  type LiftFromTriggerViewport,
} from './liftFromTriggerGeometry';

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
   * Called after the lift reads the page and before it writes to it. It lets
   * go of what the source was doing, such as a press feedback's scale. The
   * release then cannot restyle the page before the lift reads it.
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
   * Marks the lift's elements, a private attribute the caller owns: the
   * layer, its placeholder (`<attribute>-placeholder`) and a surface's exit
   * copy (`<attribute>-exit`).
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
   * Grows `surface` out of `press` (client px) into its box: a popover laid
   * out at rest, or an element inside one. Without a press, it fades the
   * surface in where it rests. The lift holds input until the lift and the
   * surface settle, so a tap during the growth reaches nothing. A no-op when
   * nothing is lifted.
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
   * The element the copy goes in, such as a viewer's container. It is
   * positioned, so the copy is laid out against its box. Its stacking decides
   * what the copy shows over and under.
   */
  readonly host: HTMLElement;
  /** The picture for a source that shows none. */
  readonly src?: string;
  /** Marks the copy, when given: a private attribute the caller owns. */
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
   * Takes the copy away. Once the last copy of the source drops, the source
   * shows again as it was. Call it at the landing or on unmount; nothing is
   * left either way. A second call does nothing.
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
   * The shadow under the source, a box in the layer laid out where the source
   * is. It follows the source frame for frame and fades on its own spring.
   */
  readonly shadow: HTMLElement;
  /** The shadow's rect morph, on the source's path and clock. */
  readonly shadowMorph: RectMorph;
  /**
   * Holds the clock of both morphs at one instant (null lets it run), so the
   * shadow starts each motion where the source does.
   */
  readonly holdClock: (at: number | null) => void;
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
    shadowIn: resolve(motion.shadowIn),
    shadowOut: resolve(motion.shadowOut),
    surfaceIn: resolve(motion.surfaceIn),
    surfaceOut: resolve(motion.surfaceOut),
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
    current.shadowMorph.dispose();
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
  // document, so an inert target hides none. It also knows whether the last
  // one to lift still owes its click. A touch's click comes after its
  // pointer's up.
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
    const {attribute} = options;
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
    // The tint, the shadow and the layer runtime's gutter, with the inset an
    // app declares, resolved where the source is.
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
    // The source grows from where the press left it into its lifted rect. It
    // stays laid out at its own size, so its content scales as UIKit's
    // snapshot does. Under Reduce Motion it lands at once and fades in.
    let heldAt: number | null = null;
    const holdClock = (at: number | null) => {
      heldAt = at;
    };
    const now = () => heldAt ?? performance.now();
    const morph = createRectMorph(source, {now});
    const shadowMorph = createRectMorph(shadowEl, {now});
    // The layer first: the source shows above its tint. The popover makes
    // its `::backdrop` new, so the tint starts clear in the same task.
    const tints = createMotionEngine(layer, {
      pseudoElement: '::backdrop',
      base: {opacity: 1},
    });
    layer.showPopover();
    tints.set({opacity: 0});
    source.showPopover();
    holdClock(performance.now());
    const growing = morph.present(
      lerpPath(from, lifted, {box: sourceRect, scale: 'uniform'}),
      {spring: motion.lift},
      {crossfadeAs: 'entrance'},
    );
    // The shadow rises with the source, frame for frame: the same path,
    // spring and clock. It fades in on its own spring. It is a box in the
    // layer, because an animated `::backdrop` of the source would restyle and
    // lay out the page on every frame.
    shadowMorph.present(
      lerpPath(from, lifted, {
        box: sourceRect,
        scale: 'uniform',
        opacity: [0, 1],
      }),
      {spring: motion.lift},
      {fade: {spring: motion.shadowIn}, crossfadeAs: 'entrance'},
    );
    holdClock(null);
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
      shadow: shadowEl,
      shadowMorph,
      holdClock,
      waits,
      untilPointersLift: async () => {},
      tints,
      tint: tints.animate({opacity: 1}, {spring: motion.lift}),
      surface: null,
      releaseGrowHold: null,
      releaseHold: null,
      isSourceLifted: true,
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
    const presenting = morph.present(
      path,
      {spring: current.motion.surfaceIn},
      {crossfadeAs: 'entrance'},
    );
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
      {spring: current.motion.surfaceOut},
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
    // The tint clears from what it shows now, with its velocity.
    current.tint = current.tints.animate({opacity: 0}, {spring: motion.clear});
    // The source returns to its place from wherever it is now, with its
    // velocity. Its shadow follows it back frame for frame: the same instant,
    // path and spring. It fades on its own spring. Under Reduce Motion both
    // fade where they are.
    current.holdClock(performance.now());
    current.shadowMorph.dismiss(
      lerpPath(sourceRect, lifted, {
        box: sourceRect,
        scale: 'uniform',
        opacity: [0, 1],
      }),
      {spring: motion.drop},
      {
        target: current.shadow,
        fade: {spring: motion.shadowOut},
        crossfadeAs: 'exit',
      },
    );
    const returning = current.morph.dismiss(
      lerpPath(sourceRect, lifted, {box: sourceRect, scale: 'uniform'}),
      {spring: motion.drop},
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
    // The close holds the layer, so nothing reaches the page under it. The
    // hold ends when the source is back, the surface's exit is done and every
    // press has lifted.
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
 * Sources a copy hides: how many copies hold each, and its inline visibility
 * before the first. A source gets that visibility back when its last copy
 * drops.
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
 * Lifts a copy of `source`'s picture into `host` for a zoom, the lift's one
 * transient copy. The copy is one image at the source's box, with aspect fill
 * and its corners. It is inert and hidden from assistive technology, and the
 * source hides where it stands. The caller moves the copy on the rect morph
 * and drops it at the landing. Null, with nothing changed, for a source that
 * is not in the page or has no box.
 */
export function liftCopy(
  source: HTMLElement,
  {host, src, attribute}: LiftCopyOptions,
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
  if (attribute != null) {
    copy.setAttribute(attribute, '');
  }
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
