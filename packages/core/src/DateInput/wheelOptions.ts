// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file wheelOptions.ts
 * @input Nothing; types, the row height and pure functions
 * @output WheelOption, WheelProps, WheelHandle, WHEEL_ROW_HEIGHT, canSpinTo,
 *   nearestEnabledIndex, steppedIndex, endIndex, and the looping wheel's
 *   restingLoopStep and loopedStep: what both wheels share
 * @position Internal; read by Wheel.tsx (which re-exports all of it) and
 *   PickerWheel.tsx
 *
 * SYNC: When modified, update:
 * - /packages/core/src/DateInput/Wheel.tsx
 * - /packages/core/src/DateInput/PickerWheel.tsx
 */

import type {Ref} from 'react';

/**
 * The row height, px (`dateInputTouchSizes.wheelItemSize`): the pitch of both
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
  /**
   * Where the row falls when a key steps the wheel; without it, rows step in
   * list order. A 12-hour hour column sets the full hour, so 12 PM comes before
   * 1 PM.
   */
  order?: number;
}

/** What a Wheel's `ref` exposes. */
export interface WheelHandle {
  /**
   * Turn the wheel onto `index` (an index into `options`) on the tap spin, then
   * commit it as a rest would. Resolves true once that row is the committed
   * one, false if a finger or another turn interrupted it or the wheel went
   * away first. An index outside `options` or a disabled row resolves false at
   * once, and nothing turns. Under a fine pointer the row commits at once. The
   * column then scrolls to it as for any new value, on the same rule.
   */
  spinTo(index: number): Promise<boolean>;
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
  /** Programmatic turns: `spinTo(index)`. */
  ref?: Ref<WheelHandle>;
  /**
   * Under a finger the rows repeat without end, as UIDatePicker's minutes and
   * hours do: the last row is followed by the first. A list shorter than the
   * column repeats down all of it. A single row never loops. The scrolling
   * column does not loop.
   */
  isLooping?: boolean;
}

/**
 * Whether `spinTo(index)` may turn onto `index`: an enabled row of `options`.
 * The touch wheel and the scrolling column answer a spin by the same rule.
 */
export function canSpinTo(
  options: ReadonlyArray<WheelOption>,
  index: number,
): boolean {
  const option = options[index];
  return option != null && !option.isDisabled;
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
 * How many rows, signed, a looping wheel resting at `position` travels to the
 * nearest enabled row: 0 when that row is enabled. `isEnabledAt` judges each
 * position. A tie goes toward `toward`, the committed
 * row's position. The search stops half a turn away, so a rest never turns the
 * long way round. With no enabled row that near, the wheel travels to `toward`.
 *
 * @example
 * ```
 * // Months, looping, with only January and February enabled: a rest on
 * // December (position 11) turns one row on to January.
 * restingLoopStep(p => p % 12 < 2, 11, 1, 12); // 1
 * ```
 */
export function restingLoopStep(
  isEnabledAt: (position: number) => boolean,
  position: number,
  toward: number,
  count: number,
): number {
  if (isEnabledAt(position)) {
    return 0;
  }
  for (let distance = 1; distance <= count / 2; distance++) {
    const isBelowEnabled = isEnabledAt(position - distance);
    const isAboveEnabled = isEnabledAt(position + distance);
    if (isBelowEnabled && isAboveEnabled) {
      return toward < position ? -distance : distance;
    }
    if (isBelowEnabled) {
      return -distance;
    }
    if (isAboveEnabled) {
      return distance;
    }
  }
  return toward - position;
}

/** The rows' indices in the order keys step them: by `order`, else list order. */
function inKeyOrder(options: ReadonlyArray<WheelOption>): number[] {
  const indices = options.map((_, index) => index);
  if (options.every(option => option.order == null)) {
    return indices;
  }
  return indices.sort(
    (a, b) => (options[a].order ?? a) - (options[b].order ?? b),
  );
}

/**
 * The row a key moves a wheel to from `from` by `delta` rows, in key order. It
 * is the next enabled row from the target in the key's direction. Past the
 * last enabled row, it is the last enabled row before the target. Null when no
 * enabled row lies in that direction, so the key commits nothing.
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
  const rows = inKeyOrder(options);
  const start = Math.max(0, rows.indexOf(from));
  const isEnabled = (position: number) => !options[rows[position]].isDisabled;
  const step = Math.sign(delta);
  const target = Math.min(count - 1, Math.max(0, start + delta));
  for (
    let position = target;
    position >= 0 && position < count;
    position += step
  ) {
    if (isEnabled(position)) {
      return position === start ? null : rows[position];
    }
  }
  for (let position = target; position !== start; position -= step) {
    if (isEnabled(position)) {
      return rows[position];
    }
  }
  return null;
}

/**
 * How many rows, signed, a key moves a looping wheel of `count` rows from
 * position `from` by `delta` rows, in list order. `isEnabledAt` judges each
 * position. Whole laps fall off `delta`, so a key never
 * turns a whole lap. The key takes the next enabled row from its target in its
 * own direction, across the seam, at most half a turn from `from`. Failing
 * that, it takes the enabled row nearest its target on the way back. Null when
 * it finds no other row, so it commits nothing.
 *
 * @example
 * ```
 * // Minutes 00-59, looping: ArrowDown on :59 moves one row on, to :00.
 * loopedStep(() => true, 59, 1, 60); // 1
 * ```
 */
export function loopedStep(
  isEnabledAt: (position: number) => boolean,
  from: number,
  delta: number,
  count: number,
): number | null {
  const step = Math.sign(delta);
  const rows = count < 2 ? 0 : Math.abs(delta) % count;
  if (rows === 0) {
    return null;
  }
  const target = from + step * rows;
  const reach = Math.max(rows, Math.floor(count / 2));
  for (
    let position = target;
    Math.abs(position - from) <= reach;
    position += step
  ) {
    if (isEnabledAt(position)) {
      return position - from;
    }
  }
  for (let position = target - step; position !== from; position -= step) {
    if (isEnabledAt(position)) {
      return position - from;
    }
  }
  return null;
}

/** The first or the last enabled row in key order: where Home or End moves a wheel. */
export function endIndex(
  options: ReadonlyArray<WheelOption>,
  end: 'first' | 'last',
): number | null {
  const enabled = inKeyOrder(options).filter(
    index => !options[index].isDisabled,
  );
  return (end === 'first' ? enabled[0] : enabled[enabled.length - 1]) ?? null;
}
