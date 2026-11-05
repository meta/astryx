// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Schedule implementation and public schedule types
 * @output Public exports for @astryxdesign/lab Schedule
 * @position Component entry point; re-exported by packages/lab/src/index.ts
 */

export {Schedule, type ScheduleProps} from './Schedule';
export {createEventFromISO} from './CalendarEvent';
export {
  createScheduleMonthlyView,
  type ScheduleMonthlyViewOptions,
} from './MonthlyView';
export {
  createScheduleWeeklyView,
  type ScheduleWeeklyViewOptions,
} from './WeeklyView';
export {createScheduleDayView, type ScheduleDayViewOptions} from './DayView';
export {createScheduleListView, type ScheduleListViewOptions} from './ListView';
export {ScheduleContext, useScheduleContext} from './context';
export {
  defaultSchedulePlugins,
  useSchedulePaginationPlugin,
  useScheduleViewSelectorPlugin,
} from './plugins';
export type {ScheduleContextValue} from './context';
export type {SchedulePaginationPluginOptions} from './plugins/PaginationPlugin';
export type {
  ScheduleViewSelectorOption,
  ScheduleViewSelectorPluginOptions,
} from './plugins/ViewSelectorPlugin';

export type {
  CalendarDayEvent,
  CalendarEvent,
  CalendarEventBase,
  CalendarInstantEvent,
  Instant,
  PlainDate,
  ScheduleRange,
  ZonedDateTime,
  ZonedDateTimeRange,
  ScheduleCategory,
  ScheduleDate,
  ScheduleEventColor,
  ScheduleEventSource,
  ScheduleHeaderContent,
  SchedulePlugin,
  SchedulePluginPosition,
  ScheduleTimeGridViewOptions,
  ScheduleView,
  ScheduleViewBase,
  ScheduleViewOptions,
} from './types';
