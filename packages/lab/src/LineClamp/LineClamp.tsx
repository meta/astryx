// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LineClamp.tsx
 * @input Uses React, stylex, useTruncation + Tooltip + BaseProps from
 *   @astryxdesign/core, and Core's canonical focusable selector and shared
 *   mutation observer through `@astryxdesign/core/internal/line-clamp`
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
  useCallback,
  useLayoutEffect,
  useRef,
  type FocusEvent,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';

import type {BaseProps} from '@astryxdesign/core';
import {useTruncation} from '@astryxdesign/core/Text';
import {truncationTooltipStyles} from '@astryxdesign/core/Text/text.stylex';
import type {LayerPlacement} from '@astryxdesign/core/Layer';
import {
  composeEventHandlers,
  focusOutlineStyles,
  mergeProps,
  themeProps,
  observeResize,
} from '@astryxdesign/core/utils';
import {useMergedRefs} from '@astryxdesign/core/hooks';
import {
  FOCUSABLE_SELECTOR,
  flushMutations,
  observeMutations,
  TruncationTooltip,
  useTruncationTooltipInterest,
} from '@astryxdesign/core/internal/line-clamp';

const styles = stylex.create({
  clamp: {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    // `clip`, not `hidden`: both clip the same way visually, but `hidden`
    // makes the box a scroll container, so a browser bringing a focused
    // descendant into view scrolls it, which, against a clamped box, means
    // focusing a clipped link replaces the visible line with the hidden one
    // out from under the reader. `clip` clips without becoming scrollable,
    // so that scroll-into-view path never triggers.
    overflow: 'clip',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
  },
});

const HIDDEN_ATTRIBUTE = 'data-line-clamp-hidden';
const ROOT_ATTRIBUTE = 'data-line-clamp-root';

/**
 * Whether `container` is the nearest clamp around `el`. A clamp nested inside
 * another manages its own descendants, so the outer one must not hide, restore
 * or disown them: it would undo the inner clamp's decisions with the outer
 * clamp's box in mind, not the inner one's.
 */
function isOwnedBy(container: HTMLElement, el: Element): boolean {
  // A popover or dialog renders in the top layer, which the clamp does not
  // clip, so ownership stops at that layer boundary.
  return (
    el.parentElement?.closest(`[${ROOT_ATTRIBUTE}], [popover], dialog`) ===
    container
  );
}

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
    if (!isOwnedBy(container, el)) {
      continue;
    }
    const box = flowBox(container, el);
    if (box == null) {
      if (el.hasAttribute(HIDDEN_ATTRIBUTE)) {
        restoreFromClip(el);
      }
      continue;
    }
    // Never take the element that holds focus out of the tab order: focus
    // would be lost from under the reader.
    const isFocused =
      el.contains(document.activeElement) ||
      (focusTarget != null && el.contains(focusTarget));
    // A candidate with no box has an all-zero rect, so the rect rule cannot
    // judge it. `display: none` cannot show, so it stays inert until the edge
    // observer sees it on a visible line. `display: contents` has no box of
    // its own; its children are the candidates.
    if (el.getClientRects().length === 0) {
      if (getComputedStyle(el).display === 'contents') {
        if (el.hasAttribute(HIDDEN_ATTRIBUTE)) {
          restoreFromClip(el);
        }
      } else if (!isFocused) {
        hideFromTabOrder(el);
      }
      continue;
    }
    const isClipped =
      !isFocused && box.getBoundingClientRect().top >= containerBottom;
    if (isClipped) {
      hideFromTabOrder(el);
    } else if (el.hasAttribute('data-line-clamp-hidden')) {
      restoreFromClip(el);
    }
  }
}

/**
 * The box whose position decides whether `el` is cut off, or null when `el`
 * starts or sits in a subtree that is never made inert. A `fixed` box, or an
 * `absolute` box whose containing block is the clamp or lies outside it,
 * starts such a subtree. An `absolute` box placed against a containing block
 * in the clamp's flow (a control's own positioned wrapper) stays in the flow,
 * and that containing block's box decides. A popover or dialog stops
 * ownership in `isOwnedBy`, and a portal renders outside the clamp.
 */
function containingBlock(node: Element): Element | null {
  if (node instanceof HTMLElement && node.offsetParent != null) {
    return node.offsetParent;
  }
  // A node with no box (for example under `display: none`) has no
  // `offsetParent`, so find its containing block from computed style.
  if (node.getClientRects().length > 0) {
    return null;
  }
  for (
    let ancestor = node.parentElement;
    ancestor != null;
    ancestor = ancestor.parentElement
  ) {
    if (getComputedStyle(ancestor).position !== 'static') {
      return ancestor;
    }
  }
  return null;
}

function flowBox(container: HTMLElement, el: Element): Element | null {
  let box: Element = el;
  for (
    let node: Element | null = el;
    node != null && node !== container;
    node = node.parentElement
  ) {
    const {position} = getComputedStyle(node);
    if (position === 'fixed') {
      return null;
    }
    if (position === 'absolute') {
      const block = containingBlock(node);
      if (block == null || block === container || !container.contains(block)) {
        return null;
      }
      box = block;
    }
  }
  return box;
}

/**
 * Lines can re-wrap at the same box size with no render, mutation or resize.
 * An IntersectionObserver rooted at the clamp reports each managed focusable
 * that crosses the clip edge. A link whose top touches the edge intersects at
 * ratio 0 but is clipped, so a threshold just above 0 reports that move too.
 */
function observeEdgeCrossings(container: HTMLElement, onCross: () => void) {
  if (typeof IntersectionObserver === 'undefined') {
    return {refresh: () => {}, disconnect: () => {}};
  }
  const observer = new IntersectionObserver(onCross, {
    root: container,
    threshold: EDGE_THRESHOLDS,
  });
  const refresh = () => {
    observer.disconnect();
    const candidates = container.querySelectorAll(CANDIDATE_SELECTOR);
    for (const el of candidates) {
      if (isOwnedBy(container, el)) {
        observer.observe(el);
      }
    }
  };
  refresh();
  return {refresh, disconnect: () => observer.disconnect()};
}

const EDGE_THRESHOLDS = [0, 1e-6];

const CANDIDATE_SELECTOR = `${FOCUSABLE_SELECTOR}, [${HIDDEN_ATTRIBUTE}]`;
const BOX_ATTRIBUTES = new Set(['hidden', 'class', 'style']);

function isBoxRecord(record: MutationRecord): boolean {
  return BOX_ATTRIBUTES.has(record.attributeName ?? '');
}

/** A record that can change which descendants are focusable. */
function changesFocusables(record: MutationRecord): boolean {
  return (
    record.type === 'childList' ||
    (record.attributeName !== 'inert' && !isBoxRecord(record))
  );
}

/**
 * A `hidden`, `class` or `style` change matters only on a candidate or an
 * ancestor of one. Decorative animation inside the clamp runs no pass.
 */
function needsPass(record: MutationRecord): boolean {
  if (!isBoxRecord(record)) {
    return true;
  }
  const target = record.target;
  return (
    target instanceof Element &&
    (target.matches(CANDIDATE_SELECTOR) ||
      target.querySelector(CANDIDATE_SELECTOR) != null)
  );
}

const MUTATION_OPTIONS: MutationObserverInit = {
  childList: true,
  subtree: true,
  attributes: true,
  attributeOldValue: true,
  // `hidden`, `class` and `style` can show a focusable past the edge with no
  // other change, so they run the pass too.
  attributeFilter: [
    'tabindex',
    'disabled',
    'href',
    'inert',
    'contenteditable',
    'hidden',
    'class',
    'style',
  ],
};

/**
 * A caller writing `inert` on a link this clamp had hidden makes the attribute
 * theirs: drop the clamp's marker, so un-clipping the link leaves it as they
 * set it. The clamp's own writes are told apart by what they do rather than
 * counted, so this does not depend on when the observer attached. It only ever
 * adds or removes the attribute, so a record that goes from present to present
 * is the caller writing it again, and a hidden link left without it had it
 * taken away.
 */
function handBackCallerInert(
  container: HTMLElement,
  records: ReadonlyArray<MutationRecord>,
) {
  const inertRecords = records.filter(
    (record): record is MutationRecord & {target: HTMLElement} =>
      record.type === 'attributes' &&
      record.attributeName === 'inert' &&
      record.target instanceof HTMLElement &&
      isOwnedBy(container, record.target),
  );
  for (const [index, record] of inertRecords.entries()) {
    const target = record.target;
    // What the attribute was set to by this record: the next record for the
    // same element reports it as its old value, and the last one is the
    // element's current state.
    const next = inertRecords
      .slice(index + 1)
      .find(candidate => candidate.target === target);
    const value = next ? next.oldValue : target.getAttribute('inert');
    if (record.oldValue != null && value != null) {
      target.removeAttribute(HIDDEN_ATTRIBUTE);
    }
  }
  for (const record of inertRecords) {
    if (!record.target.hasAttribute('inert')) {
      record.target.removeAttribute(HIDDEN_ATTRIBUTE);
    }
  }
}

/**
 * A release runs in React's commit, before the new line count is written, so
 * a clipping pass there would lay the page out a second time. While a release
 * flushes the queued records, every clamp hands back its caller's `inert` at
 * once and defers its pass until the commit is done. The releasing clamp
 * skips its own pass: its layout effect syncs it.
 */
let isReleaseFlushing = false;
const deferredSyncs = new Set<() => void>();

function deferSync(sync: () => void) {
  if (deferredSyncs.size === 0) {
    queueMicrotask(() => {
      const syncs = [...deferredSyncs];
      deferredSyncs.clear();
      syncs.forEach(run => run());
    });
  }
  deferredSyncs.add(sync);
}

function releaseFlush() {
  isReleaseFlushing = true;
  try {
    flushMutations(MUTATION_OPTIONS);
  } finally {
    isReleaseFlushing = false;
  }
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
   * @default true
   */
  hasTruncateTooltip?: boolean;
  /**
   * Where the truncation tooltip opens.
   * @default 'above'
   */
  truncateTooltipPlacement?: LayerPlacement;
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
 * <LineClamp maxLines={3} hasTruncateTooltip={false}>{longDescription}</LineClamp>
 * ```
 */
export function LineClamp({
  children,
  maxLines,
  hasTruncateTooltip = true,
  truncateTooltipPlacement = 'above',
  as: Component = 'div',
  xstyle,
  className,
  style,
  ref,
  onBlur,
  onFocus,
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
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

  // A resize, a re-wrap of the lines or a child's new focusable can move a
  // descendant across the edge without a render. The shared observers and
  // the edge observer run the sync for those. A callback ref attaches them
  // with the root and releases them when it goes, including when `as`
  // replaces it.
  const observeRoot = useCallback((container: HTMLElement | null) => {
    if (container == null) {
      return;
    }
    const sync = () => syncFocusableClipping(container);
    let isReleased = false;
    const edge = observeEdgeCrossings(container, () => {
      if (!isReleased) {
        sync();
      }
    });
    const unobserveMutations = observeMutations(
      container,
      MUTATION_OPTIONS,
      records => {
        handBackCallerInert(container, records);
        if (isReleased) {
          return;
        }
        if (records.some(changesFocusables)) {
          edge.refresh();
        }
        if (!records.some(needsPass)) {
          return;
        }
        if (isReleaseFlushing) {
          deferSync(sync);
          return;
        }
        sync();
      },
    );
    const unobserveResize = observeResize(container, sync);
    return () => {
      // The shared observer disconnects when its last registration goes, and
      // a disconnect drops the records it holds. Hand a caller's queued
      // `inert` back first, while this registration still receives it.
      isReleased = true;
      releaseFlush();
      edge.disconnect();
      unobserveResize();
      unobserveMutations();
    };
  }, []);
  const mergedRef = useMergedRefs(ref, truncation.ref, elementRef, observeRoot);

  const tooltipEnabled =
    hasTruncateTooltip && maxLines > 0 && truncation.isTruncated;
  // The tooltip mounts on the first hover, completed tap or focus, as Text's
  // does, so a page of clamped content mounts no tooltip layers at load.
  const tooltipInterest = useTruncationTooltipInterest(tooltipEnabled);

  // Line clamping clips paint only. A link on a clipped line stays in the Tab
  // order, so mark it inert. This runs on every render; the observers above
  // cover changes that do not render.
  useLayoutEffect(() => {
    const container = elementRef.current;
    if (container) {
      // A caller's `inert` written in this render must reach the hand-off
      // before the sync can un-clip that link.
      flushMutations(MUTATION_OPTIONS);
      syncFocusableClipping(container);
    }
  });

  // Focus has moved by now, so a link that was skipped while it held focus can
  // be hidden if it is clipped. `relatedTarget` is where focus is going.
  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    syncFocusableClipping(
      event.currentTarget,
      event.relatedTarget instanceof Element ? event.relatedTarget : null,
    );
  };

  return (
    <>
      <Component
        ref={mergedRef}
        {...mergeProps(
          themeProps('line-clamp'),
          stylex.props(focusOutlineStyles.focusVisible, styles.clamp, xstyle),
          className,
          {...style, WebkitLineClamp: maxLines},
        )}
        // A truncated clamp is a tab stop so keyboard users can reveal the
        // full text through the tooltip, which opens on focus. A caller's own
        // `tabIndex` wins.
        tabIndex={tooltipEnabled ? 0 : undefined}
        {...{[ROOT_ATTRIBUTE]: ''}}
        onPointerEnter={composeEventHandlers(
          tooltipInterest.onPointerEnter,
          onPointerEnter,
        )}
        onPointerLeave={composeEventHandlers(
          tooltipInterest.onPointerLeave,
          onPointerLeave,
        )}
        onPointerDown={composeEventHandlers(
          tooltipInterest.onPointerDown,
          onPointerDown,
        )}
        onFocus={composeEventHandlers(tooltipInterest.onFocus, onFocus)}
        onBlur={composeEventHandlers(
          tooltipInterest.onBlur,
          composeEventHandlers(handleBlur, onBlur),
        )}
        {...props}>
        {children}
      </Component>
      {tooltipEnabled && tooltipInterest.isWanted && (
        <TruncationTooltip
          anchorRef={elementRef}
          content={
            <span {...stylex.props(truncationTooltipStyles.content)}>
              {truncation.fullText}
            </span>
          }
          placement={truncateTooltipPlacement}
          interest={tooltipInterest}
        />
      )}
    </>
  );
}

LineClamp.displayName = 'LineClamp';
