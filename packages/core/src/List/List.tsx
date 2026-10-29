// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file List.tsx
 * @input Uses React, ReactNode, StyleXStyles, theme tokens, useDevWarning,
 *   and ListContext with the row edge treatment
 * @output Exports List component, ListProps, ListDensity, ListEdge, ListStyle
 *   types
 * @position Core implementation; consumed by index.ts, tested by List.test.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/List/List.doc.mjs
 * - /packages/core/src/List/List.test.tsx
 * - /packages/core/src/List/index.ts
 * - /apps/storybook/stories/List.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/List/ (showcase blocks)
 */

import {useId, useMemo, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {spacingVars} from '../theme/tokens.stylex';
import type {BaseProps} from '../BaseProps';
import {
  ListContext,
  type ListDensity,
  type ListEdge,
  type ListMarkerStyle,
} from './ListContext';
import {mergeProps} from '../utils';
import {themeProps} from '../utils/themeProps';
import {useDevWarning} from '../hooks/useDevWarning';

export {
  type ListDensity,
  type ListEdge,
  type ListMarkerStyle as ListStyle,
} from './ListContext';

export interface ListProps extends BaseProps<
  HTMLUListElement | HTMLOListElement
> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLUListElement | HTMLOListElement>;
  /**
   * List items. Should be ListItem components.
   */
  children: ReactNode;

  /**
   * Spacing density for list items.
   * - 'compact': Tighter spacing for dense UIs
   * - 'balanced': Standard spacing
   * - 'spacious': Extra spacing for readability
   * @default 'balanced'
   */
  density?: ListDensity;

  /**
   * Whether to show dividers between list items.
   * @default false
   */
  hasDividers?: boolean;

  /**
   * Where each row's text, dividers, and hover and selection backgrounds sit,
   * relative to the list's edges and the container around it.
   * - 'padded': text sits inside each row's padding, so it starts a little in
   *   from a heading above the list and backgrounds have room around it
   * - 'flush': rows drop their side padding, so text starts on the heading's
   *   line and dividers and backgrounds stop at the row's content, with no
   *   room beyond it on either side. Works anywhere. Suits static rows
   * - 'outset': text sits on the heading's line, and dividers and backgrounds
   *   reach a little past it into the container's padding. Suits interactive
   *   rows in a container
   * - 'bleed': text sits on the heading's line, and dividers and backgrounds
   *   reach the container's edges with square corners, like Table rows in a
   *   Card
   *
   * A row's first content is what lines up with the heading: its marker,
   * icon, or avatar when it has one, otherwise its label. 'outset' and
   * 'bleed' reach into the padding of the nearest container that shares its
   * padding: a Card, Section, Dialog, or BottomSheet, or a transparent
   * container such as a Layout region with explicit padding or a padded
   * ScrollableArea. Place the List directly in that container's padding:
   * padding that Stack, Center, or your own styles add in between is not
   * counted. Drawers and the automatic padding of LayoutContent and
   * LayoutPanel aren't supported yet. With no such container, including in a Popover, they look
   * like 'padded'. In a container with less padding than the rows' own, text
   * starts a little after the heading's line. A theme's inline padding on `item` replaces the row
   * padding of every value, including the zero padding of 'flush'.
   * @default 'padded'
   */
  edge?: ListEdge;

  /**
   * @deprecated Use `edge="outset"`, which this sets. Still works; `edge`
   * wins when both are set. `astryx upgrade` rewrites existing usage.
   */
  edgeCompensation?: 'inline';

  /**
   * Header content rendered above the list.
   * Semantically associated via aria-labelledby.
   */
  header?: ReactNode;

  /**
   * List marker style.
   * When 'decimal', renders an `<ol>`. Otherwise renders a `<ul>`.
   * @default 'none'
   */
  listStyle?: ListMarkerStyle;

  /**
   * Starting number for ordered lists (listStyle='decimal').
   * Sets the CSS counter to begin at this value.
   * @default 1
   */
  start?: number;

  /**
   * Test ID for testing frameworks.
   */
  'data-testid'?: string;
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
  },
  list: {
    margin: 0,
    paddingInlineStart: 0,
    listStyleType: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-0-5'],
    // A row dragged aside for its swipe actions (Item.swipeActions) paints
    // past the list's inline edge unless the list clips. `clip`, never
    // `hidden`: hidden makes a scroll container, which fights the list's
    // vertical scroller. (StyleX emits the physical longhand of this axis.)
    overflowInline: 'clip',
  },
  // 'outset' and 'bleed' rows reach into the container's padding. The list
  // reaches the container's padding edge on each inline edge first, so its
  // inline clip (above) moves out with the rows instead of cutting them; each
  // row then places itself inside it. Container padding vars are inherited,
  // so the list can read them, while the rows' own inset is scoped to the
  // rows. Missing or reset container padding resolves to zero.
  reachesContainerPadding: {
    marginInlineStart: 'calc(-1 * var(--container-padding-inline-start, 0px))',
    marginInlineEnd: 'calc(-1 * var(--container-padding-inline-end, 0px))',
    width:
      'calc(100% + var(--container-padding-inline-start, 0px) + var(--container-padding-inline-end, 0px))',
  },
  withDividers: {
    gap: 0,
  },
  withCounter: {
    counterReset: 'astryx-list',
  },
  header: {
    marginBottom: spacingVars['--spacing-2'],
  },
});

const dynamicStyles = stylex.create({
  counterStart: (value: number) => ({
    counterReset: `astryx-list ${value}`,
  }),
});

// =============================================================================
// Component
// =============================================================================

/**
 * A vertical list component for rendering collections of items.
 *
 * Renders semantic `<ul>` or `<ol>` elements with configurable density,
 * dividers, marker styles, and an optional header.
 *
 * Set `edge` to choose where row text, dividers, and backgrounds sit: inside
 * each row's padding (`padded`, the default), at the list's edges (`flush`),
 * on a heading's line with backgrounds reaching into the container's padding
 * (`outset`), or reaching the container's edges like Table rows (`bleed`).
 *
 * @example
 * ```
 * <List>
 *   <ListItem label="Notifications" description="Manage your alerts" />
 *   <ListItem label="Privacy" description="Control your data" />
 * </List>
 * <List listStyle="decimal" density="compact">
 *   <ListItem label="First step" />
 *   <ListItem label="Second step" />
 * </List>
 * <List edge="flush" hasDividers>
 *   <ListItem label="Solstice Mug" description="Ceramic, 12 oz" />
 * </List>
 * ```
 */
export function List({
  children,
  density = 'balanced',
  hasDividers = false,
  edge: edgeProp,
  edgeCompensation,
  header,
  listStyle = 'none',
  start,
  xstyle,
  className,
  style,
  'data-testid': testId,
  ref,
  ...props
}: ListProps) {
  const headerId = useId();
  const isOrdered = listStyle === 'decimal';
  const Tag = isOrdered ? 'ol' : 'ul';
  // Plain use of the deprecated prop is reported by its @deprecated type;
  // development warns only when the two names conflict (spec:AST-017 FR29).
  useDevWarning(
    'List',
    '`edge` and the deprecated `edgeCompensation` are both set; `edge` wins. ' +
      'Remove `edgeCompensation`. `astryx upgrade` rewrites existing usage.',
    edgeProp != null && edgeCompensation != null,
  );
  const edge: ListEdge =
    edgeProp ?? (edgeCompensation === 'inline' ? 'outset' : 'padded');
  const reachesContainerPadding = edge === 'outset' || edge === 'bleed';

  const contextValue = useMemo(
    () => ({density, hasDividers, edge, listStyle}),
    [density, hasDividers, edge, listStyle],
  );

  const listElement = (
    <Tag
      ref={ref as React.Ref<HTMLUListElement & HTMLOListElement>}
      // Consumer props first: everything the component sets for itself below
      // is part of its contract and wins on conflict.
      {...props}
      data-testid={testId}
      // Only when this component renders the header — writing `undefined`
      // unconditionally would erase a label a consumer pointed at their own
      // heading.
      {...(header != null ? {'aria-labelledby': headerId} : null)}
      {...(isOrdered && start != null && start !== 1 ? {start} : {})}
      // The base list style always sets list-style-type: none (markers are
      // custom-rendered by ListItem), and Safari/VoiceOver drops implicit
      // list semantics for lists styled with list-style: none. The explicit
      // role restores "list, N items" announcements for every listStyle
      // variant.
      role="list"
      {...mergeProps(
        themeProps('list', {density, listStyle}),
        stylex.props(
          styles.list,
          hasDividers && styles.withDividers,
          reachesContainerPadding && styles.reachesContainerPadding,
          listStyle !== 'none' &&
            (start != null && start !== 1
              ? dynamicStyles.counterStart(start - 1)
              : styles.withCounter),
          xstyle,
        ),
        className,
        style,
      )}>
      {children}
    </Tag>
  );

  if (header == null) {
    return <ListContext value={contextValue}>{listElement}</ListContext>;
  }

  return (
    <ListContext value={contextValue}>
      <div {...stylex.props(styles.root)}>
        <div id={headerId} {...stylex.props(styles.header)}>
          {header}
        </div>
        {listElement}
      </div>
    </ListContext>
  );
}

List.displayName = 'List';
