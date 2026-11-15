// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ListReorderScope.tsx
 * @input A reorderable object made by createReorderable, and the element
 *   whose children are the rows
 * @output `useListReorderScope`, a reorder session over rows that are not
 *   ListItems. `ListReorderScope` gives those rows the session as a
 *   reorderable List gives its own: `ListReorderHandle` inside a row finds it
 * @position Internal to core; Lab's ListInput reaches it through
 *   `@astryxdesign/core/internal/reorder`. It runs the same engine a
 *   reorderable List runs, List/listReorderEngine.tsx, which ships with the
 *   object. So the rows drag, take keys and announce their moves alike.
 *
 * SYNC: When modified, update List/List.tsx, which runs the same session for
 * its own rows through the hooks in List/listReorderContext.ts.
 */

import {useMemo, type ReactNode} from 'react';
import type {Reorderable} from '../reorderable/createReorderable';
import {ListContext, type ListContextValue} from './ListContext';
import {
  useReorderCommit,
  useReorderSession,
  type ListReorderContextValue,
} from './listReorderContext';

/**
 * The reorder session over the children of the element `getList` returns,
 * run by `reorderable`'s engine, or null without an object. `hintId` names
 * the handles' instructions, which `ListReorderScope` renders. The object may
 * be made on every render: the session lasts as long as its engine and reads
 * the object's latest callbacks.
 */
export function useListReorderScope(
  reorderable: Reorderable | undefined,
  getList: () => HTMLElement | null,
  hintId: string,
): ListReorderContextValue | null {
  const {session, options} = useReorderSession(reorderable, getList, hintId);
  useReorderCommit(session);
  return useMemo(
    () => (session == null || options == null ? null : {session, options}),
    [session, options],
  );
}

/**
 * Gives the rows inside it the reorder session, so `ListReorderHandle` in a
 * row drags that row, and renders the session's instructions and reorder-mode
 * hint. Without a session it renders its children alone.
 */
export function ListReorderScope({
  reorder,
  children,
}: {
  reorder: ListReorderContextValue | null;
  children: ReactNode;
}): ReactNode {
  // Only `reorder` is read inside a reorder scope; the rest is a List's
  // defaults for any row that reads it.
  const value = useMemo<ListContextValue | null>(
    () =>
      reorder == null
        ? null
        : {
            density: 'balanced',
            hasDividers: false,
            edge: 'padded',
            listStyle: 'none',
            reorder,
          },
    [reorder],
  );
  if (reorder == null || value == null) {
    return children;
  }
  return (
    <ListContext value={value}>
      {children}
      <reorder.session.Host reorder={reorder} />
    </ListContext>
  );
}
