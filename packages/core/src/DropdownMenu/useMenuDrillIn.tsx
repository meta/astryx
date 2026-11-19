// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useMenuDrillIn.tsx
 * @input React, StyleX, the shared SSR-safe media-query check
 * @output Exports useMenuDrillIn — the view stack a menu root keeps so its
 *   sub-menus can drill in — and the coarse-pointer query.
 * @position Internal; mounted by DropdownMenu and ContextMenu, read by
 *   DropdownMenuSubMenu through DropdownMenuContext.
 *
 * On a phone a flyout beside a phone-width menu has no room, so a sub-menu
 * row replaces the list with its own rows and a Back row in the same menu
 * box. The root owns the stack: `wrapContent` renders the root's rows inside
 * a wrapper that hides while a view shows, followed by the host element the
 * shown view portals its rows into. The sub-menu row stays mounted (hidden)
 * while its view shows, so its rows stay live and Back can return focus to
 * it without bookkeeping. Whether a finger drove the menu is decided once,
 * when it opens, so a menu never changes shape under a pointer.
 */

import {useCallback, useMemo, useState, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {DropdownMenuDrillIn} from './DropdownMenuContext';
import {useCompactDefinition} from '../utils/touchPresentation';

/**
 * The same compact-touch condition the root presentation uses to decide the
 * bottom sheet (the active theme's, spec:AST-012 FR9), so
 * one component carries one meaning of "adaptive". A bare `(pointer: coarse)`
 * would disagree with it on a large touch tablet: the menu would stay an
 * anchored popover while its sub-menus replaced rows in place, a combination
 * nobody designed.
 */
function matchesCompactTouch(query: string): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(query).matches
  );
}

const styles = stylex.create({
  // The wrappers add no box of their own, so the menu's flex gap still runs
  // between the rows exactly as it does without them.
  tree: {
    display: 'contents',
  },
  treeHidden: {
    display: 'none',
  },
});

export interface UseMenuDrillInReturn {
  /** The context value for `DropdownMenuContext.drillIn`. */
  drillIn: DropdownMenuDrillIn;
  /** Whether a view is shown in place of the root's rows. */
  isDrilled: boolean;
  /**
   * Wrap the root's rows: hidden while a view shows, followed by the host the
   * view renders into.
   */
  wrapContent: (content: ReactNode) => ReactNode;
}

/**
 * The drill-in view stack for a menu root.
 *
 * @param isOpen - whether the menu is open; the pointer kind is sampled when it
 *   opens and the stack empties when it closes.
 */
export function useMenuDrillIn(isOpen: boolean): UseMenuDrillInReturn {
  const compactTouchQuery = useCompactDefinition().coarsePointerQuery;
  const [isCompactTouch, setIsCompactTouch] = useState(false);
  const [viewStack, setViewStack] = useState<ReadonlyArray<string>>([]);
  const [host, setHost] = useState<HTMLElement | null>(null);
  // Derived from the open transition during render (the documented pattern
  // for state that follows a prop): the pointer kind is sampled as the menu
  // opens, and closing forgets the drilled view so the next open starts at
  // the root.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setIsCompactTouch(matchesCompactTouch(compactTouchQuery));
    } else if (viewStack.length > 0) {
      setViewStack([]);
    }
  }

  const push = useCallback((viewId: string) => {
    setViewStack(stack =>
      stack.includes(viewId) ? stack : [...stack, viewId],
    );
  }, []);
  const pop = useCallback(() => {
    setViewStack(stack => (stack.length === 0 ? stack : stack.slice(0, -1)));
  }, []);

  const drillIn = useMemo<DropdownMenuDrillIn>(
    () => ({isCompactTouch, viewStack, host, push, pop}),
    [isCompactTouch, viewStack, host, push, pop],
  );

  const isDrilled = viewStack.length > 0;

  // The wrappers render always, not only once a view shows: a tree that
  // changed shape at push time would remount the sub-menu row, and with it the
  // view id it just pushed. They own no box (`display: contents`), so the
  // menu's layout is unchanged.
  const wrapContent = useCallback(
    (content: ReactNode): ReactNode => {
      return (
        <>
          <div
            hidden={isDrilled}
            inert={isDrilled}
            {...stylex.props(styles.tree, isDrilled && styles.treeHidden)}>
            {content}
          </div>
          <div ref={setHost} {...stylex.props(styles.tree)} />
        </>
      );
    },
    [isDrilled],
  );

  return {drillIn, isDrilled, wrapContent};
}
