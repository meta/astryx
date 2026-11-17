// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file listReorderContext.ts
 * @input React's hooks and a registered key (utils/sharedRealm.ts)
 * @output `REORDER_ENGINE`, the key a reorderable object carries its
 *   machinery under. Also the internal types between List, ListItem and that
 *   machinery: what a List hands its rows through ListContext's `reorder`.
 *   `useReorderSession` and `useReorderCommit` run the object's session for a
 *   List and for List/ListReorderScope.tsx
 * @position Internal to List. List imports only this module and the
 *   reorderable object's type, and ListItem only types. So a List without
 *   `reorderable` loads no reorder code. The machinery
 *   (List/listReorderEngine.tsx) ships with createReorderable, which puts it
 *   on the object.
 *
 * SYNC: When modified, update List/List.tsx, List/ListItem.tsx,
 * List/ListContext.tsx, List/listReorderEngine.tsx and
 * reorderable/createReorderable.ts.
 */

import type {ItemAlign} from '../Item/Item';
import {
  useMemo,
  type ComponentType,
  type Key,
  type ReactNode,
  type RefObject,
} from 'react';
import {useCommittedRef} from '../hooks/useCommittedRef';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {sharedKey} from '../utils/sharedRealm';
import type {
  Reorderable,
  ReorderHandleOptions,
} from '../reorderable/createReorderable';
import type {StyleXStyles} from '@stylexjs/stylex';
import type {reorderListStyle} from './ListReorderHandle';

/**
 * The key a reorderable object carries its machinery under. `sharedKey`
 * registers it, so a swizzled List reads a package object, and the package
 * List reads an object a copy adapted.
 */
export const REORDER_ENGINE = sharedKey('list/reorder-engine', 1);

/** What a List's reorder reports and asks, as createReorderable took them. */
export interface ListReorderOptions {
  /** Called once per committed move: the item's key and its index after it. */
  readonly onReorder: (move: {key: Key; to: number}) => void;
  /** Whether the item with `key` moves; every item does without it. */
  readonly isReorderable?: (key: Key) => boolean;
  /** Where each row's handle sits and when it shows. */
  readonly handle?: ReorderHandleOptions;
  /**
   * An adapted object's (internal/reorder `adaptReorderable`): the owner's
   * options, which the owner's `start` finds this list by, while the moves go
   * through these.
   */
  readonly startedBy?: ListReorderOptions;
}

/** The handle a reorderable row ends with (List/ListReorderHandle.tsx). */
export interface ListReorderHandleProps {
  /** The row's label: its text names the handle. */
  readonly label: ReactNode;
  /** The row's item key (ListItem `itemKey`), which its moves report. */
  readonly itemKey: Key;
  /**
   * The row's own accessible name, when its caller gave one (ListItem
   * `aria-label`): the handle is "Reorder" followed by it.
   */
  readonly rowLabel?: string;
  /**
   * The elements that name the row, when its caller gave them (ListItem
   * `aria-labelledby`): the handle is "Reorder" followed by them.
   */
  readonly rowLabelledBy?: string;
  /**
   * The row is disabled: the handle stays focusable with
   * `aria-disabled="true"`, and no gesture or key moves the row.
   */
  readonly isDisabled?: boolean;
  /**
   * The row's alignment (ListItem `align`) when the handle is the row's own
   * child, outside an end slot that would align it. Absent inside the end
   * slot.
   */
  readonly rowAlign?: ItemAlign;
  /**
   * The row's edge the handle sits at.
   * @default 'end'
   */
  readonly placement?: 'start' | 'end';
  /**
   * The handle shows for every pointer, in a place of its own. Otherwise it
   * shows while its row is hovered or holds the focus where the primary
   * pointer is fine, and hangs outside the row's content.
   * @default true
   */
  readonly isAlwaysVisible?: boolean;
  /**
   * The handle keeps its place in its row where it shows only on hover or
   * focus: after a list marker, or in a row that reaches its container's
   * padding edge.
   */
  readonly isInRow?: boolean;
}

/** What a List knows of itself that its handles' layout depends on. */
export interface ReorderListFacts {
  readonly edge: 'padded' | 'flush' | 'outset' | 'bleed';
  readonly density: 'compact' | 'balanced' | 'spacious';
  readonly handle: ReorderHandleOptions | undefined;
  /** The list draws a marker before each row (`listStyle`). */
  readonly hasMarkers: boolean;
}

/** What a List row knows of itself that its handle's layout depends on. */
export interface ReorderRowFacts {
  readonly edge: ReorderListFacts['edge'];
  readonly handle: ReorderHandleOptions | undefined;
  readonly hasHandle: boolean;
  readonly hasMarker: boolean;
  readonly hasEndContent: boolean;
}

/** Where a row's handle sits, and the row's own style for it. */
export interface ReorderRowLayout {
  readonly placement: 'start' | 'end';
  readonly isAlwaysVisible: boolean;
  readonly isInRow: boolean;
  /** At the row's end, with end content, the handle joins the end slot. */
  readonly isInEndSlot: boolean;
  /**
   * The row's style: a row with a handle rings itself without it and reveals
   * it; a row that stays put keeps its neighbours' handle room.
   */
  readonly rowStyle: StyleXStyles;
}

/**
 * A reorderable List's row without a handle: its label names it in the
 * announcements of the moves beside it (List/ListReorderHandle.tsx).
 */
export interface ListReorderRowNameProps {
  /** The row's element. */
  readonly row: RefObject<HTMLElement | null>;
  /** The row's label. */
  readonly label: ReactNode;
}

/** The parts of a List's reorder session that its List and rows use. */
export interface ListReorderSession {
  /**
   * Runs after every List commit, after the List's layout updates. When a
   * drop's new order is applied, each row's old place is put back. Its
   * running spring then continues to the new one.
   */
  commit(): void;
  /**
   * Whether a drag or a reorder-mode move owns the list's next commit. The
   * List's layout updates measure nothing for such a commit.
   */
  ownsCommit(): boolean;
  /**
   * Rendered by the List beside its rows while it reorders. It keeps the
   * session's callbacks, strings and listeners current. It renders the
   * handles' instructions and disposes of the session when it goes.
   */
  readonly Host: ComponentType<{reorder: ListReorderContextValue}>;
  /** The handle each reorderable row ends with. */
  readonly Handle: ComponentType<ListReorderHandleProps>;
  /** Names a row without a handle for the announcements; renders nothing. */
  readonly RowName: ComponentType<ListReorderRowNameProps>;
  /** A row with a handle: its focus ring stays off for the handle's own. */
  readonly rowStyle: StyleXStyles;
  /** The list itself: its insertion line, a pseudo-element. */
  readonly listStyle: typeof reorderListStyle;
  /**
   * The layout of one of a List's rows. It ships with the machinery, so a
   * List without `reorderable` loads none of it.
   */
  rowLayout(row: ReorderRowFacts): ReorderRowLayout;
  /**
   * The List's own style while it reorders: its insertion line, the values
   * its rows read for their handle room, and the room hanging handles take.
   */
  listLayout(list: ReorderListFacts): StyleXStyles;
}

/** How a reorder session finds a collection's rows in its container. */
export interface ReorderRows {
  /** The rows that hold a place in the order, in order. */
  read(container: HTMLElement): HTMLElement[];
  /**
   * Whether `element` is a row of the collection. A row put back for its
   * exit is a row, but holds no place in the order.
   */
  holds(element: Element, container: HTMLElement): boolean;
}

/** The machinery a reorderable object carries. */
export interface ListReorderEngine {
  /**
   * A reorder session over the rows of the element `getList` returns.
   * `rows` finds those rows; without it, they are the element's children,
   * as in a List.
   */
  createSession(
    getList: () => HTMLElement | null,
    hintId: string,
    rows?: ReorderRows,
  ): ListReorderSession;
  /**
   * Reorder mode for the item with `key`, started from the app's own UI. It
   * runs in the collection the object with `options` is mounted on, or the
   * one mounted last if several.
   */
  start(options: ListReorderOptions, key: Key): void;
}

/** What a reorderable object holds (reorderable/createReorderable.ts). */
export interface ReorderableInternals {
  readonly options: ListReorderOptions;
  readonly [REORDER_ENGINE]: ListReorderEngine;
  /** Reorder mode for the item with `key`, from the app's own UI. */
  start(key: Key): void;
}

/** What a reorderable List hands its rows. */
export interface ListReorderContextValue {
  readonly session: ListReorderSession;
  readonly options: ListReorderOptions;
}

/** A reorder session and the options of the object that runs it. */
export interface ReorderSessionOf {
  readonly session: ListReorderSession | null;
  readonly options: ListReorderOptions | null;
}

/**
 * The reorder session over the children of the element `getList` returns,
 * run by `reorderable`'s engine. Both fields are null without an object.
 * `hintId` names the handles' instructions. The object may be made on every
 * render: the session lasts as long as its engine and reads the object's
 * latest callbacks.
 */
export function useReorderSession(
  reorderable: Reorderable | undefined,
  getList: () => HTMLElement | null,
  hintId: string,
): ReorderSessionOf {
  const reorder = reorderable as ReorderableInternals | undefined;
  const engine = reorder?.[REORDER_ENGINE];
  const getListRef = useCommittedRef(getList);
  const session = useMemo(
    () => engine?.createSession(() => getListRef.current(), hintId) ?? null,
    [engine, hintId, getListRef],
  );
  return {session, options: reorder?.options ?? null};
}

/**
 * Applies a drop's new order after each commit. A caller with layout updates
 * calls it after them, so a drop's commit is the reorder's.
 */
export function useReorderCommit(session: ListReorderSession | null): void {
  // Syncs the reorder session, which lives outside React, after each commit.
  useIsomorphicLayoutEffect(() => {
    session?.commit();
  });
}
