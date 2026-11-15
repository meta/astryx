// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ListContext.tsx
 * @input Layer-scoped React context
 * @output Exports ListContext, which shares density, dividers, the row edge
 *   treatment, marker style and a reorderable List's reorder with ListItem.
 *   Also exports ListMarkerScope, which sets the marker for the items inside
 *   it, or a task item's checkbox in its place. It also says whether their
 *   List has a marker gutter whose outside counters keep the themed inset
 * @position Internal context. Consumed by List.tsx and ListItem.tsx
 */

import {use, useMemo, type ReactNode} from 'react';
import {createLayerScopedContext} from '../Layer/layerScopedContext';
import type {AnimatedLayout} from '../hooks/useAnimatedLayout';
import type {ListReorderContextValue} from './listReorderContext';

export type ListDensity = 'compact' | 'balanced' | 'spacious';
export type ListMarkerStyle = 'none' | 'disc' | 'decimal' | 'circle';

/**
 * Where each row's content and its lines and backgrounds sit relative to the
 * list's edges and the padding of the container around the list.
 */
export type ListEdge = 'padded' | 'flush' | 'outset' | 'bleed';

/**
 * Every marker ListItem draws: the public styles, and the square, letter,
 * and roman markers Markdown's nested lists use (spec:AST-061 DEC-6).
 */
export type ListMarker =
  'disc' | 'circle' | 'square' | 'decimal' | 'lower-alpha' | 'lower-roman';

/** A task item's state, drawn as a read-only checkbox in the marker's place. */
export interface ListTaskMarker {
  readonly isChecked: boolean;
  /** The checkbox's accessible name: the item's text. */
  readonly label: string;
}

export interface ListContextValue {
  density: ListDensity;
  hasDividers: boolean;
  edge: ListEdge;
  listStyle: ListMarkerStyle;
  /**
   * The marker items draw instead of the one `listStyle` names, set by
   * ListMarkerScope; internal. Ignored when `listStyle` is `'none'`.
   */
  marker?: ListMarker;
  /**
   * A task item's state, set by ListMarkerScope; internal. The item draws a
   * read-only checkbox instead of its marker. Ignored when `listStyle` is
   * `'none'`.
   */
  task?: ListTaskMarker;
  /**
   * Whether the List has Markdown's outside-marker gutter, set by
   * ListMarkerScope; internal. Its number column keeps the ordinary themed
   * width, while whole counters may paint toward inline-start beyond it.
   * Markdown sets this on its non-swipe numbered rows and allows outside ink
   * on their List, so its text starts match RichText without a width threshold.
   */
  hasMarkerGutter?: boolean;
  /**
   * Whether a numbered item lays out outside the List's shared number
   * columns, with its counter beside its own text as a bullet row has it; set
   * by ListMarkerScope; internal. Markdown sets it on an item that reads
   * against its list, so that item's text never widens the shared counter
   * column for the other rows.
   */
  isOutsideNumberColumns?: boolean;
  /**
   * The list's `animatedLayout` handle, for its rows.
   */
  animatedLayout?: AnimatedLayout;
  /**
   * A reorderable List's reorder (`List reorderable`); internal. Its rows end
   * with the handle it carries (List/listReorderContext.ts).
   */
  reorder?: ListReorderContextValue | null;
}

export const ListContext = createLayerScopedContext<ListContextValue | null>(
  'ListContext',
  1,
  null,
);
ListContext.displayName = 'ListContext';

/**
 * Draws `marker` on the List items inside it, in place of the marker their
 * List's `listStyle` names, or `task`'s read-only checkbox in place of either;
 * internal, for Markdown's nested lists and task items in mixed lists. With
 * `hasMarkerGutter`, counters keep the ordinary marker column and may paint
 * outside it toward inline-start. With `isOutsideNumberColumns`, a numbered
 * item keeps its counter beside its own text instead of in the shared column.
 * Outside a List, or in a List without markers, it changes nothing.
 */
export function ListMarkerScope({
  marker,
  task,
  hasMarkerGutter = false,
  isOutsideNumberColumns = false,
  children,
}: {
  readonly marker: ListMarker;
  readonly task?: ListTaskMarker;
  readonly hasMarkerGutter?: boolean;
  readonly isOutsideNumberColumns?: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const context = use(ListContext);
  const value = useMemo(
    () =>
      context == null
        ? null
        : {...context, marker, task, hasMarkerGutter, isOutsideNumberColumns},
    [context, marker, task, hasMarkerGutter, isOutsideNumberColumns],
  );
  return value == null ? (
    children
  ) : (
    <ListContext value={value}>{children}</ListContext>
  );
}
