// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file wheelOptions.ts
 * @input Nothing; types, the row height and pure functions
 * @output WheelOption, WheelProps, WHEEL_ROW_HEIGHT, nearestEnabledIndex,
 *   steppedIndex and endIndex: what both wheels share
 * @position Internal; read by Wheel.tsx (which re-exports all of it) and
 *   PickerWheel.tsx
 *
 * SYNC: When modified, update:
 * - /packages/core/src/DateInput/Wheel.tsx
 * - /packages/core/src/DateInput/PickerWheel.tsx
 */

/**
 * Today's row, px (`dateInputTouchSizes.wheelItemSize`): the pitch of both
 * columns' rows, and the unit of the touch wheel's offset.
 */
export const WHEEL_ROW_HEIGHT = 28;

export interface WheelOption {
  /** Stable numeric identity of the row (a month 1-12, or a year). */
  value: number;
  /** Row text. */
  label: string;
  /**
   * Rows outside min/max stay visible but cannot be committed: a wheel that
   * stops on one travels on to the nearest enabled row.
   */
  isDisabled?: boolean;
}

export interface WheelProps {
  /** Accessible name for the column, e.g. "Month". */
  label: string;
  /** Rows, top to bottom. */
  options: ReadonlyArray<WheelOption>;
  /** Committed value; must match one option's `value`. */
  value: number;
  /** Fired when the wheel comes to rest on a different, enabled row. */
  onChange: (value: number) => void;
  /**
   * False while the wheel is hidden. The scrolling column then waits to listen
   * and scroll, because a hidden scroller's offsets mean nothing. The touch
   * wheel turns its gestures off, and shows a value set from outside without
   * motion.
   */
  isActive?: boolean;
}

/**
 * The enabled row nearest `index`: `index` itself when it is enabled,
 * otherwise the closest enabled row on either side. A tie goes to the side of
 * `towardIndex` (the committed row), and a wheel with no enabled row stays on
 * `towardIndex`.
 *
 * @example
 * ```
 * // Hours 0-23 with 09:00-17:00 bounds: stopping on 7 rests on 9.
 * nearestEnabledIndex(hourOptions, 7, 10); // 9
 * ```
 */
export function nearestEnabledIndex(
  options: ReadonlyArray<WheelOption>,
  index: number,
  towardIndex: number,
): number {
  const isEnabled = (i: number) =>
    i >= 0 && i < options.length && !options[i].isDisabled;
  if (isEnabled(index)) {
    return index;
  }
  for (let distance = 1; distance < options.length; distance++) {
    const below = index - distance;
    const above = index + distance;
    const isBelowEnabled = isEnabled(below);
    const isAboveEnabled = isEnabled(above);
    if (isBelowEnabled && isAboveEnabled) {
      return towardIndex < index ? below : above;
    }
    if (isBelowEnabled) {
      return below;
    }
    if (isAboveEnabled) {
      return above;
    }
  }
  return towardIndex;
}

/**
 * The row a key moves a wheel to from `from` by `delta` rows. It is the next
 * enabled row from the target in the key's direction. Past the last enabled
 * row, it is the last enabled row before the target. Null when no enabled row
 * lies in that direction, so the key commits nothing.
 */
export function steppedIndex(
  options: ReadonlyArray<WheelOption>,
  from: number,
  delta: number,
): number | null {
  const count = options.length;
  if (count === 0 || delta === 0) {
    return null;
  }
  const isEnabled = (index: number) => {
    const option = options[index];
    return option != null && !option.isDisabled;
  };
  const step = Math.sign(delta);
  const target = Math.min(count - 1, Math.max(0, from + delta));
  for (let index = target; index >= 0 && index < count; index += step) {
    if (isEnabled(index)) {
      return index === from ? null : index;
    }
  }
  for (let index = target; index !== from; index -= step) {
    if (isEnabled(index)) {
      return index;
    }
  }
  return null;
}

/** The first or the last enabled row: where Home or End moves a wheel. */
export function endIndex(
  options: ReadonlyArray<WheelOption>,
  end: 'first' | 'last',
): number | null {
  const step = end === 'first' ? 1 : -1;
  const start = end === 'first' ? 0 : options.length - 1;
  for (let index = start; index >= 0 && index < options.length; index += step) {
    if (!options[index].isDisabled) {
      return index;
    }
  }
  return null;
}
