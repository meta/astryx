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

export type ScrollAxis = 'inline' | 'block' | 'both';
export type ScrollOverscroll = 'allow' | 'contain';
export type ScrollStickyContainment = 'whenScrollable' | 'always';

export type ScrollKeyboardAccess =
  | {owner: 'content'}
  | {owner: 'viewport'; label: string; role?: 'group' | 'region'}
  | {
      owner: 'contentOrViewport';
      label: string;
      role?: 'group' | 'region';
    };

export interface ScrollAxisState {
  isScrollable: boolean;
  atStart: boolean;
  atEnd: boolean;
}

export interface ScrollableAreaState {
  inline: ScrollAxisState;
  block: ScrollAxisState;
}

export interface UseScrollableAreaOptions {
  axis: ScrollAxis;
  keyboardAccess: ScrollKeyboardAccess;
  overscroll?: ScrollOverscroll;
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
  const stateRef = useRef<ScrollableAreaState>(INITIAL_STATE);
  const measureRef = useRef<(() => void) | null>(null);

  const viewportRef = useCallback((node: HTMLElement | null) => {
    setViewport(current => (current === node ? current : node));
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

    // Measures now; `measure` is the frame callback that also clears the
    // pending frame. The same-commit remeasure below calls this one, so a frame
    // already scheduled stays the only pending one.
    const measureNow = () => {
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

      const nextOverflow = {
        inline: inlineOverflow,
        block: blockOverflow,
      };
      const nextState = {inline, block};
      stateRef.current = nextState;
      registerScrollOwner(viewport, nextState);
      // Measured DOM geometry decides whether the viewport becomes a CSS
      // scroll container.
      setOverflow(current =>
        overflowEqual(current, nextOverflow) ? current : nextOverflow,
      );
      // The measured DOM state is the hook's output.
      setMeasured(current =>
        statesEqual(current, nextState) ? current : nextState,
      );
      // A writing-mode change remaps the behavior-owned physical CSS.
      setMapping(current =>
        mappingsEqual(current, nextMapping) ? current : nextMapping,
      );
    };

    const measure = () => {
      frame = null;
      measureNow();
    };

    const scheduleMeasure = () => {
      if (!isActive || frame != null) {
        return;
      }
      frame = window.requestAnimationFrame(measure);
    };

    registerScrollOwner(viewport, stateRef.current);
    measureRef.current = measureNow;
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
      measureRef.current = null;
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

  // The first measure reads the viewport before this hook has let an
  // overflowing axis scroll (it is `clip` until then), so it finds overflow
  // but no scrollable axis yet. Measure again in the same commit once an axis
  // has just gained overflow (or the axis mapping changed), so the viewport is
  // a tab stop from the first frame it scrolls, not an animation frame later
  // (`spec:AST-025` FR12). Only on a gain: content that fits only once a
  // scrollbar takes space would otherwise flip overflow back and forth inside
  // one commit; a loss waits for the next frame, as before.
  const previousOverflowRef = useRef<LogicalOverflowGeometry>(INITIAL_OVERFLOW);
  const previousMappingRef = useRef<LogicalAxisMapping>(INITIAL_MAPPING);
  useIsomorphicLayoutEffect(() => {
    const previous = previousOverflowRef.current;
    const hasGainedOverflow =
      (overflow.inline && !previous.inline) ||
      (overflow.block && !previous.block);
    const hasRemapped = mapping !== previousMappingRef.current;
    previousOverflowRef.current = overflow;
    previousMappingRef.current = mapping;
    if (hasGainedOverflow || hasRemapped) {
      measureRef.current?.();
    }
  }, [overflow, mapping]);

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
      const viewportIsKeyboardOwner = keyboardAccess.owner !== 'content';
      const keepsProgrammaticFocus =
        (!viewportIsKeyboardOwner || !hasEffectiveAxis) &&
        viewport != null &&
        typeof document !== 'undefined' &&
        document.activeElement === viewport;
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
              tabIndex:
                viewportIsKeyboardOwner && hasEffectiveAxis
                  ? 0
                  : keepsProgrammaticFocus
                    ? -1
                    : undefined,
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
      keyboardAccess,
      mapping,
      overflow,
      overscroll,
      state,
      stickyContainment,
      viewport,
    ],
  );

  const getContentProps = useCallback(
    <E extends HTMLElement>(
      props: ScrollableElementProps<E> = {},
    ): ScrollableElementProps<E> => {
      const result: ScrollableElementProps<E> = {
        ...props,
        ref: getComposedContentRef(props.ref),
        'data-scroll-content': '',
      };
      return result;
    },
    [getComposedContentRef],
  );

  return {getViewportProps, getContentProps, state};
}
