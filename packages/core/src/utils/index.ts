// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Utils module exports
 * @output Re-exports all utility functions and shared types
 * @position Package entry point for utils
 */

export type {SizeValue} from './types';

export type {ISODateString, DayOfWeek, PlainDate, DateRange} from './dateTypes';

export {
  parseDateInput,
  dateToISO,
  parseISO,
  isLocaleDayFirst,
} from './dateParser';

export {
  plainDateCreate,
  plainDateFromISO,
  plainDateToISO,
  plainDateToDate,
  plainDateFromDate,
  plainDateToday,
  getDaysInMonth,
  plainDateDayOfWeek,
  plainDateAddMonths,
  plainDateAddDays,
  plainDateToInstant,
  plainDateFromInstant,
  plainDateIsBefore,
  plainDateIsAfter,
  plainDateIsEqual,
  plainDateMax,
  plainDateMin,
  plainDateIsInRange,
  plainDateSetFirstOfMonth,
  plainDateSetStartOfWeek,
  plainDateSetEndOfWeekExclusive,
  plainDateGetWeekNumber,
  plainDateFormat,
  formatSharedDate,
  DATE_FORMAT_WITH_WEEKDAY,
  DATE_FORMAT_SHORT_WITH_WEEKDAY,
  DATE_FORMAT_LONG,
  DATE_FORMAT_MONTH_YEAR,
  DATE_FORMAT_MONTH_ONLY,
  DATE_FORMAT_WEEKDAY_ONLY,
  DATE_FORMAT_SHORT,
  DATE_FORMAT_SHORT_WITH_YEAR,
  SHARED_DATE_FORMAT_OPTIONS,
} from './plainDate';
export type {SharedDateFormat} from './plainDate';

export {
  parseISOTime,
  formatISOTime,
  formatDisplayTime12h,
  formatDisplayTime24h,
  parseTimeInput,
  compareTime,
  isTimeInRange,
  clampTime,
  adjustTime,
  createISOTimeString,
} from './timeParser';
export type {ISOTimeString, ParsedTime} from './timeParser';

export {parseStyleKey} from './parseStyleKey';
export {getKey, type Key, type KeyFallback} from './getKey';

export {characterCount, firstCharacter, truncateCharacters} from './characters';

export {mergeProps} from './mergeProps';
export {mergeRefs} from './mergeRefs';
export {isFocusDetached} from './focusReturn';
export {composeEventHandlers} from './composeEventHandlers';
export {themeProps, themeDataAttributes} from './themeProps';
export type {
  ClassValue,
  ClassProps,
  ThemeDataAttributes,
  ThemeProps,
} from './themeProps';
export {groupItems, getItemGroup} from './groupItems';
export type {ItemGroup, GroupItemsOptions} from './groupItems';
export {observeResize, unobserveResize} from './sharedResizeObserver';
export {isRenderable} from './isRenderable';
export {getInputARIA} from './inputAria';
export type {InputARIA, InputARIAInputGroup} from './inputAria';

export {
  parseHex,
  parseRgb,
  parseColor,
  formatHex,
  formatColor,
  toGLFloats,
} from './color';
export type {RGBA} from './color';

export {devWarn, devError, warnOnce, formatDevMessage} from './devWarning';

export {rtlStyles} from './rtlStyles';

// The shared focus ring, exported for @astryxdesign/lab — same reason
// rtlStyles is: a style that must be identical across packages, not copied.
export {focusOutlineStyles, focusOutlineProps} from './focusOutline.stylex';

export {isImeKeyEvent} from './ime';

// The touch press model's one composable: the shared hover and pressed overlay
// styles, which carry the press's strength, its release and its paint. A local
// pressable spreads the result of the `usePressFeedback` hook on the element
// that paints and composes one of these on it; the controller, its attributes
// and its clocks are internals.
export {interactionOverlayStyles} from './interactionOverlay.stylex';
