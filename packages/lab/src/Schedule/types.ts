// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file types.ts
 * @input Public Schedule API concepts
 * @output Event, view, date, loader, and context types for Schedule
 * @position Public type surface; consumed by Schedule implementation and exports
 */

import type {ReactNode} from 'react';
import type {PlainDate} from '@astryxdesign/core/utils';
import type {CalendarEvent} from './CalendarEvent';
import type {ZonedDateTime, ZonedDateTimeRange} from './zonedDateTime';

export type {PlainDate} from '@astryxdesign/core/utils';
export type {
  CalendarDayEvent,
  CalendarEvent,
  CalendarEventBase,
  CalendarInstantEvent,
  ScheduleCategory,
  ScheduleEventColor,
} from './CalendarEvent';
export type {ZonedDateTime, ZonedDateTimeRange} from './zonedDateTime';

/** Unix epoch milliseconds. */
export type Instant = number;

export type ScheduleEventSource =
  | ReadonlyArray<CalendarEvent>
  | ((start: Instant, end: Instant) => Promise<ReadonlyArray<CalendarEvent>>);

export type ScheduleDate = Instant;

export interface ScheduleRange {
  startDate: PlainDate;
  endDate: PlainDate;
  start: Instant;
  end: Instant;
}

export type ScheduleViewOptions = object;

/**
 * Options the week and day views share: they paint the same time grid of
 * timed blocks and all-day pills, so they take the same hour window and the
 * same event popover.
 */
export interface ScheduleTimeGridViewOptions {
  /** First hour drawn, 0–23. @default 0 */
  minHour?: number;
  /** Hour the grid ends at, 1–24, kept above `minHour`. @default 24 */
  maxHour?: number;
  /** Height of one hour in pixels. @default 100 */
  hourHeight?: number;
  /**
   * Content of the popover the view opens from an event. The view renders
   * each event with content as a native button and owns the popover it
   * opens: one popover for the grid, named by the event's title, with the
   * system's standard surface, padding, dismissal, and focus return. Called
   * during render for every painted event block, so keep it pure and cheap,
   * like a table cell renderer. Return `null` for an event that has nothing
   * to open: that block stays read-only. When the option is absent the whole
   * grid is read-only.
   */
  renderPopover?: (event: CalendarEvent) => ReactNode;
}

export interface ScheduleViewComponentProps<
  Options extends ScheduleViewOptions = ScheduleViewOptions,
> {
  options: Options;
}

export interface ScheduleNavigationRange {
  label: string;
  range: ZonedDateTimeRange;
}

export type ScheduleViewComponent<
  Options extends ScheduleViewOptions = ScheduleViewOptions,
> = (props: ScheduleViewComponentProps<Options>) => ReactNode;

export interface ScheduleViewBase {
  getDateRange: (date: ZonedDateTime) => ZonedDateTimeRange;
  getPreviousDateRange: (date: ZonedDateTime) => ScheduleNavigationRange;
  getNextDateRange: (date: ZonedDateTime) => ScheduleNavigationRange;
}

export interface ScheduleView<
  Options extends ScheduleViewOptions = ScheduleViewOptions,
> extends ScheduleViewBase {
  component: ScheduleViewComponent<Options>;
  options: Options;
}

export interface ScheduleHeaderContent {
  startContent: ReactNode;
  centerContent: ReactNode;
  endContent: ReactNode;
}

export type SchedulePluginPosition = 'start' | 'end';

export interface SchedulePlugin {
  renderHeader?: (
    startContent: ReactNode,
    centerContent: ReactNode,
    endContent: ReactNode,
  ) => ScheduleHeaderContent;
}
