// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ListItem.tsx
 * @input Uses React, ReactNode, StyleXStyles, theme tokens, the List row edge
 *   treatment, CheckboxInput, and the marker or task checkbox a
 *   ListMarkerScope sets (Markdown's nested lists and the task items of mixed
 *   lists), and Item's private exact-marker formatting scope for numbered
 *   rows. Number markers stay on one line in the List's shared column,
 *   keeping every sibling's text and nested list on the same start line;
 *   they end on one line too, right-aligned with tabular figures, and hang
 *   into the row's inline inset before they widen that column. Markdown's
 *   outside counters keep the themed column and may paint beyond it, matching
 *   RichText's native outside markers without a finite width threshold.
 * @output Exports ListItem component, ListItemProps type
 * @position Core implementation; consumed by List, index.ts, tested by List.test.tsx
 *
 * Composes Item for the shared start content + label + description + end content layout
 * and the invisible button/anchor interactive pattern.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/List/List.doc.mjs
 * - /packages/core/src/List/List.test.tsx
 * - /packages/core/src/List/index.ts
 * - /apps/storybook/stories/List.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/List/ (showcase blocks)
 */

import {use, useMemo, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  typeScaleVars,
  borderVars,
} from '../theme/tokens.stylex';
import type {BaseProps} from '../BaseProps';
import {ListContext, type ListMarker} from './ListContext';
import {CheckboxInput} from '../CheckboxInput/CheckboxInput';
import {mergeProps} from '../utils/mergeProps';
import {Item} from '../Item/Item';
import {ItemMarkerColumnsContext} from '../Item/ItemMarkerColumnsContext';
import type {ItemAlign, ItemSwipeActions, ItemSwipeBehavior} from '../Item';
import {themeProps} from '../utils/themeProps';

// =============================================================================
// Types
// =============================================================================

export interface ListItemProps extends BaseProps<HTMLLIElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLLIElement>;
  /**
   * Vertical alignment of the start and end content against the label,
   * forwarded to Item. Use `first-line` to keep the start and end content level with the
   * first line of a wrapped label.
   * @default 'center'
   */
  align?: ItemAlign;
  /**
   * Primary text label for the item.
   *
   * Accepts a plain string (single-line truncation applied automatically)
   * or a ReactNode for rich content (no truncation constraints —
   * child components control their own text behavior).
   */
  label: ReactNode;

  /**
   * Secondary description below the label.
   *
   * Accepts a plain string (single-line truncation applied automatically)
   * or a ReactNode for rich/multi-line content (no wrapping constraints
   * applied — child components control their own text behavior).
   */
  description?: ReactNode;

  /**
   * Content rendered before the item (icon, avatar, checkbox).
   * Uses start/end naming for RTL support.
   */
  startContent?: ReactNode;

  /**
   * Content rendered after the item (badge, action button, chevron).
   */
  endContent?: ReactNode;

  /**
   * Click handler for interactive items.
   * Automatically enables hover/press styles when provided.
   */
  onClick?: (e: React.MouseEvent) => void;

  /**
   * Ref to a nested control inside the item (e.g. a checkbox in
   * `startContent`) that already provides the item's keyboard access and
   * action. When set, the item becomes an enlarged click/tap target that
   * delegates surface clicks to that control via the `useClickableContainer`
   * pattern: it renders no invisible button/anchor, so the row adds no second
   * tab stop (WCAG 4.1.2 — one focusable control per option). Mutually
   * exclusive with `onClick`/`href` — when set those are ignored.
   */
  interactiveRef?: React.RefObject<HTMLElement | null>;

  /**
   * URL for link items. Renders an invisible anchor element.
   * Automatically enables hover/press styles when provided.
   */
  href?: string;

  /**
   * Link target (e.g., '_blank'). Only used with href.
   */
  target?: string;

  /**
   * Link relationship. Automatically includes noopener noreferrer when
   * target is "_blank".
   */
  rel?: string;

  /**
   * Whether the item is disabled.
   * @default false
   */
  isDisabled?: boolean;

  /**
   * Whether the item is currently selected.
   * @default false
   */
  isSelected?: boolean;

  /**
   * Swipe actions for touch, passed through to `Item` unchanged: the verbs a
   * sideways drag uncovers on each side. See `Item.swipeActions`; `List`
   * clips the rows in the inline axis for them.
   */
  swipeActions?: ItemSwipeActions;

  /**
   * What a swipe does, passed through to `Item` unchanged. See
   * `Item.swipeBehavior`.
   * @default 'reveal'
   */
  swipeBehavior?: ItemSwipeBehavior;
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  numberColumns: {
    display: {
      default: 'flex',
      '@supports (grid-template-columns: subgrid)': 'grid',
    },
    gridTemplateColumns: 'subgrid',
    gridColumn: '1 / -1',
  },
  withCounter: {
    counterIncrement: 'astryx-list',
  },
  // List's edge treatments. Each reads --_item-inset-inline, the variable
  // Item derives its paddingInline from, on the row itself (custom properties
  // only cascade downward, so the <ul> cannot read it); density and theme
  // paddingInline overrides on `item` move it. Each edge resolves against ITS
  // OWN container padding var, so asymmetric padding never over-reaches an
  // edge, and logical properties keep RTL correct.
  //
  // 'flush': no inset, so content meets the row's edges.
  edgeFlush: {
    '--_item-inset-inline': '0px',
  },
  // 'outset': the list reaches the container's padding edge (List.tsx); the
  // row steps back in by whatever padding its inset does not fill, so the row
  // reaches min(inset, container padding) past the content line and its text
  // lands on that line when the padding is at least the inset.
  edgeOutset: {
    marginInlineStart:
      'max(var(--container-padding-inline-start, 0px) - var(--_item-inset-inline), 0px)',
    marginInlineEnd:
      'max(var(--container-padding-inline-end, 0px) - var(--_item-inset-inline), 0px)',
  },
  // 'bleed': the row fills the list, which reaches the container's padding
  // edge (List.tsx); its text sits on the container's padding line, never
  // closer to the row's edge than its own inset. Square corners: the row
  // meets the container's straight sides.
  edgeBleed: {
    paddingInlineStart:
      'max(var(--container-padding-inline-start, 0px), var(--_item-inset-inline))',
    paddingInlineEnd:
      'max(var(--container-padding-inline-end, 0px), var(--_item-inset-inline))',
    borderRadius: 0,
  },
  withDivider: {
    borderBlockEndWidth: borderVars['--border-width'],
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: colorVars['--color-border'],
    // A longhand, not the `borderBlockEnd` shorthand: StyleX's default
    // property-specificity mode drops border shorthands silently, so the
    // shorthand never reached the shipped CSS and the last item kept its
    // divider.
    ':last-child': {
      borderBlockEndWidth: 0,
    },
  },
});

// =============================================================================
// Marker styles — custom-rendered markers instead of native list-style-type.
// Uses CSS counters for numbers (same pattern as WWW Astryx).
// =============================================================================

const MARKER_DOT_SIZE = 6;

/**
 * How far a counter wider than its marker reaches toward the row's edge: the
 * row's whole inline inset, the way a native outside marker hangs into its
 * list's padding. Up to that width the item's text keeps its usual start; a
 * wider counter widens the List's shared column instead. It is never
 * clipped: the inset is inside the row, and the row inside the List's inline
 * clip. Markdown's outside counters use a separate rule (`gutterHang`).
 */
const COUNTER_HANG = 'calc(-1 * var(--_item-inset-inline))';

const markerStyles = stylex.create({
  container: {
    alignSelf: 'baseline',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: spacingVars['--spacing-4'],
    marginTop: `calc((1em * ${typeScaleVars['--text-body-leading']} - ${MARKER_DOT_SIZE}px) / 2)`,
  },
  dot: {
    width: MARKER_DOT_SIZE,
    height: MARKER_DOT_SIZE,
    borderRadius: '50%',
    backgroundColor: colorVars['--color-text-primary'],
  },
  circle: {
    width: MARKER_DOT_SIZE,
    height: MARKER_DOT_SIZE,
    borderRadius: '50%',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colorVars['--color-text-primary'],
    backgroundColor: 'transparent',
  },
  square: {
    width: MARKER_DOT_SIZE,
    height: MARKER_DOT_SIZE,
    backgroundColor: colorVars['--color-text-primary'],
  },
  number: {
    alignSelf: 'baseline',
    // The counter ends where the marker ends, so every period in a list lines
    // up, as a native outside marker's does. Tabular figures give each digit
    // the same width down the list.
    display: 'flex',
    justifyContent: 'flex-end',
    flexShrink: 0,
    color: colorVars['--color-text-primary'],
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
    fontVariantNumeric: 'tabular-nums',
    // Short counters retain their inset. A longer counter first reaches into
    // the row's inline inset (COUNTER_HANG) and only then sizes the List's
    // shared grid column, so no single number moves its item's text.
    minWidth: spacingVars['--spacing-4'],
    width: 'auto',
    whiteSpace: 'nowrap',
  },
  // A number outside a counter style's range (zero or below, or past 3999
  // in roman) is written in decimal, as CSS counter styles fall back.
  decimal: {
    '::before': {
      content: 'counter(astryx-list) "."',
      marginInlineStart: COUNTER_HANG,
    },
  },
  lowerAlpha: {
    '::before': {
      content: 'counter(astryx-list, lower-alpha) "."',
      marginInlineStart: COUNTER_HANG,
    },
  },
  lowerRoman: {
    '::before': {
      content: 'counter(astryx-list, lower-roman) "."',
      marginInlineStart: COUNTER_HANG,
    },
  },
  // Markdown's non-swipe lists allow outside marker paint. Keep their marker
  // column at the ordinary themed width, as RichText's native outside markers
  // do (spec:AST-061 FR11). The counter itself stays intrinsic and unbroken;
  // flex-end aligns its end even when it overflows toward inline-start. A
  // larger finite negative margin would only move the parity failure threshold.
  gutterHang: {
    width: spacingVars['--spacing-4'],
    '::before': {
      marginInlineStart: 0,
      flexShrink: 0,
    },
  },
});

/** The width and height of CheckboxInput's small control. */
const TASK_CHECKBOX_SIZE = 20;

const taskMarkerStyles = stylex.create({
  // A task item's checkbox stands where the marker would, centered on the
  // item's first line, as a task list's checkboxes are.
  container: {
    alignSelf: 'flex-start',
    display: 'flex',
    flexShrink: 0,
    marginTop: `calc((1em * ${typeScaleVars['--text-body-leading']} - ${TASK_CHECKBOX_SIZE}px) / 2)`,
  },
});

/** The number styles, by marker. */
const NUMBER_STYLES = {
  decimal: markerStyles.decimal,
  'lower-alpha': markerStyles.lowerAlpha,
  'lower-roman': markerStyles.lowerRoman,
} as const;

const embeddedStyles = stylex.create({
  noRadius: {
    borderRadius: 0,
  },
});

// =============================================================================
// Component
// =============================================================================

/**
 * A list item component for use within List.
 *
 * Renders structured content with label, description, start/end content areas.
 * When `onClick` is provided, uses the invisible button pattern for accessibility.
 * When `href` is provided, uses an invisible anchor pattern.
 *
 * @example
 * ```
 * <ListItem label="Settings" description="Manage your preferences" />
 * <ListItem label="Profile" onClick={() => navigate('/profile')} />
 * <ListItem label="Docs" href="/docs" target="_blank" rel="noreferrer" />
 * ```
 */
export function ListItem({
  label,
  description,
  startContent,
  endContent,
  onClick,
  interactiveRef,
  href,
  target,
  rel,
  isDisabled = false,
  isSelected = false,
  align,
  xstyle,
  className,
  style,
  ref,
  ...restProps
}: ListItemProps) {
  const ctx = use(ListContext);
  const density = ctx?.density ?? 'balanced';
  const hasDividers = ctx?.hasDividers ?? false;
  const edge = ctx?.edge ?? 'padded';
  const listStyle = ctx?.listStyle ?? 'none';
  const hasMarkers = listStyle !== 'none';
  // ListMarkerScope may name another marker for this item.
  const markerKind: ListMarker | null =
    listStyle === 'none' ? null : (ctx?.marker ?? listStyle);

  // A task item in a list with markers shows its checkbox instead.
  const task = markerKind == null ? undefined : ctx?.task;

  const hasMarkerGutter = ctx?.hasMarkerGutter === true;
  const marker = useMemo(
    () =>
      task != null ? (
        <span {...stylex.props(taskMarkerStyles.container)}>
          <CheckboxInput
            size="sm"
            value={task.isChecked}
            label={task.label}
            isLabelHidden
            isReadOnly
          />
        </span>
      ) : markerKind === 'disc' ||
        markerKind === 'circle' ||
        markerKind === 'square' ? (
        <span {...stylex.props(markerStyles.container)}>
          <span
            {...stylex.props(
              markerKind === 'disc'
                ? markerStyles.dot
                : markerKind === 'circle'
                  ? markerStyles.circle
                  : markerStyles.square,
            )}
          />
        </span>
      ) : markerKind != null ? (
        <span
          {...stylex.props(
            markerStyles.number,
            NUMBER_STYLES[markerKind],
            hasMarkerGutter && markerStyles.gutterHang,
          )}
        />
      ) : null,
    [task, markerKind, hasMarkerGutter],
  );

  const item = (
    <Item
      as="li"
      ref={ref}
      marker={marker}
      startContent={startContent}
      label={label}
      description={description}
      endContent={endContent}
      onClick={onClick}
      interactiveRef={interactiveRef}
      href={href}
      target={target as '_blank' | '_self'}
      rel={rel}
      isDisabled={isDisabled}
      isSelected={isSelected}
      align={align}
      density={density}
      xstyle={
        [
          listStyle === 'decimal' && styles.numberColumns,
          hasMarkers && styles.withCounter,
          hasDividers && styles.withDivider,
          hasDividers && embeddedStyles.noRadius,
          edge === 'flush' && styles.edgeFlush,
          edge === 'outset' && styles.edgeOutset,
          edge === 'bleed' && styles.edgeBleed,
          xstyle,
        ] as StyleXStyles
      }
      {...mergeProps(themeProps('list-item'), {className, style})}
      {...restProps}
    />
  );
  // Only numbered rows contribute two cells to List's shared counter grid.
  // Passing the marker identity keeps this request off unrelated Items in slots.
  return listStyle === 'decimal' ? (
    <ItemMarkerColumnsContext value={marker}>{item}</ItemMarkerColumnsContext>
  ) : (
    item
  );
}

ListItem.displayName = 'ListItem';
