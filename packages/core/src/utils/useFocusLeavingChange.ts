// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useFocusLeavingChange.ts
 * @input A state whose change can remove or hide focused content, how to note
 *   the focus before the change, and how to move it after
 * @output A before-change callback for `LayoutChangeSnapshot`, and the move,
 *   run from a layout effect of the same commit
 * @position Internal hook, not exported from the package: the one sequence a
 *   disclosure runs so focus leaves content its change takes away
 *   (`component:SideNav` AR3, `component:Collapsible` AR4). It pairs with
 *   `noteFocusWithin` and `moveFocusLeftBehind` in `focusReturn.ts`, which
 *   stays free of React so `isFocusDetached` remains server-safe.
 */

import {useCallback, useLayoutEffect, useRef} from 'react';

/**
 * Notes focus in the commit before `value`'s change touches the DOM, and
 * moves it from a layout effect of the same commit.
 *
 * Pass the returned callback as `LayoutChangeSnapshot`'s `onBeforeChange`
 * (with `value` as its `value`). `note` receives the value being left and
 * returns what `move` needs, or `null` when there is nothing to move; `move`
 * receives that and the new value once the change has committed. `move` is
 * the latest render's. `note` runs before this commit's effects, so it is the
 * previous committed render's: read refs or the DOM in it, not props.
 */
export function useFocusLeavingChange<V, N>(
  value: V,
  note: (previous: V) => N | null,
  move: (noted: N, value: V) => void,
): (previous: V) => void {
  const noteRef = useRef(note);
  const moveRef = useRef(move);
  const pendingRef = useRef<N | null>(null);
  useLayoutEffect(() => {
    noteRef.current = note;
    moveRef.current = move;
  });
  useLayoutEffect(() => {
    const noted = pendingRef.current;
    pendingRef.current = null;
    if (noted != null) {
      moveRef.current(noted, value);
    }
  }, [value]);
  return useCallback((previous: V) => {
    pendingRef.current = noteRef.current(previous);
  }, []);
}
