// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MonthlyView.tsx
 * @input Schedule context and monthly view options
 * @output Month grid schedule view factory: chips on at most three levels per
 *   week row, each in the cell where it starts; a "+N more" button on a busy
 *   day that opens the view's one popover listing that day's events; and,
 *   with renderPopover, chips and list rows that open an event's content in
 *   that same popover
 * @position Concrete schedule view; exported as createScheduleMonthlyView
 */

import {useRef, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {layerAnimations} from '@astryxdesign/core/Layer';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';
import {
  focusOutlineStyles,
  plainDateAddDays,
  plainDateAddMonths,
  plainDateIsAfter,
  plainDateIsBefore,
  plainDateIsEqual,
  plainDateSetEndOfWeekExclusive,
  plainDateSetFirstOfMonth,
  plainDateSetStartOfWeek,
  plainDateToISO,
  type PlainDate,
} from '@astryxdesign/core/utils';
import {Heading, Text} from '@astryxdesign/core/Text';
import {
  enumerateDates,
  getScheduleRangeFromDates,
  isDayEvent,
} from './dateMath';
import {useScheduleContext} from './context';
import {
  getEventDateSpan,
  layoutMonthEvents,
  MONTH_VISIBLE_LEVELS,
  type MonthChipPlacement,
} from './monthLayout';
import {
  formatDayNumber,
  formatEventAccessibilityLabel,
  formatEventTimeRange,
  formatFullDate,
  formatMonthTitle,
  formatWeekday,
  formatWeekRange,
  getEventCategory,
  isEventInPast,
  ListEventRow,
  MonthEventPill,
  ScheduleFrame,
  ScheduleMonthTitle,
  SchedulePopoverBody,
  styles,
} from './shared';
import {useCurrentTime} from './useCurrentTime';
import {useScheduleViewPopover} from './useScheduleViewPopover';
import {scheduleRangeToZonedDateTimeRange} from './zonedDateTime';
import type {Locale} from '@astryxdesign/core/i18n';
import type {
  CalendarEvent,
  ScheduleCategory,
  ScheduleView,
  ScheduleViewComponentProps,
} from './types';

export interface ScheduleMonthlyViewOptions {
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /**
   * Content of the view-owned event popover. A chip whose content is not
   * null or undefined is a button that opens it; absent, the month is
   * read-only (component:Schedule FR19–FR20).
   */
  renderPopover?: (event: CalendarEvent) => ReactNode;
}

// The view's one popover shows a busy day's list, a chip's event, or an event
// handed over from a day's list. Event ids may contain any character, so the
// id is always the key's last part.
type MonthPopoverKey =
  | {kind: 'day'; dayISO: string}
  | {kind: 'chip'; segment: string; eventID: string}
  | {kind: 'row'; dayISO: string; eventID: string};

function dayKey(dayISO: string): string {
  return `day/${dayISO}`;
}

/** One painted chip: a span cut around a busy day paints as two chips. */
function chipKey(chip: MonthChipPlacement): string {
  return `chip/${chip.week}:${chip.columnStart}/${chip.event.id}`;
}

function rowKey(dayISO: string, eventID: string): string {
  return `row/${dayISO}/${eventID}`;
}

function parseKey(key: string | null): MonthPopoverKey | null {
  if (key == null) {
    return null;
  }
  const kind = key.slice(0, key.indexOf('/'));
  const rest = key.slice(kind.length + 1);
  if (kind === 'day') {
    return {kind, dayISO: rest};
  }
  const second = rest.indexOf('/');
  const head = rest.slice(0, second);
  const eventID = rest.slice(second + 1);
  if (kind === 'chip') {
    return {kind, segment: head, eventID};
  }
  return kind === 'row' ? {kind, dayISO: head, eventID} : null;
}

function ScheduleMonthlyView({
  options,
}: ScheduleViewComponentProps<ScheduleMonthlyViewOptions>) {
  const {renderPopover} = options;
  const hasPopover = renderPopover != null;
  const {
    events,
    categories,
    date,
    focusDate,
    timezoneID,
    locale,
    range,
    isLoading,
    headingLevel,
  } = useScheduleContext();
  const rangeDate = date.toPlainDate();
  const highlightedDate = focusDate.toPlainDate();
  const currentTime = useCurrentTime();
  const days = enumerateDates(range.startDate, range.endDate);
  const weeks = getWeeks(days);
  const layout = layoutMonthEvents(events, days, timezoneID);
  const overflowByDay = new Map(
    layout.overflow.map(day => [day.dayIndex, day.count]),
  );
  const eventsByDay = getMonthEventsByDay(events, days, timezoneID);
  // Every chip that covers each day, in level order: a chip renders in the
  // cell where it starts, and with renderPopover each later day it covers
  // names it as static text (component:Schedule FR19, AR8).
  const chipsByDay = new Map<number, MonthChipPlacement[]>();
  for (const chip of layout.chips) {
    for (let column = chip.columnStart; column <= chip.columnEnd; column += 1) {
      const index = chip.week * 7 + column;
      const cellChips = chipsByDay.get(index) ?? [];
      cellChips.push(chip);
      chipsByDay.set(index, cellChips);
    }
  }
  chipsByDay.forEach(cellChips => cellChips.sort((a, b) => a.level - b.level));
  const eventByID = new Map(events.map(event => [event.id, event]));
  // The view's one popover (component:Schedule FR17, FR20, AR7): a busy
  // day's list named by its full date, or one event's content named by its
  // title.
  const dayByISO = new Map<string, PlainDate>(
    days.map(day => [plainDateToISO(day), day]),
  );
  const monthTitle = formatMonthTitle(rangeDate, timezoneID, locale);
  const tableRef = useRef<HTMLDivElement>(null);
  // Where each chip painted so far starts, so focus can land on that cell if
  // the chip goes away while its popover is open.
  const chipStartDayRef = useRef(new Map<string, string>());
  const chipStartDay = chipStartDayRef.current;
  const focusCell = (dayISO: string | undefined) => {
    if (dayISO != null) {
      tableRef.current
        ?.querySelector<HTMLElement>(`[data-schedule-day="${dayISO}"]`)
        ?.focus();
    }
  };
  const monthPopover = useScheduleViewPopover(
    key => {
      const parsed = parseKey(key);
      if (parsed == null) {
        return monthTitle;
      }
      if (parsed.kind === 'day') {
        const day = dayByISO.get(parsed.dayISO);
        return day == null
          ? monthTitle
          : formatFullDate(day, timezoneID, locale);
      }
      return eventByID.get(parsed.eventID)?.title ?? monthTitle;
    },
    // What opened the popover is gone: focus lands on the day it belonged
    // to, or on the day's "+N more" when an event leaves a day that is
    // still busy.
    key => {
      const parsed = parseKey(key);
      if (parsed == null) {
        return;
      }
      if (parsed.kind === 'chip') {
        focusCell(chipStartDayRef.current.get(key));
        return;
      }
      const more =
        parsed.kind === 'row'
          ? tableRef.current?.querySelector<HTMLElement>(
              `[data-schedule-popover-trigger="${dayKey(parsed.dayISO)}"]`,
            )
          : null;
      if (more != null) {
        more.focus();
        return;
      }
      focusCell(parsed.dayISO);
    },
  );
  const openParsed = parseKey(monthPopover.openKey);
  const openDay =
    openParsed?.kind === 'day' ? dayByISO.get(openParsed.dayISO) : undefined;
  const openEvent =
    openParsed != null && openParsed.kind !== 'day'
      ? eventByID.get(openParsed.eventID)
      : undefined;
  // The popover's content scrolls inside its surface, never the layer
  // (SchedulePopoverBody): a day's list, or one event's content.
  let openContent: ReactNode = null;
  if (openDay != null) {
    const openDayISO = plainDateToISO(openDay);
    openContent = (
      <SchedulePopoverBody
        label={`${formatFullDate(openDay, timezoneID, locale)} events`}>
        <MonthDayEvents
          day={openDay}
          events={eventsByDay.get(openDayISO) ?? EMPTY_EVENTS}
          renderPopover={renderPopover}
          onOpenEvent={event =>
            monthPopover.switchTo(rowKey(openDayISO, event.id))
          }
        />
      </SchedulePopoverBody>
    );
  } else if (openEvent != null) {
    const content = renderPopover?.(openEvent) ?? null;
    openContent =
      content == null ? null : (
        <SchedulePopoverBody label={`${openEvent.title} details`}>
          {content}
        </SchedulePopoverBody>
      );
  }

  return (
    <ScheduleFrame
      title={<ScheduleMonthTitle date={rangeDate} timezoneID={timezoneID} />}
      titleLabel={monthTitle}
      isLoading={isLoading}>
      {/* A table, not an interactive grid (component:Schedule AR7): weekday
          column headers, week row headers, cells named by their full date,
          and no arrow-key promise, so a busy day's "+N more" is an ordinary
          Tab stop. The table scrolls horizontally at narrow viewports and a
          month without a busy day has no focusable descendants, so it is
          focusable itself for keyboard scrolling (axe:
          scrollable-region-focusable). */}
      <div
        ref={tableRef}
        role="table"
        aria-label={monthTitle}
        tabIndex={0}
        {...monthPopover.containerProps}
        {...stylex.props(styles.monthGrid)}>
        <div role="row" {...stylex.props(styles.weekHeader)}>
          <div
            role="columnheader"
            aria-colindex={1}
            {...stylex.props(styles.visuallyHidden)}>
            Week
          </div>
          {days.slice(0, 7).map((day, index) => (
            <div
              key={plainDateToISO(day)}
              role="columnheader"
              aria-label={formatWeekday(day, timezoneID, 'long', locale)}
              aria-colindex={index + 2}
              {...stylex.props(styles.weekdayLabel)}>
              <Heading
                level={headingLevel}
                color="secondary"
                display="block"
                xstyle={styles.weekdayHeading}>
                {formatWeekday(day, timezoneID, 'short', locale)}
              </Heading>
            </div>
          ))}
        </div>
        <div {...stylex.props(styles.monthGridSurface)}>
          <div {...stylex.props(styles.monthCellGrid)}>
            {weeks.map((week, weekIndex) => (
              <div
                key={plainDateToISO(week[0])}
                role="row"
                {...stylex.props(styles.monthGridRow)}>
                <div
                  role="rowheader"
                  aria-colindex={1}
                  {...stylex.props(styles.visuallyHidden)}>
                  {formatWeekRange(
                    week[0],
                    week[week.length - 1],
                    timezoneID,
                    locale,
                  )}
                </div>
                {week.map((day, dayIndex) => {
                  const index = weekIndex * 7 + dayIndex;
                  const isOutsideMonth = day.month !== rangeDate.month;
                  const dayISO = plainDateToISO(day);
                  const dayEvents = eventsByDay.get(dayISO) ?? EMPTY_EVENTS;
                  const hiddenCount = overflowByDay.get(index);
                  return (
                    <div
                      key={plainDateToISO(day)}
                      role="cell"
                      aria-label={formatFullDate(day, timezoneID, locale)}
                      aria-colindex={dayIndex + 2}
                      // Focus lands here when the day's "+N more" goes away.
                      tabIndex={-1}
                      data-schedule-day={dayISO}
                      aria-current={
                        plainDateIsEqual(day, highlightedDate)
                          ? 'date'
                          : undefined
                      }
                      {...stylex.props(
                        styles.monthCell,
                        index % 7 === 6 && styles.monthCellLastColumn,
                        index >= days.length - 7 && styles.monthCellLastRow,
                        isOutsideMonth && styles.monthCellOutside,
                        focusOutlineStyles.focusVisible,
                        styles.monthCellFocus,
                      )}>
                      <div
                        {...stylex.props(
                          styles.monthDayNumber,
                          plainDateIsEqual(day, highlightedDate) &&
                            styles.currentDayPill,
                        )}>
                        <Text
                          type="supporting"
                          color="inherit"
                          weight="medium"
                          hasTabularNumbers>
                          {formatDayNumber(day, timezoneID, locale)}
                        </Text>
                      </div>
                      {(chipsByDay.get(index) ?? EMPTY_CHIPS).map(chip => {
                        const key = chipKey(chip);
                        if (chip.columnStart !== dayIndex) {
                          const startDay =
                            days[chip.week * 7 + chip.columnStart];
                          return hasPopover && startDay != null ? (
                            <span
                              key={key}
                              {...stylex.props(styles.visuallyHidden)}>
                              {formatMonthEventName(
                                chip.event,
                                `since ${formatFullDate(startDay, timezoneID, locale)}`,
                                timezoneID,
                                categories,
                                locale,
                              )}
                            </span>
                          ) : null;
                        }
                        chipStartDay.set(key, dayISO);
                        return (
                          <MonthChip
                            key={key}
                            chip={chip}
                            isLastColumn={dayIndex === 6}
                            popoverKey={key}
                            popover={monthPopover}
                            renderPopover={renderPopover}
                            isPast={isEventInPast(
                              chip.event,
                              currentTime,
                              timezoneID,
                            )}
                          />
                        );
                      })}
                      {/* With renderPopover the chips are the cell's
                          accessible events, so the hidden list would repeat
                          them (component:Schedule FR19). */}
                      {!hasPopover && dayEvents.length > 0 && (
                        <ul {...stylex.props(styles.visuallyHidden)}>
                          {dayEvents.map(event => (
                            <li key={event.id}>
                              {formatEventAccessibilityLabel(
                                event,
                                day,
                                timezoneID,
                                categories,
                                locale,
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {hiddenCount != null && (
                        <button
                          type="button"
                          aria-label={`${hiddenCount} more ${
                            hiddenCount === 1 ? 'event' : 'events'
                          }, ${formatFullDate(day, timezoneID, locale)}`}
                          {...monthPopover.getTriggerProps(
                            dayKey(dayISO),
                            // An event handed over from this day's list
                            // keeps "+N more" as its trigger while the
                            // event is still on this day.
                            openKey => {
                              const parsed = parseKey(openKey);
                              return (
                                parsed?.kind === 'row' &&
                                parsed.dayISO === dayISO &&
                                dayEvents.some(
                                  event => event.id === parsed.eventID,
                                )
                              );
                            },
                          )}
                          {...stylex.props(
                            styles.eventButtonReset,
                            styles.monthMoreButton,
                            styles.monthMoreButtonPosition(
                              MONTH_VISIBLE_LEVELS - 1,
                            ),
                            focusOutlineStyles.focusVisible,
                          )}>
                          {/* Isolated, so the count reads "+3 more" in either
                              direction. */}
                          <bdi>+{hiddenCount} more</bdi>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {monthPopover.popover.render(openContent, {
        placement: 'below',
        alignment: 'start',
        offset: spacingVars['--spacing-1'],
        xstyle: layerAnimations.below,
      })}
    </ScheduleFrame>
  );
}

/**
 * One chip, in the cell where it starts. Read-only it is painted
 * decoration; with renderPopover it is the button that opens its event, or
 * static text when the event has no content (component:Schedule FR19, AR8).
 */
function MonthChip({
  chip,
  isLastColumn,
  popoverKey,
  popover,
  renderPopover,
  isPast,
}: {
  chip: MonthChipPlacement;
  isLastColumn: boolean;
  popoverKey: string;
  popover: ReturnType<typeof useScheduleViewPopover>;
  renderPopover: ScheduleMonthlyViewOptions['renderPopover'];
  isPast: boolean;
}) {
  const {categories, timezoneID, locale} = useScheduleContext();
  const placement = [
    styles.monthChip(chip.columnEnd - chip.columnStart + 1, chip.level),
    isLastColumn && styles.monthChipInLastColumn,
  ];
  const pill = (
    <MonthEventPill
      event={chip.event}
      timezoneID={timezoneID}
      isPast={isPast}
    />
  );
  if (renderPopover == null) {
    return (
      <div aria-hidden data-schedule-month-chip="" {...stylex.props(placement)}>
        {pill}
      </div>
    );
  }
  const name = formatMonthEventName(
    chip.event,
    formatEventDays(chip.event, timezoneID, locale),
    timezoneID,
    categories,
    locale,
  );
  if (renderPopover(chip.event) == null) {
    return (
      <div data-schedule-month-chip="" {...stylex.props(placement)}>
        <span {...stylex.props(styles.visuallyHidden)}>{name}</span>
        <span aria-hidden>{pill}</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-label={name}
      data-schedule-month-chip=""
      {...popover.getTriggerProps(popoverKey)}
      {...stylex.props(
        styles.eventButtonReset,
        placement,
        styles.monthChipFocus,
        focusOutlineStyles.focusVisible,
      )}>
      {pill}
    </button>
  );
}

/**
 * A busy day's list: every event of the day, in start order. With
 * renderPopover, a row whose event has content is a button that hands the
 * event to the view's popover (component:Schedule FR20).
 */
function MonthDayEvents({
  day,
  events,
  renderPopover,
  onOpenEvent,
}: {
  day: PlainDate;
  events: ReadonlyArray<CalendarEvent>;
  renderPopover: ScheduleMonthlyViewOptions['renderPopover'];
  onOpenEvent: (event: CalendarEvent) => void;
}) {
  const {categories, timezoneID, locale} = useScheduleContext();
  const currentTime = useCurrentTime();
  const fullDate = formatFullDate(day, timezoneID, locale);
  return (
    <div {...stylex.props(styles.monthDayEvents)}>
      <Text type="supporting" weight="bold" color="secondary">
        {fullDate}
      </Text>
      <ul {...stylex.props(styles.monthDayEventList)}>
        {events.map(event => {
          const row = (
            <ListEventRow
              event={event}
              timezoneID={timezoneID}
              isPast={isEventInPast(event, currentTime, timezoneID)}
            />
          );
          return (
            <li key={event.id}>
              {renderPopover?.(event) == null ? (
                row
              ) : (
                <button
                  type="button"
                  aria-label={formatMonthEventName(
                    event,
                    fullDate,
                    timezoneID,
                    categories,
                    locale,
                  )}
                  onClick={() => onOpenEvent(event)}
                  {...stylex.props(
                    styles.eventButtonReset,
                    styles.monthDayEventButton,
                    focusOutlineStyles.focusVisible,
                  )}>
                  {row}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * A month event button's name: the title, the time range or "all day", the
 * category, and the day (component:Schedule AR8).
 */
function formatMonthEventName(
  event: CalendarEvent,
  dayLabel: string,
  timezoneID: string,
  categories: ReadonlyArray<ScheduleCategory>,
  locale: Locale,
): string {
  const time = isDayEvent(event)
    ? 'all day'
    : formatEventTimeRange(event, timezoneID, locale);
  return `${event.title}, ${time}, ${getEventCategory(event, categories).label}, ${dayLabel}`;
}

/** The event's day, or its date range when it covers several days. */
function formatEventDays(
  event: CalendarEvent,
  timezoneID: string,
  locale: Locale,
): string {
  const [first, last] = getEventDateSpan(event, timezoneID);
  return plainDateIsEqual(first, last)
    ? formatFullDate(first, timezoneID, locale)
    : formatWeekRange(first, last, timezoneID, locale);
}

function getWeeks(days: ReadonlyArray<PlainDate>): PlainDate[][] {
  const weeks: PlainDate[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }
  return weeks;
}

const EMPTY_EVENTS: ReadonlyArray<CalendarEvent> = [];
const EMPTY_CHIPS: ReadonlyArray<MonthChipPlacement> = [];

function getMonthEventsByDay(
  events: ReadonlyArray<CalendarEvent>,
  days: ReadonlyArray<PlainDate>,
  timezoneID: string,
): Map<string, CalendarEvent[]> {
  const eventsByDay = new Map<string, CalendarEvent[]>();
  days.forEach(day => {
    eventsByDay.set(plainDateToISO(day), []);
  });
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  if (firstDay == null || lastDay == null) {
    return eventsByDay;
  }

  events.forEach(event => {
    const [eventStart, eventEnd] = getEventDateSpan(event, timezoneID);
    if (
      plainDateIsBefore(eventEnd, firstDay) ||
      plainDateIsAfter(eventStart, lastDay)
    ) {
      return;
    }

    let current = plainDateIsBefore(eventStart, firstDay)
      ? firstDay
      : eventStart;
    const visibleEnd = plainDateIsAfter(eventEnd, lastDay) ? lastDay : eventEnd;
    while (!plainDateIsAfter(current, visibleEnd)) {
      eventsByDay.get(plainDateToISO(current))?.push(event);
      current = plainDateAddDays(current, 1);
    }
  });

  return eventsByDay;
}

export function createScheduleMonthlyView({
  weekStartsOn = 0,
  renderPopover,
}: ScheduleMonthlyViewOptions = {}): ScheduleView<ScheduleMonthlyViewOptions> {
  return {
    component: ScheduleMonthlyView,
    options: {weekStartsOn, renderPopover},
    getDateRange: date => {
      const range = getMonthDateRange({
        date: date.toPlainDate(),
        timezoneID: date.timezoneID,
        weekStartsOn,
      });
      return scheduleRangeToZonedDateTimeRange(range, date.timezoneID);
    },
    getPreviousDateRange: date => {
      const range = getMonthDateRange({
        date: plainDateAddMonths(date.toPlainDate(), -1),
        timezoneID: date.timezoneID,
        weekStartsOn,
      });
      return {
        label: 'Previous month',
        range: scheduleRangeToZonedDateTimeRange(range, date.timezoneID),
      };
    },
    getNextDateRange: date => {
      const range = getMonthDateRange({
        date: plainDateAddMonths(date.toPlainDate(), 1),
        timezoneID: date.timezoneID,
        weekStartsOn,
      });
      return {
        label: 'Next month',
        range: scheduleRangeToZonedDateTimeRange(range, date.timezoneID),
      };
    },
  };
}

function getMonthDateRange({
  date,
  timezoneID,
  weekStartsOn,
}: {
  date: PlainDate;
  timezoneID: string;
  weekStartsOn: number;
}) {
  const firstOfMonth = plainDateSetFirstOfMonth(date);
  const nextMonth = plainDateAddMonths(firstOfMonth, 1);
  return getScheduleRangeFromDates({
    startDate: plainDateSetStartOfWeek(firstOfMonth, weekStartsOn),
    endDate: plainDateSetEndOfWeekExclusive(
      plainDateAddDays(nextMonth, -1),
      weekStartsOn,
    ),
    timezoneID,
  });
}
