// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LineClamp.tsx
 * @input Uses React, stylex, useTruncation + Tooltip + BaseProps from @astryxdesign/core
 * @output Exports LineClamp component, LineClampProps
 * @position Lab experiment (facebook/astryx#4180); consumed by index.ts
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/lab/src/LineClamp/LineClamp.doc.mjs (props table, features)
 * - /packages/lab/src/LineClamp/LineClamp.test.tsx (tests for new/changed behavior)
 * - /packages/lab/src/LineClamp/index.ts (exports if types change)
 * - /apps/storybook/stories/LineClamp.stories.tsx (storybook stories)
 */

import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';

import type {BaseProps} from '@astryxdesign/core';
import {useTruncation} from '@astryxdesign/core/Text';
import type {LayerPlacement} from '@astryxdesign/core/Layer';
import {
  mergeProps,
  themeProps,
  observeResize,
  unobserveResize,
} from '@astryxdesign/core/utils';
import {useMergedRefs} from '@astryxdesign/core/hooks';

const LazyTooltip = lazy(async () =>
  import('@astryxdesign/core/Tooltip').then(mod => ({default: mod.Tooltip})),
);

const styles = stylex.create({
  clamp: {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    // `clip`, not `hidden`: both clip the same way visually, but `hidden`
    // makes the box a scroll container, so a browser bringing a focused
    // descendant into view scrolls it — which, against a clamped box, means
    // focusing a clipped link replaces the visible line with the hidden one
    // out from under the reader. `clip` clips without becoming scrollable,
    // so that scroll-into-view path never triggers (#4259).
    overflow: 'clip',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
  },
  tooltipContent: {
    maxWidth: '300px',
    wordBreak: 'break-word',
  },
});

// Elements the browser's own tab order can reach inside clamped content.
// `core`'s canonical FOCUSABLE_SELECTOR (see useFocusTrap) is an internal
// implementation detail not exported from its public barrel, so this is its
// own narrower list — the cases actually plausible inside clamped text
// content, skipping already-inert (`tabindex="-1"`) elements so this effect
// doesn't fight a consumer's own choice.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Original tabIndex/aria-hidden state, captured before we touch an element. */
const ORIGINAL_STATE = new WeakMap<
  Element,
  {tabIndex: string | null; ariaHidden: string | null}
>();

/** Remove a clipped descendant from the tab order, capturing its prior state once. */
function hideFromTabOrder(el: HTMLElement) {
  if (!ORIGINAL_STATE.has(el)) {
    ORIGINAL_STATE.set(el, {
      tabIndex: el.getAttribute('tabindex'),
      ariaHidden: el.getAttribute('aria-hidden'),
    });
  }
  el.setAttribute('tabindex', '-1');
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('data-line-clamp-hidden', '');
}

/** Put a previously-clipped descendant's own state back, exactly as it was. */
function restoreOriginalState(el: HTMLElement) {
  const original = ORIGINAL_STATE.get(el);
  if (original) {
    if (original.tabIndex === null) {
      el.removeAttribute('tabindex');
    } else {
      el.setAttribute('tabindex', original.tabIndex);
    }
    if (original.ariaHidden === null) {
      el.removeAttribute('aria-hidden');
    } else {
      el.setAttribute('aria-hidden', original.ariaHidden);
    }
    ORIGINAL_STATE.delete(el);
  }
  el.removeAttribute('data-line-clamp-hidden');
}

/**
 * Scan a clamp container for focusable descendants that fall on a visually
 * clipped line, and hide exactly those from the tab order (see the fuller
 * comment where this runs, in the component). Also includes elements this
 * already hid (`[data-line-clamp-hidden]`) even though a hidden one no
 * longer matches FOCUSABLE_SELECTOR (its own tabindex="-1" excludes it) —
 * otherwise a previously-clipped descendant that becomes visible again
 * (a resize, more space) would never be found and restored.
 */
function syncFocusableClipping(container: HTMLElement) {
  const containerBottom = container.getBoundingClientRect().bottom;
  const candidates = container.querySelectorAll<HTMLElement>(
    `${FOCUSABLE_SELECTOR}, [data-line-clamp-hidden]`,
  );
  for (const el of candidates) {
    const isClipped = el.getBoundingClientRect().top >= containerBottom;
    if (isClipped) {
      hideFromTabOrder(el);
    } else if (el.hasAttribute('data-line-clamp-hidden')) {
      restoreOriginalState(el);
    }
  }
}

export interface LineClampProps extends BaseProps<HTMLElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLElement>;
  /**
   * Content to clamp. Unlike `Text`'s `maxLines` (which truncates a single
   * text node), `LineClamp` wraps arbitrary children — mixed inline content,
   * nested elements, anything that isn't a single `Text`.
   */
  children: ReactNode;
  /**
   * Maximum number of lines to show before clamping with an ellipsis.
   */
  maxLines: number;
  /**
   * Show a tooltip with the full content on hover/focus when clamped.
   * - `true` (default): show tooltip at default position
   * - `false`: disable tooltip
   * - Position value: show tooltip at specific position
   * @default true
   */
  hasTooltip?: boolean | LayerPlacement;
  /**
   * HTML element to render.
   * @default 'div'
   */
  as?: 'div' | 'span' | 'p';
}

/**
 * Clamps arbitrary content to a fixed number of lines with an ellipsis.
 *
 * `Text`'s `maxLines` truncates the text component's own string content;
 * `LineClamp` is the composable version — wrap it around any children (mixed
 * inline content, nested elements) to clamp the whole block to N lines.
 *
 * Truncation detection reuses `useTruncation` (the same hook `Text` uses),
 * so overflow is measured correctly even while `-webkit-line-clamp` clips
 * `scrollHeight`.
 *
 * @example
 * ```
 * <LineClamp maxLines={2}>
 *   Some <strong>mixed</strong> inline content that may run long.
 * </LineClamp>
 * <LineClamp maxLines={3} hasTooltip={false}>{longDescription}</LineClamp>
 * ```
 */
export function LineClamp({
  children,
  maxLines,
  hasTooltip = true,
  as: Component = 'div',
  xstyle,
  className,
  style,
  ref,
  ...props
}: LineClampProps): ReactNode {
  const truncation = useTruncation({maxLines});
  const elementRef = useRef<HTMLElement>(null);

  // Keep the merged ref stable across rerenders.
  const mergedRef = useMergedRefs(ref, truncation.ref, elementRef);

  const tooltipPlacement: LayerPlacement =
    typeof hasTooltip === 'string' ? hasTooltip : 'above';
  const tooltipEnabled =
    hasTooltip !== false && maxLines > 0 && truncation.isTruncated;

  // A descendant on a visually clipped line (e.g. a trailing "Read more"
  // link that lands past maxLines) is still in the DOM and still tabbable —
  // `-webkit-line-clamp` only clips paint, it doesn't remove the underlying
  // layout. Tab can land on something the reader cannot see. `overflow:
  // clip` above stops the browser from scrolling the box to chase a focused
  // descendant into view, but the descendant itself is still a real, if
  // invisible, tab stop unless something removes it from the tab order.
  // `syncFocusableClipping` (above) is what finds and hides exactly that
  // set, by comparing each focusable descendant's rect against the clamp
  // box's own (clipped) rect: the DOM layout underneath a clamp is always
  // the full, unclamped height, so anything whose top falls at or past the
  // box's clipped bottom edge is what the clamp is hiding.
  //
  // Runs from two places, because either alone misses a real case:
  // - Every render (rerun on children/maxLines changing, or anything else
  //   that reflows the content) — covers ordinary prop-driven updates.
  // - The shared ResizeObserver `useTruncation` also uses, on any actual
  //   size change — a window/container resize can change which lines a
  //   descendant falls on without `truncation.isTruncated` ever flipping
  //   (still truncated before and after), so a render-only check would
  //   never re-run and a since-uncovered descendant would stay hidden.
  useLayoutEffect(() => {
    const container = elementRef.current;
    if (container) {
      syncFocusableClipping(container);
    }
  });

  useEffect(() => {
    const container = elementRef.current;
    if (!container) {
      return;
    }
    observeResize(container, () => syncFocusableClipping(container));
    return () => unobserveResize(container);
  }, []);

  return (
    <>
      <Component
        ref={mergedRef}
        {...mergeProps(
          themeProps('line-clamp'),
          stylex.props(styles.clamp, xstyle),
          className,
          {...style, WebkitLineClamp: maxLines},
        )}
        {...props}>
        {children}
      </Component>
      {tooltipEnabled && (
        <Suspense fallback={null}>
          <LazyTooltip
            anchorRef={elementRef}
            content={
              <span {...stylex.props(styles.tooltipContent)}>
                {truncation.fullText}
              </span>
            }
            placement={tooltipPlacement}
          />
        </Suspense>
      )}
    </>
  );
}

LineClamp.displayName = 'LineClamp';
