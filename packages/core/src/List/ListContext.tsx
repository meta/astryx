// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ListContext.tsx
 * @input Layer-scoped React context
 * @output Exports ListContext for sharing density, dividers, the row edge
 *   treatment, and marker style between List and ListItem, and
 *   ListMarkerScope, which sets the marker for the items inside it, or a
 *   task item's checkbox in its place, and whether their List has a marker
 *   gutter whose outside counters keep the ordinary themed text inset
 * @position Internal context; consumed by List.tsx and ListItem.tsx
 */

import {use, useMemo, type ReactNode} from 'react';
import {createLayerScopedContext as createContext} from '../Layer/layerScopedContext';

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
}

export const ListContext = createContext<ListContextValue | null>(null);
ListContext.displayName = 'ListContext';

/**
 * Draws `marker` on the List items inside it, in place of the marker their
 * List's `listStyle` names, or `task`'s read-only checkbox in place of either;
 * internal, for Markdown's nested lists and task items in mixed lists. With
 * `hasMarkerGutter`, counters keep the ordinary marker column and may paint
 * outside it toward inline-start. Outside a List, or in a List without markers, it
 * changes nothing.
 */
export function ListMarkerScope({
  marker,
  task,
  hasMarkerGutter = false,
  children,
}: {
  readonly marker: ListMarker;
  readonly task?: ListTaskMarker;
  readonly hasMarkerGutter?: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const context = use(ListContext);
  const value = useMemo(
    () =>
      context == null ? null : {...context, marker, task, hasMarkerGutter},
    [context, marker, task, hasMarkerGutter],
  );
  return value == null ? (
    children
  ) : (
    <ListContext value={value}>{children}</ListContext>
  );
}
