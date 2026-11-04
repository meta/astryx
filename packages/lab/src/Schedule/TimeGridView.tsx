// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TimeGridView.tsx
 * @input Schedule context, visible days, timezone, hour bounds, and the range label
 * @output Shared weekly/day time-grid layout: one scroll viewport whose sticky
 *   day header, all-day row, and hour gutter share the day columns' grid tracks
 * @position Internal view primitive shared by WeeklyView and DayView
 */

import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type UIEvent,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {Locale} from '@astryxdesign/core/i18n';
import {layerAnimations} from '@astryxdesign/core/Layer';
import {usePopover} from '@astryxdesign/core/Popover';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';
import {
  focusOutlineStyles,
  plainDateAddDays,
  plainDateFromInstant,
  plainDateIsAfter,
  plainDateIsBefore,
  plainDateIsEqual,
  plainDateToInstant,
  plainDateToISO,
  type PlainDate,
} from '@astryxdesign/core/utils';
import {useScrollableArea} from '@astryxdesign/core/hooks';
import {Heading, Text} from '@astryxdesign/core/Text';
import {useScheduleContext} from './context';
import {eventOccursOnDate, isAllDaySpan, isDayEvent} from './dateMath';
import {timeGridViewportScope} from './schedule.stylex';
import {
  clamp,
  EventPill,
  eventPastSurfaceColorStyle,
  eventSurfaceColorStyle,
  formatDayNumber,
  formatEventDateTimeRange,
  formatEventTime,
  formatEventTimeRange,
  formatFullDate,
  formatHour,
  formatTimezoneAbbreviation,
  formatWeekday,
  getEventCategory,
  getMinutesSinceStartOfDay,
  isEventInPast,
  SchedulePopoverBody,
  ScheduleTime,
  styles,
  TitleFirstPill,
} from './shared';
import {layoutTimedEvents, type TimedEventPlacement} from './timeGridLayout';
import {
  getInitialTimeGridOffset,
  isSameRangeKey,
  TimeGridScrollMemoryContext,
  type TimeGridScrollMemory,
} from './timeGridScrollMemory';
import {useCurrentTime} from './useCurrentTime';
import type {
  CalendarEvent,
  CalendarInstantEvent,
  ScheduleCategory,
} from './types';

export function TimeGridView({
  days,
  events,
  focusDate,
  timezoneID,
  minHour,
  maxHour,
  hourHeight,
  label,
  renderPopover,
}: {
  days: PlainDate[];
  events: ReadonlyArray<CalendarEvent>;
  focusDate: PlainDate;
  timezoneID: string;
  minHour: number;
  maxHour: number;
  hourHeight: number;
  /** Accessible name of the rendered range; names the scroll viewport. */
  label: string;
  /** Content of the view-owned event popover; absent keeps the grid read-only. */
  renderPopover?: (event: CalendarEvent) => ReactNode;
}) {
  const {categories, headingLevel, locale, range} = useScheduleContext();
  const hasPopover = renderPopover != null;
  const normalizedMinHour = Math.max(0, Math.min(23, Math.floor(minHour)));
  const normalizedMaxHour = Math.max(
    normalizedMinHour + 1,
    Math.min(24, Math.floor(maxHour)),
  );
  const hours = Array.from(
    {length: normalizedMaxHour - normalizedMinHour},
    (_, index) => normalizedMinHour + index,
  );
  // Date-only events and timed events of a day or more are spans in the
  // all-day row; every other timed event is a block in its day columns
  // (component:Schedule FR21).
  const allDayEvents = events.filter(isAllDaySpan);
  const allDaySegments = getAllDayEventSegments(allDayEvents, days, timezoneID);
  const allDayLevelCount = allDaySegments.reduce(
    (levelCount, segment) => Math.max(levelCount, segment.level + 1),
    0,
  );
  const instantEvents = events.filter(
    (event): event is CalendarInstantEvent => !isAllDaySpan(event),
  );
  const currentTime = useCurrentTime();
  const currentDate = plainDateFromInstant(currentTime, timezoneID);
  const timezoneLabel = formatTimezoneAbbreviation(
    days[0] ?? focusDate,
    timezoneID,
    locale,
  );

  const {
    getViewportProps,
    getContentProps,
    state: scrollState,
  } = useScrollableArea({
    axis: 'both',
    keyboardAccess: {
      owner: 'viewport',
      label: `${label} time grid`,
      role: 'region',
    },
  });

  // Initial position (component:Schedule FR4–FR6): once per rendered range,
  // the viewport opens one hour above now when the range includes today, or
  // at the top of the hour window. The record is shared with the suspended
  // fallback's viewport, so a late loader restores the person's own offset
  // instead of positioning again; clock ticks, data, theme, and resizes never
  // reach this effect because the key does not change.
  const sharedScrollMemory = useContext(TimeGridScrollMemoryContext);
  const localScrollMemory = useRef<TimeGridScrollMemory>({
    key: null,
    offset: 0,
  });
  const scrollMemory = sharedScrollMemory ?? localScrollMemory;
  const viewportRef = useRef<HTMLDivElement>(null);
  const rangeKey = useMemo(
    () => ({
      start: range.start,
      end: range.end,
      timezoneID,
      minHour: normalizedMinHour,
      maxHour: normalizedMaxHour,
      hourHeight,
    }),
    [
      hourHeight,
      normalizedMaxHour,
      normalizedMinHour,
      range.end,
      range.start,
      timezoneID,
    ],
  );
  const positioning = useRef({
    currentTime,
    days,
    minHour: normalizedMinHour,
    hourHeight,
  });
  positioning.current = {
    currentTime,
    days,
    minHour: normalizedMinHour,
    hourHeight,
  };
  const isBlockScrollable = scrollState.block.isScrollable;
  // The clock is 0 only in the server snapshot; wait for the client's.
  const hasClock = currentTime !== 0;
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport == null || !isBlockScrollable || !hasClock) {
      return;
    }
    const memory = scrollMemory.current;
    if (
      memory != null &&
      memory.key != null &&
      isSameRangeKey(memory.key, rangeKey)
    ) {
      if (Math.abs(viewport.scrollTop - memory.offset) > 1) {
        viewport.scrollTop = memory.offset;
      }
      return;
    }
    const offset = getInitialTimeGridOffset({
      ...positioning.current,
      timezoneID,
      scrollHeight: viewport.scrollHeight,
      clientHeight: viewport.clientHeight,
    });
    viewport.scrollTop = offset;
    if (memory != null) {
      memory.key = rangeKey;
      memory.offset = offset;
    }
  }, [hasClock, isBlockScrollable, rangeKey, scrollMemory, timezoneID]);
  const rememberScroll = (event: UIEvent<HTMLDivElement>) => {
    const memory = scrollMemory.current;
    if (
      memory != null &&
      memory.key != null &&
      isSameRangeKey(memory.key, rangeKey)
    ) {
      memory.offset = event.currentTarget.scrollTop;
    }
  };

  // Event popover (component:Schedule FR11–FR12, DEC-1, DEC-5). The grid
  // owns one popover and remembers which painted block opened it, by event id
  // and day so a multi-day event's blocks open it separately. The popover is
  // the system's standard Popover: dialog named by the event's title, modal,
  // auto-focus, hidden fallback close, Escape and light dismiss, standard
  // surface and padding. Content comes from the caller for the open event
  // only; it re-renders with that event's current object while the event
  // stays in range, and the popover closes when its block is no longer
  // painted.
  const [openBlock, setOpenBlock] = useState<{
    eventID: string;
    dayISO: string;
  } | null>(null);
  const openBlockRef = useRef(openBlock);
  openBlockRef.current = openBlock;
  const openEvent =
    openBlock == null
      ? null
      : (events.find(event => event.id === openBlock.eventID) ?? null);
  const popover = usePopover({
    dialogLabel: openEvent?.title,
    // Popover's own defaults, spelled out where the hook's differ.
    padding: 3,
    surfaceTarget: 'popover',
    onHide: useCallback(() => {
      setOpenBlock(null);
    }, []),
  });
  const popoverRef = useRef(popover);
  popoverRef.current = popover;
  // A pointer press on a block while the popover is open would close it by
  // the browser's light dismiss before the click arrives, and the layer then
  // absorbs a show() from that same press. So the press itself decides: a
  // press on another block closes the popover here, ahead of the browser,
  // and the click that follows opens the pressed block; a press on the open
  // block is remembered so its click ends closed, whichever of the two
  // closed it. A key press starts a new gesture and forgets the press.
  const openBlockAtPressRef = useRef<string | null>(null);
  const handlePointerDownCapture = (
    pointerEvent: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const target = pointerEvent.target as Element | null;
    const pressedKey =
      target
        ?.closest('[data-schedule-event-block]')
        ?.getAttribute('data-schedule-event-block') ?? null;
    const current = openBlockRef.current;
    const currentKey =
      current == null ? null : blockKeyOf(current.eventID, current.dayISO);
    openBlockAtPressRef.current = pressedKey == null ? null : currentKey;
    if (
      pressedKey != null &&
      currentKey != null &&
      pressedKey !== currentKey &&
      popover.isOpen
    ) {
      popover.hide();
    }
  };
  const forgetPress = () => {
    openBlockAtPressRef.current = null;
  };
  const toggleBlock = (
    event: CalendarEvent,
    dayISO: string,
    button: HTMLButtonElement,
  ) => {
    const key = blockKeyOf(event.id, dayISO);
    const openAtPress = openBlockAtPressRef.current;
    openBlockAtPressRef.current = null;
    const current = openBlockRef.current;
    const isCurrent =
      current != null && blockKeyOf(current.eventID, current.dayISO) === key;
    if (openAtPress === key || (isCurrent && popover.isOpen)) {
      if (popover.isOpen) {
        popover.hide();
      }
      return;
    }
    setOpenBlock({eventID: event.id, dayISO});
    popover.triggerRef(button);
    popover.show();
  };
  // Blocks painted this render; the popover may stay open only for one of
  // them.
  const paintedBlockKeys = new Set<string>();
  const openBlockKey =
    openBlock == null ? null : blockKeyOf(openBlock.eventID, openBlock.dayISO);
  let openContent: ReactNode = null;
  useEffect(() => {
    if (openBlockKey != null && !paintedBlockKeys.has(openBlockKey)) {
      popoverRef.current.hide();
      setOpenBlock(null);
    }
  });

  const viewportProps = getViewportProps<HTMLDivElement>({
    ref: viewportRef,
    onScroll: rememberScroll,
    onPointerDownCapture: handlePointerDownCapture,
    onKeyDownCapture: forgetPress,
    ...stylex.props(styles.timeGridViewport, timeGridViewportScope),
  });
  const contentProps = getContentProps<HTMLDivElement>(
    stylex.props(styles.timeGridContent(days.length)),
  );

  // Read-only: everything painted is decoration for sighted users and the
  // hidden grid is what assistive technology reads. With renderPopover the
  // painted events are the accessible representation themselves — buttons
  // that open the popover, or static text for an event without content,
  // grouped by day — so the hidden grid is not rendered twice over. Either
  // way each decorative part is hidden on its own, never the viewport, so
  // the viewport stays a reachable, named keyboard scroll owner.
  return (
    <>
      {!hasPopover && (
        <TimeGridAccessibilityGrid
          allDayEvents={allDayEvents}
          categories={categories}
          days={days}
          events={instantEvents}
          focusDate={focusDate}
          hours={hours}
          locale={locale}
          timezoneID={timezoneID}
          timezoneLabel={timezoneLabel}
        />
      )}
      <div {...stylex.props(styles.timeGridFrame)}>
        <div {...viewportProps}>
          <div {...contentProps}>
            <div aria-hidden {...stylex.props(styles.timeGridCorner)} />
            {days.map((day, index) => (
              <div
                key={plainDateToISO(day)}
                aria-hidden
                {...stylex.props(
                  styles.timeGridHeaderCell,
                  styles.dayColumnPlacement(index),
                  index === days.length - 1 && styles.timeGridHeaderCellLast,
                )}>
                <Heading
                  level={headingLevel}
                  color="secondary"
                  display="block"
                  xstyle={styles.timeGridHeaderHeading}>
                  <span {...stylex.props(styles.timeGridHeaderHeadingContent)}>
                    {formatWeekday(day, timezoneID, 'short', locale)}
                    <span
                      {...stylex.props(
                        styles.timeGridDayNumber,
                        plainDateIsEqual(day, focusDate) &&
                          styles.timeGridCurrentDayPill,
                      )}>
                      {formatDayNumber(day, timezoneID, locale)}
                    </span>
                  </span>
                </Heading>
              </div>
            ))}
            <div aria-hidden {...stylex.props(styles.allDayLabel)}>
              <Text type="supporting" color="secondary" weight="bold">
                {timezoneLabel}
              </Text>
            </div>
            <div
              {...(hasPopover
                ? {role: 'group', 'aria-label': 'All-day events'}
                : {'aria-hidden': true})}
              {...stylex.props(styles.allDayRow(allDayLevelCount))}>
              {days.map((day, index) => (
                <div
                  key={plainDateToISO(day)}
                  aria-hidden
                  {...stylex.props(
                    styles.allDayCell,
                    styles.allDaySubgridPlacement(index),
                    index === days.length - 1 && styles.allDayCellLast,
                  )}
                />
              ))}
              {allDaySegments.map(segment => {
                const day = days[segment.columnStart] ?? focusDate;
                const dayISO = plainDateToISO(day);
                const key = `${segment.event.id}:${segment.columnStart}`;
                const isSegmentPast = isEventInPast(
                  segment.event,
                  currentTime,
                  timezoneID,
                );
                // A timed span of a day or more leads with its title and
                // shows its start and end times when both fit
                // (component:Schedule FR21).
                const pill = isDayEvent(segment.event) ? (
                  <EventPill event={segment.event} isPast={isSegmentPast} />
                ) : (
                  <TitleFirstPill
                    event={segment.event}
                    timeLabel={formatEventTimeRange(
                      segment.event,
                      timezoneID,
                      locale,
                    )}
                    isPast={isSegmentPast}
                  />
                );
                const placement = styles.allDayEventSpan(
                  segment.columnStart,
                  segment.columnEnd,
                  segment.level,
                );
                const content = renderPopover?.(segment.event);
                if (!hasPopover) {
                  return (
                    <div key={key} {...stylex.props(placement)}>
                      {pill}
                    </div>
                  );
                }
                if (content == null) {
                  return (
                    <div
                      key={key}
                      aria-label={formatEventButtonLabel(
                        segment.event,
                        day,
                        timezoneID,
                        categories,
                        locale,
                      )}
                      {...stylex.props(placement)}>
                      {pill}
                    </div>
                  );
                }
                const blockKey = blockKeyOf(segment.event.id, dayISO);
                paintedBlockKeys.add(blockKey);
                const isOpen = popover.isOpen && openBlockKey === blockKey;
                if (isOpen) {
                  openContent = content;
                }
                return (
                  <button
                    key={key}
                    type="button"
                    aria-label={formatEventButtonLabel(
                      segment.event,
                      day,
                      timezoneID,
                      categories,
                      locale,
                    )}
                    aria-haspopup="dialog"
                    aria-expanded={isOpen}
                    aria-controls={popover.id}
                    data-schedule-event-block={blockKey}
                    onClick={domEvent =>
                      toggleBlock(segment.event, dayISO, domEvent.currentTarget)
                    }
                    {...stylex.props(
                      styles.eventButtonReset,
                      placement,
                      styles.eventButtonFocus,
                      focusOutlineStyles.focusVisible,
                    )}>
                    {pill}
                  </button>
                );
              })}
            </div>
            <div aria-hidden {...stylex.props(styles.timeLabels)}>
              {hours.slice(1).map((hour, index) => (
                <div
                  key={hour}
                  {...stylex.props(
                    styles.timeLabel,
                    styles.timeLabelPosition(index + 1, hourHeight),
                  )}>
                  <ScheduleTime>{formatHour(hour, locale)}</ScheduleTime>
                </div>
              ))}
            </div>
            {days.map((day, index) => {
              const currentTimeTop = getCurrentTimeTop({
                currentTime,
                day,
                timezoneID,
                minHour: normalizedMinHour,
                maxHour: normalizedMaxHour,
              });
              return (
                <div
                  key={plainDateToISO(day)}
                  {...(hasPopover
                    ? {
                        role: 'group',
                        'aria-label': formatFullDate(day, timezoneID, locale),
                      }
                    : {'aria-hidden': true})}
                  {...stylex.props(
                    styles.timeColumn,
                    styles.dayColumnPlacement(index),
                    styles.timeColumnRows(hourHeight),
                    index === days.length - 1 && styles.timeColumnLast,
                  )}>
                  {hours.map((hour, hourIndex) => (
                    <div
                      key={hour}
                      aria-hidden
                      {...stylex.props(
                        styles.hourSlot,
                        hourIndex === hours.length - 1 && styles.hourSlotLast,
                      )}
                    />
                  ))}
                  {getTimedEventLayouts({
                    events: instantEvents.filter(event =>
                      eventOccursOnDate(event, day, timezoneID),
                    ),
                    day,
                    timezoneID,
                    minHour: normalizedMinHour,
                    maxHour: normalizedMaxHour,
                  }).map(
                    ({
                      event,
                      height,
                      top,
                      columnStart,
                      columnSpan,
                      columnCount,
                    }) => {
                      const timeLabel = formatEventTime(
                        event,
                        day,
                        timezoneID,
                        locale,
                      );
                      const category = getEventCategory(event, categories);
                      const blockStyles = [
                        styles.timedEvent,
                        styles.timedEventPosition(
                          clamp(top, 0, 100),
                          clamp(height, 4, 100),
                          (columnStart / columnCount) * 100,
                          (columnSpan / columnCount) * 100,
                        ),
                        isEventInPast(event, currentTime, timezoneID)
                          ? eventPastSurfaceColorStyle(category.color)
                          : eventSurfaceColorStyle(category.color),
                      ];
                      const blockContent = (
                        <>
                          <Text
                            type="supporting"
                            color="inherit"
                            weight="bold"
                            xstyle={styles.eventTitle}>
                            {event.title}
                          </Text>
                          <Text
                            type="supporting"
                            color="inherit"
                            xstyle={styles.eventTime}>
                            <ScheduleTime>{timeLabel}</ScheduleTime>
                          </Text>
                        </>
                      );
                      if (!hasPopover) {
                        return (
                          <div key={event.id} {...stylex.props(...blockStyles)}>
                            {blockContent}
                          </div>
                        );
                      }
                      const popoverContent = renderPopover(event);
                      const buttonLabel = formatEventButtonLabel(
                        event,
                        day,
                        timezoneID,
                        categories,
                        locale,
                      );
                      if (popoverContent == null) {
                        return (
                          <div
                            key={event.id}
                            aria-label={buttonLabel}
                            {...stylex.props(...blockStyles)}>
                            {blockContent}
                          </div>
                        );
                      }
                      const dayISO = plainDateToISO(day);
                      const blockKey = blockKeyOf(event.id, dayISO);
                      paintedBlockKeys.add(blockKey);
                      const isOpen =
                        popover.isOpen && openBlockKey === blockKey;
                      if (isOpen) {
                        openContent = popoverContent;
                      }
                      return (
                        <button
                          key={event.id}
                          type="button"
                          aria-label={buttonLabel}
                          aria-haspopup="dialog"
                          aria-expanded={isOpen}
                          aria-controls={popover.id}
                          data-schedule-event-block={blockKey}
                          onClick={domEvent =>
                            toggleBlock(event, dayISO, domEvent.currentTarget)
                          }
                          {...stylex.props(
                            styles.eventButtonReset,
                            ...blockStyles,
                            styles.eventButtonFocus,
                            focusOutlineStyles.focusVisible,
                          )}>
                          {blockContent}
                        </button>
                      );
                    },
                  )}
                  {plainDateIsEqual(day, currentDate) &&
                    currentTimeTop != null && (
                      <div
                        aria-hidden
                        {...stylex.props(
                          styles.currentTimeLine(currentTimeTop),
                        )}
                      />
                    )}
                </div>
              );
            })}
          </div>
        </div>
        <div aria-hidden {...stylex.props(styles.timeGridFocusRing)} />
      </div>
      {hasPopover &&
        popover.render(
          openContent == null || openEvent == null ? null : (
            <SchedulePopoverBody label={`${openEvent.title} details`}>
              {openContent}
            </SchedulePopoverBody>
          ),
          {
            placement: 'below',
            alignment: 'start',
            offset: spacingVars['--spacing-1'],
            xstyle: layerAnimations.below,
          },
        )}
    </>
  );
}

function TimeGridAccessibilityGrid({
  allDayEvents,
  categories,
  days,
  events,
  focusDate,
  hours,
  locale,
  timezoneID,
  timezoneLabel,
}: {
  allDayEvents: ReadonlyArray<CalendarEvent>;
  categories: ReadonlyArray<ScheduleCategory>;
  days: ReadonlyArray<PlainDate>;
  events: ReadonlyArray<CalendarInstantEvent>;
  focusDate: PlainDate;
  hours: ReadonlyArray<number>;
  locale: Locale;
  timezoneID: string;
  timezoneLabel: string;
}) {
  return (
    <div
      role="grid"
      aria-label="Schedule time grid"
      aria-readonly
      {...stylex.props(styles.visuallyHidden)}>
      <div role="row">
        <div role="columnheader" aria-colindex={1}>
          Time
        </div>
        {days.map((day, index) => (
          <div
            key={plainDateToISO(day)}
            role="columnheader"
            aria-colindex={index + 2}
            aria-current={
              plainDateIsEqual(day, focusDate) ? 'date' : undefined
            }>
            {formatFullDate(day, timezoneID, locale)}
          </div>
        ))}
      </div>
      <div role="row">
        <div role="rowheader" aria-colindex={1}>
          {timezoneLabel} all day
        </div>
        {days.map((day, index) => {
          const cellEvents = allDayEvents.filter(event =>
            eventOccursOnDate(event, day, timezoneID),
          );
          return (
            <div
              key={plainDateToISO(day)}
              role="gridcell"
              aria-colindex={index + 2}
              aria-label={formatTimeGridAccessibilityCellLabel({
                categories,
                day,
                events: cellEvents,
                label: `${formatFullDate(day, timezoneID, locale)} all day`,
                locale,
                timezoneID,
              })}
            />
          );
        })}
      </div>
      {hours.map(hour => (
        <div key={hour} role="row">
          <div role="rowheader" aria-colindex={1}>
            {formatHour(hour, locale)}
          </div>
          {days.map((day, index) => {
            const cellEvents = events.filter(event =>
              eventOverlapsHour(event, day, hour, timezoneID),
            );
            return (
              <div
                key={plainDateToISO(day)}
                role="gridcell"
                aria-colindex={index + 2}
                aria-label={formatTimeGridAccessibilityCellLabel({
                  categories,
                  day,
                  events: cellEvents,
                  label: `${formatFullDate(day, timezoneID, locale)} ${formatHour(
                    hour,
                    locale,
                  )}`,
                  locale,
                  timezoneID,
                })}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function formatTimeGridAccessibilityCellLabel({
  categories,
  day,
  events,
  label,
  locale,
  timezoneID,
}: {
  categories: ReadonlyArray<ScheduleCategory>;
  day: PlainDate;
  events: ReadonlyArray<CalendarEvent>;
  label: string;
  locale: Locale;
  timezoneID: string;
}): string {
  if (events.length === 0) {
    return label;
  }
  const eventLabels = events.map(
    event =>
      `${event.title}, ${getEventCategory(event, categories).label}, ${formatTimeGridEventTime(
        event,
        day,
        timezoneID,
        locale,
      )}`,
  );
  return `${label}. ${eventLabels.join('. ')}`;
}

/** One painted block: an event on one day. Ids may contain any character. */
function blockKeyOf(eventID: string, dayISO: string): string {
  return `${dayISO}/${eventID}`;
}

/**
 * A block exposed on its own, rather than inside a dated cell, carries the day
 * in its name. The visible text — title, then time — leads the name, then the
 * category and the full date.
 */
function formatEventButtonLabel(
  event: CalendarEvent,
  day: PlainDate,
  timezoneID: string,
  categories: ReadonlyArray<ScheduleCategory>,
  locale: Locale,
): string {
  const category = getEventCategory(event, categories);
  const timeLabel = formatTimeGridEventTime(event, day, timezoneID, locale);
  return `${event.title}, ${timeLabel}, ${category.label}, ${formatFullDate(
    day,
    timezoneID,
    locale,
  )}`;
}

/**
 * "all day" for a date-only event; the start and end with their dates for a
 * timed span of a day or more, which no single day frames; otherwise the
 * start and end times (component:Schedule AR2).
 */
function formatTimeGridEventTime(
  event: CalendarEvent,
  day: PlainDate,
  timezoneID: string,
  locale: Locale,
): string {
  if (isDayEvent(event)) {
    return 'all day';
  }
  return isAllDaySpan(event)
    ? formatEventDateTimeRange(event, timezoneID, locale)
    : formatEventTime(event, day, timezoneID, locale);
}

function eventOverlapsHour(
  event: CalendarInstantEvent,
  day: PlainDate,
  hour: number,
  timezoneID: string,
): boolean {
  if (!eventOccursOnDate(event, day, timezoneID)) {
    return false;
  }
  const hourStart = plainDateToInstant(day, timezoneID, hour);
  const hourEnd =
    hour === 23
      ? plainDateToInstant(plainDateAddDays(day, 1), timezoneID)
      : plainDateToInstant(day, timezoneID, hour + 1);
  return event.start < hourEnd && event.end > hourStart;
}

interface AllDayEventSegment {
  event: CalendarEvent;
  columnStart: number;
  columnEnd: number;
  level: number;
}

function getAllDayEventSegments(
  events: ReadonlyArray<CalendarEvent>,
  days: ReadonlyArray<PlainDate>,
  timezoneID: string,
): AllDayEventSegment[] {
  const levels: number[] = [];
  return events
    .map(event => {
      // The days the event touches in the schedule's timezone; a timed span
      // ending at midnight does not touch the next day.
      const startIndex = days.findIndex(day =>
        eventOccursOnDate(event, day, timezoneID),
      );
      if (startIndex < 0) {
        return null;
      }
      let endIndex = startIndex;
      while (
        endIndex + 1 < days.length &&
        eventOccursOnDate(event, days[endIndex + 1], timezoneID)
      ) {
        endIndex += 1;
      }
      return {event, startIndex, endIndex};
    })
    .filter(
      (
        segment,
      ): segment is {
        event: CalendarEvent;
        startIndex: number;
        endIndex: number;
      } => segment != null,
    )
    .sort((a, b) => {
      if (a.startIndex !== b.startIndex) {
        return a.startIndex - b.startIndex;
      }
      const aDuration = a.endIndex - a.startIndex;
      const bDuration = b.endIndex - b.startIndex;
      return (
        bDuration - aDuration || a.event.title.localeCompare(b.event.title)
      );
    })
    .map(({event, startIndex, endIndex}) => {
      const level = getAvailableAllDayLevel(levels, startIndex);
      levels[level] = endIndex;
      return {
        event,
        columnStart: startIndex,
        columnEnd: endIndex,
        level,
      };
    });
}

function getAvailableAllDayLevel(
  levels: number[],
  columnStart: number,
): number {
  const level = levels.findIndex(columnEnd => columnStart > columnEnd);
  return level >= 0 ? level : levels.length;
}

function getTimedEventLayouts({
  events,
  day,
  timezoneID,
  minHour,
  maxHour,
}: {
  events: ReadonlyArray<CalendarInstantEvent>;
  day: PlainDate;
  timezoneID: string;
  minHour: number;
  maxHour: number;
}): TimedEventPlacement<CalendarInstantEvent>[] {
  const minMinute = minHour * 60;
  const maxMinute = maxHour * 60;
  const intervals = events.flatMap(event => {
    const startDate = plainDateFromInstant(event.start, timezoneID);
    const rawStart = plainDateIsBefore(startDate, day)
      ? 0
      : getMinutesSinceStartOfDay(event.start, timezoneID);
    // An event that runs to midnight or past it fills the rest of the day;
    // ending exactly at midnight is the bottom of the column, not minute 0.
    const rawEnd = plainDateIsAfter(
      plainDateFromInstant(event.end, timezoneID),
      day,
    )
      ? 24 * 60
      : getMinutesSinceStartOfDay(event.end, timezoneID);
    if (rawEnd <= minMinute || rawStart >= maxMinute) {
      return [];
    }
    const visibleStart = Math.max(rawStart, minMinute);
    // A block is at least fifteen minutes tall so a short event stays legible.
    const visibleEnd = Math.min(maxMinute, Math.max(visibleStart + 15, rawEnd));
    return visibleEnd > visibleStart ? [{event, visibleStart, visibleEnd}] : [];
  });
  return layoutTimedEvents(intervals, minMinute, maxMinute);
}

function getCurrentTimeTop({
  currentTime,
  day,
  timezoneID,
  minHour,
  maxHour,
}: {
  currentTime: number;
  day: PlainDate;
  timezoneID: string;
  minHour: number;
  maxHour: number;
}): number | null {
  const currentDate = plainDateFromInstant(currentTime, timezoneID);
  if (!plainDateIsEqual(day, currentDate)) {
    return null;
  }
  const currentMinute = getMinutesSinceStartOfDay(currentTime, timezoneID);
  const minMinute = minHour * 60;
  const maxMinute = maxHour * 60;
  if (currentMinute < minMinute || currentMinute > maxMinute) {
    return null;
  }
  return ((currentMinute - minMinute) / (maxMinute - minMinute)) * 100;
}
