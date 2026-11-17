// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useWheelListbox.ts
 * @input A wheel's label, options, committed value and active row, and its
 *   presentation's three moves: a step, an end, a row
 * @output useWheelListbox: the listbox and option props both wheels share
 * @position Internal hook of ScrollWheel (Wheel.tsx) and PickerWheel.tsx
 *
 * A wheel is a listbox: one tab stop, with Arrow, Page, Home and End keys.
 * Each presentation decides what its keys and clicks do to its own column.
 *
 * SYNC: When modified, update Wheel.tsx and PickerWheel.tsx.
 */

import {useCallback, useId, type KeyboardEvent} from 'react';
import type {WheelOption} from './wheelOptions';

/** Rows a Page Up or Page Down key moves. */
const PAGE_ROWS = 10;

export interface WheelListboxProps {
  /** Accessible name for the column. */
  label: string;
  /** Rows, top to bottom. */
  options: ReadonlyArray<WheelOption>;
  /** Committed value. */
  value: number;
  /** The row `aria-activedescendant` names. */
  activeIndex: number;
  /** An Arrow or Page key: a step of `delta` rows. */
  stepBy: (delta: number) => void;
  /** Home or End. */
  toEnd: (end: 'first' | 'last') => void;
  /** A click on row `index`. */
  activate: (index: number) => void;
}

/**
 * The listbox and option props of one wheel column: ids, ARIA, the keys and
 * a click on a row. `aria-activedescendant` marks the active row, and a click
 * reaches every row. The scrolling column steps from the row under its band. The
 * touch column steps from the row it is heading to.
 *
 * @example
 * ```
 * const {listboxProps, optionProps} = useWheelListbox({label, options, value, activeIndex, stepBy, toEnd, activate});
 * <div {...listboxProps}>{options.map((option, index) => <div key={option.value} {...optionProps(option, index)} />)}</div>
 * ```
 */
export function useWheelListbox({
  label,
  options,
  value,
  activeIndex,
  stepBy,
  toEnd,
  activate,
}: WheelListboxProps) {
  const id = useId();
  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          stepBy(1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          stepBy(-1);
          break;
        case 'PageDown':
          event.preventDefault();
          stepBy(PAGE_ROWS);
          break;
        case 'PageUp':
          event.preventDefault();
          stepBy(-PAGE_ROWS);
          break;
        case 'Home':
          event.preventDefault();
          toEnd('first');
          break;
        case 'End':
          event.preventDefault();
          toEnd('last');
          break;
        default:
          break;
      }
    },
    [stepBy, toEnd],
  );
  return {
    listboxProps: {
      role: 'listbox' as const,
      'aria-label': label,
      'aria-activedescendant': `${id}-${options[activeIndex]?.value}`,
      tabIndex: 0,
      onKeyDown,
    },
    optionProps: (option: WheelOption, index: number) => ({
      id: `${id}-${option.value}`,
      role: 'option' as const,
      'aria-selected': option.value === value,
      'aria-disabled': option.isDisabled || undefined,
      onClick: () => activate(index),
    }),
  };
}
