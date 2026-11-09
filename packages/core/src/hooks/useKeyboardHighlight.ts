// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useKeyboardHighlight.ts
 * @input The owning combobox's shared modality reader and its keydown and
 *   option-hover handlers
 * @output Exports useKeyboardHighlight: whether the last highlight move came
 *   from keyboard input, the handlers wrapped to record each move, and the
 *   recorder for other paths that move the highlight
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
  /** Records the current input for a path that moves the highlight. */
  noteHighlightMove: () => void;
  onKeyDown: (...args: KeyArgs) => void;
  onItemMouseEnter: (...args: HoverArgs) => void;
}

/**
 * A highlight moves from both keys and the pointer, but keyboard-only paint
 * follows the shared interaction modality. The hook reads that modality each
 * time the highlight moves.
 */
export function useKeyboardHighlight<
  KeyArgs extends unknown[],
  HoverArgs extends unknown[],
>(
  readModality: () => InteractionModality,
  onKeyDown: (...args: KeyArgs) => void,
  onItemMouseEnter: (...args: HoverArgs) => void,
): KeyboardHighlight<KeyArgs, HoverArgs> {
  const [isKeyboardHighlight, setIsKeyboardHighlight] = useState(
    () => readModality() === 'keyboard',
  );
  const noteHighlightMove = useCallback(
    () => setIsKeyboardHighlight(readModality() === 'keyboard'),
    [readModality],
  );
  const handleKeyDown = useCallback(
    (...args: KeyArgs) => {
      onKeyDown(...args);
      noteHighlightMove();
    },
    [onKeyDown, noteHighlightMove],
  );
  const handleItemMouseEnter = useCallback(
    (...args: HoverArgs) => {
      onItemMouseEnter(...args);
      noteHighlightMove();
    },
    [onItemMouseEnter, noteHighlightMove],
  );
  return {
    isKeyboardHighlight,
    noteHighlightMove,
    onKeyDown: handleKeyDown,
    onItemMouseEnter: handleItemMouseEnter,
  };
}
