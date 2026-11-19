// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {PlainDate} from '../utils/plainDate';
import {plainDateIsEqual, plainDateIsInRange} from '../utils/plainDate';

export interface DayCellState {
  effectivelyDisabled: boolean;
  isToday: boolean;
  isSelected: boolean;
  isInRange: boolean;
  isRangeStart: boolean;
  isRangeEnd: boolean;
  isInPreview: boolean;
  isPreviewStart: boolean;
  isPreviewEnd: boolean;
  isFirstColumn: boolean;
  isLastColumn: boolean;
}

export interface DayCellStateInput {
  date: PlainDate;
  dayIndex: number;
  mode: 'single' | 'range';
  selectedDate: PlainDate | null;
  rangeStart: PlainDate | null;
  rangeEnd: PlainDate | null;
  previewStart: PlainDate | null;
  previewEnd: PlainDate | null;
  /** Today, or `null` on the server and while hydrating. */
  today: PlainDate | null;
  isDisabled: boolean;
  isOutside: boolean;
}

/**
 * Derives all visual/interaction states for a single day cell.
 *
 * Outside (adjacent-month) days never receive selection, range, or preview
 * state: in the two-month layout the same date renders in both panes, and
 * highlighting the spillover copy would duplicate the selection onto the wrong
 * month's pane (#2715).
 */
export function computeDayCellState(input: DayCellStateInput): DayCellState {
  const {
    date,
    dayIndex,
    mode,
    selectedDate,
    rangeStart,
    rangeEnd,
    previewStart,
    previewEnd,
    today,
    isDisabled,
    isOutside,
  } = input;

  return {
    effectivelyDisabled: isDisabled || isOutside,
    isToday: !isOutside && today != null && plainDateIsEqual(date, today),
    isSelected: !!(
      !isOutside &&
      mode === 'single' &&
      selectedDate &&
      plainDateIsEqual(date, selectedDate)
    ),
    isInRange: !!(
      !isOutside &&
      mode === 'range' &&
      rangeStart &&
      rangeEnd &&
      plainDateIsInRange(date, [rangeStart, rangeEnd])
    ),
    isRangeStart: !!(
      !isOutside &&
      mode === 'range' &&
      rangeStart &&
      plainDateIsEqual(date, rangeStart)
    ),
    isRangeEnd: !!(
      !isOutside &&
      mode === 'range' &&
      rangeEnd &&
      plainDateIsEqual(date, rangeEnd)
    ),
    isInPreview: !!(
      !isOutside &&
      previewStart &&
      previewEnd &&
      plainDateIsInRange(date, [previewStart, previewEnd])
    ),
    isPreviewStart: !!(
      !isOutside &&
      previewStart &&
      plainDateIsEqual(date, previewStart)
    ),
    isPreviewEnd: !!(
      !isOutside &&
      previewEnd &&
      plainDateIsEqual(date, previewEnd)
    ),
    isFirstColumn: dayIndex === 0,
    isLastColumn: dayIndex === 6,
  };
}

/**
 * Generic rounding for a highlight run (range or preview).
 *
 * Rounds at the run's endpoints and the grid row edges, and also caps the
 * highlight where the run meets a break in continuity — a neighbouring cell
 * that is disabled or an adjacent-month (outside) day (#2715).
 */
function computeHighlightRounding(input: {
  isStart: boolean;
  isEnd: boolean;
  isFirstColumn: boolean;
  isLastColumn: boolean;
  prevContinues?: boolean;
  nextContinues?: boolean;
}) {
  const prevBreaks =
    input.prevContinues !== undefined ? !input.prevContinues : false;
  const nextBreaks =
    input.nextContinues !== undefined ? !input.nextContinues : false;
  return {
    roundStart: input.isStart || input.isFirstColumn || prevBreaks,
    roundEnd: input.isEnd || input.isLastColumn || nextBreaks,
  };
}

/** Rounding for the committed range background. */
export function computeRangeRounding(
  state: DayCellState,
  neighbors?: {prevInRange?: boolean; nextInRange?: boolean},
) {
  return computeHighlightRounding({
    isStart: state.isRangeStart,
    isEnd: state.isRangeEnd,
    isFirstColumn: state.isFirstColumn,
    isLastColumn: state.isLastColumn,
    prevContinues: neighbors?.prevInRange,
    nextContinues: neighbors?.nextInRange,
  });
}

/** Rounding for the hover-preview background. */
export function computePreviewRounding(
  state: DayCellState,
  neighbors?: {prevInPreview?: boolean; nextInPreview?: boolean},
) {
  return computeHighlightRounding({
    isStart: state.isPreviewStart,
    isEnd: state.isPreviewEnd,
    isFirstColumn: state.isFirstColumn,
    isLastColumn: state.isLastColumn,
    prevContinues: neighbors?.prevInPreview,
    nextContinues: neighbors?.nextInPreview,
  });
}

/** Whether a day is a selection endpoint (selected, range start, or range end). */
export function isEndpoint(state: DayCellState): boolean {
  return state.isSelected || state.isRangeStart || state.isRangeEnd;
}

/**
 * Whether a day is part of an unbroken highlight run (enabled, in-month, inside
 * the given span). Outside and disabled days break the run, producing end caps.
 */
function isSpanHighlighted(input: {
  date: PlainDate;
  spanStart: PlainDate | null;
  spanEnd: PlainDate | null;
  isDisabled: boolean;
  isOutside: boolean;
}): boolean {
  const {date, spanStart, spanEnd, isDisabled, isOutside} = input;
  return !!(
    !isOutside &&
    !isDisabled &&
    spanStart &&
    spanEnd &&
    plainDateIsInRange(date, [spanStart, spanEnd])
  );
}

/** Whether a day participates in the continuous committed-range highlight. */
export function isRangeHighlighted(input: {
  date: PlainDate;
  mode: 'single' | 'range';
  rangeStart: PlainDate | null;
  rangeEnd: PlainDate | null;
  isDisabled: boolean;
  isOutside: boolean;
}): boolean {
  if (input.mode !== 'range') {
    return false;
  }
  return isSpanHighlighted({
    date: input.date,
    spanStart: input.rangeStart,
    spanEnd: input.rangeEnd,
    isDisabled: input.isDisabled,
    isOutside: input.isOutside,
  });
}

/** Whether a day participates in the continuous hover-preview highlight. */
export function isPreviewHighlighted(input: {
  date: PlainDate;
  previewStart: PlainDate | null;
  previewEnd: PlainDate | null;
  isDisabled: boolean;
  isOutside: boolean;
}): boolean {
  return isSpanHighlighted({
    date: input.date,
    spanStart: input.previewStart,
    spanEnd: input.previewEnd,
    isDisabled: input.isDisabled,
    isOutside: input.isOutside,
  });
}

/**
 * Continuity of the highlighted run through a day's immediate neighbours in the
 * same week row, for both the committed range and the hover preview. A day gets
 * an end cap on whichever side its neighbour does not continue the run (see
 * {@link computeRangeRounding} / {@link computePreviewRounding}).
 */
export interface DayNeighborContinuity {
  prevInRange: boolean;
  nextInRange: boolean;
  prevInPreview: boolean;
  nextInPreview: boolean;
}

/** Minimal shape needed from a week's day cells to derive neighbour continuity. */
export interface NeighborDay {
  date: PlainDate;
  isOutside: boolean;
}

/**
 * Derives whether the previous/next day in the same week row continues the
 * highlighted run, for both range and preview. Broken out from the render path
 * so the neighbour logic is unit-testable in isolation.
 */
export function computeDayNeighborContinuity(input: {
  week: ReadonlyArray<NeighborDay>;
  dayIndex: number;
  mode: 'single' | 'range';
  rangeStart: PlainDate | null;
  rangeEnd: PlainDate | null;
  previewStart: PlainDate | null;
  previewEnd: PlainDate | null;
  isDisabled: (date: PlainDate) => boolean;
}): DayNeighborContinuity {
  const {
    week,
    dayIndex,
    mode,
    rangeStart,
    rangeEnd,
    previewStart,
    previewEnd,
    isDisabled,
  } = input;

  const prev = week[dayIndex - 1];
  const next = week[dayIndex + 1];

  const rangeContinues = (day: NeighborDay | undefined): boolean =>
    day != null &&
    isRangeHighlighted({
      date: day.date,
      mode,
      rangeStart,
      rangeEnd,
      isDisabled: isDisabled(day.date),
      isOutside: day.isOutside,
    });

  const previewContinues = (day: NeighborDay | undefined): boolean =>
    day != null &&
    isPreviewHighlighted({
      date: day.date,
      previewStart,
      previewEnd,
      isDisabled: isDisabled(day.date),
      isOutside: day.isOutside,
    });

  return {
    prevInRange: rangeContinues(prev),
    nextInRange: rangeContinues(next),
    prevInPreview: previewContinues(prev),
    nextInPreview: previewContinues(next),
  };
}
