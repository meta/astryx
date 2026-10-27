// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file listReorderContext.ts
 * @input Nothing at run time but a symbol
 * @output `REORDER_ENGINE`, the key a reorderable object carries its
 *   machinery under, the attributes the machinery marks the DOM with, and
 *   the internal types between List, ListItem and that machinery (what a
 *   List hands its rows through ListContext's `reorder`)
 * @position Internal to List. List imports only this module and the
 *   reorderable object's type, and ListItem only types, so a List without
 *   `reorderable` loads no reorder code (spec:AST-103 FR2): the machinery
 *   (List/listReorderEngine.tsx) ships with createReorderable
 *   (reorderable/createReorderable.ts), which puts it on the object.
 *
 * SYNC: When modified, update List/List.tsx, List/ListItem.tsx,
 * List/ListContext.tsx, List/listReorderEngine.tsx and
 * reorderable/createReorderable.ts.
 */

import type {ItemAlign} from '../Item/Item';
import type {ComponentType, Key, ReactNode, RefObject} from 'react';
import type {StyleXStyles} from '@stylexjs/stylex';
import type {reorderListStyle} from './ListReorderHandle';

/**
 * The key a reorderable object carries its machinery under. No description:
 * it would ship in every List (spec:AST-103 FR2).
 */
export const REORDER_ENGINE: unique symbol = Symbol();

/** On the list root while a drag session owns its rows. */
export const REORDERING_ATTRIBUTE = 'data-astryx-reordering';
/** On each row's reorder handle. */
export const HANDLE_ATTRIBUTE = 'data-astryx-list-reorder';

/** What a List's reorder reports and asks, as createReorderable took them. */
export interface ListReorderOptions {
  /** Called once per committed move: the item's key and its index after it. */
  readonly onReorder: (move: {key: Key; to: number}) => void;
  /** Whether the item with `key` moves; every item does without it. */
  readonly isReorderable?: (key: Key) => boolean;
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
   * `aria-disabled="true"`, and no gesture or key moves the row
   * (spec:AST-085).
   */
  readonly isDisabled?: boolean;
  /**
   * The row's alignment (ListItem `align`) when the handle is the row's own
   * child, after its label: a row without end content, which has no end slot
   * to align it (spec:AST-103 FR5). Absent inside the end slot.
   */
  readonly rowAlign?: ItemAlign;
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
   * After every List commit, after the List's update motion: a drop's new
   * order is applied, so each row's old place is put back and its running
   * spring continues to the new one.
   */
  commit(): void;
  /**
   * Rendered by the List beside its rows while it reorders: keeps the
   * session's callbacks, strings and listeners current, renders the handles'
   * instructions, and disposes of the session when it goes.
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
}

/** The machinery a reorderable object carries. */
export interface ListReorderEngine {
  /** A List's reorder session over the rows of the element `getList` returns. */
  createSession(
    getList: () => HTMLElement | null,
    hintId: string,
  ): ListReorderSession;
  /**
   * Reorder mode for the item with `key`, started from the app's own UI, in
   * the collection the object with `options` is mounted on (the one mounted
   * last, if several).
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
