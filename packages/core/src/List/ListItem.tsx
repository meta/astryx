// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ListItem.tsx
 * @input Uses React, ReactNode, StyleXStyles, theme tokens, the List row edge
 *   treatment, CheckboxInput, and the marker or task checkbox a
 *   ListMarkerScope sets (Markdown's nested lists and the task items of mixed
 *   lists)
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

import {use, type ReactNode} from 'react';
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
import {CheckboxInput} from '../CheckboxInput';
import {mergeProps} from '../utils';
import {Item} from '../Item';
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
    flexShrink: 0,
    color: colorVars['--color-text-primary'],
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
    width: spacingVars['--spacing-4'],
  },
  // A number outside a counter style's range (zero or below, or past 3999
  // in roman) is written in decimal, as CSS counter styles fall back.
  decimal: {
    '::before': {
      content: 'counter(astryx-list) "."',
    },
  },
  lowerAlpha: {
    '::before': {
      content: 'counter(astryx-list, lower-alpha) "."',
    },
  },
  lowerRoman: {
    '::before': {
      content: 'counter(astryx-list, lower-roman) "."',
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

  const marker =
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
      <span {...stylex.props(markerStyles.number, NUMBER_STYLES[markerKind])} />
    ) : null;

  return (
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
}

ListItem.displayName = 'ListItem';
