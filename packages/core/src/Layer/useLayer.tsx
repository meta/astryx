// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useLayer.tsx
 * @input Uses React hooks, Popover API (its `beforetoggle`/`toggle` events through the popoverOperations ledger), CSS anchor positioning, owned DOM boundaries, shared text/provider boundaries
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
  useSyncExternalStore,
  type ReactNode,
  type RefCallback,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '@stylexjs/stylex';
import {createPortal} from 'react-dom';
import {LayerContentBoundary} from './layerScopedContext';
import {layerClickBoundary} from './layerClickBoundary';
import {addAnchorName, readAnchorNames, removeAnchorName} from './anchorName';
import {
  claimContextMenuPress,
  currentGesture,
  currentGestureHasClicked,
} from './gestureCounter';
import {resolveLayerPortalTarget} from './layerHost';
import {layerTextReset} from './layerTextReset.stylex';
import {layerStructureReset} from './layerStructureReset.stylex';
import {layerViewportInset} from './layerViewportInset.stylex';
import {keyboardLiftStyle, useLayerKeyboardClearance} from './LayerTouch';
import {LAYER_ANCHORED_ATTRIBUTE} from './layerKeyboardClearance';
import {settledBox} from './settledBox';
import {layerInsetProperties} from './layerInset';
import {
  LAYER_CLEARANCE_PROPERTY,
  ensureSlideRules,
  anchorClearAlignment,
  getAnchorClearFallbacks,
  slideRuleName,
} from './layerSlideRules';
import {
  afterPopoverOperations,
  isBrowserHideInFlight,
  isPopoverOperationInFlight,
  observeBrowserHide,
  runPopoverOperation,
} from './popoverOperations';
import {preserveAnimations} from './preserveAnimations';
import {useLayerContext} from './LayerContext';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {overlayPaddingReset} from '../Layout/overlayPaddingReset.stylex';
import {observeResize} from '../utils/sharedResizeObserver';
import {observeMutations} from '../utils/sharedMutationObserver';
import {containsAlongFlatTree, parentAcrossShadow} from '../utils/flatTree';
import {isShadowRoot} from '../utils/nodeType';
import {subscribeInput} from '../utils/inputStream';

const styles = stylex.create({
  // The software keyboard's block-size cap, on the layer's own element. Every
  // layer sets it, an uncapped one to a limit no viewport cap reaches. So a
  // layer nested in a capped one does not inherit the outer cap. The surfaces
  // inside a layer read it through `layerViewportInset.maxBlockSize`. The cap
  // also writes the overflow a capped surface takes. Popover's surface reads
  // it, so it scrolls from the commit that caps it. Beside them, the
  // keyboard's inset from the viewport's bottom lets a layer that places
  // itself slide above the keyboard. The inset keeps its largest value until
  // the layer closes, so that layer stays put as the keyboard goes. Every
  // layer sets it, `initial` until a keyboard is up, so a nested layer does
  // not inherit it. All three are private runtime state, never set by an app
  // or a theme.
  // SYNC: the properties are LAYER_KEYBOARD_CAP_PROPERTY,
  // LAYER_KEYBOARD_OVERFLOW_PROPERTY and LAYER_KEYBOARD_INSET_PROPERTY
  // (useLayerKeyboardClearance.ts).
  keyboardCap: (cap: string, overflow: 'auto' | 'visible', inset: string) => ({
    '--_layer-keyboard-max-block-size': cap,
    '--_layer-keyboard-overflow': overflow,
    '--_layer-keyboard-inset-block-end': inset,
  }),
  // A layer that keeps its anchor clear scrolls only once its content
  // overflows the box it was given. A layer that fits has no scroll range, so
  // a wheel over it scrolls the page. Nothing contains the scroll, so a tall
  // layer chains to the page at its end.
  scrollsOnOverflow: {
    overflowY: 'auto',
  },
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
   * While the layer is shown, and until its exit animation ends, the trigger
   * carries the layer's CSS anchor name.
   */
  ref: RefCallback<HTMLElement>;

  /**
   * The CSS anchor name to use for positioning.
   * Use this when you need to set anchorName manually (e.g., display:contents wrapper).
   * Set it only while the layer is shown or its exit animation runs.
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

/** Context-mode members a core component may use through `useLayerInternal`. */
interface InternalContextLayerFields {
  /**
   * With `lazyMount`, mounts the layer's content without showing it. The
   * popover stays closed, so it shows no pixel and is out of the accessibility
   * tree until `show()`, which then only shows it. A caller that knows a show
   * is coming spares that show the first mount's render. Does nothing for a
   * layer that is mounted already.
   */
  prepare: () => void;
  /**
   * Unmounts what `prepare()` mounted, unless the layer has shown since. A
   * layer that has shown keeps its mount as its options say.
   */
  releasePrepared: () => void;
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
  /**
   * With `lazyMount`, the layer stays mounted once its first `show()` mounted
   * it: hiding leaves it in place, so its close plays out and every later
   * `show()` opens it at once. A layer never shown still mounts only its inert
   * marker. For a component with many triggers that each own a layer (a
   * context menu on every table cell).
   */
  keepsMountAfterShow?: boolean;
  /**
   * Runs as the layer starts to close, while the browser still shows it: in
   * its `beforetoggle` to closed. A close that plays out after the layer is
   * hidden starts here.
   */
  onCloseStart?: () => void;
}

type InternalContextLayerReturn = ContextLayerReturn &
  InternalLayerFields &
  InternalContextLayerFields;
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

/**
 * Whether an animation is running and ends on its own. A paused or idle
 * animation does not end by itself. An animation with an infinite end time
 * never ends. Waiting on either holds the layer for good.
 */
function endsOnItsOwn(animation: Animation): boolean {
  return (
    animation.playState === 'running' &&
    animation.effect?.getComputedTiming().endTime !== Infinity
  );
}

/**
 * The finite animations still running on `layer` and its content. A layer
 * that fades out keeps running them after the browser hides it, and it stays
 * placed against its anchor until they end.
 */
function exitAnimations(layer: HTMLElement | null): Animation[] {
  if (layer == null || typeof layer.getAnimations !== 'function') {
    return [];
  }
  return layer.getAnimations({subtree: true}).filter(endsOnItsOwn);
}

/**
 * Whether the closed state's transition keeps `layer` shown after it hides.
 * Only a discrete `display` transition holds a hidden layer shown, until it
 * ends. Read it while the layer is closed: the close takes its values from
 * the closed state's style.
 */
function closeTransitionKeepsShown(layer: HTMLElement): boolean {
  const style = layer.ownerDocument.defaultView?.getComputedStyle(layer);
  if (style == null) {
    return false;
  }
  const list = (name: string) =>
    style
      .getPropertyValue(name)
      .split(',')
      .map(value => value.trim());
  const behaviors = list('transition-behavior');
  const durations = list('transition-duration').map(parseFloat);
  const delays = list('transition-delay').map(parseFloat);
  return list('transition-property').some((name, index) => {
    const behavior = behaviors[index % behaviors.length];
    const duration = durations[index % durations.length] || 0;
    const delay = delays[index % delays.length] || 0;
    return (
      (name === 'all' || name === 'display') &&
      behavior === 'allow-discrete' &&
      duration + Math.max(0, delay) > 0
    );
  });
}

/** The keyframe animations that `layer`'s style declares, or `none`. */
function animationNames(layer: HTMLElement): string {
  const style = layer.ownerDocument.defaultView?.getComputedStyle(layer);
  return style?.getPropertyValue('animation-name').trim() || 'none';
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
 * For a layer that must never settle over its anchor (spec:AST-059 FR4). Every
 * option of its one combined fallback list keeps it clear of its anchor, and
 * the engine picks one. Where the box still covers the anchor or, while the
 * anchor is in view, leaves the viewport on the block axis, the layer is
 * placed afresh (`placeAfresh`) from that list. The runtime calls this in the
 * same task as every show and remount, and while the layer is open whenever
 * its size, its content's size, its anchor's size or the viewport changes;
 * each of those reads lands before the next frame paints. It also runs once
 * in the first frame painted after a scroll of the anchor stops
 * (`observeScrollStop`), because during a scroll the browser does not choose
 * an option again. Nothing watches an anchor that moves without resizing, so
 * the layer never jumps to another side mid-scroll.
 */
function keepAnchorClear(layer: HTMLElement, anchor: HTMLElement | null): void {
  if (anchor && failsAnchor(layer, anchor)) {
    placeAfresh(layer);
  }
}

/**
 * How long a scroll must stay still, in ms, to count as stopped where the
 * browser does not fire `scrollend`.
 */
const SCROLL_STILL_MS = 150;

/**
 * The shadow roots along `node`'s flat-tree path. `scroll` and `scrollend`
 * are not composed, so a scroll inside a shadow tree reaches its shadow root
 * but not the window.
 */
function shadowRootsAbove(node: Node): ShadowRoot[] {
  const roots: ShadowRoot[] = [];
  for (
    let current: Node | null = node;
    current;
    current = parentAcrossShadow(current)
  ) {
    const root = current.getRootNode();
    if (isShadowRoot(root) && !roots.includes(root)) {
      roots.push(root);
    }
  }
  return roots;
}

/**
 * Calls `onStop` once each time a scroll of the page or of an ancestor of
 * `anchor` stops, in the first frame painted after it stops. During a scroll,
 * Chromium does not choose a layer's position option again, so the layer is
 * checked once the scroll stops. A scroll stops at `scrollend`; where the
 * browser does not fire it, a scroll stops after `SCROLL_STILL_MS` with no
 * `scroll` event. A scroll that starts again before the check cancels it. No
 * handler reads layout.
 */
function observeScrollStop(
  view: Window,
  anchor: HTMLElement,
  onStop: () => void,
): () => void {
  let frame: number | null = null;
  let timer: number | null = null;
  const cancel = () => {
    if (frame !== null) {
      view.cancelAnimationFrame(frame);
      frame = null;
    }
    if (timer !== null) {
      view.clearTimeout(timer);
      timer = null;
    }
  };
  // At `scrollend`, and in the frame after it, Chromium still reads the
  // anchored layer at its position before the scroll. After one painted
  // frame it reads the position the scroll gave it.
  const callAfterNextPaint = () => {
    cancel();
    frame = view.requestAnimationFrame(() => {
      frame = null;
      timer = view.setTimeout(() => {
        timer = null;
        frame = view.requestAnimationFrame(() => {
          frame = null;
          onStop();
        });
      });
    });
  };
  const firesScrollEnd =
    (view as {onscrollend?: unknown}).onscrollend !== undefined;
  const isAnchorScroll = (event: Event) =>
    containsAlongFlatTree(event.target as Node, anchor);
  const onScroll = (event: Event) => {
    if (!isAnchorScroll(event)) {
      return;
    }
    cancel();
    if (!firesScrollEnd) {
      timer = view.setTimeout(() => {
        timer = null;
        callAfterNextPaint();
      }, SCROLL_STILL_MS);
    }
  };
  const onScrollEnd = (event: Event) => {
    if (isAnchorScroll(event)) {
      callAfterNextPaint();
    }
  };
  const unsubscribes = [subscribeInput(view, 'scroll', onScroll)];
  if (firesScrollEnd) {
    unsubscribes.push(subscribeInput(view, 'scrollend', onScrollEnd));
  }
  const listening = {capture: true, passive: true};
  const shadowRoots = shadowRootsAbove(anchor);
  for (const shadowRoot of shadowRoots) {
    shadowRoot.addEventListener('scroll', onScroll, listening);
    if (firesScrollEnd) {
      shadowRoot.addEventListener('scrollend', onScrollEnd, listening);
    }
  }
  return () => {
    for (const unsubscribe of unsubscribes) {
      unsubscribe();
    }
    for (const shadowRoot of shadowRoots) {
      shadowRoot.removeEventListener('scroll', onScroll, listening);
      shadowRoot.removeEventListener('scrollend', onScrollEnd, listening);
    }
    cancel();
  };
}

/**
 * Watch an open layer that keeps its anchor clear, and its anchor, for every
 * change that can re-settle the layer over the anchor (spec:AST-059 FR4, FR8):
 * the layer, its content or the anchor resizing (ResizeObserver, before
 * paint), the viewport resizing (before paint), and a scroll of the anchor
 * stopping (`observeScrollStop`, in the first frame painted after it). Each
 * calls `keepAnchorClear` for this layer and anchor while `isCurrent` says
 * they are still the live pair. Returns the function that removes every
 * observer and listener it added.
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
  view.addEventListener('resize', reread);
  const stopObservingScrollStop = observeScrollStop(view, anchor, reread);
  return () => {
    observer?.disconnect();
    stopObservingScrollStop();
    view.removeEventListener('resize', reread);
  };
}

/** Whether `element` is shown as a popover (`:popover-open`). */
function isShownAsPopover(element: HTMLElement): boolean {
  try {
    return element.matches(':popover-open');
  } catch {
    // An engine without the pseudo-class has no popovers to be shown as.
    return false;
  }
}

/**
 * Whether `anchor` is a valid CSS anchor right now: it has a layout box, and
 * any `<dialog>` it sits in is showing, as a modal (`open`) or as a popover
 * (a non-modal `Drawer` is shown with `showPopover()` and never `open`).
 * `Dialog` displays its element during render but only calls `showModal()` in
 * a later Effect, so in that window the trigger already has a box while the
 * dialog is not yet in the top layer; opening a layer then paints it before
 * the dialog is modal.
 */
function isAnchorReady(anchor: HTMLElement): boolean {
  // No layout box at all: `display: none`, or inside a closed `<dialog>`. An
  // element that renders but is empty (an inline `<span>` with no content, such
  // as a ContextMenu's cursor anchor in a shadow root without Astryx's styles)
  // still has one 0x0 client rect and is a valid anchor.
  if (anchor.getClientRects().length === 0) {
    return false;
  }
  const dialog = anchor.closest('dialog');
  return dialog == null || dialog.open || isShownAsPopover(dialog);
}

/**
 * Calls `onReady` one frame later, once every running animation that ends on
 * its own, on the document timeline, on `anchor` or an ancestor, has finished.
 * Calls it synchronously if `document.getAnimations` does not exist (jsdom).
 * Returns a cancel function.
 *
 * `getBoundingClientRect()` reflects an ancestor's CSS transform, so an
 * anchor sitting inside a running entry animation — Dialog's own
 * scale/translate enter transition, e.g. — keeps reporting a different box
 * every frame for as long as that animation runs, even though a
 * `ResizeObserver` sees no size change at all (a transform never changes the
 * anchor's own layout box). Anchoring a layer to the trigger's box mid
 * transition, rather than the one it settles into, has produced a CSS
 * anchor-positioning resolution that never gets revisited once the trigger
 * stops moving: the layer is stranded at its unanchored fallback position
 * for the rest of that open.
 *
 * The check itself waits one frame before reading `document.getAnimations()`:
 * a CSS animation just triggered by a `display`/class change (exactly what
 * unhides a Dialog's content) is not yet in that list in the same task —
 * measured directly, not assumed — so checking synchronously would always see
 * zero animations and defeat the whole guard. One frame is enough for the UA
 * to have started it.
 *
 * The wait skips an animation that never ends by itself: a paused one, an
 * infinite one such as `StatusDot`'s pulse, and a scroll- or view-driven one.
 * `Animation.finished` never resolves for these, so waiting on them would
 * block a layer that anchors to them from ever opening.
 */

function waitForAncestorAnimations(
  anchor: HTMLElement,
  onReady: () => void,
): () => void {
  if (typeof document.getAnimations !== 'function') {
    onReady();
    return () => {};
  }
  let cancelled = false;
  const handle = requestAnimationFrame(() => {
    if (cancelled) {
      return;
    }
    const running = document.getAnimations().filter(animation => {
      const target =
        animation.effect instanceof KeyframeEffect
          ? animation.effect.target
          : null;
      if (
        !(target instanceof Node) ||
        !(target === anchor || target.contains(anchor))
      ) {
        return false;
      }
      // A scroll- or view-driven animation finishes only when the person
      // scrolls to the end of its range, so it is not a settle to wait on.
      if (animation.timeline !== document.timeline) {
        return false;
      }
      return endsOnItsOwn(animation);
    });
    if (running.length === 0) {
      onReady();
      return;
    }
    void Promise.all(
      running.map(async animation => animation.finished.catch(() => {})),
    ).then(() => {
      if (!cancelled) {
        onReady();
      }
    });
  });
  return () => {
    cancelled = true;
    cancelAnimationFrame(handle);
  };
}

interface ContextLayerMount {
  /** Null means the marker's parent is safe and the layer stays inline. */
  portalTarget: HTMLElement | null;
  /**
   * Logical writing context lost when moving outside an unsafe ancestor, or
   * null until it is read. A closed layer mounted ahead of its first show
   * reads it in `show()`, before the layer opens: reading computed style for
   * every closed layer on mount forces a style recalculation per layer.
   */
  portalStyle: React.CSSProperties | null;
}

/**
 * Where a context layer is hosted, published to the one component that
 * renders it. The hook resolves the mount from the marker's parent once the
 * marker is in the DOM, and the slot below subscribes to it, so the render
 * that places the layer re-renders the slot alone: the hook's host (a
 * Tooltip, a Popover, a menu) and everything under it render once on mount.
 */
interface ContextLayerMountStore {
  readonly get: () => ContextLayerMount | null;
  readonly set: (mount: ContextLayerMount | null) => void;
  readonly subscribe: (onChange: () => void) => () => void;
}

function createContextLayerMountStore(): ContextLayerMountStore {
  let mount: ContextLayerMount | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => mount,
    set: next => {
      if (next === mount) {
        return;
      }
      mount = next;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: onChange => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
  };
}

const readNoMount = (): ContextLayerMount | null => null;

/**
 * The marker and, once the hook has resolved where it goes, the layer. The
 * server and the hydrating render carry the marker alone, so block content
 * never enters server markup inside `<p>` and its kin; the mount arrives from
 * the marker's ref callback, and only this component re-renders to place the
 * layer.
 */
function ContextLayerSlot({
  mountStore,
  renderLayer,
  sentinelRef,
}: {
  readonly mountStore: ContextLayerMountStore;
  readonly renderLayer: (mount: ContextLayerMount) => ReactNode;
  readonly sentinelRef: RefCallback<HTMLTemplateElement>;
}) {
  const mount = useSyncExternalStore(
    mountStore.subscribe,
    mountStore.get,
    readNoMount,
  );
  // Keep the marker mounted after resolving the layer. Apart from giving
  // us the real JSX parent on first show, this lets its ref report when a
  // persistent hook's render call moves to a different host.
  const sentinel = <template ref={sentinelRef} />;
  if (mount === null) {
    return <>{sentinel}</>;
  }
  const layer = renderLayer(mount);
  return (
    <>
      {sentinel}
      {mount.portalTarget ? createPortal(layer, mount.portalTarget) : layer}
    </>
  );
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
  const keepsMountAfterShow =
    lazyMount && mode === 'context'
      ? (options.keepsMountAfterShow ?? false)
      : false;
  const keepsAnchorClear =
    mode === 'context' ? (options.keepsAnchorClear ?? false) : false;
  const onCloseStartRef = useRef<(() => void) | undefined>(undefined);
  onCloseStartRef.current =
    mode === 'context' ? options.onCloseStart : undefined;
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
  // A detach (contextRef(null)) still in its transient window — cancelled if
  // the same element reattaches before the microtask runs, applied
  // (removing the anchor name) otherwise. See contextRef below.
  const pendingTriggerDetachRef = useRef<{
    element: HTMLElement;
    cancelled: boolean;
  } | null>(null);
  // Context layers place a persistent inert marker at their real JSX position.
  // Its parent tells us whether the final layer can stay inline or needs a
  // corrective portal, including after the render call moves.
  const sentinelRef = useRef<HTMLTemplateElement | null>(null);
  const contextMountRef = useRef<ContextLayerMount | null>(null);
  // The resolved mount reaches the slot through this store, never through
  // state on this hook, so placing the layer renders the slot alone. The
  // generation counts mounts that REPLACE a resolved one (a render call that
  // moved to another host): the layer element is recreated then, and the
  // effects below that bind to it re-run.
  const [mountStore] = useState(createContextLayerMountStore);
  const [mountGeneration, setMountGeneration] = useState(0);
  // A show() that cannot run yet is remembered here and replayed: one that
  // arrives before the final layer mounts runs when its popover ref attaches;
  // one that arrives while another popover is mid show/hide runs once that
  // operation has unwound. hide() forgets it either way.
  const pendingShowRef = useRef(false);

  // Ref mirrors isOpen for synchronous reads inside show/hide.
  // State drives re-renders; the ref lets the imperative calls avoid
  // stale-closure reads of the previous isOpen value.
  const isOpenRef = useRef(false);

  // The exit of the layer that closed last, while it still paints. Its
  // trigger stays an anchor until it ends, also when the trigger attaches
  // again during it. Null once it has ended.
  const exitRef = useRef<object | null>(null);

  // Read at the last show, from the closed state's style.
  const closeKeepsShownRef = useRef(false);

  // A closed trigger is no anchor, once the layer stops painting. A show
  // during the exit keeps the name, and so does a later exit.
  const releaseAnchor = useCallback(
    (layer: HTMLElement | null) => {
      const exit = {};
      exitRef.current = exit;
      const release = () => {
        if (exitRef.current !== exit) {
          return;
        }
        exitRef.current = null;
        const trigger = triggerRef.current;
        if (!isOpenRef.current && trigger != null) {
          removeAnchorName(trigger, anchorId);
        }
      };
      // The animation read lays out the page between the writes of the close.
      // Skip it when the layer stops painting as it hides.
      const running = closeKeepsShownRef.current ? exitAnimations(layer) : [];
      if (running.length === 0) {
        release();
        return;
      }
      void Promise.all(
        running.map(async animation =>
          animation.finished.catch(() => undefined),
        ),
      ).then(release);
    },
    [anchorId],
  );

  // The gesture during which the browser last closed this layer on its own.
  // Read through wasJustDismissed by triggers deciding whether a click is
  // theirs to act on.
  const dismissedByGestureRef = useRef<number | null>(null);
  const forgetDismissalRef = useRef<(() => void) | null>(null);

  const wasJustDismissed = useCallback(() => {
    const gesture = currentGesture();
    return dismissedByGestureRef.current === gesture;
  }, []);

  /**
   * Asks the browser to show the popover. Returns false when the browser
   * refused with an `InvalidStateError` while a hide it runs itself is still
   * in flight (the ledger counts it from `beforetoggle`); the caller then
   * replays the show once that hide has ended. Any other failure, and a
   * refusal outside such a hide, reaches the caller: a replay runs outside
   * the hide, so one that fails is not caught here.
   */
  const showPopoverElement = useCallback((popover: HTMLElement): boolean => {
    // Finding infra-4: the Popover API is unsupported on Safari <17 and
    // Firefox <125. On those browsers `showPopover` does not exist, so fall
    // back to plain visibility instead of throwing.
    if (typeof popover.showPopover === 'function') {
      const doc = popover.ownerDocument;
      const duringBrowserHide = isBrowserHideInFlight(doc);
      try {
        runPopoverOperation(doc, () => {
          // The trigger is passed as the popover's invoker `source`: a layer
          // hosted away from its trigger then still takes its sequential
          // focus order (and its popover nesting) from the trigger rather
          // than from its own DOM position. Browsers without the option
          // ignore it. `source` is declared as an `HTMLElement`. A
          // caller-rendered icon trigger is an `SVGElement`, whose dictionary
          // conversion throws before the popover opens. Omitting the option
          // for it still anchors the layer, because positioning reads the
          // anchor-name pair, and only gives up the invoker's focus order.
          // The check asks the trigger's own window: an HTML trigger rendered
          // into another document (an iframe, a Picture-in-Picture window) is
          // not an instance of this window's `HTMLElement`, and keeps its
          // source.
          const trigger = triggerRef.current;
          const triggerView = trigger?.ownerDocument.defaultView;
          popover.showPopover({
            source:
              triggerView != null && trigger instanceof triggerView.HTMLElement
                ? trigger
                : undefined,
          });
        });
      } catch (error) {
        // The name, not the constructor: a popover in another document throws
        // that document's `DOMException`.
        if (
          duringBrowserHide &&
          (error as {name?: unknown} | null)?.name === 'InvalidStateError'
        ) {
          return false;
        }
        throw error;
      }
    } else {
      popover.style.display = 'block';
    }
    openedPopoverRef.current = popover;
    return true;
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

    // The slide options' `@position-try` rules (FR4) are installed in the
    // layer's document before its first paint, here where the mount resolves:
    // the marker's arrival is the one event every mount has, whether the
    // render call mounts with its host or later. One sheet serves every layer.
    ensureSlideRules(sentinel.ownerDocument);

    const portalTarget = resolveLayerPortalTarget(inlineParent);
    // A mount for a layer that is opening or open reads its writing context
    // now; a closed layer's waits for its first show.
    const opening = pendingShowRef.current || isOpenRef.current;
    const mount: ContextLayerMount = {
      portalTarget,
      portalStyle:
        portalTarget == null
          ? {}
          : opening
            ? readPortalWritingContext(sentinel, portalTarget)
            : null,
    };
    const replaced = contextMountRef.current !== null;
    contextMountRef.current = mount;
    mountStore.set(mount);
    if (replaced) {
      setMountGeneration(generation => generation + 1);
    }
  }, [mode, mountStore]);

  // Reads the writing context a closed layer's mount deferred, before the
  // layer opens. It is written on the popover at once, so the first open frame
  // already has it (layer-runtime INV12), and published to the slot, whose
  // render writes the same values. A value the caller's own `style` sets is
  // already inline and wins, as it does in render.
  const applyDeferredWritingContext = useCallback(
    (popover: HTMLElement) => {
      const mount = contextMountRef.current;
      const sentinel = sentinelRef.current;
      if (
        mount === null ||
        mount.portalTarget === null ||
        mount.portalStyle !== null ||
        sentinel === null
      ) {
        return;
      }
      const portalStyle = readPortalWritingContext(
        sentinel,
        mount.portalTarget,
      );
      if (portalStyle.direction != null && popover.style.direction === '') {
        popover.style.direction = portalStyle.direction;
      }
      if (portalStyle.writingMode != null && popover.style.writingMode === '') {
        popover.style.writingMode = portalStyle.writingMode;
      }
      const next: ContextLayerMount = {...mount, portalStyle};
      contextMountRef.current = next;
      mountStore.set(next);
    },
    [mountStore],
  );

  // The mount came from `prepare()`, and the layer has not shown since.
  const isMountPreparedRef = useRef(false);

  const prepare = useCallback(() => {
    if (mode !== 'context' || !lazyMount || contextMountRef.current != null) {
      return;
    }
    isMountPreparedRef.current = true;
    requestContextMount();
  }, [mode, lazyMount, requestContextMount]);

  const releasePrepared = useCallback(() => {
    if (
      !isMountPreparedRef.current ||
      pendingShowRef.current ||
      isOpenRef.current
    ) {
      return;
    }
    isMountPreparedRef.current = false;
    contextMountRef.current = null;
    mountStore.set(null);
  }, [mountStore]);

  const clearContextMount = useCallback(() => {
    if (mode !== 'context' || !lazyMount || keepsMountAfterShow) {
      return;
    }
    contextMountRef.current = null;
    mountStore.set(null);
  }, [mode, lazyMount, keepsMountAfterShow, mountStore]);

  const openNow = useCallback(() => {
    // Every caller lands here, so this is where the dismissing press is
    // absorbed: opening now would reopen the popup that same press closed.
    if (wasJustDismissed()) {
      return;
    }
    isMountPreparedRef.current = false;
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
      const replayWhenSettled = () => {
        pendingShowRef.current = true;
        afterPopoverOperations(popover.ownerDocument, () => {
          if (pendingShowRef.current) {
            pendingShowRef.current = false;
            showRef.current();
          }
        });
      };
      // Another layer's own show or hide is running (typically a hide that is
      // handing focus back to this layer's trigger): the browser would refuse
      // the show, so replay this call once that operation has returned.
      if (isPopoverOperationInFlight(popover.ownerDocument)) {
        replayWhenSettled();
        return;
      }
      // The close takes its values from the closed state's style. Read it
      // before the writes of the show, so the read lays nothing out.
      const closeTransitionHolds = closeTransitionKeepsShown(popover);
      const closedAnimations = animationNames(popover);
      applyDeferredWritingContext(popover);
      // The trigger takes the layer's anchor name in the task that shows the
      // layer, so the layer's first frame is placed against it.
      const anchor = triggerRef.current;
      if (anchor != null) {
        addAnchorName(anchor, anchorId);
      }
      // A hide the browser runs itself (an Escape its close watcher answers)
      // is counted too, from `beforetoggle` until the element's `toggle`, a
      // task after the hide has returned. The show is asked of the browser
      // first, because the browser accepts it once its hide has returned (a
      // light dismiss at pointerup, then this show at the click); only a show
      // it refuses replays once the hide's count has ended.
      if (!showPopoverElement(popover)) {
        // The replay anchors the trigger again; until then it is closed. An
        // exit still running keeps the name.
        if (anchor != null && exitRef.current == null) {
          removeAnchorName(anchor, anchorId);
        }
        replayWhenSettled();
        return;
      }
      // A keyframe animation that only the closed state declares starts at
      // the close, and it can animate `display`. One that both states declare
      // is the entrance, and the hide stops it.
      const closeStartsAnimation =
        closedAnimations !== 'none' &&
        closedAnimations !== animationNames(popover);
      closeKeepsShownRef.current = closeTransitionHolds || closeStartsAnimation;
      if (lightDismiss) {
        claimContextMenuPress(popover);
      }
      if (keepsAnchorClear) {
        keepAnchorClear(popover, triggerRef.current);
      }
      isOpenRef.current = true;
      setIsOpen(true);
      onShow?.();
    }
  }, [
    anchorId,
    onShow,
    keepsAnchorClear,
    lightDismiss,
    requestContextMount,
    applyDeferredWritingContext,
    showPopoverElement,
    isCurrentContextPopover,
    wasJustDismissed,
  ]);

  // A wait for the trigger to get a layout box, started by a show() that
  // found none. Cancelled by the next show()/hide() or by
  // unmount, so a stale wait from a closed-then-reopened layer never fires
  // openNow() after the fact.
  const pendingAnchorWaitRef = useRef<(() => void) | null>(null);
  // The element that wait is observing, so a trigger swapped out underneath it
  // can restart the wait on the new element (see `contextRef`).
  const pendingAnchorElementRef = useRef<HTMLElement | null>(null);

  // The deferred restart `contextRef` queues after a trigger swap. Any
  // show()/hide() or a new wait supersedes it, so a layer that was hidden in
  // the same commit never reopens by itself.
  const pendingRestartRef = useRef<{cancelled: boolean} | null>(null);

  const cancelPendingAnchorWait = useCallback(() => {
    pendingAnchorWaitRef.current?.();
    pendingAnchorWaitRef.current = null;
    pendingAnchorElementRef.current = null;
    if (pendingRestartRef.current) {
      pendingRestartRef.current.cancelled = true;
      pendingRestartRef.current = null;
    }
  }, []);

  // A wait that reached its end: nothing is pending any more, so a later
  // trigger swap must not restart it.
  const finishAnchorWait = useCallback(() => {
    pendingAnchorWaitRef.current = null;
    pendingAnchorElementRef.current = null;
  }, []);

  // A trigger with no layout box (no client rect) is not a valid CSS anchor. Opening against it now resolves the popover to
  // its fallback position (the viewport corner), and unlike a live layout
  // change, that resolution does not get revisited once the trigger later
  // gets a box: the popover is stuck there for the rest of this open.
  //
  // The concrete case this guards: a Dialog mounts its children before it
  // opens (`isOpen` gates only `showModal()`, not rendering), so a context
  // layer with `isDefaultOpen` or a controlled `isOpen={true}` inside one can
  // mount, and show() can run, while the trigger sits inside a `<dialog>`
  // that hasn't gone modal yet and so has no box. Anchor readiness lives here
  // rather than in each caller because this is the one place that already
  // owns the trigger element (`triggerRef`, set by `contextRef` below) and the
  // one place every context-mode show() funnels through.
  const show = useCallback(() => {
    cancelPendingAnchorWait();

    const anchor = mode === 'context' ? triggerRef.current : null;
    if (!anchor) {
      openNow();
      return;
    }
    if (isAnchorReady(anchor)) {
      // A trigger that already has a layout box is a valid anchor: open now, in the
      // same task as the interaction that asked, so a menu still opens on
      // press and not on the next frame. Only a trigger with no layout box has to wait.
      openNow();
      return;
    }
    // No layout engine to wait on (jsdom, an old browser): same fallback
    // sharedResizeObserver.ts uses for the same gap. Skip the wait rather than
    // throw, and open against whatever box is available now. A missing
    // `document.getAnimations` is the signal for "no real layout" here: jsdom
    // reports every box as 0x0 forever, so a ResizeObserver stub that never
    // fires would otherwise hold every layer closed.
    if (
      typeof ResizeObserver === 'undefined' ||
      typeof document.getAnimations !== 'function'
    ) {
      openNow();
      return;
    }
    // The wait is driven by signals, never by polling. Any of them re-reads `isAnchorReady`; the first that
    // finds the anchor ready wins. None resolves against a boxless trigger, so
    // a layer whose container gains layout much later still ends up anchored,
    // not opened against a 0x0 box because a cap gave up first:
    //
    // - ResizeObserver: a block-level trigger gaining a box.
    // - IntersectionObserver: reports a `display: inline` trigger, which
    //   ResizeObserver never delivers an entry for, such as the wrapper
    //   `<span>` of a text-only Tooltip or HoverCard. It also fires
    //   when a hidden ancestor is displayed.
    // - The enclosing `<dialog>`'s `open` attribute and `toggle` event: the
    //   trigger can have a box before the dialog is modal (see
    //   `isAnchorReady`), and a popover-shown dialog never sets `open`.
    //
    // A ResizeObserver stub that fires synchronously (several component tests
    // use one) resolves exactly as fast as it always did. Environments with no
    // real layout ever are excluded before this point.
    const anchorElement: HTMLElement = anchor;
    const dialog = anchor.closest('dialog');
    let cancelSettleWait: () => void = () => {};
    let resolved = false;
    // The shared observers hand back an unsubscribe for this
    // registration only, so the teardown does not touch other observers of the
    // same element.
    let stopResize: () => void = () => {};
    let stopMutations: () => void = () => {};
    const release = () => {
      stopResize();
      intersection?.disconnect();
      stopMutations();
      dialog?.removeEventListener('toggle', check);
    };
    const resolve = () => {
      resolved = true;
      release();
      // Once the box exists, a short settle wait lets an ancestor's running
      // entry animation finish before the layer anchors to it.
      cancelSettleWait = waitForAncestorAnimations(anchor, () => {
        finishAnchorWait();
        openNow();
      });
    };
    function check() {
      if (!resolved && isAnchorReady(anchorElement)) {
        resolve();
      }
    }
    const intersection =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(check);
    stopResize = observeResize(anchor, check);
    if (!resolved) {
      intersection?.observe(anchor);
      if (dialog) {
        stopMutations = observeMutations(
          dialog,
          {attributes: true, attributeFilter: ['open']},
          check,
        );
        dialog.addEventListener('toggle', check);
      }
    } else {
      // The registration itself resolved the wait before its unsubscribe
      // existed, so release it now.
      release();
    }
    pendingAnchorWaitRef.current = () => {
      resolved = true;
      release();
      cancelSettleWait();
    };
    pendingAnchorElementRef.current = anchor;
  }, [mode, openNow, cancelPendingAnchorWait, finishAnchorWait]);

  const hide = useCallback(() => {
    cancelPendingAnchorWait();
    pendingShowRef.current = false;
    if (isOpenRef.current) {
      const el = popoverRef.current;
      // A close that plays out after the layer is hidden starts here, while
      // the browser still shows it. The `beforetoggle` handler below starts
      // the browser's own hides.
      onCloseStartRef.current?.();
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
    releaseAnchor(popoverRef.current);
    clearContextMount();
  }, [onHide, clearContextMount, releaseAnchor, cancelPendingAnchorWait]);

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
  //
  // A combined ref can call this ref with `null` and then with the same
  // element. Removing `anchor-name` in that gap strands an open layer at its
  // fallback position. So a `null` call removes the name one microtask later,
  // unless the same element attaches again first. A different element takes
  // over at once, and a `null` with nothing after it (an unmount) removes the
  // name.
  const contextRef = useCallback(
    (el: HTMLElement | null) => {
      if (!el) {
        const stale = triggerRef.current;
        if (!stale) {
          return;
        }
        const pending = {element: stale, cancelled: false};
        pendingTriggerDetachRef.current = pending;
        queueMicrotask(() => {
          if (pending.cancelled || triggerRef.current !== stale) {
            return;
          }
          removeAnchorName(stale, anchorId);
          triggerRef.current = null;
          // A real unmount: stop waiting on an element that will never get a
          // box, and release the observers an open layer kept on it.
          if (pendingAnchorElementRef.current === stale) {
            cancelPendingAnchorWait();
          }
          if (keepsAnchorClear && isOpenRef.current) {
            clearObserversRef.current?.();
            clearObserversRef.current = null;
          }
        });
        return;
      }
      // Reattaching the exact element a pending detach targeted: cancel it,
      // the churn never happened as far as the anchor name is concerned.
      if (pendingTriggerDetachRef.current?.element === el) {
        pendingTriggerDetachRef.current.cancelled = true;
        pendingTriggerDetachRef.current = null;
      }
      // Remove only THIS layer's anchor name from the previous element so
      // other layers sharing the same trigger keep their anchors.
      if (triggerRef.current && triggerRef.current !== el) {
        removeAnchorName(triggerRef.current, anchorId);
      }

      // Only a shown layer's trigger is an anchor. WebKit's Linux ports run the
      // transform animation of an element that holds an anchor on the main
      // thread. A busy task would then freeze a surface that moves around a
      // closed trigger.
      if (el && (isOpenRef.current || exitRef.current != null)) {
        addAnchorName(el, anchorId);
      }

      const previous = triggerRef.current;
      triggerRef.current = el;

      // A trigger replaced while the layer is open (React detaches the old
      // node with `null`, then attaches the new one): the old trigger's
      // observers are removed before the new trigger's are added, and
      // binding them reads the new trigger's geometry at once.
      if (keepsAnchorClear && isOpenRef.current && el !== previous) {
        clearObserversRef.current?.();
        clearObserversRef.current = null;
        const layer = popoverRef.current;
        if (layer) {
          clearObserversRef.current = observeAnchorClearance(
            layer,
            el,
            () => popoverRef.current === layer && triggerRef.current === el,
          );
          keepAnchorClear(layer, el);
        }
      }

      // A show() is still waiting for a box on a different trigger: that wait
      // observes the element it started with, so it would never end for this
      // one. Restart it on the new trigger, after the commit that attached it.
      const waitingOn = pendingAnchorElementRef.current;
      if (waitingOn && waitingOn !== el) {
        cancelPendingAnchorWait();
        const restart = {cancelled: false};
        pendingRestartRef.current = restart;
        queueMicrotask(() => {
          if (restart.cancelled) {
            return;
          }
          pendingRestartRef.current = null;
          if (triggerRef.current === el && !isOpenRef.current) {
            showRef.current();
          }
        });
      }
    },
    [anchorId, cancelPendingAnchorWait, keepsAnchorClear],
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

  // Syncs the document's capture-phase gesture tracking with this mount.
  // Unmount forgets the layer's dismissal and releases a pending anchor wait.
  useEffect(() => {
    // Install capture-phase gesture tracking before the first interaction.
    currentGesture();
    return () => {
      forgetDismissalRef.current?.();
      pendingAnchorWaitRef.current?.();
    };
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
  // A hide the browser runs itself (light dismiss, popover="auto" stack
  // eviction, an Escape its close watcher answers) never passes through
  // hide(), so the ledger of popover operations would not know the document
  // is mid-hide, and a layer that the hide's focus restore wakes would ask the
  // browser to show inside it. `beforetoggle` fires synchronously as such a
  // hide starts; the ledger counts the hide from there until the element's
  // own `toggle`, independent of this hook's bindings, which a render inside
  // the hide can replace.
  const handleBeforeToggle = useCallback(
    (e: Event) => {
      const toggleEvent = e as ToggleEvent;
      const el = e.currentTarget as HTMLElement | null;
      if (toggleEvent.newState !== 'closed' || el == null) {
        return;
      }
      if (isOpenRef.current) {
        observeBrowserHide(el);
        onCloseStartRef.current?.();
        // The browser's own close releases the name from its toggle event.
        return;
      }
      // Our hide drops its trigger's anchor name here, inside the hide, so the
      // hide's own layout covers the change. A name dropped after that layout
      // costs one more. A layer that the closed state keeps shown keeps the
      // name until its exit ends.
      const trigger = triggerRef.current;
      if (
        trigger != null &&
        readAnchorNames(trigger).includes(anchorId) &&
        !closeKeepsShownRef.current
      ) {
        exitRef.current = null;
        removeAnchorName(trigger, anchorId);
      }
    },
    [anchorId],
  );

  const handleToggle = useCallback(
    (e: Event) => {
      const toggleEvent = e as ToggleEvent;
      if (toggleEvent.newState === 'closed' && isOpenRef.current) {
        openedPopoverRef.current = null;
        isOpenRef.current = false;
        rememberDismissal(
          (e.currentTarget as HTMLElement | null)?.ownerDocument ?? document,
        );
        releaseAnchor(e.currentTarget as HTMLElement | null);
        setIsOpen(false);
        onHide?.();
        clearContextMount();
      }
    },
    [onHide, clearContextMount, rememberDismissal, releaseAnchor],
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
        listenedElRef.current.removeEventListener(
          'beforetoggle',
          handleBeforeToggle,
        );
        listenedElRef.current = null;
        listenedHandlerRef.current = null;
      }
      if (el && listenedElRef.current !== el) {
        el.addEventListener('toggle', handler);
        el.addEventListener('beforetoggle', handleBeforeToggle);
        listenedElRef.current = el;
        listenedHandlerRef.current = handler;
      }
    },
    [handleBeforeToggle],
  );

  // An anchored layer that would run under the software keyboard keeps its
  // block-start edge and ends clear of the keyboard.
  const {
    cap: keyboardCap,
    lift: keyboardLift,
    inset: keyboardInset,
    followLayerElement,
  } = useLayerKeyboardClearance(isOpen && mode === 'context', popoverRef);

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
        // A show the browser refused during one of its own hides replays once
        // that hide has ended, for the element still mounted then. The
        // keyboard cap follows the replacement element too.
        followLayerElement();
        if (showPopoverElement(el)) {
          if (keepsAnchorClear) {
            keepAnchorClear(el, triggerRef.current);
          }
        } else {
          afterPopoverOperations(el.ownerDocument, () => {
            const current = popoverRef.current;
            if (
              isOpenRef.current &&
              current === el &&
              openedPopoverRef.current !== el &&
              showPopoverElement(el) &&
              keepsAnchorClear
            ) {
              keepAnchorClear(el, triggerRef.current);
            }
          });
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
      followLayerElement,
    ],
  );

  const sentinelRefCallback = useCallback(
    (el: HTMLTemplateElement | null) => {
      sentinelRef.current = el;
      // A layer that keeps its mount re-resolves it too once it has one.
      if (
        el &&
        (!lazyMount ||
          pendingShowRef.current ||
          isOpenRef.current ||
          (keepsMountAfterShow && contextMountRef.current != null))
      ) {
        // The render call may have moved while the hook stayed mounted.
        // Resolve again from the newly attached marker rather than reusing a
        // portal target from its previous JSX position.
        requestContextMount();
      }
    },
    [lazyMount, keepsMountAfterShow, requestContextMount],
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
        listenedElRef.current.removeEventListener(
          'beforetoggle',
          handleBeforeToggle,
        );
        listenedElRef.current = null;
        listenedHandlerRef.current = null;
      }
    };
  }, [handleToggle, bindToggleListener, handleBeforeToggle]);

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

  // A layer that keeps its anchor clear re-reads its geometry while it
  // is open: content that grows, an anchor that resizes or moves (in layout or
  // by a scroll) or a viewport resize can each re-settle the standard list over the anchor or
  // give the layer a scroll range (`observeAnchorClearance`). The external
  // systems are those browser observers and listeners; this effect binds them
  // while the layer is open and removes them when it closes, unmounts or is
  // remounted by a moved render call (`mountGeneration`). A trigger replaced
  // while open is rebound by the trigger callback ref, so no DOM node enters
  // state.
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
  }, [keepsAnchorClear, isOpen, mode, mountGeneration]);

  // Render function for context mode
  const renderContext = useCallback(
    (children: ReactNode, props?: ContextRenderProps) => {
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
      // An above or below layer that keeps its anchor clear uses one combined
      // list whose options never overlap the anchor (FR4).
      const clearFallbacks =
        keepsAnchorClear && positioning === 'anchor'
          ? getAnchorClearFallbacks(placement)
          : '';
      const anchorStyle: React.CSSProperties =
        positioning === 'custom'
          ? // Consumer authors its own position styles via `style` — keep
            // only the anchor wiring, derive nothing from placement.
            {positionAnchor: anchorId}
          : {
              positionAnchor: anchorId,
              positionArea: getPositionArea(placement, alignment),
              positionTryFallbacks: clearFallbacks || standardFallbacks,
              ...(clearFallbacks
                ? {alignSelf: anchorClearAlignment(placement)}
                : {}),
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
        styles.keyboardCap(
          keyboardCap == null ? '100vh' : `${keyboardCap}px`,
          keyboardCap == null ? 'visible' : 'auto',
          keyboardInset == null ? 'initial' : `${keyboardInset}px`,
        ),
        keepsAnchorClear && styles.scrollsOnOverflow,
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
      // The slot renders the layer once the hook has resolved that mount.
      const renderLayer = (mount: ContextLayerMount) => (
        <Container
          ref={popoverRefCallback}
          id={id}
          // Anchor positioning, as this commit renders it: the software
          // keyboard caps only an anchored layer, and reads this at
          // measurement.
          {...(positioning === 'anchor'
            ? {[LAYER_ANCHORED_ATTRIBUTE]: ''}
            : {})}
          role={role}
          aria-label={ariaLabel}
          popover={lightDismiss ? 'auto' : 'manual'}
          className={combinedClassName}
          style={{
            ...stylexResult.style,
            ...anchorStyle,
            ...keyboardLiftStyle(keyboardLift),
            ...clearanceProperty,
            ...layerInsetProperties(declaredInset),
            ...mount.portalStyle,
            ...extraStyle,
          }}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          // Presses inside the layer do not reach handlers around where it
          // is written.
          {...layerClickBoundary()}>
          <LayerContentBoundary>{children}</LayerContentBoundary>
        </Container>
      );

      return (
        <ContextLayerSlot
          mountStore={mountStore}
          renderLayer={renderLayer}
          sentinelRef={sentinelRefCallback}
        />
      );
    },
    [
      anchorId,
      declaredInset,
      id,
      isAnchorInView,
      keepsAnchorClear,
      keyboardCap,
      keyboardInset,
      keyboardLift,
      lightDismiss,
      mountStore,
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
        // A fixed layer is never capped; it still sets its own limit so it is
        // not clamped by a capped layer it sits in.
        styles.keyboardCap('100vh', 'visible', 'initial'),
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
          style={{...stylexResult.style, ...positionStyle, ...extraStyle}}
          // Presses inside the layer do not reach handlers around where it
          // is written.
          {...layerClickBoundary()}>
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
      prepare,
      releasePrepared,
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
      prepare,
      releasePrepared,
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
    const {
      wasJustDismissed: _,
      prepare: _prepare,
      releasePrepared: _releasePrepared,
      ...layer
    } = internalLayer as (
      InternalContextLayerReturn | InternalFixedLayerReturn
    ) &
      Partial<InternalContextLayerFields>;
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
