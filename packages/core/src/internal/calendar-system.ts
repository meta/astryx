// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file calendar-system.ts
 * @input The i18n calendar resolution
 * @output `@astryxdesign/core/internal/calendar-system`: the hook that
 *   resolves the calendar a date component shows, and the helpers that name
 *   its months and days as Core's Calendar does, for Lab components
 * @position An internal entry reserved for Astryx's own packages:
 *   undocumented, outside the public API and its compatibility promise,
 *   versioned in lockstep with Core, and allowed only in Core and Lab by the
 *   `@astryx/no-core-internal-import` lint rule. Named re-exports only.
 *
 * SYNC: When modified, update calendar-system.test.ts and
 * scripts/sync-exports.js.
 */

export {useCalendarSystem} from '../i18n/useCalendarSystem';
export {
  calendarMonthLabelDay,
  calendarMonthOf,
  formatCalendarDate,
  formatCalendarDateToParts,
  formatCalendarInstantRange,
} from '../utils/calendarSystem';
export type {CalendarSystem} from '../utils/calendarSystem';
