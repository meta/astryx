// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useScrollableArea.ts
 * @input Logical scroll intent, focus-time keyboard delegation, caller-owned viewport/content props
 * @output Safe prop getters, native keyboard entry, and stable per-axis effective scroll state
 * @position Canonical behavior core for ScrollableArea and structure-owning adopters
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/useScrollableArea.doc.mjs
 * - /packages/core/src/hooks/useScrollableArea.test.tsx
 * - /packages/core/src/hooks/index.ts
 */

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
  type RefAttributes,
  type RefCallback,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import {attachScrollKeyboardDelegation} from './scrollKeyboardDelegation';
import {useIsomorphicLayoutEffect} from './useIsomorphicLayoutEffect';
import {mergeProps} from '../utils/mergeProps';
import {mergeRefs} from '../utils/mergeRefs';
import {observeResize} from '../utils/sharedResizeObserver';
import {
  getLogicalAxisMapping,
  measureLogicalOverflowGeometry,
  measureLogicalScrollAxis,
  type LogicalAxisMapping,
  type LogicalOverflowGeometry,
} from './scrollGeometry';
import {
  registerScrollOwner,
  unregisterScrollOwner,
} from './scrollOwnerRegistry';

/** Logical axis or axes where native scrolling is requested. */
export type ScrollAxis = 'inline' | 'block' | 'both';
/** Whether effective axes pass scroll gestures to ancestors at an edge. */
export type ScrollOverscroll = 'allow' | 'contain';
/** Whether a fitting viewport deliberately remains a Sticky containing boundary. */
export type ScrollStickyContainment = 'whenScrollable' | 'always';

/**
 * Where keyboard scrolling is reached: caller-owned content, a named viewport,
 * or a named viewport that delegates forward Tab entry into its content.
 */
export type ScrollKeyboardAccess =
  | {owner: 'content'}
  | {owner: 'viewport'; label: string; role?: 'group' | 'region'}
  | {
      owner: 'contentOrViewport';
      label: string;
      role?: 'group' | 'region';
    };

/** Effective ownership and logical edge state for one requested axis. */
export interface ScrollAxisState {
  isScrollable: boolean;
  atStart: boolean;
  atEnd: boolean;
}

/** Per-axis effective scroll state published by the hook. */
export interface ScrollableAreaState {
  inline: ScrollAxisState;
  block: ScrollAxisState;
}

export interface UseScrollableAreaOptions {
  /** Logical axis or axes where scrolling is allowed. */
  axis: ScrollAxis;
  /** Keyboard reachability owner; a named viewport joins the tab order while effective. */
  keyboardAccess: ScrollKeyboardAccess;
  /** Edge propagation on effective axes. @default 'allow' */
  overscroll?: ScrollOverscroll;
  /** Sticky containment while fitting. @default 'whenScrollable' */
  stickyContainment?: ScrollStickyContainment;
}

export type ScrollableElementProps<E extends HTMLElement> = BaseProps<E> &
  RefAttributes<E>;

export interface UseScrollableAreaResult {
  getViewportProps<E extends HTMLElement>(
    props?: ScrollableElementProps<E>,
  ): ScrollableElementProps<E>;
  getContentProps<E extends HTMLElement>(
    props?: ScrollableElementProps<E>,
  ): ScrollableElementProps<E>;
  state: ScrollableAreaState;
}

const INACTIVE_AXIS_STATE: ScrollAxisState = {
  isScrollable: false,
  atStart: true,
  atEnd: true,
};
const INITIAL_STATE: ScrollableAreaState = {
  inline: INACTIVE_AXIS_STATE,
  block: INACTIVE_AXIS_STATE,
};
const INITIAL_OVERFLOW: LogicalOverflowGeometry = {
  inline: false,
  block: false,
};
const INITIAL_MAPPING: LogicalAxisMapping = {
  inline: 'x',
  block: 'y',
  inlineReversed: false,
  blockReversed: false,
};

const styles = stylex.create({
  overflow: (
    overflowX: 'auto' | 'hidden' | 'clip',
    overflowY: 'auto' | 'hidden' | 'clip',
  ) => ({overflowX, overflowY}),
});

function axisIsRequested(requested: ScrollAxis, axis: 'inline' | 'block') {
  return requested === axis || requested === 'both';
}

function statesEqual(a: ScrollableAreaState, b: ScrollableAreaState): boolean {
  return (
    a.inline.isScrollable === b.inline.isScrollable &&
    a.inline.atStart === b.inline.atStart &&
    a.inline.atEnd === b.inline.atEnd &&
    a.block.isScrollable === b.block.isScrollable &&
    a.block.atStart === b.block.atStart &&
    a.block.atEnd === b.block.atEnd
  );
}

function overflowEqual(
  a: LogicalOverflowGeometry,
  b: LogicalOverflowGeometry,
): boolean {
  return a.inline === b.inline && a.block === b.block;
}

function mappingsEqual(a: LogicalAxisMapping, b: LogicalAxisMapping): boolean {
  return (
    a.inline === b.inline &&
    a.block === b.block &&
    a.inlineReversed === b.inlineReversed &&
    a.blockReversed === b.blockReversed
  );
}

function withoutOwnedOverflow(
  style: CSSProperties | undefined,
): CSSProperties | undefined {
  if (style == null) {
    return undefined;
  }
  const result = {...style};
  delete result.overflow;
  delete result.overflowX;
  delete result.overflowY;
  delete result.overflowInline;
  delete result.overflowBlock;
  return result;
}

function useStableComposedRef(
  internalRef: RefCallback<HTMLElement>,
): (externalRef: Ref<HTMLElement> | undefined) => RefCallback<HTMLElement> {
  const cachedExternalRef = useRef<Ref<HTMLElement> | undefined>(undefined);
  const cachedComposedRef = useRef<RefCallback<HTMLElement> | null>(null);
  return useCallback(
    (externalRef: Ref<HTMLElement> | undefined) => {
      if (
        cachedComposedRef.current != null &&
        Object.is(cachedExternalRef.current, externalRef)
      ) {
        return cachedComposedRef.current;
      }
      const composed = mergeRefs(externalRef, internalRef);
      cachedExternalRef.current = externalRef;
      cachedComposedRef.current = composed;
      return composed;
    },
    [internalRef],
  );
}

/**
 * Adds axis-aware scroll behavior to caller-owned viewport and content boxes.
 * The returned prop getters compose refs and preserve caller props, so spread
 * order cannot detach measurement or override behavior-owned accessibility.
 *
 * @example
 * ```
 * const {getViewportProps, getContentProps, state} = useScrollableArea({
 *   axis: 'block',
 *   keyboardAccess: {owner: 'viewport', label: 'Activity history'},
 * });
 * return (
 *   <div {...getViewportProps({xstyle: styles.viewport})}>
 *     <div {...getContentProps()}>{children}</div>
 *   </div>
 * );
 * ```
 */
export function useScrollableArea({
  axis,
  keyboardAccess,
  overscroll = 'allow',
  stickyContainment = 'whenScrollable',
}: UseScrollableAreaOptions): UseScrollableAreaResult {
  const [viewport, setViewport] = useState<HTMLElement | null>(null);
  const [content, setContent] = useState<HTMLElement | null>(null);
  const [measured, setMeasured] = useState<ScrollableAreaState>(INITIAL_STATE);
  const [overflow, setOverflow] =
    useState<LogicalOverflowGeometry>(INITIAL_OVERFLOW);
  const [mapping, setMapping] = useState<LogicalAxisMapping>(INITIAL_MAPPING);
  const [isViewportFocused, setViewportFocused] = useState(false);
  const stateRef = useRef<ScrollableAreaState>(INITIAL_STATE);

  const viewportRef = useCallback((node: HTMLElement | null) => {
    setViewport(current => (current === node ? current : node));
    if (node == null) {
      return;
    }
    const syncFocus = () => {
      // Only a viewport with no scrollable axis reads this state, and the
      // measurement that ends its scrolling reads focus again, so a scrollable
      // one can skip the render.
      const {inline, block} = stateRef.current;
      if (inline.isScrollable || block.isScrollable) {
        return;
      }
      setViewportFocused(node.ownerDocument.activeElement === node);
    };
    syncFocus();
    node.addEventListener('focusin', syncFocus);
    node.addEventListener('focusout', syncFocus);
    // React runs this cleanup instead of calling the ref with null, so the
    // viewport state has to clear here as well.
    return () => {
      node.removeEventListener('focusin', syncFocus);
      node.removeEventListener('focusout', syncFocus);
      setViewportFocused(false);
      setViewport(null);
    };
  }, []);
  const contentRef = useCallback((node: HTMLElement | null) => {
    setContent(current => (current === node ? current : node));
  }, []);
  const getComposedViewportRef = useStableComposedRef(viewportRef);
  const getComposedContentRef = useStableComposedRef(contentRef);

  useIsomorphicLayoutEffect(() => {
    if (viewport == null || content == null) {
      return;
    }

    let frame: number | null = null;
    let isActive = true;

    const measure = () => {
      frame = null;
      const computedStyle = getComputedStyle(viewport);
      const nextMapping = getLogicalAxisMapping(
        computedStyle.writingMode,
        computedStyle.direction,
      );
      const inlineOverflow = axisIsRequested(axis, 'inline')
        ? measureLogicalOverflowGeometry(viewport, 'inline', nextMapping)
        : false;
      const blockOverflow = axisIsRequested(axis, 'block')
        ? measureLogicalOverflowGeometry(viewport, 'block', nextMapping)
        : false;
      const inline = axisIsRequested(axis, 'inline')
        ? measureLogicalScrollAxis(viewport, 'inline', nextMapping)
        : INACTIVE_AXIS_STATE;
      const block = axisIsRequested(axis, 'block')
        ? measureLogicalScrollAxis(viewport, 'block', nextMapping)
        : INACTIVE_AXIS_STATE;

      // Hidden, disconnected, and zero-size viewports are unknown rather than
      // fitting. Keep the last valid state until a bounded signal remeasures.
      if (
        inlineOverflow == null ||
        blockOverflow == null ||
        inline == null ||
        block == null
      ) {
        return;
      }

      // Focus events do not always reach the viewport (Chromium fires none
      // while the page lacks system focus), and this commit may drop the tab
      // stop that keeps focus here. A scrollable viewport never reads it.
      if (!inline.isScrollable && !block.isScrollable) {
        setViewportFocused(viewport.ownerDocument.activeElement === viewport);
      }

      const nextOverflow = {
        inline: inlineOverflow,
        block: blockOverflow,
      };
      const nextState = {inline, block};
      stateRef.current = nextState;
      registerScrollOwner(viewport, nextState);
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- measured DOM geometry controls whether the viewport becomes a CSS scroll container
      setOverflow(current =>
        overflowEqual(current, nextOverflow) ? current : nextOverflow,
      );
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- measured DOM state is the hook's output
      setMeasured(current =>
        statesEqual(current, nextState) ? current : nextState,
      );
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- writing-mode changes remap behavior-owned physical CSS
      setMapping(current =>
        mappingsEqual(current, nextMapping) ? current : nextMapping,
      );
    };

    const scheduleMeasure = () => {
      if (!isActive || frame != null) {
        return;
      }
      frame = window.requestAnimationFrame(measure);
    };

    registerScrollOwner(viewport, stateRef.current);
    measure();
    const stopObservingViewport = observeResize(viewport, scheduleMeasure);
    const stopObservingContent = observeResize(content, scheduleMeasure);

    viewport.addEventListener('scroll', scheduleMeasure, {passive: true});
    window.addEventListener('resize', scheduleMeasure);
    window.visualViewport?.addEventListener('resize', scheduleMeasure);
    content.addEventListener('load', scheduleMeasure, true);
    viewport.addEventListener('transitionend', scheduleMeasure);
    viewport.addEventListener('animationend', scheduleMeasure);
    content.addEventListener('transitionend', scheduleMeasure);
    content.addEventListener('animationend', scheduleMeasure);

    // Geometry invalidation is independent of keyboard eligibility. The latter
    // is inspected only on native keyboard entry, never by these observers.
    const mutationObserver =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(scheduleMeasure);
    mutationObserver?.observe(viewport, {
      attributes: true,
      attributeFilter: ['class', 'dir', 'hidden', 'style'],
    });
    mutationObserver?.observe(content, {
      attributes: true,
      attributeFilter: ['class', 'dir', 'hidden', 'style'],
      characterData: true,
      childList: true,
      subtree: true,
    });
    let ancestor = viewport.parentElement;
    while (ancestor != null) {
      mutationObserver?.observe(ancestor, {
        attributes: true,
        attributeFilter: ['class', 'dir', 'hidden', 'style'],
      });
      ancestor = ancestor.parentElement;
    }

    const fonts = document.fonts;
    fonts?.addEventListener?.('loadingdone', scheduleMeasure);
    void fonts?.ready.then(scheduleMeasure);

    return () => {
      isActive = false;
      unregisterScrollOwner(viewport);
      stopObservingViewport();
      stopObservingContent();
      mutationObserver?.disconnect();
      viewport.removeEventListener('scroll', scheduleMeasure);
      window.removeEventListener('resize', scheduleMeasure);
      window.visualViewport?.removeEventListener('resize', scheduleMeasure);
      content.removeEventListener('load', scheduleMeasure, true);
      viewport.removeEventListener('transitionend', scheduleMeasure);
      viewport.removeEventListener('animationend', scheduleMeasure);
      content.removeEventListener('transitionend', scheduleMeasure);
      content.removeEventListener('animationend', scheduleMeasure);
      fonts?.removeEventListener?.('loadingdone', scheduleMeasure);
      if (frame != null) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [axis, content, viewport]);

  const state = useMemo<ScrollableAreaState>(
    () => ({
      inline: axisIsRequested(axis, 'inline')
        ? measured.inline
        : INACTIVE_AXIS_STATE,
      block: axisIsRequested(axis, 'block')
        ? measured.block
        : INACTIVE_AXIS_STATE,
    }),
    [axis, measured],
  );

  const hasEffectiveAxis =
    state.inline.isScrollable || state.block.isScrollable;
  useIsomorphicLayoutEffect(() => {
    if (
      keyboardAccess.owner !== 'contentOrViewport' ||
      !hasEffectiveAxis ||
      viewport == null ||
      content == null
    ) {
      return;
    }
    return attachScrollKeyboardDelegation(viewport, content);
  }, [content, hasEffectiveAxis, keyboardAccess.owner, viewport]);

  const getViewportProps = useCallback(
    <E extends HTMLElement>(
      props: ScrollableElementProps<E> = {},
    ): ScrollableElementProps<E> => {
      const hasEffectiveAxis =
        state.inline.isScrollable || state.block.isScrollable;
      const requestedX =
        (axisIsRequested(axis, 'inline') && mapping.inline === 'x') ||
        (axisIsRequested(axis, 'block') && mapping.block === 'x');
      const requestedY =
        (axisIsRequested(axis, 'inline') && mapping.inline === 'y') ||
        (axisIsRequested(axis, 'block') && mapping.block === 'y');
      const overflowingX =
        (overflow.inline && mapping.inline === 'x') ||
        (overflow.block && mapping.block === 'x');
      const overflowingY =
        (overflow.inline && mapping.inline === 'y') ||
        (overflow.block && mapping.block === 'y');
      const containsSticky =
        overflowingX || overflowingY || stickyContainment === 'always';
      const scrollsOnX =
        stickyContainment === 'always' ? requestedX : overflowingX;
      const scrollsOnY =
        stickyContainment === 'always' ? requestedY : overflowingY;
      const {xstyle, ...domProps} = props;
      const callerProps = {
        ...domProps,
        style: withoutOwnedOverflow(domProps.style),
      };
      const styledProps = mergeProps(
        callerProps,
        stylex.props(
          xstyle,
          styles.overflow(
            containsSticky ? (scrollsOnX ? 'auto' : 'hidden') : 'clip',
            containsSticky ? (scrollsOnY ? 'auto' : 'hidden') : 'clip',
          ),
        ),
      ) as ScrollableElementProps<E>;
      // Focus state is stale while an axis scrolls, so until an axis change is
      // measured, the last measured scrolling keeps a focused viewport's
      // tabindex. Dropping it there blurs the viewport in Chromium.
      const mayHoldFocus =
        isViewportFocused ||
        measured.inline.isScrollable ||
        measured.block.isScrollable;
      const behaviorStyle: CSSProperties = {...styledProps.style};
      const containInline =
        overscroll === 'contain' && state.inline.isScrollable;
      const containBlock = overscroll === 'contain' && state.block.isScrollable;
      const inlinePhysical = mapping.inline;
      const blockPhysical = mapping.block;

      if (axisIsRequested(axis, 'inline')) {
        behaviorStyle[
          inlinePhysical === 'x' ? 'overscrollBehaviorX' : 'overscrollBehaviorY'
        ] = containInline ? 'contain' : 'auto';
      }
      if (axisIsRequested(axis, 'block')) {
        behaviorStyle[
          blockPhysical === 'x' ? 'overscrollBehaviorX' : 'overscrollBehaviorY'
        ] = containBlock ? 'contain' : 'auto';
      }

      const keyboardProps =
        keyboardAccess.owner !== 'content'
          ? {
              role: keyboardAccess.role ?? 'group',
              'aria-label': keyboardAccess.label,
              tabIndex: hasEffectiveAxis ? 0 : mayHoldFocus ? -1 : undefined,
            }
          : {};

      const result: ScrollableElementProps<E> = {
        ...styledProps,
        ...keyboardProps,
        ref: getComposedViewportRef(styledProps.ref),
        style: behaviorStyle,
        'data-scroll-axis': axis,
        'data-scrollable-inline': state.inline.isScrollable
          ? 'true'
          : undefined,
        'data-scrollable-block': state.block.isScrollable ? 'true' : undefined,
        'data-scroll-inline-start': state.inline.atStart ? 'true' : undefined,
        'data-scroll-inline-end': state.inline.atEnd ? 'true' : undefined,
        'data-scroll-block-start': state.block.atStart ? 'true' : undefined,
        'data-scroll-block-end': state.block.atEnd ? 'true' : undefined,
      };
      return result;
    },
    [
      axis,
      getComposedViewportRef,
      isViewportFocused,
      keyboardAccess,
      mapping,
      measured,
      overflow,
      overscroll,
      state,
      stickyContainment,
    ],
  );

  const getContentProps = useCallback(
    <E extends HTMLElement>(
      props: ScrollableElementProps<E> = {},
    ): ScrollableElementProps<E> => {
      const {xstyle, ...domProps} = props;
      const styledProps = mergeProps(
        domProps,
        stylex.props(xstyle),
      ) as ScrollableElementProps<E>;
      const result: ScrollableElementProps<E> = {
        ...styledProps,
        ref: getComposedContentRef(styledProps.ref),
        'data-scroll-content': '',
      };
      return result;
    },
    [getComposedContentRef],
  );

  return {getViewportProps, getContentProps, state};
}
