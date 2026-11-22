// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useKeyboardHighlight.ts
 * @input The owning combobox's shared modality reader and its keydown and
 *   option-hover handlers
 * @output Exports useKeyboardHighlight: whether the last highlight move came
 *   from keyboard input, the option the mouse entered since the last key, the
 *   handlers wrapped to record each move, and the recorder for other paths
 *   that move the highlight
 * @position Internal hook; used by Selector and MultiSelector to draw
 *   keyboard-only highlight paint
 */

import {useCallback, useState} from 'react';
import type {InteractionModality} from '../utils/interactionModality';

interface KeyboardHighlight<
  KeyArgs extends unknown[],
  HoverArgs extends unknown[],
> {
  /** The last highlight move came from keyboard input. */
  isKeyboardHighlight: boolean;
  /**
   * The option the mouse entered since the last key, or null. It draws no
   * keyboard-only paint, even while the modality still reads keyboard.
   */
  hoveredIndex: number | null;
  /** Moves the hovered option with its option when the options change. */
  setHoveredIndex: (index: number | null) => void;
  /** Records the current input for a path that moves the highlight. */
  noteHighlightMove: () => void;
  onKeyDown: (...args: KeyArgs) => void;
  onItemMouseEnter: (...args: HoverArgs) => void;
}

/**
 * A highlight moves from both keys and the pointer, but keyboard-only paint
 * follows the shared interaction modality. The hook reads that modality each
 * time the highlight moves.
 *
 * Modality changes only on a key or a press, so a hover alone still reads as
 * keyboard. The option the mouse enters therefore draws no keyboard paint
 * until a key moves the highlight again. `hoverIndexOf` names that option, or
 * returns null for the option that is already active: entering it, as when a
 * key scrolls it under a still mouse, changes nothing.
 */
export function useKeyboardHighlight<
  KeyArgs extends unknown[],
  HoverArgs extends unknown[],
>(
  readModality: () => InteractionModality,
  onKeyDown: (...args: KeyArgs) => void,
  onItemMouseEnter: (...args: HoverArgs) => void,
  hoverIndexOf: (...args: HoverArgs) => number | null,
): KeyboardHighlight<KeyArgs, HoverArgs> {
  const [isKeyboardHighlight, setIsKeyboardHighlight] = useState(
    () => readModality() === 'keyboard',
  );
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const noteHighlightMove = useCallback(
    () => setIsKeyboardHighlight(readModality() === 'keyboard'),
    [readModality],
  );
  const handleKeyDown = useCallback(
    (...args: KeyArgs) => {
      setHoveredIndex(null);
      onKeyDown(...args);
      noteHighlightMove();
    },
    [onKeyDown, noteHighlightMove],
  );
  const handleItemMouseEnter = useCallback(
    (...args: HoverArgs) => {
      const index = hoverIndexOf(...args);
      if (index != null) {
        setHoveredIndex(index);
      }
      onItemMouseEnter(...args);
      noteHighlightMove();
    },
    [onItemMouseEnter, hoverIndexOf, noteHighlightMove],
  );
  return {
    isKeyboardHighlight,
    hoveredIndex,
    setHoveredIndex,
    noteHighlightMove,
    onKeyDown: handleKeyDown,
    onItemMouseEnter: handleItemMouseEnter,
  };
}
