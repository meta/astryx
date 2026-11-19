// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useListFocusIsland.ts
 * @input Canonical item keys and the consumer's viewport and focus container refs
 * @output The one retained focused item, and focus return when it unmounts
 * @position The focus island of the private list-windowing module, shared by
 *   its block-axis and inline-axis window hooks. It installs no observer.
 */
import {useCallback, useRef, useState, type RefObject} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {
  moveFocusLeftBehind,
  noteFocusWithin,
  type FocusWithin,
} from '../utils/focusReturn';
import {useInteractionModalityTrackingFor} from '../utils/interactionModality';

export type ListWindowKey = string | number;

export interface UseListFocusIslandOptions {
  /** Key-to-index map of the items that can stay mounted as the island. */
  keyIndices: ReadonlyMap<ListWindowKey, number>;
  /** Whether the list windows now; only then is the last input tracked. */
  isActive: boolean;
  /** The scroll viewport; it takes focus when the focused item unmounts. */
  viewport: RefObject<HTMLElement | null>;
  /** Where item focus is noted when an item reports no focus target. */
  focusContainer: RefObject<HTMLElement | null>;
}

export interface ListFocusIsland {
  /** The focused item's index, kept mounted outside the window. */
  focusIndex: number | undefined;
  onItemFocus: (key: ListWindowKey, focusTarget?: HTMLElement) => void;
  /** The consumer invokes this only when focus genuinely leaves the item. */
  onItemBlur: () => void;
}

export function useListFocusIsland({
  keyIndices,
  isActive,
  viewport,
  focusContainer,
}: UseListFocusIslandOptions): ListFocusIsland {
  const [focusedKey, setFocusedKey] = useState<ListWindowKey | undefined>();
  const focusNoteRef = useRef<FocusWithin | null>(null);
  // Focus return reads the last input, so only a windowed list tracks it.
  useInteractionModalityTrackingFor(viewport, isActive);
  const focusIndex =
    focusedKey === undefined ? undefined : keyIndices.get(focusedKey);
  if (focusedKey !== undefined && focusIndex === undefined) {
    setFocusedKey(undefined);
  }

  const onItemFocus = useCallback(
    (key: ListWindowKey, focusTarget?: HTMLElement) => {
      focusNoteRef.current =
        noteFocusWithin(focusTarget ?? focusContainer.current) ??
        focusNoteRef.current;
      setFocusedKey(key);
    },
    [focusContainer],
  );
  const onItemBlur = useCallback(() => {
    focusNoteRef.current = null;
    setFocusedKey(undefined);
  }, []);

  useIsomorphicLayoutEffect(() => {
    // Syncs DOM focus with the committed items: a removed focused item
    // returns focus to the viewport.
    if (
      focusNoteRef.current != null &&
      (focusedKey === undefined || focusIndex === undefined)
    ) {
      moveFocusLeftBehind(focusNoteRef.current, viewport.current, null, {
        preventScroll: true,
      });
      focusNoteRef.current = null;
    }
  });

  return {focusIndex, onItemFocus, onItemBlur};
}
