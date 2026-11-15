// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Imports calendar components and types
 * @output Exports Calendar and related types
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 *
 * SYNC: When modified, update this header and /packages/core/src/Calendar/Calendar.doc.mjs
 */

export {Calendar} from './Calendar';
export type {
  CalendarProps,
  CalendarHandle,
  ISODateString,
  DayOfWeek,
  DayOfWeekName,
  DateRange,
} from './Calendar';

// Re-export hooks for advanced usage
export {
  useCalendarDays,
  useCalendarConstraints,
  useCalendarNavigation,
} from './hooks';
export type {
  CalendarDay,
  UseCalendarDaysOptions,
  UseCalendarDaysReturn,
  UseCalendarConstraintsOptions,
  UseCalendarConstraintsReturn,
  UseCalendarNavigationOptions,
  UseCalendarNavigationReturn,
} from './hooks';

// Re-export calendar-specific utilities for advanced usage
export {isSameDay, isDateInRange, getWeekNumber} from './utils';

// Re-export theme styles for customization
