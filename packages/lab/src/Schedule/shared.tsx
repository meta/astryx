// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file shared.tsx
 * @input Schedule events, dates, timezone IDs, provider locale, and display metadata
 * @output Shared rendering primitives, formatters, and styles for schedule views
 * @position Internal view utility module; consumed by Monthly, Weekly, Day, and List views
 */

import {type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {useScrollableArea} from '@astryxdesign/core/hooks';
import {getLocaleDirection, type Locale} from '@astryxdesign/core/i18n';
import {
  borderVars,
  colorVars,
  focusVars,
  fontWeightVars,
  radiusVars,
  spacingVars,
  typographyVars,
  typeScaleVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {Spinner} from '@astryxdesign/core/Spinner';
import {HStack} from '@astryxdesign/core/Stack';
import {Heading, Text} from '@astryxdesign/core/Text';
import {
  plainDateFromInstant,
  plainDateIsBefore,
  plainDateToInstant,
  type PlainDate,
} from '@astryxdesign/core/utils';
import {isDayEvent} from './dateMath';
import {useScheduleContext} from './context';
import {timeGridViewportScope} from './schedule.stylex';
import type {
  CalendarEvent,
  CalendarInstantEvent,
  Instant,
  ScheduleCategory,
  ScheduleHeaderContent,
  ScheduleEventColor,
} from './types';

const DEFAULT_EVENT_CATEGORY: ScheduleCategory = {
  label: 'Event',
  color: 'blue',
};

// Month week rows are 128px. A chip level starts below the day number and the
// next one a chip's height plus a gap further down, so three levels fit in a
// row in every shipped theme.
const MONTH_CHIP_TOP = 30;
const MONTH_LEVEL_PITCH = 29;

export function ScheduleFrame({
  title,
  titleLabel,
  isLoading,
  children,
}: {
  title: ReactNode;
  titleLabel: string;
  isLoading: boolean;
  children: ReactNode;
}) {
  const {plugins} = useScheduleContext();
  const initialHeader: ScheduleHeaderContent = {
    startContent: null,
    centerContent: (
      <span {...stylex.props(styles.headerTitleContent)}>
        <Heading level={2}>{title}</Heading>
        <span
          {...stylex.props(
            styles.loadingSpinner,
            !isLoading && styles.loadingSpinnerHidden,
          )}>
          <Spinner size="md" aria-label="Loading events" />
        </span>
      </span>
    ),
    endContent: null,
  };
  const header = plugins.reduce(
    (content, plugin) =>
      plugin.renderHeader?.(
        content.startContent,
        content.centerContent,
        content.endContent,
      ) ?? content,
    initialHeader,
  );

  return (
    <section {...stylex.props(styles.frame)} aria-label={titleLabel}>
      <div {...stylex.props(styles.header)}>
        <HStack gap={8} align="center" xstyle={styles.headerControls}>
          {header.startContent}
        </HStack>
        <HStack gap={8} align="center" xstyle={styles.headerTitle}>
          {header.centerContent}
        </HStack>
        <HStack
          gap={8}
          align="center"
          justify="end"
          xstyle={styles.headerStatus}>
          {header.endContent}
        </HStack>
      </div>
      {children}
    </section>
  );
}

export function ScheduleMonthTitle({
  date,
  timezoneID,
}: {
  date: PlainDate;
  timezoneID: string;
}) {
  const {locale} = useScheduleContext();
  return (
    <LocalizedMonthTitle date={date} timezoneID={timezoneID} locale={locale} />
  );
}

function LocalizedMonthTitle({
  date,
  timezoneID,
  locale,
}: {
  date: PlainDate;
  timezoneID: string;
  locale: Locale;
}) {
  const parts = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: timezoneID,
    calendar: 'gregory',
  }).formatToParts(new Date(plainDateToInstant(date, timezoneID, 12)));

  return parts.map((part, index) =>
    part.type === 'month' ? (
      <span key={index} {...stylex.props(styles.titleEmphasis)}>
        {part.value}
      </span>
    ) : (
      part.value
    ),
  );
}

export function ScheduleRangeMonthTitle({
  start,
  end,
  timezoneID,
}: {
  start: PlainDate;
  end: PlainDate;
  timezoneID: string;
}) {
  const {locale} = useScheduleContext();
  if (start.year === end.year && start.month === end.month) {
    return <ScheduleMonthTitle date={start} timezoneID={timezoneID} />;
  }

  const startMonth = formatWithPlainDate(
    start,
    timezoneID,
    {month: 'long'},
    locale,
  );
  const endMonthTitle = (
    <LocalizedMonthTitle date={end} timezoneID={timezoneID} locale={locale} />
  );
  return start.year === end.year ? (
    <>
      <span {...stylex.props(styles.titleEmphasis)}>{startMonth}</span> -{' '}
      {endMonthTitle}
    </>
  ) : (
    <>
      <LocalizedMonthTitle
        date={start}
        timezoneID={timezoneID}
        locale={locale}
      />{' '}
      - {endMonthTitle}
    </>
  );
}

/**
 * A painted time or time range, isolated in the locale's direction: it lays
 * out as one unit whatever the layout direction, so "9:00 AM" never paints as
 * "AM 9:00" and a right-to-left locale's range still reads start first.
 */
export function ScheduleTime({children}: {children: ReactNode}) {
  const {locale} = useScheduleContext();
  return <bdi dir={getLocaleDirection(locale)}>{children}</bdi>;
}

/**
 * The content of a Schedule view's popover. Only the content scrolls, inside
 * the surface: the popover's hidden fallback close sits one pixel below the
 * surface, so a scroller around the whole popover would count that pixel as
 * overflow and paint a scrollbar on content that fits, and would clip the
 * surface's shadow. Taller content scrolls in a named group that joins the
 * tab order only while it overflows, so the keyboard reaches all of it; a
 * group, not a region, so no popover adds a landmark.
 */
export function SchedulePopoverBody({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const {getViewportProps, getContentProps} = useScrollableArea({
    axis: 'block',
    keyboardAccess: {owner: 'viewport', label},
  });
  return (
    <div
      {...getViewportProps<HTMLDivElement>({xstyle: styles.eventPopoverBody})}>
      <div {...getContentProps<HTMLDivElement>()}>{children}</div>
    </div>
  );
}

export function EventPill({
  event,
  day,
  timezoneID,
  isPast = false,
}: {
  event: CalendarEvent;
  day?: PlainDate;
  timezoneID?: string;
  isPast?: boolean;
}) {
  const {categories, locale} = useScheduleContext();
  const category = getEventCategory(event, categories);
  const timeLabel =
    day != null && timezoneID != null && !isDayEvent(event)
      ? formatEventTime(event, day, timezoneID, locale)
      : null;
  return (
    <span
      {...stylex.props(
        styles.eventPill,
        isPast
          ? eventPastSurfaceColorStyle(category.color)
          : eventSurfaceColorStyle(category.color),
      )}>
      {timeLabel != null && (
        <Text type="supporting" color="inherit" xstyle={styles.eventTime}>
          <ScheduleTime>{timeLabel}</ScheduleTime>
        </Text>
      )}
      <Text
        type="supporting"
        color="inherit"
        weight="bold"
        xstyle={styles.eventTitle}>
        {event.title}
      </Text>
    </span>
  );
}

export function MonthEventPill({
  event,
  timezoneID,
  isPast = false,
}: {
  event: CalendarEvent;
  timezoneID: string;
  isPast?: boolean;
}) {
  const {locale} = useScheduleContext();
  // A month chip shows its start time after the title (component:Schedule
  // FR18).
  return (
    <TitleFirstPill
      event={event}
      timeLabel={
        isDayEvent(event)
          ? null
          : formatEventStartTime(event, timezoneID, locale)
      }
      isPast={isPast}
    />
  );
}

/**
 * A pill that leads with the event's title; its time follows on the same
 * line only when the whole title and the time fit, and otherwise the title
 * shows alone, ellipsized.
 */
export function TitleFirstPill({
  event,
  timeLabel,
  isPast = false,
}: {
  event: CalendarEvent;
  timeLabel: string | null;
  isPast?: boolean;
}) {
  const {categories} = useScheduleContext();
  const category = getEventCategory(event, categories);
  return (
    <span
      {...stylex.props(
        styles.eventPill,
        isPast
          ? eventPastSurfaceColorStyle(category.color)
          : eventSurfaceColorStyle(category.color),
      )}>
      <span {...stylex.props(styles.titleFirstLine)}>
        <Text
          type="supporting"
          color="inherit"
          weight="bold"
          xstyle={styles.titleFirstTitle}>
          {event.title}
        </Text>
        {timeLabel != null && (
          <Text
            type="supporting"
            color="inherit"
            xstyle={styles.titleFirstTime}>
            <ScheduleTime>{timeLabel}</ScheduleTime>
          </Text>
        )}
      </span>
    </span>
  );
}

export function ListEventRow({
  event,
  timezoneID,
  isPast = false,
}: {
  event: CalendarEvent;
  timezoneID: string;
  isPast?: boolean;
}) {
  const {categories, locale} = useScheduleContext();
  const category = getEventCategory(event, categories);
  return (
    <div {...stylex.props(styles.listEventRow)}>
      <span
        aria-hidden
        {...stylex.props(
          styles.listEventDot,
          eventDotColorStyle(category.color),
          isPast && styles.listEventDotPast,
        )}
      />
      <span {...stylex.props(styles.listEventTime)}>
        <ScheduleTime>
          {isDayEvent(event)
            ? 'All day'
            : formatEventTimeRange(event, timezoneID, locale)}
        </ScheduleTime>
      </span>
      <span
        {...stylex.props(
          styles.listEventTitle,
          isPast && styles.listEventTitlePast,
        )}>
        {event.title}
      </span>
    </div>
  );
}

export function getEventCategory(
  event: CalendarEvent,
  categories: ReadonlyArray<ScheduleCategory>,
): ScheduleCategory {
  return (
    categories.find(category => category.label === event.category) ??
    (event.category != null
      ? {label: event.category, color: DEFAULT_EVENT_CATEGORY.color}
      : DEFAULT_EVENT_CATEGORY)
  );
}

export function eventDotColorStyle(color: ScheduleEventColor | undefined) {
  switch (color) {
    case 'cyan':
      return styles.eventDotCyan;
    case 'gray':
      return styles.eventDotGray;
    case 'green':
      return styles.eventDotGreen;
    case 'orange':
      return styles.eventDotOrange;
    case 'pink':
      return styles.eventDotPink;
    case 'purple':
      return styles.eventDotPurple;
    case 'red':
      return styles.eventDotRed;
    case 'teal':
      return styles.eventDotTeal;
    case 'yellow':
      return styles.eventDotYellow;
    case 'blue':
    default:
      return styles.eventDotBlue;
  }
}

export function eventSurfaceColorStyle(color: ScheduleEventColor | undefined) {
  switch (color) {
    case 'cyan':
      return styles.eventSurfaceCyan;
    case 'gray':
      return styles.eventSurfaceGray;
    case 'green':
      return styles.eventSurfaceGreen;
    case 'orange':
      return styles.eventSurfaceOrange;
    case 'pink':
      return styles.eventSurfacePink;
    case 'purple':
      return styles.eventSurfacePurple;
    case 'red':
      return styles.eventSurfaceRed;
    case 'teal':
      return styles.eventSurfaceTeal;
    case 'yellow':
      return styles.eventSurfaceYellow;
    case 'blue':
    default:
      return styles.eventSurfaceBlue;
  }
}

export function eventPastSurfaceColorStyle(
  color: ScheduleEventColor | undefined,
) {
  switch (color) {
    case 'cyan':
      return styles.eventPastSurfaceCyan;
    case 'gray':
      return styles.eventPastSurfaceGray;
    case 'green':
      return styles.eventPastSurfaceGreen;
    case 'orange':
      return styles.eventPastSurfaceOrange;
    case 'pink':
      return styles.eventPastSurfacePink;
    case 'purple':
      return styles.eventPastSurfacePurple;
    case 'red':
      return styles.eventPastSurfaceRed;
    case 'teal':
      return styles.eventPastSurfaceTeal;
    case 'yellow':
      return styles.eventPastSurfaceYellow;
    case 'blue':
    default:
      return styles.eventPastSurfaceBlue;
  }
}

export function formatWithPlainDate(
  date: PlainDate,
  timezoneID: string,
  options: Intl.DateTimeFormatOptions,
  locale: Locale,
): string {
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: timezoneID,
    calendar: 'gregory',
  }).format(new Date(plainDateToInstant(date, timezoneID, 12)));
}

export function formatMonthTitle(
  date: PlainDate,
  timezoneID: string,
  locale: Locale,
): string {
  return formatWithPlainDate(
    date,
    timezoneID,
    {
      month: 'long',
      year: 'numeric',
    },
    locale,
  );
}

export function formatWeekTitle(
  start: PlainDate,
  end: PlainDate,
  timezoneID: string,
  locale: Locale,
): string {
  if (start.year === end.year && start.month === end.month) {
    return formatMonthTitle(start, timezoneID, locale);
  }
  const startMonth = formatWithPlainDate(
    start,
    timezoneID,
    {month: 'long'},
    locale,
  );
  const endMonthTitle = formatMonthTitle(end, timezoneID, locale);
  return start.year === end.year
    ? `${startMonth} - ${endMonthTitle}`
    : `${formatMonthTitle(start, timezoneID, locale)} - ${endMonthTitle}`;
}

export function formatFullDate(
  date: PlainDate,
  timezoneID: string,
  locale: Locale,
): string {
  return formatWithPlainDate(
    date,
    timezoneID,
    {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    },
    locale,
  );
}

/** A week row's dates, such as "May 10 – 16, 2026", for its row header. */
export function formatWeekRange(
  start: PlainDate,
  end: PlainDate,
  timezoneID: string,
  locale: Locale,
): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezoneID,
    calendar: 'gregory',
  }).formatRange(
    new Date(plainDateToInstant(start, timezoneID, 12)),
    new Date(plainDateToInstant(end, timezoneID, 12)),
  );
}

export function formatWeekday(
  date: PlainDate,
  timezoneID: string,
  weekday: 'short' | 'long',
  locale: Locale,
): string {
  return formatWithPlainDate(date, timezoneID, {weekday}, locale);
}

export function formatDayNumber(
  date: PlainDate,
  timezoneID: string,
  locale: Locale,
): string {
  return formatWithPlainDate(date, timezoneID, {day: 'numeric'}, locale);
}

export function formatHour(hour: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2026, 0, 1, hour)));
}

export function formatTimezoneAbbreviation(
  date: PlainDate,
  timezoneID: string,
  locale: Locale,
): string {
  const part = new Intl.DateTimeFormat(locale, {
    timeZone: timezoneID,
    timeZoneName: 'short',
  })
    .formatToParts(new Date(plainDateToInstant(date, timezoneID, 12)))
    .find(({type}) => type === 'timeZoneName');
  return part?.value ?? timezoneID;
}

export function formatEventTime(
  event: CalendarInstantEvent,
  day: PlainDate,
  timezoneID: string,
  locale: Locale,
): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezoneID,
  });
  return `${formatter.format(new Date(event.start))} - ${formatter.format(
    new Date(event.end),
  )}`;
}

export function formatEventTimeRange(
  event: CalendarInstantEvent,
  timezoneID: string,
  locale: Locale,
): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezoneID,
  });
  return `${formatter.format(new Date(event.start))} - ${formatter.format(
    new Date(event.end),
  )}`;
}

/**
 * An event's start and end with their dates, such as "May 11 at 9:00 AM – May
 * 13 at 9:00 AM" in en-US, for a timed span of a day or more
 * (component:Schedule AR2).
 */
export function formatEventDateTimeRange(
  event: CalendarInstantEvent,
  timezoneID: string,
  locale: Locale,
): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezoneID,
  }).formatRange(new Date(event.start), new Date(event.end));
}

export function formatEventStartTime(
  event: CalendarInstantEvent,
  timezoneID: string,
  locale: Locale,
): string {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezoneID,
  }).format(new Date(event.start));
}

export function formatEventAccessibilityLabel(
  event: CalendarEvent,
  day: PlainDate,
  timezoneID: string,
  categories: ReadonlyArray<ScheduleCategory>,
  locale: Locale,
): string {
  const category = getEventCategory(event, categories);
  const timeLabel = isDayEvent(event)
    ? 'all day'
    : formatEventTime(event, day, timezoneID, locale);
  return `${event.title}, ${category.label}, ${timeLabel}`;
}

export function getMinutesSinceStartOfDay(
  instant: number,
  timezoneID: string,
): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezoneID,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const lookup = Object.fromEntries(
    parts
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)]),
  );
  return lookup.hour * 60 + lookup.minute;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isEventInPast(
  event: CalendarEvent,
  currentTime: Instant,
  timezoneID: string,
): boolean {
  if (isDayEvent(event)) {
    return plainDateIsBefore(
      event.end,
      plainDateFromInstant(currentTime, timezoneID),
    );
  }
  return event.end <= currentTime;
}

const baseText = {
  fontFamily: typographyVars['--font-family-body'],
  color: colorVars['--color-text-primary'],
};

export const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: 0,
  },
  frame: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: 0,
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-container'],
    backgroundColor: colorVars['--color-background-card'],
    overflow: 'hidden',
  },
  header: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
    alignItems: 'center',
    gap: spacingVars['--spacing-3'],
    paddingBlock: spacingVars['--spacing-3'],
    paddingInline: spacingVars['--spacing-4'],
    borderBottomWidth: borderVars['--border-width'],
    borderBottomStyle: 'solid',
    borderBottomColor: colorVars['--color-border'],
  },
  headerControls: {
    justifySelf: 'start',
  },
  headerTitle: {
    justifySelf: 'center',
    textAlign: 'center',
    minWidth: 0,
  },
  headerTitleContent: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
  },
  loadingSpinner: {
    display: 'inline-flex',
  },
  loadingSpinnerHidden: {
    visibility: 'hidden',
  },
  headerStatus: {
    justifySelf: 'end',
    minWidth: 0,
  },
  titleEmphasis: {
    fontWeight: fontWeightVars['--font-weight-bold'],
  },
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  weekHeader: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
    borderBottomWidth: borderVars['--border-width'],
    borderBottomStyle: 'solid',
    borderBottomColor: colorVars['--color-border'],
  },
  weekdayLabel: {
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-3'],
    textAlign: 'center',
  },
  weekdayHeading: {
    textAlign: 'center',
  },
  monthGrid: {
    overflowX: 'auto',
  },
  // The month surface isolates its paint order: chips rise above the cells
  // and a focused "+N more" above the chips, and nothing outside the surface
  // can see either value.
  monthGridSurface: {
    position: 'relative',
    width: '100%',
    minWidth: '784px',
    isolation: 'isolate',
  },
  monthCellGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
    gridAutoRows: '128px',
  },
  monthGridRow: {
    display: 'contents',
  },
  monthCell: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-1'],
    minWidth: 0,
    padding: 0,
    borderInlineEndWidth: borderVars['--border-width'],
    borderInlineEndStyle: 'solid',
    borderInlineEndColor: colorVars['--color-border'],
    borderBlockEndWidth: borderVars['--border-width'],
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: colorVars['--color-border'],
    backgroundColor: colorVars['--color-background-card'],
  },
  // A day cell takes focus only when its "+N more" goes away while its
  // popover is open. The shared ring sits inset, so the table's scroll edge
  // never clips it, and the cell stays under the chips it holds.
  monthCellFocus: {
    outlineOffset: {
      default: null,
      ':focus-visible': `calc(-1 * ${focusVars['--focus-outline-width']})`,
    },
  },
  monthCellLastColumn: {
    borderInlineEndWidth: 0,
  },
  monthCellLastRow: {
    borderBlockEndWidth: 0,
  },
  monthCellOutside: {
    backgroundColor: colorVars['--color-background-muted'],
  },
  monthDayNumber: {
    alignSelf: 'flex-start',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '24px',
    height: '24px',
    margin: spacingVars['--spacing-0-5'],
    paddingInlineStart: spacingVars['--spacing-1'],
    paddingInlineEnd: 0,
    borderRadius: radiusVars['--radius-full'],
    color: colorVars['--color-text-secondary'],
  },
  currentDayPill: {
    color: colorVars['--color-on-accent'],
    backgroundColor: colorVars['--color-accent'],
  },
  monthEventStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-0-5'],
    minWidth: 0,
  },
  // A chip lives in the cell of its first day in the week and paints across
  // its days from there, on its level: it starts a chip inset into that cell
  // and ends a chip inset plus one border short of its last day's edge, so
  // it clears each day's end border the way the cells do. It rises above the
  // cells it crosses inside the isolated surface (component:Schedule FR15,
  // FR19).
  monthChip: (span: number, level: number) => ({
    position: 'absolute',
    insetInlineStart: spacingVars['--spacing-0-5'],
    insetBlockStart: `${MONTH_CHIP_TOP + level * MONTH_LEVEL_PITCH}px`,
    inlineSize: `calc(${span} * 100% + ${span - 1} * ${borderVars['--border-width']} - 2 * ${spacingVars['--spacing-0-5']})`,
    minWidth: 0,
    zIndex: 1,
  }),
  // The last column's cell has no end border, so the same chip is one border
  // narrower than its padding box.
  monthChipInLastColumn: {
    inlineSize: `calc(100% - 2 * ${spacingVars['--spacing-0-5']} - ${borderVars['--border-width']})`,
  },
  // A chip button stays above the cells it crosses, like any chip, and a
  // focused one keeps its whole ring above the chips around it.
  monthChipFocus: {
    zIndex: {
      default: 1,
      ':focus-visible': 2,
    },
  },
  // A busy day's "+N more" takes the slot of the level it stands in for, with
  // a chip's insets and height, and keeps its focus ring above the chips.
  monthMoreButton: {
    position: 'absolute',
    insetInlineStart: spacingVars['--spacing-0-5'],
    insetInlineEnd: `calc(${spacingVars['--spacing-0-5']} + ${borderVars['--border-width']})`,
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    overflow: 'hidden',
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: radiusVars['--radius-inner'],
    paddingBlock: spacingVars['--spacing-0-5'],
    paddingInline: spacingVars['--spacing-1-5'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    color: colorVars['--color-text-secondary'],
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    backgroundColor: {
      default: 'transparent',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        default: null,
        '@media (hover: hover)': colorVars['--color-overlay-hover'],
      },
    },
    zIndex: {
      default: null,
      ':focus-visible': 2,
    },
  },
  monthMoreButtonPosition: (level: number) => ({
    insetBlockStart: `${MONTH_CHIP_TOP + level * MONTH_LEVEL_PITCH}px`,
  }),
  // The day popover lists rows that ellipsize their titles, so its content
  // has a cap for the titles to fit within.
  monthDayEvents: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-2'],
    maxInlineSize: '360px',
  },
  // A row of a day's list that opens its event: the whole row is the
  // button, with the list row's look and the shared focus ring.
  monthDayEventButton: {
    inlineSize: '100%',
    borderRadius: radiusVars['--radius-inner'],
    backgroundColor: {
      default: 'transparent',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        default: null,
        '@media (hover: hover)': colorVars['--color-overlay-hover'],
      },
    },
  },
  monthDayEventList: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-2'],
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  eventPill: {
    ...baseText,
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    minWidth: 0,
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderRadius: radiusVars['--radius-inner'],
    paddingBlock: spacingVars['--spacing-0-5'],
    paddingInline: spacingVars['--spacing-1-5'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontWeight: fontWeightVars['--font-weight-medium'],
  },
  eventTitle: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  eventTime: {
    display: {
      default: 'block',
      '@container (max-width: 72px)': 'none',
    },
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    opacity: 0.8,
  },
  // A chip that leads with its title is one line tall. Its title and time
  // wrap as a flex row, so the time drops to a second, clipped line whenever
  // the whole title and the time do not fit side by side: layout, not
  // script, decides whether the time shows (component:Schedule FR18, PR5).
  titleFirstLine: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: spacingVars['--spacing-1'],
    flexGrow: 1,
    minWidth: 0,
    blockSize: `calc(${typeScaleVars['--text-supporting-size']} * ${typeScaleVars['--text-supporting-leading']})`,
    overflow: 'hidden',
  },
  // Alone on the line, a long title shrinks and ellipsizes.
  titleFirstTitle: {
    minWidth: 0,
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  titleFirstTime: {
    flexShrink: 0,
    whiteSpace: 'nowrap',
    opacity: 0.8,
  },
  moreEvents: {
    ...baseText,
    color: colorVars['--color-text-secondary'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
  },
  // The time grid is one scroll viewport. Its day header, all-day row, hour
  // gutter, and day columns are items of a single grid inside it, pinned with
  // position: sticky, so a scrollbar, a zoom level, or an inline scroll cannot
  // separate header tracks from body tracks. Local z-index values order the
  // pinned parts inside the isolated viewport only.
  // A 640px flex basis, not a height: inside the frame's indefinite-height
  // column a `height` with `flex: 1` resolves to content size, so the grid
  // would grow to its full hours and the page, not the viewport, would scroll.
  // The basis gives a 640px scrolling viewport by default and still fills or
  // shrinks to a root the caller sizes.
  timeGridFrame: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '640px',
    minHeight: 0,
    minWidth: 0,
  },
  // The viewport paints no focus outline of its own: the frame clips outside
  // its border box, and an inset outline is painted under the viewport's
  // pinned header and gutter. The ring is the overlay below instead.
  timeGridViewport: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 0,
    minWidth: 0,
    scrollbarGutter: 'stable',
    isolation: 'isolate',
    outlineStyle: 'none',
  },
  // The keyboard focus ring of the viewport: a pointer-transparent overlay
  // laid over the whole viewport (scrollbar included) and painted after the
  // viewport's stacking context, so every edge of the ring is visible above
  // the pinned parts. It shows while the viewport before it has keyboard
  // focus, drawn just inside the edge the frame clips at.
  timeGridFocusRing: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    outlineWidth: {
      default: 0,
      [stylex.when.siblingBefore(':focus-visible', timeGridViewportScope)]:
        focusVars['--focus-outline-width'],
    },
    outlineStyle: {
      default: 'none',
      [stylex.when.siblingBefore(':focus-visible', timeGridViewportScope)]:
        focusVars['--focus-outline-style'],
    },
    outlineColor: {
      default: 'transparent',
      [stylex.when.siblingBefore(':focus-visible', timeGridViewportScope)]:
        focusVars['--focus-outline-color'],
    },
    outlineOffset: `calc(-1 * ${focusVars['--focus-outline-width']})`,
  },
  // The minimum width keeps the grid box as wide as its tracks when the
  // viewport is narrower, so the pinned gutter has the whole scrolled extent as
  // its sticky containing block instead of only the first viewport width.
  timeGridContent: (columnCount: number) => ({
    display: 'grid',
    gridTemplateColumns: `60px repeat(${Math.max(1, columnCount)}, minmax(140px, 1fr))`,
    gridTemplateRows: '56px auto auto',
    minWidth: `${60 + Math.max(1, columnCount) * 140}px`,
  }),
  dayColumnPlacement: (index: number) => ({
    gridColumn: `${index + 2}`,
  }),
  timeGridCorner: {
    gridColumn: 1,
    gridRow: 1,
    position: 'sticky',
    insetBlockStart: 0,
    insetInlineStart: 0,
    zIndex: 3,
    backgroundColor: colorVars['--color-background-card'],
    borderInlineEndWidth: borderVars['--border-width'],
    borderInlineEndStyle: 'solid',
    borderInlineEndColor: colorVars['--color-border'],
    borderBottomWidth: borderVars['--border-width'],
    borderBottomStyle: 'solid',
    borderBottomColor: colorVars['--color-border'],
  },
  timeGridHeaderCell: {
    gridRow: 1,
    position: 'sticky',
    insetBlockStart: 0,
    zIndex: 2,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingVars['--spacing-0-5'],
    minWidth: 0,
    backgroundColor: colorVars['--color-background-card'],
    borderInlineEndWidth: borderVars['--border-width'],
    borderInlineEndStyle: 'solid',
    borderInlineEndColor: colorVars['--color-border'],
    borderBottomWidth: borderVars['--border-width'],
    borderBottomStyle: 'solid',
    borderBottomColor: colorVars['--color-border'],
  },
  timeGridHeaderCellLast: {
    borderInlineEndWidth: 0,
  },
  timeGridHeaderHeading: {
    textAlign: 'center',
  },
  timeGridHeaderHeadingContent: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingVars['--spacing-1'],
  },
  timeGridDayNumber: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radiusVars['--radius-full'],
  },
  timeGridCurrentDayPill: {
    minWidth: '30px',
    height: '30px',
    lineHeight: '30px',
    color: colorVars['--color-on-accent'],
    backgroundColor: colorVars['--color-accent'],
  },
  allDayLabel: {
    gridColumn: 1,
    gridRow: 2,
    position: 'sticky',
    insetBlockStart: '56px',
    insetInlineStart: 0,
    zIndex: 3,
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-2'],
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: colorVars['--color-background-card'],
    borderInlineEndWidth: borderVars['--border-width'],
    borderInlineEndStyle: 'solid',
    borderInlineEndColor: colorVars['--color-border'],
    borderBottomWidth: borderVars['--border-width'],
    borderBottomStyle: 'solid',
    borderBottomColor: colorVars['--color-border'],
  },
  // A subgrid, so all-day cells and spans sit on the day columns' own tracks.
  allDayRow: (levelCount: number) => ({
    gridColumn: '2 / -1',
    gridRow: 2,
    display: 'grid',
    gridTemplateColumns: 'subgrid',
    position: 'sticky',
    insetBlockStart: '56px',
    zIndex: 2,
    isolation: 'isolate',
    minHeight: levelCount > 0 ? `${3 + levelCount * 27}px` : '26px',
    minWidth: 0,
    backgroundColor: colorVars['--color-background-card'],
    borderBottomWidth: borderVars['--border-width'],
    borderBottomStyle: 'solid',
    borderBottomColor: colorVars['--color-border'],
  }),
  allDaySubgridPlacement: (index: number) => ({
    gridColumn: `${index + 1}`,
  }),
  allDayCell: {
    gridRow: 1,
    minWidth: 0,
    borderInlineEndWidth: borderVars['--border-width'],
    borderInlineEndStyle: 'solid',
    borderInlineEndColor: colorVars['--color-border'],
  },
  allDayCellLast: {
    borderInlineEndWidth: 0,
  },
  allDayEventSpan: (columnStart: number, columnEnd: number, level: number) => ({
    gridRow: 1,
    gridColumn: `${columnStart + 1} / ${columnEnd + 2}`,
    alignSelf: 'start',
    minWidth: 0,
    marginInlineStart: spacingVars['--spacing-0-5'],
    marginInlineEnd: `calc(${spacingVars['--spacing-0-5']} + ${borderVars['--border-width']})`,
    marginBlockStart: `${2 + level * 27}px`,
  }),
  timeLabels: {
    gridColumn: 1,
    gridRow: 3,
    position: 'sticky',
    insetInlineStart: 0,
    zIndex: 2,
    backgroundColor: colorVars['--color-background-card'],
    borderInlineEndWidth: borderVars['--border-width'],
    borderInlineEndStyle: 'solid',
    borderInlineEndColor: colorVars['--color-border'],
  },
  timeLabel: {
    ...baseText,
    position: 'absolute',
    insetInline: 0,
    transform: 'translateY(-50%)',
    paddingInlineStart: spacingVars['--spacing-1'],
    paddingInlineEnd: spacingVars['--spacing-1'],
    color: colorVars['--color-text-secondary'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    textAlign: 'end',
  },
  timeLabelPosition: (index: number, hourHeight: number) => ({
    top: `${index * hourHeight - 1}px`,
  }),
  // Each day column isolates its own paint order: blocks, the now-line, and a
  // raised focused block never rank against anything outside the column.
  timeColumn: {
    gridRow: 3,
    position: 'relative',
    isolation: 'isolate',
    display: 'grid',
    minWidth: 0,
    borderInlineEndWidth: borderVars['--border-width'],
    borderInlineEndStyle: 'solid',
    borderInlineEndColor: colorVars['--color-border'],
  },
  timeColumnRows: (hourHeight: number) => ({
    gridAutoRows: `${hourHeight}px`,
  }),
  timeColumnLast: {
    borderInlineEndWidth: 0,
  },
  hourSlot: {
    borderBottomWidth: borderVars['--border-width'],
    borderBottomStyle: 'solid',
    borderBottomColor: colorVars['--color-border'],
  },
  hourSlotLast: {
    borderBottomWidth: 0,
  },
  timedEvent: {
    ...baseText,
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    minHeight: '24px',
    minWidth: 0,
    overflow: 'hidden',
    // The block is a container so a narrow track can drop its time line
    // (eventTime below) while the title keeps its single ellipsized line.
    containerType: 'inline-size',
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderRadius: radiusVars['--radius-inner'],
    paddingBlockStart: spacingVars['--spacing-0-5'],
    paddingBlockEnd: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-1'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontWeight: fontWeightVars['--font-weight-medium'],
  },
  // An event that opens the popover is a native button that keeps the block's
  // own paint: the reset removes only what the user agent adds to a button.
  // Block display lets an all-day pill fill the days its button spans; a
  // timed block's own flex display wins over it.
  eventButtonReset: {
    appearance: 'none',
    display: 'block',
    // A button grid item would otherwise size to its content.
    justifySelf: 'stretch',
    margin: 0,
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    color: 'inherit',
    font: 'inherit',
    textAlign: 'start',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  // A focused block rises above its neighbours inside the isolated column so
  // its ring is never clipped by a later sibling; nothing outside the column
  // can see the value.
  eventButtonFocus: {
    zIndex: {
      default: null,
      ':focus-visible': 1,
    },
  },
  // The popover keeps to the viewport the way the Popover component does: it
  // never grows past the visible block size, minus the surface padding.
  eventPopoverBody: {
    maxBlockSize: stylex.firstThatWorks(
      `calc(100dvb - 2 * ${spacingVars['--spacing-4']} - 2 * ${spacingVars['--spacing-3']})`,
      `calc(100vh - 2 * ${spacingVars['--spacing-4']} - 2 * ${spacingVars['--spacing-3']})`,
    ),
  },
  // Blocks in one overlap cluster split the column into equal tracks and never
  // overlap, so they carry no z-index of their own; the 2px insets keep the
  // same gutter a lone block has at the column's edges.
  timedEventPosition: (
    top: number,
    height: number,
    inlineStart: number,
    inlineSize: number,
  ) => ({
    top: `calc(${top}% + 2px)`,
    height: `calc(${height}% - 5px)`,
    insetInlineStart: `calc(${inlineStart}% + ${spacingVars['--spacing-0-5']})`,
    inlineSize: `calc(${inlineSize}% - ${spacingVars['--spacing-0-5']} * 2)`,
  }),
  currentTimeLine: (top: number) => ({
    position: 'absolute',
    insetInline: 0,
    top: `calc(${top}% + 2px)`,
    borderTopWidth: '2px',
    borderTopStyle: 'solid',
    borderTopColor: colorVars['--color-border-orange'],
    // Local to the isolated day column: above its blocks, nothing else.
    zIndex: 1,
    pointerEvents: 'none',
    '::before': {
      content: '""',
      position: 'absolute',
      insetInlineStart: '-6px',
      top: '-6px',
      width: '10px',
      height: '10px',
      borderRadius: radiusVars['--radius-full'],
      backgroundColor: colorVars['--color-border-orange'],
    },
  }),
  list: {
    display: 'flex',
    flexDirection: 'column',
  },
  listDay: {
    display: 'grid',
    gridTemplateColumns: '88px minmax(0, 1fr)',
    alignItems: 'start',
    columnGap: spacingVars['--spacing-3'],
    paddingBlock: spacingVars['--spacing-3'],
    paddingInline: spacingVars['--spacing-3'],
    borderBottomWidth: borderVars['--border-width'],
    borderBottomStyle: 'solid',
    borderBottomColor: colorVars['--color-border'],
  },
  listDayLast: {
    borderBottomWidth: 0,
  },
  listDayHeading: {
    gridColumn: '1',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    columnGap: spacingVars['--spacing-2'],
    marginBlockStart: `calc(${spacingVars['--spacing-1']} * -1)`,
    marginInlineStart: `calc(${spacingVars['--spacing-1']} * -1)`,
  },
  listDayNumber: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '30px',
    height: '30px',
    borderRadius: radiusVars['--radius-full'],
  },
  listDayNumberText: {
    fontWeight: fontWeightVars['--font-weight-bold'],
  },
  listDayNumberCurrent: {
    justifyContent: 'center',
    color: colorVars['--color-on-accent'],
    backgroundColor: colorVars['--color-accent'],
  },
  listEvents: {
    gridColumn: 2,
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-2'],
    minWidth: 0,
  },
  listNowRow: {
    position: 'relative',
    height: '10px',
    marginBlock: spacingVars['--spacing-0-5'],
    '::before': {
      content: '""',
      position: 'absolute',
      insetInline: 0,
      top: '4px',
      borderTopWidth: '2px',
      borderTopStyle: 'solid',
      borderTopColor: colorVars['--color-border-orange'],
    },
    '::after': {
      content: '""',
      position: 'absolute',
      insetInlineStart: '-1px',
      top: 0,
      width: '10px',
      height: '10px',
      borderRadius: radiusVars['--radius-full'],
      backgroundColor: colorVars['--color-border-orange'],
    },
  },
  listEventRow: {
    display: 'grid',
    gridTemplateColumns: '12px 144px minmax(0, 1fr)',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    minWidth: 0,
  },
  listEventDot: {
    width: '10px',
    height: '10px',
    borderRadius: radiusVars['--radius-full'],
  },
  listEventTime: {
    ...baseText,
    color: colorVars['--color-text-secondary'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    whiteSpace: 'nowrap',
  },
  listEventTitle: {
    ...baseText,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
    fontWeight: fontWeightVars['--font-weight-medium'],
  },
  // A past row is muted with the secondary text token, which the theme
  // guarantees at AA. Fading the whole row with opacity instead pulled its
  // text toward the surface behind it — 2.35:1 on the light theme.
  listEventTitlePast: {
    color: colorVars['--color-text-secondary'],
  },
  listEventDotPast: {
    opacity: 0.5,
  },
  eventBlue: {
    color: colorVars['--color-text-blue'],
    backgroundColor: colorVars['--color-background-blue'],
    borderColor: colorVars['--color-border-blue'],
  },
  eventDotBlue: {
    backgroundColor: colorVars['--color-border-blue'],
  },
  eventSurfaceBlue: {
    color: colorVars['--color-text-blue'],
    borderColor: colorVars['--color-border-blue'],
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-border-blue']} 20%, ${colorVars['--color-background-card']})`,
  },
  eventPastSurfaceBlue: {
    color: `color-mix(in srgb, ${colorVars['--color-text-blue']} 52%, ${colorVars['--color-text-secondary']})`,
    borderColor: `color-mix(in srgb, ${colorVars['--color-border-blue']} 48%, ${colorVars['--color-border']})`,
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-border-blue']} 10%, ${colorVars['--color-background-card']})`,
  },
  eventCyan: {
    color: colorVars['--color-text-cyan'],
    backgroundColor: colorVars['--color-background-cyan'],
    borderColor: colorVars['--color-border-cyan'],
  },
  eventDotCyan: {
    backgroundColor: colorVars['--color-border-cyan'],
  },
  eventSurfaceCyan: {
    color: colorVars['--color-text-cyan'],
    borderColor: colorVars['--color-border-cyan'],
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-border-cyan']} 20%, ${colorVars['--color-background-card']})`,
  },
  eventPastSurfaceCyan: {
    color: `color-mix(in srgb, ${colorVars['--color-text-cyan']} 52%, ${colorVars['--color-text-secondary']})`,
    borderColor: `color-mix(in srgb, ${colorVars['--color-border-cyan']} 48%, ${colorVars['--color-border']})`,
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-border-cyan']} 10%, ${colorVars['--color-background-card']})`,
  },
  eventGray: {
    color: colorVars['--color-text-gray'],
    backgroundColor: colorVars['--color-background-gray'],
    borderColor: colorVars['--color-border-gray'],
  },
  eventDotGray: {
    backgroundColor: colorVars['--color-text-secondary'],
  },
  eventSurfaceGray: {
    color: colorVars['--color-text-gray'],
    borderColor: colorVars['--color-border-gray'],
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-border-gray']} 20%, ${colorVars['--color-background-card']})`,
  },
  eventPastSurfaceGray: {
    color: colorVars['--color-text-secondary'],
    borderColor: colorVars['--color-border'],
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-border-gray']} 10%, ${colorVars['--color-background-card']})`,
  },
  eventGreen: {
    color: colorVars['--color-text-green'],
    backgroundColor: colorVars['--color-background-green'],
    borderColor: colorVars['--color-border-green'],
  },
  eventDotGreen: {
    backgroundColor: colorVars['--color-border-green'],
  },
  eventSurfaceGreen: {
    color: colorVars['--color-text-green'],
    borderColor: colorVars['--color-border-green'],
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-border-green']} 20%, ${colorVars['--color-background-card']})`,
  },
  eventPastSurfaceGreen: {
    color: `color-mix(in srgb, ${colorVars['--color-text-green']} 52%, ${colorVars['--color-text-secondary']})`,
    borderColor: `color-mix(in srgb, ${colorVars['--color-border-green']} 48%, ${colorVars['--color-border']})`,
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-border-green']} 10%, ${colorVars['--color-background-card']})`,
  },
  eventOrange: {
    color: colorVars['--color-text-orange'],
    backgroundColor: colorVars['--color-background-orange'],
    borderColor: colorVars['--color-border-orange'],
  },
  eventDotOrange: {
    backgroundColor: colorVars['--color-border-orange'],
  },
  eventSurfaceOrange: {
    color: colorVars['--color-text-orange'],
    borderColor: colorVars['--color-border-orange'],
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-border-orange']} 20%, ${colorVars['--color-background-card']})`,
  },
  eventPastSurfaceOrange: {
    color: `color-mix(in srgb, ${colorVars['--color-text-orange']} 52%, ${colorVars['--color-text-secondary']})`,
    borderColor: `color-mix(in srgb, ${colorVars['--color-border-orange']} 48%, ${colorVars['--color-border']})`,
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-border-orange']} 10%, ${colorVars['--color-background-card']})`,
  },
  eventPink: {
    color: colorVars['--color-text-pink'],
    backgroundColor: colorVars['--color-background-pink'],
    borderColor: colorVars['--color-border-pink'],
  },
  eventDotPink: {
    backgroundColor: colorVars['--color-border-pink'],
  },
  eventSurfacePink: {
    color: colorVars['--color-text-pink'],
    borderColor: colorVars['--color-border-pink'],
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-border-pink']} 20%, ${colorVars['--color-background-card']})`,
  },
  eventPastSurfacePink: {
    color: `color-mix(in srgb, ${colorVars['--color-text-pink']} 52%, ${colorVars['--color-text-secondary']})`,
    borderColor: `color-mix(in srgb, ${colorVars['--color-border-pink']} 48%, ${colorVars['--color-border']})`,
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-border-pink']} 10%, ${colorVars['--color-background-card']})`,
  },
  eventPurple: {
    color: colorVars['--color-text-purple'],
    backgroundColor: colorVars['--color-background-purple'],
    borderColor: colorVars['--color-border-purple'],
  },
  eventDotPurple: {
    backgroundColor: colorVars['--color-border-purple'],
  },
  eventSurfacePurple: {
    color: colorVars['--color-text-purple'],
    borderColor: colorVars['--color-border-purple'],
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-border-purple']} 20%, ${colorVars['--color-background-card']})`,
  },
  eventPastSurfacePurple: {
    color: `color-mix(in srgb, ${colorVars['--color-text-purple']} 52%, ${colorVars['--color-text-secondary']})`,
    borderColor: `color-mix(in srgb, ${colorVars['--color-border-purple']} 48%, ${colorVars['--color-border']})`,
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-border-purple']} 10%, ${colorVars['--color-background-card']})`,
  },
  eventRed: {
    color: colorVars['--color-text-red'],
    backgroundColor: colorVars['--color-background-red'],
    borderColor: colorVars['--color-border-red'],
  },
  eventDotRed: {
    backgroundColor: colorVars['--color-border-red'],
  },
  eventSurfaceRed: {
    color: colorVars['--color-text-red'],
    borderColor: colorVars['--color-border-red'],
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-border-red']} 20%, ${colorVars['--color-background-card']})`,
  },
  eventPastSurfaceRed: {
    color: `color-mix(in srgb, ${colorVars['--color-text-red']} 52%, ${colorVars['--color-text-secondary']})`,
    borderColor: `color-mix(in srgb, ${colorVars['--color-border-red']} 48%, ${colorVars['--color-border']})`,
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-border-red']} 10%, ${colorVars['--color-background-card']})`,
  },
  eventTeal: {
    color: colorVars['--color-text-teal'],
    backgroundColor: colorVars['--color-background-teal'],
    borderColor: colorVars['--color-border-teal'],
  },
  eventDotTeal: {
    backgroundColor: colorVars['--color-border-teal'],
  },
  eventSurfaceTeal: {
    color: colorVars['--color-text-teal'],
    borderColor: colorVars['--color-border-teal'],
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-border-teal']} 20%, ${colorVars['--color-background-card']})`,
  },
  eventPastSurfaceTeal: {
    color: `color-mix(in srgb, ${colorVars['--color-text-teal']} 52%, ${colorVars['--color-text-secondary']})`,
    borderColor: `color-mix(in srgb, ${colorVars['--color-border-teal']} 48%, ${colorVars['--color-border']})`,
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-border-teal']} 10%, ${colorVars['--color-background-card']})`,
  },
  eventYellow: {
    color: colorVars['--color-text-yellow'],
    backgroundColor: colorVars['--color-background-yellow'],
    borderColor: colorVars['--color-border-yellow'],
  },
  eventDotYellow: {
    backgroundColor: colorVars['--color-border-yellow'],
  },
  eventSurfaceYellow: {
    color: colorVars['--color-text-yellow'],
    borderColor: colorVars['--color-border-yellow'],
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-border-yellow']} 20%, ${colorVars['--color-background-card']})`,
  },
  eventPastSurfaceYellow: {
    color: `color-mix(in srgb, ${colorVars['--color-text-yellow']} 52%, ${colorVars['--color-text-secondary']})`,
    borderColor: `color-mix(in srgb, ${colorVars['--color-border-yellow']} 48%, ${colorVars['--color-border']})`,
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-border-yellow']} 10%, ${colorVars['--color-background-card']})`,
  },
});
