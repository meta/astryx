// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file List.tsx
 * @input Uses React, ReactNode, StyleXStyles, theme tokens, useDevWarning,
 *   and ListContext with the row edge treatment. Numbered rows share one
 *   intrinsic marker column, including when a counter changes digit count.
 * @output Exports List component, ListProps, ListDensity, ListEdge, ListStyle
 *   types
 * @position Core implementation. Consumed by index.ts, tested by List.test.tsx
 *
 * `animatedLayout` runs the layout updates (List/listLayoutUpdates.ts).
 * `reorderable` runs the reorder session after them. List imports only the
 * reorderable object's type and List/listReorderContext.ts, which holds the
 * object's key and the session hooks. It hands the reorder to its rows
 * through ListContext. The session, its handle
 * and its listeners come with the object (reorderable/createReorderable.ts).
 * So a List without it loads no reorder code.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/List/List.doc.mjs
 * - /packages/core/src/List/List.test.tsx
 * - /packages/core/src/List/index.ts
 * - /apps/storybook/stories/List.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/List/ (showcase blocks)
 */

import {useCallback, useId, useMemo, useRef, type ReactNode} from 'react';
import type {Reorderable} from '../reorderable/createReorderable';
import * as stylex from '@stylexjs/stylex';
import {spacingVars} from '../theme/tokens.stylex';
import type {BaseProps} from '../BaseProps';
import {
  ListContext,
  type ListDensity,
  type ListEdge,
  type ListMarkerStyle,
} from './ListContext';
import {mergeProps} from '../utils/mergeProps';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {useListLayoutUpdates} from './listLayoutUpdates';
import {LayoutChangeSnapshot} from '../motion/LayoutChangeSnapshot';
import type {AnimatedLayout} from '../motion/animatedLayout';
import {themeProps} from '../utils/themeProps';
import {useDevWarning} from '../hooks/useDevWarning';
import {
  useReorderCommit,
  useReorderSession,
  type ListReorderOptions,
} from './listReorderContext';

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
   * The handle from `useAnimatedLayout({containerRef})`. With it, the list
   * animates its row changes on one shared motion, under every pointer. An
   * inserted row enters, and a removed row collapses in place. A row that
   * crosses rows moving the other way rides above them. The rows after a
   * change, and the content after the list up to that container, glide to
   * their new places. A row's identity is its `itemKey`, so a row without one
   * changes at once. Without a handle the list changes at once.
   */
  animatedLayout?: AnimatedLayout;

  /**
   * Makes the rows reorderable, with the object `createReorderable` makes.
   * Each ListItem with an `itemKey` gets a reorder handle at its end. One the
   * object's `isReorderable` rejects keeps its place. Each committed move
   * calls its `onReorder` once with the row's key and its index after the
   * move. Apply it by rendering the rows in their new order. A drop on the
   * starting place, a cancel, or a move the order does not take changes
   * nothing.
   *
   * On a touch screen, a finger held still on a handle for a moment picks up
   * its row. A flick on it still scrolls. The row stays in its place, dimmed,
   * while a copy of it follows the finger. An accent line marks where it
   * would land. The other rows stay still, the list scrolls near the edges,
   * and on release the rows rearrange. A mouse drags a handle at once, the
   * same way.
   *
   * Without a drag, activating a handle (a click, Space or Enter) turns on
   * reorder mode for its row. Each arrow key moves it a place at once,
   * reported and announced with its place and neighbours. Escape or another
   * activation ends the mode, keeping the moves.
   * While it is on, a hint anchored to the handle shows the moves and Done as
   * buttons, so taps alone can reorder.
   */
  reorderable?: Reorderable;

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
   *   reach the container's edges, like Table rows in a Card. Rows are
   *   square, except that the first or last row of a list that is a rounded
   *   Card's or Dialog's first or last child takes its corner
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
    // Under a finger, the isolation boundary for what rises inside the list.
    // A row's touch band and a swipeable row order above the rows after them.
    // They stay below a page-level sticky header at the same z-index. With a
    // mouse nothing rises, so the list keeps its stacking.
    isolation: {default: null, '@media (pointer: coarse)': 'isolate'},
  },
  // A list under an `animatedLayout` handle isolates for every pointer. A row
  // that slides across others rides above them with a mouse too, and it must
  // stay below a page-level sticky header.
  animatedIsolation: {
    isolation: 'isolate',
  },
  // Subgridded numbered rows contribute their marker's intrinsic width to
  // one column, so text and nested lists never move with an individual number.
  numberColumns: {
    display: {
      default: 'flex',
      '@supports (grid-template-columns: subgrid)': 'grid',
    },
    gridTemplateColumns: 'max-content minmax(0, 1fr)',
    columnGap: spacingVars['--spacing-2'],
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
  // 'bleed' rows reach the container's padding edge inline, and keep its block
  // padding. The list passes its first and last rows the corner a rounded
  // container publishes, less that block padding. It is at a corner only as
  // the container's first or last child.
  bleedCorners: {
    '--_list-corner-start-start': {
      default: '0px',
      ':first-child':
        'max(0px, var(--container-corner-start-start, 0px) - var(--container-padding-block-start, 0px))',
    },
    '--_list-corner-start-end': {
      default: '0px',
      ':first-child':
        'max(0px, var(--container-corner-start-end, 0px) - var(--container-padding-block-start, 0px))',
    },
    '--_list-corner-end-start': {
      default: '0px',
      ':last-child':
        'max(0px, var(--container-corner-end-start, 0px) - var(--container-padding-block-end, 0px))',
    },
    '--_list-corner-end-end': {
      default: '0px',
      ':last-child':
        'max(0px, var(--container-corner-end-end, 0px) - var(--container-padding-block-end, 0px))',
    },
  },
  // With a header, the list's root is the container's child, and the header
  // sits above the first row.
  bleedCornersBelowHeader: {
    '--_list-corner-start-start': '0px',
    '--_list-corner-start-end': '0px',
    '--_list-corner-end-start': {
      default: '0px',
      ':last-child':
        'max(0px, var(--container-corner-end-start, 0px) - var(--container-padding-block-end, 0px))',
    },
    '--_list-corner-end-end': {
      default: '0px',
      ':last-child':
        'max(0px, var(--container-corner-end-end, 0px) - var(--container-padding-block-end, 0px))',
    },
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
  animatedLayout,
  reorderable,
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
  const listRef = useRef<HTMLUListElement & HTMLOListElement>(null);
  // The reorder's machinery comes with the object. The handles'
  // instructions take the header's id with a suffix.
  const {session: reorderSession, options: reorderOptions} = useReorderSession(
    reorderable,
    () => listRef.current,
    `${headerId}h`,
  );
  const measureRows = useListLayoutUpdates(listRef, animatedLayout);
  // A drag's or a reorder-mode move's commits are the reorder's to move, so
  // the layout updates measure nothing for them.
  const measureUnlessReordering = useCallback(() => {
    if (reorderSession?.ownsCommit() !== true) {
      measureRows();
    }
  }, [measureRows, reorderSession]);
  // After the layout updates, so a drop's commit is the reorder's.
  useReorderCommit(reorderSession);
  const mergedRef = useMergedRefs(
    listRef,
    ref as React.Ref<HTMLUListElement & HTMLOListElement>,
  );
  const isOrdered = listStyle === 'decimal';
  const Tag = isOrdered ? 'ol' : 'ul';
  // Plain use of the deprecated prop is reported by its @deprecated type;
  // development warns only when the two names conflict.
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
    () => ({
      density,
      hasDividers,
      edge,
      listStyle,
      animatedLayout,
      // With a session there is an object, so its options too.
      reorder: reorderSession && {
        session: reorderSession,
        options: reorderOptions as ListReorderOptions,
      },
    }),
    [
      density,
      hasDividers,
      edge,
      listStyle,
      animatedLayout,
      reorderSession,
      reorderOptions,
    ],
  );

  const listElement = (
    <Tag
      ref={mergedRef}
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
      // A bleeding list reads the corner its container publishes. With a
      // header, the root below is the container's child and reads it.
      {...(edge === 'bleed' && header == null
        ? {'data-container-corner': ''}
        : null)}
      {...mergeProps(
        themeProps('list', {density, listStyle}),
        stylex.props(
          styles.list,
          animatedLayout != null && styles.animatedIsolation,
          isOrdered && styles.numberColumns,
          hasDividers && styles.withDividers,
          reachesContainerPadding && styles.reachesContainerPadding,
          edge === 'bleed' && header == null && styles.bleedCorners,
          listStyle !== 'none' &&
            (start != null && start !== 1
              ? dynamicStyles.counterStart(start - 1)
              : styles.withCounter),
          reorderSession?.listStyle,
          xstyle,
        ),
        className,
        style,
      )}>
      {children}
    </Tag>
  );

  // Every change of the rows is measured before it lands. LayoutChangeSnapshot
  // calls this in the commit, before the DOM changes.
  const snapshot =
    animatedLayout != null ? (
      <LayoutChangeSnapshot
        value={children}
        onBeforeChange={measureUnlessReordering}
      />
    ) : null;

  // The session's options and listeners, and the handles' instructions.
  const {reorder: reorderValue} = contextValue;
  const reorderHost = reorderValue && (
    <reorderValue.session.Host reorder={reorderValue} />
  );

  if (header == null) {
    return (
      <ListContext value={contextValue}>
        {snapshot}
        {listElement}
        {reorderHost}
      </ListContext>
    );
  }

  return (
    <ListContext value={contextValue}>
      {snapshot}
      <div
        {...(edge === 'bleed' ? {'data-container-corner': ''} : null)}
        {...stylex.props(
          styles.root,
          edge === 'bleed' && styles.bleedCornersBelowHeader,
        )}>
        <div id={headerId} {...stylex.props(styles.header)}>
          {header}
        </div>
        {listElement}
        {reorderHost}
      </div>
    </ListContext>
  );
}

List.displayName = 'List';
