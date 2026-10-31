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
import {mergeProps, themeProps, observeResize} from '@astryxdesign/core/utils';
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

const HIDDEN_ATTRIBUTE = 'data-line-clamp-hidden';

/**
 * Take a clipped descendant out of the tab order and the accessibility tree by
 * marking it `inert`. The element's own `tabindex` and `aria-hidden` are never
 * rewritten, so a caller's `tabIndex={-1}` or `aria-hidden="true"` survives
 * whatever the clamp does, and there is nothing to restore but the one
 * attribute this adds.
 */
function hideFromTabOrder(el: HTMLElement) {
  if (el.hasAttribute(HIDDEN_ATTRIBUTE)) {
    return;
  }
  // Already inert because the caller made it so: not ours to manage.
  if (el.hasAttribute('inert')) {
    return;
  }
  el.setAttribute('inert', '');
  el.setAttribute(HIDDEN_ATTRIBUTE, '');
}

/** Make a descendant this clamp hid reachable again. */
function restoreFromClip(el: HTMLElement) {
  el.removeAttribute('inert');
  el.removeAttribute(HIDDEN_ATTRIBUTE);
}

/**
 * Scan a clamp container for focusable descendants that fall on a visually
 * clipped line, and hide exactly those from the tab order (see the fuller
 * comment where this runs, in the component). Also includes elements this
 * already hid (`[data-line-clamp-hidden]`) so a previously-clipped descendant
 * that becomes visible again (a resize, more space) is found and restored.
 *
 * `focusTarget` is where focus is going when this runs from a `focusout`,
 * which fires before `document.activeElement` has moved.
 */
function syncFocusableClipping(
  container: HTMLElement,
  focusTarget?: Element | null,
) {
  const containerBottom = container.getBoundingClientRect().bottom;
  const candidates = container.querySelectorAll<HTMLElement>(
    `${FOCUSABLE_SELECTOR}, [data-line-clamp-hidden]`,
  );
  for (const el of candidates) {
    // Never take the element that holds focus out of the tab order: focus
    // would be lost from under the reader.
    const isFocused =
      el.contains(document.activeElement) ||
      (focusTarget != null && el.contains(focusTarget));
    const isClipped =
      !isFocused && el.getBoundingClientRect().top >= containerBottom;
    if (isClipped) {
      hideFromTabOrder(el);
    } else if (el.hasAttribute('data-line-clamp-hidden')) {
      restoreFromClip(el);
    }
  }
}

const MUTATION_OPTIONS: MutationObserverInit = {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['tabindex', 'disabled', 'href', 'inert'],
  // An `inert` written while the attribute is already there is the caller's.
  attributeOldValue: true,
};

// One observer for every clamp on the page: a list of N clamps would
// otherwise hold N observers. Each record is dispatched to the clamp roots
// that contain its target.
const mutationRoots = new Map<HTMLElement, () => void>();
let sharedMutations: MutationObserver | null = null;

function dispatchMutations(records: ReadonlyArray<MutationRecord>) {
  const due = new Set<() => void>();
  for (const record of records) {
    // The caller rendered `inert` on a link this clamp had already hidden: the
    // attribute was present before the write, and this clamp only ever writes
    // it when absent. Hand ownership back, so un-clipping the link leaves it
    // inert as the caller asked.
    if (
      record.type === 'attributes' &&
      record.attributeName === 'inert' &&
      record.oldValue !== null &&
      record.target instanceof HTMLElement &&
      record.target.hasAttribute(HIDDEN_ATTRIBUTE) &&
      record.target.hasAttribute('inert')
    ) {
      record.target.removeAttribute(HIDDEN_ATTRIBUTE);
    }
    for (const [root, sync] of mutationRoots) {
      if (root.contains(record.target)) {
        due.add(sync);
      }
    }
  }
  due.forEach(sync => sync());
}

function observeMutations(container: HTMLElement, sync: () => void) {
  if (typeof MutationObserver === 'undefined') {
    return () => {};
  }
  sharedMutations ??= new MutationObserver(dispatchMutations);
  mutationRoots.set(container, sync);
  sharedMutations.observe(container, MUTATION_OPTIONS);
  return () => {
    const observer = sharedMutations;
    if (observer == null) {
      return;
    }
    // An observer cannot unobserve one target, so drop it, hand over what it
    // had already seen, and watch the roots that remain.
    const pending = observer.takeRecords();
    observer.disconnect();
    mutationRoots.delete(container);
    dispatchMutations(pending);
    if (mutationRoots.size === 0) {
      sharedMutations = null;
      return;
    }
    for (const root of mutationRoots.keys()) {
      observer.observe(root, MUTATION_OPTIONS);
    }
  };
}

export interface LineClampProps extends BaseProps<HTMLElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLElement>;
  /**
   * Content to clamp: mixed inline content, nested elements, anything you
   * would rather not wrap in a single `Text`.
   */
  children: ReactNode;
  /**
   * Maximum number of lines to show before clamping with an ellipsis.
   */
  maxLines: number;
  /**
   * Show a tooltip with the full text content on hover or keyboard focus when
   * clamped. A clamped root is focusable so the tooltip can be reached without a
   * pointer.
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
 * `Text`'s `maxLines` clamps a `Text` element. `LineClamp` clamps whatever it
 * wraps and adds no typography of its own, so it fits content that is not a
 * single `Text` (mixed inline content, nested elements) without changing its
 * font, color or wrapping.
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
  // The clamp is height-based at every line count, so a single line must be
  // measured the way a multi-line clamp is. `useTruncation({maxLines: 1})`
  // compares horizontal overflow, which a wrapping box never has, so the
  // tooltip would never appear.
  const truncation = useTruncation({
    maxLines: maxLines > 0 ? Math.max(maxLines, 2) : 0,
  });
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
  // - The shared ResizeObserver `useTruncation` also uses, and a
  //   MutationObserver for descendant changes, on any actual change — a window/container resize can change which lines a
  //   descendant falls on without `truncation.isTruncated` ever flipping
  //   (still truncated before and after), so a render-only check would
  //   never re-run and a since-uncovered descendant would stay hidden.
  useLayoutEffect(() => {
    const container = elementRef.current;
    if (container) {
      syncFocusableClipping(container);
    }
  });

  // Resubscribes when `as` swaps the root node, so the observers never stay
  // attached to a node that has been replaced. The mutation observer covers
  // what neither a render nor a resize does: a child component adding or
  // re-enabling a focusable element past the fold on its own state change.
  // A `focusout` re-runs the sync once focus has moved: the focused element
  // was skipped while it held focus, so a link clipped in the meantime would
  // otherwise stay an invisible tab stop.
  useEffect(() => {
    const container = elementRef.current;
    if (!container) {
      return;
    }
    const sync = () => syncFocusableClipping(container);
    const onFocusOut = (event: FocusEvent) =>
      syncFocusableClipping(
        container,
        event.relatedTarget instanceof Element ? event.relatedTarget : null,
      );
    const unobserve = observeResize(container, sync);
    const unobserveMutations = observeMutations(container, sync);
    container.addEventListener('focusout', onFocusOut);
    return () => {
      unobserve();
      unobserveMutations();
      container.removeEventListener('focusout', onFocusOut);
    };
  }, [Component]);

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
        // A truncated clamp is a tab stop so keyboard users can reveal the
        // full text through the tooltip, which opens on focus. A caller's own
        // `tabIndex` wins.
        tabIndex={tooltipEnabled ? 0 : undefined}
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
