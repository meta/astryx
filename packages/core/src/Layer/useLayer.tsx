// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useLayer.tsx
 * @input Uses React hooks, Popover API, CSS anchor positioning, shared text/provider boundaries
 * @output Exports the public useLayer hook plus internal trigger helpers.
 * @position Core layer utility; used by useHoverCard, useTooltip, etc.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Layer/useLayer.doc.mjs
 * - /packages/core/src/Layer/useLayer.test.tsx
 * - /packages/core/src/Layer/index.ts
 */

import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefCallback,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '@stylexjs/stylex';
import {createPortal} from 'react-dom';
import {LayerContentBoundary} from './layerScopedContext';
import {addAnchorName, removeAnchorName} from './anchorName';
import {currentGesture, currentGestureHasClicked} from './gestureCounter';
import {resolveLayerPortalTarget} from './layerHost';
import {layerTextReset} from './layerTextReset.stylex';
import {layerStructureReset} from './layerStructureReset.stylex';
import {layerViewportInset} from './layerViewportInset.stylex';
import {layerInsetProperties} from './layerInset';
import {
  LAYER_CLEARANCE_PROPERTY,
  LAYER_CLEARS_ANCHOR_ATTRIBUTE,
  LAYER_SCROLLS_ATTRIBUTE,
  LAYER_CLEAR_FALLBACKS_PROPERTY,
  LAYER_TRY_FALLBACKS_PROPERTY,
  ensureSlideRules,
  getAnchorClearFallbacks,
  slideRuleName,
} from './layerSlideRules';
import {preserveAnimations} from './preserveAnimations';
import {useLayerContext} from './LayerContext';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {overlayPaddingReset} from '../Layout/padding.stylex';

const styles = stylex.create({
  // Base reset for all layers
  base: {
    marginBlockStart: 0,
    marginBlockEnd: 0,
    marginInlineStart: 0,
    marginInlineEnd: 0,
    paddingBlockStart: 0,
    paddingBlockEnd: 0,
    paddingInlineStart: 0,
    paddingInlineEnd: 0,
    borderWidth: 0,
    borderStyle: 'none',
    overflow: 'visible',
    // Override browser default [popover] background (canvas color)
    backgroundColor: 'transparent',
  },
  // Fixed positioning mode
  fixed: {
    position: 'fixed',
  },
  // Margins on the placement axis: the anchor clearance on the edge facing
  // the anchor, the viewport gutter on the far edge (spec:AST-059 FR1, FR6).
  // The margin box is what must fit a position option and what the browser's
  // overflow shift keeps inside the viewport, so a layer that would end
  // inside the gutter — or under a declared bar — does not fit there and the
  // next option is tried. A flip tactic swaps the two values with the area,
  // so the clearance stays on the anchor side and the gutter on the far side
  // (#4803); for the same reason the gutter is one value for both edges, the
  // larger of the two block gutters.
  placementBelow: (offset: string) => ({
    marginBlockStart: offset,
    marginBlockEnd: layerViewportInset.gutterBlock,
  }),
  placementAbove: (offset: string) => ({
    marginBlockStart: layerViewportInset.gutterBlock,
    marginBlockEnd: offset,
  }),
  placementEnd: (offset: string) => ({
    marginInlineStart: offset,
    marginInlineEnd: layerViewportInset.gutterInline,
  }),
  placementStart: (offset: string) => ({
    marginInlineStart: layerViewportInset.gutterInline,
    marginInlineEnd: offset,
  }),
  // Flush against the anchor (no offset): only the far-edge gutter.
  farBelow: {marginBlockEnd: layerViewportInset.gutterBlock},
  farAbove: {marginBlockStart: layerViewportInset.gutterBlock},
  farEnd: {marginInlineEnd: layerViewportInset.gutterInline},
  farStart: {marginInlineStart: layerViewportInset.gutterInline},
  // The viewport inset (spec:AST-059 FR1–FR3). Every anchor-mode layer is
  // capped to the viewport minus both gutters on both axes and keeps the
  // runtime's gutter from the far viewport edge of its alignment axis as a
  // margin (the placement-axis gutter rides the placement margins above).
  // The cap is on the layer box itself: content wider than the viewport
  // overflows inside the layer, where the composing component decides
  // whether it scrolls or clips; the box never leaves the viewport.
  // Each constant is wrapped in `calc()` so both declarations ship (see
  // layerViewportInset).
  viewportFit: {
    boxSizing: 'border-box',
    maxInlineSize: stylex.firstThatWorks(
      `calc(${layerViewportInset.maxInlineSize})`,
      `calc(${layerViewportInset.maxInlineSizeFallback})`,
    ),
    maxBlockSize: stylex.firstThatWorks(
      `calc(${layerViewportInset.maxBlockSize})`,
      `calc(${layerViewportInset.maxBlockSizeFallback})`,
    ),
  },
  // Alignment-axis gutter (spec:AST-059 FR1): a margin on the far viewport
  // edge of the alignment axis — one on the anchor-facing edge would push an
  // aligned layer off its anchor — or both edges for a centered layer. The
  // flip tactic mirrors it with the area. The slide options carry both
  // (see layerSlideRules.ts).
  gutterInlineEnd: {
    marginInlineEnd: stylex.firstThatWorks(
      `calc(${layerViewportInset.gutterInline})`,
      `calc(${layerViewportInset.gutterInlineFallback})`,
    ),
  },
  gutterInlineStart: {
    marginInlineStart: stylex.firstThatWorks(
      `calc(${layerViewportInset.gutterInline})`,
      `calc(${layerViewportInset.gutterInlineFallback})`,
    ),
  },
  gutterBlockEnd: {
    marginBlockEnd: stylex.firstThatWorks(
      `calc(${layerViewportInset.gutterBlock})`,
      `calc(${layerViewportInset.gutterBlockFallback})`,
    ),
  },
  gutterBlockStart: {
    marginBlockStart: stylex.firstThatWorks(
      `calc(${layerViewportInset.gutterBlock})`,
      `calc(${layerViewportInset.gutterBlockFallback})`,
    ),
  },
});

/**
 * Props for a control that sits on the trigger but must not dismiss the layer.
 */
interface KeepLayerOpenProps {
  onPointerDown: React.PointerEventHandler<HTMLElement>;
  /**
   * Capture phase, so spreading these props never collides with the control's
   * own `onClick`.
   */
  onClickCapture: React.MouseEventHandler<HTMLElement>;
}

/**
 * Position placement relative to anchor.
 * Logical: start/end resolve against the popover's own inherited direction
 * via CSS (RTL contexts mirror automatically, no JS involved).
 */
export type LayerPlacement = 'above' | 'below' | 'start' | 'end';

/**
 * Alignment along the placement axis
 */
export type LayerAlignment = 'start' | 'center' | 'end';

/**
 * Render props for context mode (anchor positioning)
 */
export interface ContextRenderProps {
  /**
   * Who authors the layer's position styles.
   *
   * `'anchor'` (default): the hook derives CSS anchor-positioning styles —
   * `position-area` and `position-try-fallbacks` — from the logical
   * `placement`/`alignment`.
   *
   * `'custom'`: the consumer authors its own position styles via `style`
   * (e.g. explicit `anchor()` insets or an `anchor-size()` cover). The hook
   * keeps the popover behavior and the `position-anchor` wiring but emits no
   * placement-derived styles, so direction handling becomes the consumer's
   * responsibility. `placement`/`alignment` are ignored.
   *
   * @default 'anchor'
   */
  positioning?: 'anchor' | 'custom';
  /**
   * Logical placement relative to the anchor. Ignored when `positioning`
   * is `'custom'`.
   */
  placement?: LayerPlacement;
  /**
   * Alignment along the placement axis. Ignored when `positioning`
   * is `'custom'`.
   */
  alignment?: LayerAlignment;
  /**
   * Clearance between the layer and its anchor, as a CSS length (a number is
   * treated as `px`). Applied along the placement axis and flip-safe, so the
   * gap survives a `position-try-fallbacks` flip to the opposite side.
   *
   * Layers sit flush by default: the hook zeroes the UA margins so anchor
   * positioning has a clean box, and clearance is a deliberate choice per
   * surface. `var(--spacing-1)` is the system's standard clearance.
   *
   * Ignored when `positioning` is `'custom'` — that mode owns its own insets.
   *
   * @default 0
   */
  offset?: number | string;
  /**
   * ARIA role applied to the popover container (e.g. `'tooltip'`). Lets
   * consumers complete the ARIA pattern and gives test tooling a stable,
   * non-hashed selector for the layer.
   */
  role?: string;
  /**
   * Accessible name applied to the popover container via `aria-label`.
   * Pair with `role` so layers with a named role (e.g. `'dialog'`) expose a
   * proper name to assistive technology.
   */
  'aria-label'?: string;
  /**
   * StyleX styles for the popover container.
   */
  xstyle?: StyleXStyles;
  /**
   * Additional CSS class name(s) for the popover container.
   * Use with themeProps() for theme targeting when reflecting visual props.
   */
  className?: string;
  /**
   * Inline styles for the popover container.
   * Merged after StyleX and anchor positioning styles.
   */
  style?: React.CSSProperties;
  /**
   * HTML tag to render the popover container as.
   *
   * Defaults to `'div'`. Context layers render an inert `<template>` marker at
   * the JSX position. The marker's parent is checked before the requested
   * container mounts there or portals outside ancestors that cannot safely
   * contain it. The marker remains available to detect a new parent if the
   * render call moves. With `lazyMount`, the first check waits until `show()`.
   *
   * @default 'div'
   */
  as?: 'div' | 'span';
  /**
   * Pointer-enter handler attached to the popover container itself. Lets a
   * consumer keep a hover-driven layer open while the pointer is over the
   * surface (e.g. Tooltip/HoverCard "hoverable" behavior — WCAG 1.4.13).
   */
  onMouseEnter?: React.MouseEventHandler<HTMLElement>;
  /**
   * Pointer-leave handler attached to the popover container itself.
   */
  onMouseLeave?: React.MouseEventHandler<HTMLElement>;
}

/**
 * Render props for fixed mode (manual coordinates)
 */
export interface FixedRenderProps {
  x: number;
  y: number;
  /**
   * StyleX styles for the popover container.
   */
  xstyle?: StyleXStyles;
  /**
   * Additional CSS class name(s) for the popover container.
   * Use with themeProps() for theme targeting when reflecting visual props.
   */
  className?: string;
  /**
   * Inline styles for the popover container.
   * Merged after StyleX and position styles.
   */
  style?: React.CSSProperties;
}

/**
 * Base options shared by both modes
 */
interface BaseLayerOptions {
  /**
   * Callback fired when layer is shown.
   * Wrap in useCallback for stable identity.
   */
  onShow?: () => void;

  /**
   * Callback fired when layer is hidden.
   * Wrap in useCallback for stable identity.
   */
  onHide?: () => void;

  /**
   * Whether clicking outside should dismiss the layer.
   * When true, uses popover="auto" for native light-dismiss behavior.
   * @default false
   */
  lightDismiss?: boolean;
}

/**
 * Options for context mode (CSS anchor positioning)
 */
export interface ContextLayerOptions extends BaseLayerOptions {
  mode: 'context';
  /**
   * Defer mounting the final layer and resolving its inline/portal position
   * until `show()` is requested. Hiding unmounts it while the inert marker
   * remains at the JSX position. Use this when rich content must never enter
   * an unsafe ancestor, even briefly, and does not need to exist while closed.
   *
   * @default false
   */
  lazyMount?: boolean;
}

/**
 * Options for fixed mode (manual positioning)
 */
export interface FixedLayerOptions extends BaseLayerOptions {
  mode: 'fixed';
}

/**
 * Return type for context mode
 */
export interface ContextLayerReturn {
  /**
   * Ref to attach to trigger element.
   * Injects anchorName style for CSS anchor positioning.
   */
  ref: RefCallback<HTMLElement>;

  /**
   * The CSS anchor name to use for positioning.
   * Use this when you need to set anchorName manually (e.g., display:contents wrapper).
   */
  anchorId: string;

  /**
   * Show the layer
   */
  show: () => void;

  /**
   * Hide the layer
   */
  hide: () => void;

  /**
   * Whether the layer is currently open
   */
  isOpen: boolean;

  /**
   * Unique ID for aria-describedby
   */
  id: string;

  /**
   * Render function for layer content.
   * Pass placement and alignment for anchor positioning.
   */
  render: (children: ReactNode, props?: ContextRenderProps) => ReactNode;
}

/**
 * Return type for fixed mode
 */
export interface FixedLayerReturn {
  /**
   * Ref is undefined in fixed mode (no anchor element needed)
   */
  ref: undefined;

  /**
   * Show the layer
   */
  show: () => void;

  /**
   * Hide the layer
   */
  hide: () => void;

  /**
   * Whether the layer is currently open
   */
  isOpen: boolean;

  /**
   * Unique ID for aria-describedby
   */
  id: string;

  /**
   * Render function for layer content.
   * Pass x and y coordinates for fixed positioning.
   */
  render: (children: ReactNode, props: FixedRenderProps) => ReactNode;
}

interface InternalLayerFields {
  wasJustDismissed: () => boolean;
}

/**
 * Context-mode options a core component may pass through `useLayerInternal`;
 * not part of the public `useLayer` options.
 */
interface InternalContextLayerOptions extends ContextLayerOptions {
  /**
   * The layer must never settle over its anchor (spec:AST-059 FR4). When the
   * standard fallback list settles it over its anchor, it switches to its
   * anchor-clear list: beside the trigger, then whichever block side is
   * roomier, sized to its room. For a hover-summoned layer, which the hover on
   * its trigger keeps open.
   */
  keepsAnchorClear?: boolean;
}

type InternalContextLayerReturn = ContextLayerReturn & InternalLayerFields;
type InternalFixedLayerReturn = FixedLayerReturn & InternalLayerFields;

function toCssLength(value: number | string): string {
  return typeof value === 'number' ? `${value}px` : value;
}

/**
 * Make the engine choose a shown layer's position option afresh: a browser
 * keeps a laid-out layer on the option it last used until the layer stops
 * being rendered, so the layer is taken out of rendering for one forced
 * layout and restored, in the same task. No frame paints in between and the
 * popover stays open, so no toggle event fires and focus and hover are
 * untouched. Every CSS animation and transition of the layer and its content
 * is put back in the state it was in (`preserveAnimations`).
 */
function placeAfresh(layer: HTMLElement): void {
  preserveAnimations(layer, () => {
    const display = layer.style.display;
    layer.style.display = 'none';
    layer.getBoundingClientRect();
    layer.style.display = display;
  });
}

const TRANSFORM_PROPERTIES = ['transform', 'translate', 'scale', 'rotate'];

function hasTransform(style: CSSStyleDeclaration): boolean {
  return TRANSFORM_PROPERTIES.some(name => {
    const value = style.getPropertyValue(name);
    return value !== '' && value !== 'none';
  });
}

/**
 * `rect`, the box of an element whose computed style still carries a 2D
 * transform, with that transform undone: the transformed box's centre is the
 * image of the element's centre, so undoing the transform about its origin on
 * that centre gives the untransformed box, at the element's layout size. A
 * transform this cannot undo (3D, or a rotation in another unit) leaves `rect`
 * as it is.
 */
function untransform(
  rect: DOMRect,
  layer: HTMLElement,
  style: CSSStyleDeclaration,
): DOMRect {
  const set = (value: string) => value !== '' && value !== 'none';
  if (typeof DOMMatrix === 'undefined' || layer.offsetWidth <= 0) {
    return rect;
  }
  // The individual transform properties apply before `transform`, in this
  // order (CSS Transforms 2).
  let matrix = new DOMMatrix();
  if (set(style.translate)) {
    const [x = '0', y = '0', z] = style.translate.split(' ');
    if (z != null) {
      return rect;
    }
    matrix = matrix.translate(parseFloat(x), parseFloat(y));
  }
  if (set(style.rotate)) {
    if (!/^-?[\d.]+deg$/.test(style.rotate)) {
      return rect;
    }
    matrix = matrix.rotate(parseFloat(style.rotate));
  }
  if (set(style.scale)) {
    const [x = '1', y = x, z] = style.scale.split(' ');
    if (z != null) {
      return rect;
    }
    matrix = matrix.scale(parseFloat(x), parseFloat(y));
  }
  if (set(style.transform)) {
    matrix = matrix.multiply(new DOMMatrix(style.transform));
  }
  if (!matrix.is2D) {
    return rect;
  }
  const [originX = 0, originY = 0] = style.transformOrigin
    .split(' ')
    .map(value => parseFloat(value));
  const width = layer.offsetWidth;
  const height = layer.offsetHeight;
  const centre = matrix.transformPoint(
    new DOMPoint(width / 2 - originX, height / 2 - originY),
  );
  const left = rect.left + rect.width / 2 - centre.x - originX;
  const top = rect.top + rect.height / 2 - centre.y - originY;
  return new DOMRect(left, top, width, height);
}

/**
 * The layer's box where its position option put it, without the transform an
 * entry animation (or anything else) applies to it: a Tooltip enters from a
 * few pixels toward its trigger, scaled down, so the transformed box of a
 * tooltip that fits beside its trigger can read as covering it while it
 * enters. The layer's transforms are overridden with `none !important`, which
 * outranks an animation, for this one read and then restored, in the same
 * task: no frame paints in between and the animation keeps running. Where the
 * engine still applies an animated transform under that override (WebKit),
 * the read box has that transform undone instead (`untransform`). A layer
 * that transitions a transform property is not overridden, since restoring the
 * value would start that transition; its box has its transform undone.
 */
function settledBox(layer: HTMLElement): DOMRect {
  const view = layer.ownerDocument.defaultView;
  const style = view?.getComputedStyle(layer);
  if (style == null || !hasTransform(style)) {
    return layer.getBoundingClientRect();
  }
  const transitions = style.transitionProperty.split(',').map(p => p.trim());
  const durations = style.transitionDuration.split(',').map(parseFloat);
  const transitioned = transitions.some(
    (name, index) =>
      (name === 'all' || TRANSFORM_PROPERTIES.includes(name)) &&
      (durations[index % durations.length] ?? 0) > 0,
  );
  if (transitioned) {
    return untransform(layer.getBoundingClientRect(), layer, style);
  }
  const saved = TRANSFORM_PROPERTIES.map(
    name =>
      [
        name,
        layer.style.getPropertyValue(name),
        layer.style.getPropertyPriority(name),
      ] as const,
  );
  for (const name of TRANSFORM_PROPERTIES) {
    layer.style.setProperty(name, 'none', 'important');
  }
  const box = layer.getBoundingClientRect();
  const under = view?.getComputedStyle(layer);
  const settled =
    under != null && hasTransform(under) ? untransform(box, layer, under) : box;
  for (const [name, value, priority] of saved) {
    if (value === '') {
      layer.style.removeProperty(name);
    } else {
      layer.style.setProperty(name, value, priority);
    }
  }
  return settled;
}

/**
 * Whether the standard list has failed a layer that must keep its anchor
 * clear: its box covers the anchor or, while the anchor is in view, leaves the
 * viewport on the block axis. Only a box that overlaps the anchor counts; a
 * layer flush against it does not.
 */
function failsAnchor(layer: HTMLElement, anchor: HTMLElement): boolean {
  const a = anchor.getBoundingClientRect();
  const l = settledBox(layer);
  if (l.width <= 0 || l.height <= 0) {
    return false;
  }
  const covers =
    l.left < a.right &&
    a.left < l.right &&
    l.top < a.bottom &&
    a.top < l.bottom;
  // The viewport's block extent, as the layer's anchor positioning sees it.
  const viewportBlock = layer.ownerDocument.documentElement.clientHeight;
  const anchorInView = a.bottom > 0 && a.top < viewportBlock;
  return covers || (anchorInView && (l.top < 0 || l.bottom > viewportBlock));
}

/**
 * For a layer that must never settle over its anchor (spec:AST-059 FR4): read
 * where its fallback list settled it and, if its box covers the anchor or,
 * while the anchor is in view, leaves the viewport on the block axis, switch it
 * to its anchor-clear list; then let it scroll only if its content overflows
 * the box it was given (FR3). Engines differ in where they leave a box that
 * fits no option: Chromium shifts it into the viewport, over the anchor; WebKit
 * keeps it at its preferred position, partly off-screen. Either way the
 * standard list has failed it. The runtime calls this in the same task as
 * every show and remount, and while the layer is open whenever its size, its
 * content's size, its anchor's size or the viewport changes; each of those
 * reads lands before the next frame paints. A same-size anchor that moves on
 * screen, in layout or because something scrolled, is read after paint, from
 * the anchor-move observer (FR8). Scroll events are not read: during one the
 * anchor has moved but the layer anchored to it not yet, so the read would
 * compare a moved anchor with a stale layer. Once switched, a layer keeps its
 * anchor-clear list until it next opens, so it never jumps back over its
 * trigger while open; it is placed afresh (`placeAfresh`) only when the switch
 * does not take effect at once, or when a later read finds it failing again.
 */
function keepAnchorClear(layer: HTMLElement, anchor: HTMLElement | null): void {
  if (anchor && failsAnchor(layer, anchor)) {
    const switching = !layer.hasAttribute(LAYER_CLEARS_ANCHOR_ATTRIBUTE);
    layer.setAttribute(LAYER_CLEARS_ANCHOR_ATTRIBUTE, '');
    // A switch usually takes effect at once. The engine may instead keep the
    // option it last used, even one the new list does not contain or one a
    // scroll has since made fail: then, and on any later read that finds the
    // switched layer failing again, place it afresh.
    if (!switching || failsAnchor(layer, anchor)) {
      placeAfresh(layer);
    }
  }
  // A layer that fits has no scroll range and stays a plain box, so a wheel
  // over it still scrolls the page.
  layer.toggleAttribute(
    LAYER_SCROLLS_ATTRIBUTE,
    layer.scrollHeight > layer.clientHeight + 1,
  );
}

/**
 * Call `onMove` when an element moves on screen without changing size: in
 * layout (a sibling above it grows, a margin changes) or because something
 * scrolled. ResizeObserver sees only size. The element is observed by an
 * IntersectionObserver whose root is the viewport shrunk, through
 * `rootMargin`, to the element's own rectangle (the layout-shift technique of
 * `@floating-ui/dom`'s `observeMove`), so any move changes the intersection
 * ratio and fires the callback, which calls `onMove` and re-arms on the new
 * rectangle. Intersection callbacks run after the frame that moved the
 * element has painted, so the caller corrects that move in the next frame.
 *
 * A fresh observer's first report can already differ from its threshold: the
 * element is partly outside the viewport, or it kept moving between the
 * rectangle read and the observer's first check, as it does every frame of a
 * smooth scroll. Any such report calls `onMove` and re-arms, at the reported
 * ratio, or at once on the element's new rectangle when the report is 0 and
 * the element moved, so a move that spans many frames is followed frame by
 * frame. A report of 0 for an element that has not moved means a scrolled
 * container clips it wholly; re-arming then would report 0 again every frame.
 * Instead a second IntersectionObserver, rooted at the viewport with a
 * threshold of 0 (it counts every ancestor's overflow clip), waits for the
 * element to come back into view, then calls `onMove` and re-arms. Nothing
 * runs on a timer. Returns the function that stops observing.
 */
function observeMove(element: HTMLElement, onMove: () => void): () => void {
  const doc = element.ownerDocument;
  if (typeof IntersectionObserver === 'undefined') {
    return () => {};
  }
  let observer: IntersectionObserver | null = null;
  let visibility: IntersectionObserver | null = null;
  const stop = () => {
    observer?.disconnect();
    observer = null;
    visibility?.disconnect();
    visibility = null;
  };
  const moved = (threshold: number) => {
    onMove();
    arm(threshold);
  };
  const arm = (threshold: number) => {
    stop();
    const root = doc.documentElement;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }
    const top = Math.floor(rect.top);
    const left = Math.floor(rect.left);
    const right = Math.floor(root.clientWidth - rect.right);
    const bottom = Math.floor(root.clientHeight - rect.bottom);
    const hasMoved = () => {
      const now = element.getBoundingClientRect();
      return (
        now.top !== rect.top ||
        now.left !== rect.left ||
        now.width !== rect.width ||
        now.height !== rect.height
      );
    };
    // Clipped by a scrolled container: wait, without a timer, for the
    // element to come back into view. A first report that already finds it
    // in view only counts if it has moved, so a clip the move observer and
    // this one judge differently cannot re-arm every frame.
    const awaitVisible = () => {
      let isFirstVisible = true;
      visibility = new IntersectionObserver(
        entries => {
          const visible = entries[entries.length - 1]?.isIntersecting ?? false;
          const firstVisible = isFirstVisible;
          isFirstVisible = false;
          if (visible && (!firstVisible || hasMoved())) {
            moved(1);
          }
        },
        {root: doc, threshold: 0},
      );
      visibility.observe(element);
    };
    let isFirst = true;
    observer = new IntersectionObserver(
      entries => {
        const ratio = entries[entries.length - 1]?.intersectionRatio ?? 0;
        const first = isFirst;
        isFirst = false;
        if (ratio === threshold) {
          // Still over its own rectangle, but a move smaller than the
          // rounding of the root margin can leave the ratio at 1.
          if (ratio === 1 && hasMoved()) {
            moved(1);
          }
          return;
        }
        if (!first || ratio > 0) {
          moved(first ? ratio : 1);
          return;
        }
        if (hasMoved()) {
          moved(1);
          return;
        }
        if (visibility === null) {
          awaitVisible();
        }
      },
      {
        root: doc,
        rootMargin: `${-top}px ${-right}px ${-bottom}px ${-left}px`,
        threshold,
      },
    );
    observer.observe(element);
  };
  arm(1);
  return stop;
}

/**
 * Watch an open layer that keeps its anchor clear, and its anchor, for every
 * change that can re-settle the layer over the anchor or give it a scroll
 * range (spec:AST-059 FR4, FR8): the layer, its content or the anchor
 * resizing (ResizeObserver, before paint), the viewport resizing (before
 * paint), and the anchor moving on screen without resizing, in layout or by a
 * scroll (`observeMove`, after paint). Each calls `keepAnchorClear` for this layer and anchor while
 * `isCurrent` says they are still the live pair. Returns the function that
 * removes every observer and listener it added.
 */
function observeAnchorClearance(
  layer: HTMLElement,
  anchor: HTMLElement,
  isCurrent: () => boolean,
): () => void {
  const view = layer.ownerDocument.defaultView;
  if (!view) {
    return () => {};
  }
  const reread = () => {
    if (isCurrent()) {
      keepAnchorClear(layer, anchor);
    }
  };
  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(reread);
    observer.observe(layer);
    for (const child of Array.from(layer.children)) {
      observer.observe(child);
    }
    observer.observe(anchor);
  }
  const stopObservingMove = observeMove(anchor, reread);
  view.addEventListener('resize', reread);
  return () => {
    observer?.disconnect();
    stopObservingMove();
    view.removeEventListener('resize', reread);
  };
}

/**
 * Popover operations in flight, per document.
 *
 * The Popover API refuses to show a popover while the document is in the
 * middle of showing or hiding ANY popover: `showPopover()` throws an
 * `InvalidStateError` ("Invalid to show a popover during another show
 * operation"); an engine still rolling the rule out instead refuses silently
 * with a console warning, which would leave this hook open with nothing
 * shown. Hiding a popover restores focus to the element that had it —
 * synchronously, inside that window — so a focus-driven layer on the element
 * receiving focus (a tooltip on the trigger that just closed a popover) asks
 * to show while the hide is still running. Every layer's show and hide passes
 * through here, so the window is observable: a `show()` that arrives inside
 * it is replayed in a microtask, which runs once the script that started the
 * operation — and the event dispatch it answered — has unwound.
 */
const popoverOperationsByDocument = new WeakMap<Document, number>();

function runPopoverOperation(doc: Document, operation: () => void): void {
  popoverOperationsByDocument.set(
    doc,
    (popoverOperationsByDocument.get(doc) ?? 0) + 1,
  );
  try {
    operation();
  } finally {
    popoverOperationsByDocument.set(
      doc,
      (popoverOperationsByDocument.get(doc) ?? 1) - 1,
    );
  }
}

function isPopoverOperationInFlight(doc: Document): boolean {
  return (popoverOperationsByDocument.get(doc) ?? 0) > 0;
}

interface ContextLayerMount {
  /** Null means the marker's parent is safe and the layer stays inline. */
  portalTarget: HTMLElement | null;
  /** Logical writing context lost when moving outside an unsafe ancestor. */
  portalStyle: React.CSSProperties;
}

function readPortalWritingContext(
  element: HTMLElement,
  portalTarget: HTMLElement,
): React.CSSProperties {
  const view = element.ownerDocument.defaultView;
  if (!view) {
    return {};
  }
  const sourceStyle = view.getComputedStyle(element);
  const targetStyle = view.getComputedStyle(portalTarget);

  // Do not snapshot custom properties here. The portal target is the closest
  // safe ancestor, so theme variables continue to inherit and update there.
  // These two properties can be set on the unsafe chain itself and directly
  // affect the logical anchor-positioning keywords used by the layer. Only
  // override values the portal would actually lose; matching values should
  // keep inheriting from the target so later direction changes remain live.
  return {
    ...(sourceStyle.direction !== targetStyle.direction && {
      direction: sourceStyle.direction as React.CSSProperties['direction'],
    }),
    ...(sourceStyle.writingMode !== targetStyle.writingMode && {
      writingMode:
        sourceStyle.writingMode as React.CSSProperties['writingMode'],
    }),
  };
}

/**
 * Map logical placement/alignment to a CSS position-area value.
 *
 * Uses the self-* logical keyword family: the inline axis resolves against
 * the popover's own direction (inherited inline or preserved when portaled),
 * so it mirrors in RTL without placement-specific JS. The block axis is
 * direction-neutral but must come from the same keyword family — mixing
 * physical `top` with `self-inline-*` produces an invalid position-area
 * (computes to `none`, which pins the popover to the viewport corner because
 * styles.base zeroes the UA margins).
 *
 * Note the plain logical family (`inline-start`, no `self-`) is NOT a
 * substitute: it resolves against the containing block — the page root for
 * a top-layer popover — so it ignores `direction` set on a subtree, which
 * is exactly #3389's repro.
 */
function getPositionArea(
  placement: LayerPlacement = 'above',
  alignment: LayerAlignment = 'center',
): string {
  if (placement === 'above' || placement === 'below') {
    const block = placement === 'above' ? 'self-block-start' : 'self-block-end';
    if (alignment === 'start') {
      return `${block} span-self-inline-end`;
    }
    if (alignment === 'end') {
      return `${block} span-self-inline-start`;
    }
    return block; // center
  }

  const inline =
    placement === 'start' ? 'self-inline-start' : 'self-inline-end';
  if (alignment === 'start') {
    return `${inline} span-self-block-end`;
  }
  if (alignment === 'end') {
    return `${inline} span-self-block-start`;
  }
  return inline; // center
}

/**
 * Compute the `position-try-fallbacks` list for a placement/alignment pair
 * (spec:AST-059 FR4).
 *
 * Flips first; they mirror the placement-axis margins (clearance and gutter)
 * and the alignment-axis gutter with the area. Then the slide: named
 * `@position-try` options whose area spans the whole alignment axis
 * (`layerSlideRules.ts`), same side of the trigger first, opposite side
 * second. Flips alone cannot rescue a layer wider than the room on either
 * side of its trigger — every flipped option overflows the alignment axis
 * too, and the browser keeps the base option, so the layer never moves to the
 * side of the trigger that has room on the placement axis (#3671 for centered
 * layers, where a flip maps center → center). A slide option fits wherever
 * the layer fits the viewport; its anchor-center alignment plus the browser's
 * overflow shift keep the layer's margin box — and so the gutter on both
 * edges — inside the viewport. Centered layers keep their one-sided spans
 * ahead of the full span so they slide the least distance first.
 */
export function getPositionTryFallbacks(
  placement: LayerPlacement = 'above',
  alignment: LayerAlignment = 'center',
): string {
  const flips = 'flip-block, flip-inline, flip-block flip-inline';
  const slides = `${slideRuleName(placement, alignment, 'same')}, ${slideRuleName(placement, alignment, 'opposite')}`;

  if (alignment !== 'center') {
    return `${flips}, ${slides}`;
  }

  if (placement === 'above' || placement === 'below') {
    const [same, opposite] =
      placement === 'above' ? ['top', 'bottom'] : ['bottom', 'top'];
    return `${flips}, ${same} span-left, ${same} span-right, ${opposite} span-left, ${opposite} span-right, ${slides}`;
  }

  const [same, opposite] =
    placement === 'start' ? ['left', 'right'] : ['right', 'left'];
  return `${flips}, ${same} span-top, ${same} span-bottom, ${opposite} span-top, ${opposite} span-bottom, ${slides}`;
}

/**
 * The self-alignment an aligned layer uses while its anchor is out of view
 * (spec:AST-059 FR5). A position-area box that overflows the room beside its
 * anchor is shifted by default to stay inside the viewport — the slide an
 * aligned layer relies on when it fits on neither side (FR4). Once the anchor
 * has left the viewport that shift would pin the layer into the narrowest
 * strip at the edge, so the alignment is pinned `unsafe` toward the anchor
 * instead and the layer holds the position its flips give it. `self-*`
 * keywords resolve against the layer's own direction, matching the `self-*`
 * position-area family; the flip tactics swap start/end with the area.
 *
 * Centered layers already slide through their span fallbacks and are
 * unchanged; a visible anchor keeps the browser's default alignment.
 */
export function getSelfAlignment(
  placement: LayerPlacement,
  alignment: LayerAlignment,
  isAnchorInView: boolean,
): React.CSSProperties {
  if (isAnchorInView || alignment === 'center') {
    return {};
  }
  const edge = alignment === 'start' ? 'unsafe self-start' : 'unsafe self-end';
  return placement === 'above' || placement === 'below'
    ? {justifySelf: edge}
    : {alignSelf: edge};
}

/**
 * The gutter styles for a placement/alignment pair: the far viewport edge of
 * the alignment axis, or both edges when centered (spec:AST-059 FR1).
 */
function getGutterStyles(
  placement: LayerPlacement,
  alignment: LayerAlignment,
): ReadonlyArray<StyleXStyles> {
  if (placement === 'above' || placement === 'below') {
    if (alignment === 'start') {
      return [styles.gutterInlineEnd];
    }
    if (alignment === 'end') {
      return [styles.gutterInlineStart];
    }
    return [styles.gutterInlineStart, styles.gutterInlineEnd];
  }
  if (alignment === 'start') {
    return [styles.gutterBlockEnd];
  }
  if (alignment === 'end') {
    return [styles.gutterBlockStart];
  }
  return [styles.gutterBlockStart, styles.gutterBlockEnd];
}

/**
 * Internal props for controls that sit beside an open layer. This stays out of
 * the public useLayer/usePopover return types until the input family adopts it.
 */
export function useKeepLayerOpenProps(
  id: string,
  isOpen: boolean,
): KeepLayerOpenProps {
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  return useMemo(
    () => ({
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
        if (!isOpenRef.current) {
          return;
        }
        // The browser reads the invoker relationship at both ends of the press.
        const control = event.currentTarget;
        const doc = control.ownerDocument;
        control.setAttribute('popovertarget', id);
        const onPressEnd = () => {
          doc.removeEventListener('pointerup', onPressEnd);
          doc.removeEventListener('pointercancel', onPressEnd);
          // Light dismiss runs as the pointerup default action after listeners.
          doc.defaultView?.setTimeout(() => {
            control.removeAttribute('popovertarget');
          }, 0);
        };
        doc.addEventListener('pointerup', onPressEnd);
        doc.addEventListener('pointercancel', onPressEnd);
      },
      onClickCapture: (event: React.MouseEvent<HTMLElement>) => {
        const control = event.currentTarget;
        if (control.hasAttribute('popovertarget')) {
          // Being an invoker would otherwise toggle the layer shut.
          event.preventDefault();
          control.removeAttribute('popovertarget');
        }
      },
    }),
    [id],
  );
}

/**
 * Core layer hook that handles popover behavior and positioning.
 *
 * Supports two positioning modes with type-safe render props:
 * - `context`: CSS anchor positioning relative to a trigger element
 * - `fixed`: Fixed positioning at specified coordinates
 *
 * @example
 * ```
 * const layer = useLayer({ mode: 'context' });
 * <button ref={layer.ref}>Trigger</button>
 * {layer.render(<Content />, { placement: 'above', alignment: 'center' })}
 * ```
 */
function useLayerImplementation(
  options: InternalContextLayerOptions | FixedLayerOptions,
): InternalContextLayerReturn | InternalFixedLayerReturn {
  const {mode, onShow, onHide, lightDismiss = false} = options;
  const lazyMount = mode === 'context' ? (options.lazyMount ?? false) : false;
  const keepsAnchorClear =
    mode === 'context' ? (options.keepsAnchorClear ?? false) : false;
  const id = useId();
  const anchorId = `--astryx-layer-${id.replace(/:/g, '')}`;

  const [isOpen, setIsOpen] = useState(false);
  // Whether the anchor is inside the viewport (spec:AST-059 FR5). The slide
  // fallback is withdrawn while it is not, so an aligned layer holds its
  // position and size instead of chasing an anchor nobody can see.
  const [isAnchorInView, setIsAnchorInView] = useState(true);
  // Mirror so the pre-paint read commits nothing when the answer is unchanged.
  const isAnchorInViewRef = useRef(true);
  const updateAnchorInView = useCallback((inView: boolean) => {
    if (isAnchorInViewRef.current !== inView) {
      isAnchorInViewRef.current = inView;
      setIsAnchorInView(inView);
    }
  }, []);
  // The inset the app declared on LayerProvider (FR6). Read through context
  // and written inline on the layer, so a corrective portal cannot escape it
  // and no measurement is needed to apply it.
  const layerContext = useLayerContext();
  const declaredInset = layerContext?.inset;
  const popoverRef = useRef<HTMLElement | null>(null);
  // The DOM element on which the current logical open state was applied.
  // A portal target change replaces the popover element; retaining the old
  // reference lets the ref callback recognize and reopen its replacement.
  const openedPopoverRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  // Context layers place a persistent inert marker at their real JSX position.
  // Its parent tells us whether the final layer can stay inline or needs a
  // corrective portal, including after the render call moves.
  const sentinelRef = useRef<HTMLTemplateElement | null>(null);
  const contextMountRef = useRef<ContextLayerMount | null>(null);
  const [contextMount, setContextMount] = useState<ContextLayerMount | null>(
    null,
  );
  // A show() that cannot run yet is remembered here and replayed: one that
  // arrives before the final layer mounts runs when its popover ref attaches;
  // one that arrives while another popover is mid show/hide runs once that
  // operation has unwound. hide() forgets it either way.
  const pendingShowRef = useRef(false);

  // Ref mirrors isOpen for synchronous reads inside show/hide.
  // State drives re-renders; the ref lets the imperative calls avoid
  // stale-closure reads of the previous isOpen value.
  const isOpenRef = useRef(false);

  // The gesture during which the browser last closed this layer on its own.
  // Read through wasJustDismissed by triggers deciding whether a click is
  // theirs to act on.
  const dismissedByGestureRef = useRef<number | null>(null);
  const forgetDismissalRef = useRef<(() => void) | null>(null);

  const wasJustDismissed = useCallback(() => {
    const gesture = currentGesture();
    return dismissedByGestureRef.current === gesture;
  }, []);

  const showPopoverElement = useCallback((popover: HTMLElement) => {
    // Finding infra-4: the Popover API is unsupported on Safari <17 and
    // Firefox <125. On those browsers `showPopover` does not exist, so fall
    // back to plain visibility instead of throwing.
    if (typeof popover.showPopover === 'function') {
      runPopoverOperation(popover.ownerDocument, () => {
        // The trigger is passed as the popover's invoker `source`: a layer
        // hosted away from its trigger then still takes its sequential focus
        // order (and its popover nesting) from the trigger rather than from
        // its own DOM position. Browsers without the option ignore it.
        // `source` is declared as an `HTMLElement`. A caller-rendered icon
        // trigger is an `SVGElement`, whose dictionary conversion throws
        // before the popover opens. Omitting the option for it still anchors
        // the layer, because positioning reads the anchor-name pair, and only
        // gives up the invoker's focus order. The check asks the trigger's own
        // window: an HTML trigger rendered into another document (an iframe,
        // a Picture-in-Picture window) is not an instance of this window's
        // `HTMLElement`, and keeps its source.
        const trigger = triggerRef.current;
        const triggerView = trigger?.ownerDocument.defaultView;
        popover.showPopover({
          source:
            triggerView != null && trigger instanceof triggerView.HTMLElement
              ? trigger
              : undefined,
        });
      });
    } else {
      popover.style.display = 'block';
    }
    openedPopoverRef.current = popover;
  }, []);

  const isCurrentContextPopover = useCallback(
    (popover: HTMLElement): boolean => {
      if (mode !== 'context') {
        return true;
      }
      const mount = contextMountRef.current;
      if (mount === null) {
        return false;
      }
      const expectedParent =
        mount.portalTarget ?? sentinelRef.current?.parentElement ?? null;
      return popover.parentElement === expectedParent;
    },
    [mode],
  );

  const requestContextMount = useCallback(() => {
    if (mode !== 'context') {
      return;
    }

    const sentinel = sentinelRef.current;
    const inlineParent = sentinel?.parentElement ?? null;
    if (!sentinel || !inlineParent) {
      return;
    }

    const portalTarget = resolveLayerPortalTarget(inlineParent);
    const mount: ContextLayerMount = {
      portalTarget,
      portalStyle: portalTarget
        ? readPortalWritingContext(sentinel, portalTarget)
        : {},
    };
    contextMountRef.current = mount;
    setContextMount(mount);
  }, [mode]);

  const clearContextMount = useCallback(() => {
    if (mode !== 'context' || !lazyMount) {
      return;
    }
    contextMountRef.current = null;
    setContextMount(null);
  }, [mode, lazyMount]);

  const show = useCallback(() => {
    // Every caller lands here, so this is where the dismissing press is
    // absorbed: opening now would reopen the popup that same press closed.
    if (wasJustDismissed()) {
      return;
    }
    // A context popover left over until React commits a previous hide must not
    // be reopened. The synchronous mount ref is the source of truth.
    const candidate = popoverRef.current;
    const popover =
      candidate && isCurrentContextPopover(candidate) ? candidate : null;
    if (!popover) {
      pendingShowRef.current = true;
      requestContextMount();
      return;
    }
    if (!isOpenRef.current) {
      // Another popover is mid show/hide (typically one whose hide is handing
      // focus back to this layer's trigger): the browser would refuse the
      // show, so replay this call once that operation has returned.
      if (isPopoverOperationInFlight(popover.ownerDocument)) {
        pendingShowRef.current = true;
        queueMicrotask(() => {
          if (pendingShowRef.current) {
            pendingShowRef.current = false;
            showRef.current();
          }
        });
        return;
      }
      popover.removeAttribute(LAYER_CLEARS_ANCHOR_ATTRIBUTE);
      popover.removeAttribute(LAYER_SCROLLS_ATTRIBUTE);
      showPopoverElement(popover);
      if (keepsAnchorClear) {
        keepAnchorClear(popover, triggerRef.current);
      }
      isOpenRef.current = true;
      setIsOpen(true);
      onShow?.();
    }
  }, [
    onShow,
    keepsAnchorClear,
    requestContextMount,
    showPopoverElement,
    isCurrentContextPopover,
    wasJustDismissed,
  ]);

  const hide = useCallback(() => {
    pendingShowRef.current = false;
    if (isOpenRef.current) {
      const el = popoverRef.current;
      // Clear the open state BEFORE hiding: hidePopover fires `toggle`, and
      // the reconciler below reads this ref to tell the browser's own
      // dismissals from ours.
      openedPopoverRef.current = null;
      isOpenRef.current = false;
      // See finding infra-4 note in `show`: mirror the same guard on hide so
      // unsupported browsers degrade gracefully instead of throwing.
      if (el) {
        if (typeof el.hidePopover === 'function') {
          // Hiding hands focus back to the previously focused element while
          // the browser still counts this popover as hiding; a layer that
          // focus wakes (a tooltip on that element) defers its show until
          // this returns.
          runPopoverOperation(el.ownerDocument, () => {
            el.hidePopover();
          });
        } else {
          el.style.display = 'none';
        }
      }
      setIsOpen(false);
      onHide?.();
    }
    clearContextMount();
  }, [onHide, clearContextMount]);

  // A deferred show() replays through a ref so the queued closure reaches the
  // current callback rather than the one captured when it was queued.
  const showRef = useRef(show);
  showRef.current = show;

  // The open-state geometry observers of a layer that keeps its anchor clear
  // (`observeAnchorClearance`), as their teardown. The open-state layout
  // effect binds them; the trigger callback ref rebinds them when a caller
  // replaces the trigger element while the layer stays open.
  const clearObserversRef = useRef<(() => void) | null>(null);

  // Stable ref for the trigger element (context mode only).
  const contextRef = useCallback(
    (el: HTMLElement | null) => {
      // Remove only THIS layer's anchor name from the previous element so
      // other layers sharing the same trigger keep their anchors.
      if (triggerRef.current && triggerRef.current !== el) {
        removeAnchorName(triggerRef.current, anchorId);
      }

      if (el) {
        addAnchorName(el, anchorId);
      }

      const previous = triggerRef.current;
      triggerRef.current = el;

      // A trigger replaced while the layer is open (React detaches the old
      // node with `null`, then attaches the new one): the old trigger's
      // observers are removed before the new trigger's are added (INV6), and
      // binding them reads the new trigger's geometry at once.
      if (keepsAnchorClear && isOpenRef.current && el !== previous) {
        clearObserversRef.current?.();
        clearObserversRef.current = null;
        const layer = popoverRef.current;
        if (el && layer) {
          clearObserversRef.current = observeAnchorClearance(
            layer,
            el,
            () => popoverRef.current === layer && triggerRef.current === el,
          );
          keepAnchorClear(layer, el);
        }
      }
    },
    [anchorId, keepsAnchorClear],
  );

  // Arm only when the dismissing gesture's click is still ahead of us. Some
  // engines deliver click first; in that order there is nothing left to absorb.
  const rememberDismissal = useCallback((doc: Document) => {
    forgetDismissalRef.current?.();
    if (currentGestureHasClicked()) {
      return;
    }
    dismissedByGestureRef.current = currentGesture();
    const view = doc.defaultView;
    let forgetTimer: number | null = null;
    const forget = () => {
      dismissedByGestureRef.current = null;
      doc.removeEventListener('click', scheduleForget, true);
      if (forgetTimer !== null) {
        view?.clearTimeout(forgetTimer);
        forgetTimer = null;
      }
      if (forgetDismissalRef.current === forget) {
        forgetDismissalRef.current = null;
      }
    };
    const scheduleForget = () => {
      doc.removeEventListener('click', scheduleForget, true);
      // The next task keeps the dismissal armed through React's click handler.
      if (view) {
        forgetTimer = view.setTimeout(() => {
          forgetTimer = null;
          if (forgetDismissalRef.current === forget) {
            forget();
          }
        }, 0);
      } else {
        forget();
      }
    };
    doc.addEventListener('click', scheduleForget, true);
    forgetDismissalRef.current = forget;
  }, []);

  useEffect(() => {
    // Install capture-phase gesture tracking before the first interaction.
    currentGesture();
    return () => forgetDismissalRef.current?.();
  }, []);

  // Reconcile browser-initiated closes (light-dismiss, popover="auto" stack
  // eviction). These are the only cases where the DOM mutates without going
  // through our show/hide — we sync React state back to match.
  //
  // No "open" case: the browser never spontaneously opens a popover. Opens
  // only happen via showPopover() which we always call from show().
  //
  // The isOpenRef guard prevents double-firing: when our hide() already set
  // the ref to false, the subsequent toggle event (which the browser fires
  // as a side-effect of hidePopover) sees false and skips.
  const handleToggle = useCallback(
    (e: Event) => {
      const toggleEvent = e as ToggleEvent;
      if (toggleEvent.newState === 'closed' && isOpenRef.current) {
        openedPopoverRef.current = null;
        isOpenRef.current = false;
        rememberDismissal(
          (e.currentTarget as HTMLElement | null)?.ownerDocument ?? document,
        );
        setIsOpen(false);
        onHide?.();
        clearContextMount();
      }
    },
    [onHide, clearContextMount, rememberDismissal],
  );

  // Ref callback for popover element — sets up the `toggle` listener.
  // Tracks the element + handler currently bound so the listener is removed
  // when the element detaches or when `handleToggle`'s identity changes (a new
  // `onHide` prop), preventing stale-closure listeners from accumulating on the
  // same element (infra-10).
  const listenedElRef = useRef<HTMLElement | null>(null);
  const listenedHandlerRef = useRef<((e: Event) => void) | null>(null);

  const bindToggleListener = useCallback(
    (el: HTMLElement | null, handler: (e: Event) => void) => {
      if (
        listenedElRef.current &&
        listenedHandlerRef.current &&
        (listenedElRef.current !== el || listenedHandlerRef.current !== handler)
      ) {
        listenedElRef.current.removeEventListener(
          'toggle',
          listenedHandlerRef.current,
        );
        listenedElRef.current = null;
        listenedHandlerRef.current = null;
      }
      if (el && listenedElRef.current !== el) {
        el.addEventListener('toggle', handler);
        listenedElRef.current = el;
        listenedHandlerRef.current = handler;
      }
    },
    [],
  );

  const popoverRefCallback = useCallback(
    (el: HTMLElement | null) => {
      popoverRef.current = el;
      bindToggleListener(el, handleToggle);
      if (el && pendingShowRef.current) {
        pendingShowRef.current = false;
        show();
      } else if (
        el &&
        isOpenRef.current &&
        openedPopoverRef.current !== el &&
        isCurrentContextPopover(el)
      ) {
        // Changing a portal target remounts the popover. Preserve the logical
        // open state without firing onShow again for the replacement element.
        showPopoverElement(el);
        if (keepsAnchorClear) {
          keepAnchorClear(el, triggerRef.current);
        }
      }
    },
    [
      handleToggle,
      bindToggleListener,
      show,
      showPopoverElement,
      isCurrentContextPopover,
      keepsAnchorClear,
    ],
  );

  const sentinelRefCallback = useCallback(
    (el: HTMLTemplateElement | null) => {
      sentinelRef.current = el;
      if (el && (!lazyMount || pendingShowRef.current || isOpenRef.current)) {
        // The render call may have moved while the hook stayed mounted.
        // Resolve again from the newly attached marker rather than reusing a
        // portal target from its previous JSX position.
        requestContextMount();
      }
    },
    [lazyMount, requestContextMount],
  );

  // Re-bind when the handler identity changes while the element stays mounted,
  // and detach on unmount.
  useEffect(() => {
    if (popoverRef.current) {
      bindToggleListener(popoverRef.current, handleToggle);
    }
    return () => {
      if (listenedElRef.current && listenedHandlerRef.current) {
        listenedElRef.current.removeEventListener(
          'toggle',
          listenedHandlerRef.current,
        );
        listenedElRef.current = null;
        listenedHandlerRef.current = null;
      }
    };
  }, [handleToggle, bindToggleListener]);

  // The slide options' `@position-try` rules (FR4) are installed in the
  // layer's document before its first paint; one sheet serves every layer.
  useIsomorphicLayoutEffect(() => {
    if (mode !== 'context') {
      return;
    }
    const doc =
      popoverRef.current?.ownerDocument ?? sentinelRef.current?.ownerDocument;
    if (doc) {
      ensureSlideRules(doc);
    }
  }, [mode, contextMount]);

  // Anchor visibility (FR5). The first frame must already be right (FR8), so
  // the opening read is synchronous — a layout effect runs before paint, and a
  // state change inside it re-renders before paint — against the visual
  // viewport. IntersectionObserver then tracks changes while open; with no
  // root it reports against the viewport and through every ancestor clip, so
  // an anchor scrolled out of a panel reads as out of view too.
  useIsomorphicLayoutEffect(() => {
    if (!isOpen || mode !== 'context') {
      return;
    }
    const anchor = triggerRef.current;
    if (!anchor) {
      return;
    }
    const view = anchor.ownerDocument.defaultView;
    if (view) {
      // Edge-adjacent counts as in view, as IntersectionObserver reports it;
      // an engine with no layout (a zero rect) therefore reads as in view too.
      const rect = anchor.getBoundingClientRect();
      const inView =
        rect.bottom >= 0 &&
        rect.right >= 0 &&
        rect.top <= view.innerHeight &&
        rect.left <= view.innerWidth;
      updateAnchorInView(inView);
    }
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }
    const observer = new IntersectionObserver(entries => {
      const latest = entries[entries.length - 1];
      if (latest) {
        updateAnchorInView(latest.isIntersecting);
      }
    });
    observer.observe(anchor);
    return () => observer.disconnect();
  }, [isOpen, mode, updateAnchorInView]);

  // A layer that keeps its anchor clear (FR4) re-reads its geometry while it
  // is open: content that grows, an anchor that resizes or moves (in layout or
  // by a scroll) or a viewport resize can each re-settle the standard list over the anchor or
  // give the layer a scroll range (`observeAnchorClearance`). The external
  // systems are those browser observers and listeners; this effect binds them
  // while the layer is open and removes them when it closes, unmounts or is
  // remounted by a moved render call (`contextMount`). A trigger replaced while
  // open is rebound by the trigger callback ref, so no DOM node enters state.
  useIsomorphicLayoutEffect(() => {
    if (!keepsAnchorClear || !isOpen || mode !== 'context') {
      return;
    }
    const layer = popoverRef.current;
    const anchor = triggerRef.current;
    if (!layer || !anchor) {
      return;
    }
    clearObserversRef.current?.();
    clearObserversRef.current = observeAnchorClearance(
      layer,
      anchor,
      () => popoverRef.current === layer && triggerRef.current === anchor,
    );
    return () => {
      clearObserversRef.current?.();
      clearObserversRef.current = null;
    };
  }, [keepsAnchorClear, isOpen, mode, contextMount]);

  // Render function for context mode
  const renderContext = useCallback(
    (children: ReactNode, props?: ContextRenderProps) => {
      // Keep the marker mounted after resolving the layer. Apart from giving
      // us the real JSX parent on first show, this lets its ref report when a
      // persistent hook's render call moves to a different host.
      const sentinel = <template ref={sentinelRefCallback} />;

      if (contextMount === null) {
        return <>{sentinel}</>;
      }

      const {
        placement = 'above',
        alignment = 'center',
        positioning = 'anchor',
        offset,
        role,
        'aria-label': ariaLabel,
        xstyle,
        className: extraClassName,
        style: extraStyle,
        as: Container = 'div',
        onMouseEnter,
        onMouseLeave,
      } = props || {};

      // CSS anchor positioning (dynamic, not in StyleX)
      const standardFallbacks = getPositionTryFallbacks(placement, alignment);
      // A layer that keeps its anchor clear carries a second list; `show()`
      // switches to it when the standard list settles over the anchor (FR4).
      const clearFallbacks =
        keepsAnchorClear && positioning === 'anchor'
          ? getAnchorClearFallbacks(placement)
          : '';
      const clearFallbacksProperty: Record<string, string> = clearFallbacks
        ? {[LAYER_CLEAR_FALLBACKS_PROPERTY]: clearFallbacks}
        : {};
      const anchorStyle: React.CSSProperties =
        positioning === 'custom'
          ? // Consumer authors its own position styles via `style` — keep
            // only the anchor wiring, derive nothing from placement.
            {positionAnchor: anchorId}
          : {
              positionAnchor: anchorId,
              positionArea: getPositionArea(placement, alignment),
              positionTryFallbacks: clearFallbacks
                ? `var(${LAYER_TRY_FALLBACKS_PROPERTY}, ${standardFallbacks})`
                : standardFallbacks,
              ...getSelfAlignment(placement, alignment, isAnchorInView),
            };

      const clearance = offset ? toCssLength(offset) : null;
      const clearanceProperty: Record<string, string> =
        positioning === 'anchor' && clearance != null
          ? {[LAYER_CLEARANCE_PROPERTY]: clearance}
          : {};
      const offsetStyle =
        positioning !== 'anchor'
          ? null
          : clearance == null
            ? placement === 'above'
              ? styles.farAbove
              : placement === 'below'
                ? styles.farBelow
                : placement === 'start'
                  ? styles.farStart
                  : styles.farEnd
            : placement === 'above'
              ? styles.placementAbove(clearance)
              : placement === 'below'
                ? styles.placementBelow(clearance)
                : placement === 'start'
                  ? styles.placementStart(clearance)
                  : styles.placementEnd(clearance);

      const viewportStyles =
        positioning === 'anchor'
          ? [styles.viewportFit, ...getGutterStyles(placement, alignment)]
          : null;

      const stylexResult = stylex.props(
        layerTextReset.reset,
        layerStructureReset.reset,
        styles.base,
        overlayPaddingReset.reset,
        viewportStyles,
        offsetStyle,
        xstyle,
      );
      const combinedClassName = extraClassName
        ? `${extraClassName} ${stylexResult.className ?? ''}`
        : stylexResult.className;

      // The marker gives us the actual JSX parent without mounting arbitrary
      // children there. Safe positions preserve the existing DOM order and
      // cascade; unsafe positions use the nearest corrective portal target.
      const layer = (
        <Container
          ref={popoverRefCallback}
          id={id}
          role={role}
          aria-label={ariaLabel}
          popover={lightDismiss ? 'auto' : 'manual'}
          className={combinedClassName}
          style={{
            ...stylexResult.style,
            ...anchorStyle,
            ...clearanceProperty,
            ...clearFallbacksProperty,
            ...layerInsetProperties(declaredInset),
            ...contextMount.portalStyle,
            ...extraStyle,
          }}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}>
          <LayerContentBoundary>{children}</LayerContentBoundary>
        </Container>
      );

      return (
        <>
          {sentinel}
          {contextMount.portalTarget
            ? createPortal(layer, contextMount.portalTarget)
            : layer}
        </>
      );
    },
    [
      anchorId,
      contextMount,
      declaredInset,
      id,
      isAnchorInView,
      keepsAnchorClear,
      lightDismiss,
      popoverRefCallback,
      sentinelRefCallback,
    ],
  );

  // Render function for fixed mode
  const renderFixed = useCallback(
    (children: ReactNode, props: FixedRenderProps) => {
      const {
        x,
        y,
        xstyle,
        className: extraClassName,
        style: extraStyle,
      } = props;

      // Dynamic position values
      const positionStyle: React.CSSProperties = {
        top: y,
        left: x,
      };

      const stylexResult = stylex.props(
        layerTextReset.reset,
        layerStructureReset.reset,
        styles.base,
        overlayPaddingReset.reset,
        styles.fixed,
        xstyle,
      );
      const combinedClassName = extraClassName
        ? `${extraClassName} ${stylexResult.className ?? ''}`
        : stylexResult.className;

      return (
        <div
          ref={popoverRefCallback}
          id={id}
          popover={lightDismiss ? 'auto' : 'manual'}
          className={combinedClassName}
          style={{...stylexResult.style, ...positionStyle, ...extraStyle}}>
          <LayerContentBoundary>{children}</LayerContentBoundary>
        </div>
      );
    },
    [popoverRefCallback, id, lightDismiss],
  );

  const contextResult = useMemo<InternalContextLayerReturn>(
    () => ({
      ref: contextRef,
      anchorId,
      show,
      hide,
      isOpen,
      wasJustDismissed,
      id,
      render: renderContext,
    }),
    [
      contextRef,
      anchorId,
      show,
      hide,
      isOpen,
      wasJustDismissed,
      id,
      renderContext,
    ],
  );
  const fixedResult = useMemo<InternalFixedLayerReturn>(
    () => ({
      ref: undefined,
      show,
      hide,
      isOpen,
      wasJustDismissed,
      id,
      render: renderFixed,
    }),
    [show, hide, isOpen, wasJustDismissed, id, renderFixed],
  );

  return mode === 'context' ? contextResult : fixedResult;
}

export function useLayer(options: ContextLayerOptions): ContextLayerReturn;
export function useLayer(options: FixedLayerOptions): FixedLayerReturn;
export function useLayer(
  options: ContextLayerOptions | FixedLayerOptions,
): ContextLayerReturn | FixedLayerReturn {
  const internalLayer = useLayerImplementation(options);
  return useMemo(() => {
    const {wasJustDismissed: _, ...layer} = internalLayer;
    return layer;
  }, [internalLayer]);
}

/**
 * @internal Shared with usePopover and useTooltip; not exported from the
 * package barrel.
 */
export function useLayerInternal(
  options: InternalContextLayerOptions,
): InternalContextLayerReturn;
export function useLayerInternal(
  options: FixedLayerOptions,
): InternalFixedLayerReturn;
export function useLayerInternal(
  options: InternalContextLayerOptions | FixedLayerOptions,
): InternalContextLayerReturn | InternalFixedLayerReturn {
  return useLayerImplementation(options);
}
