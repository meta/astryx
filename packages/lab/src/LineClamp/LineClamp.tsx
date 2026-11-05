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
  lazy,
  Suspense,
  useCallback,
  useLayoutEffect,
  useRef,
  type FocusEvent,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';

import type {BaseProps} from '@astryxdesign/core';
import {useTruncation} from '@astryxdesign/core/Text';
import type {LayerPlacement} from '@astryxdesign/core/Layer';
import {
  composeEventHandlers,
  mergeProps,
  themeProps,
  observeResize,
} from '@astryxdesign/core/utils';
import {useMergedRefs} from '@astryxdesign/core/hooks';
import {
  FOCUSABLE_SELECTOR,
  observeMutations,
} from '@astryxdesign/core/internal/line-clamp';

const LazyTooltip = lazy(async () =>
  import('@astryxdesign/core/Tooltip').then(mod => ({default: mod.Tooltip})),
);

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
  tooltipContent: {
    maxWidth: '300px',
    wordBreak: 'break-word',
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
  return el.parentElement?.closest(`[${ROOT_ATTRIBUTE}]`) === container;
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
  attributeOldValue: true,
  attributeFilter: ['tabindex', 'disabled', 'href', 'inert', 'contenteditable'],
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
  hasTruncateTooltip?: boolean | LayerPlacement;
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
  as: Component = 'div',
  xstyle,
  className,
  style,
  ref,
  onBlur,
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

  // A resize can move a descendant across the clip edge without a render, and
  // a child can add or re-enable a focusable element past it, so the sync also
  // runs from the shared observers. A callback ref attaches them with the root
  // and releases them when it goes, including when `as` replaces it.
  const observeRoot = useCallback((container: HTMLElement | null) => {
    if (container == null) {
      return;
    }
    const sync = () => syncFocusableClipping(container);
    const unobserveMutations = observeMutations(
      container,
      MUTATION_OPTIONS,
      records => {
        handBackCallerInert(container, records);
        sync();
      },
    );
    const unobserveResize = observeResize(container, sync);
    return () => {
      unobserveResize();
      unobserveMutations();
    };
  }, []);
  const mergedRef = useMergedRefs(ref, truncation.ref, elementRef, observeRoot);

  const tooltipPlacement: LayerPlacement =
    typeof hasTruncateTooltip === 'string' ? hasTruncateTooltip : 'above';
  const tooltipEnabled =
    hasTruncateTooltip !== false && maxLines > 0 && truncation.isTruncated;

  // Line clamping clips paint only. A link on a clipped line stays in the Tab
  // order, so mark it inert. This runs on every render; the observers above
  // cover changes that do not render.
  useLayoutEffect(() => {
    const container = elementRef.current;
    if (container) {
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
          stylex.props(styles.clamp, xstyle),
          className,
          {...style, WebkitLineClamp: maxLines},
        )}
        // A truncated clamp is a tab stop so keyboard users can reveal the
        // full text through the tooltip, which opens on focus. A caller's own
        // `tabIndex` wins.
        tabIndex={tooltipEnabled ? 0 : undefined}
        {...{[ROOT_ATTRIBUTE]: ''}}
        onBlur={composeEventHandlers(handleBlur, onBlur)}
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
