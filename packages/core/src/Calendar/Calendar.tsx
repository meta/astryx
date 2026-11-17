// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Calendar.tsx
 * @input Uses React useState, useMemo, useCallback, hooks
 * @output Exports Calendar component and related types
 * @position Core implementation; forwards DOM ref and exposes navigation via
 *   handleRef
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Calendar/Calendar.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/Calendar/getInitialFocusDate.ts (which month the calendar opens on)
 * - /packages/core/src/Calendar/Calendar.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/Calendar/index.ts (exports if types change)
 * - /apps/storybook/stories/Calendar.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/Calendar/ (showcase blocks)
 */

import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import type {BaseProps} from '../BaseProps';
import * as stylex from '@stylexjs/stylex';
import {Button} from '../Button';
import {Icon} from '../Icon';
import {useAnnounce, useGridFocus} from '../hooks';
import {useCalendarConstraints, type CalendarDay} from './hooks';
import {useCalendarDays} from './hooks/useCalendarDays';
import {
  calendarStyles,
  monthGridStyles,
  dayCellStyles,
  dayCellTheme,
} from './styles';
import {
  type PlainDate,
  plainDateFromISO,
  plainDateToISO,
  plainDateToDate,
  plainDateAddDays,
  plainDateDayOfWeek,
  plainDateDiffDays,
  plainDateIsAfter,
  plainDateIsBefore,
  plainDateIsEqual,
  plainDateGetWeekNumber,
  plainDateWeekFieldName,
  plainDateFormatDayNumber,
  DATE_FORMAT_WITH_WEEKDAY,
} from '../utils/plainDate';
import {
  type CalendarMonth,
  type CalendarSystem,
  calendarAddMonths,
  calendarMonthOf,
  calendarShiftMonths,
  calendarShiftYears,
  calendarYearMonthOf,
  formatCalendarDate,
  formatCalendarMonthLabel,
  isInCalendarMonth,
} from '../utils/calendarSystem';
import {mergeProps, composeEventHandlers, rtlStyles} from '../utils';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {interactionOverlayStyles} from '../utils/interactionOverlay.stylex';
import {usePressFeedback} from '../hooks/usePressFeedback';
import {useToday} from '../hooks/useToday';
import {getInitialFocusDate} from './getInitialFocusDate';
import {getWeekdayHeaders} from './getWeekdayHeaderNames';
import {
  computeDayCellState,
  computeRangeRounding,
  computePreviewRounding,
  computeDayNeighborContinuity,
  isEndpoint,
  type DayNeighborContinuity,
} from './dayCellUtils';

// =============================================================================
// Types
// =============================================================================

export type {
  ISODateString,
  DayOfWeek,
  DayOfWeekName,
  DateRange,
} from '../utils/dateTypes';
import type {
  ISODateString,
  DayOfWeek,
  DayOfWeekName,
  DateRange,
} from '../utils/dateTypes';
import {normalizeDayOfWeek} from '../utils/dateTypes';
import {themeProps} from '../utils/themeProps';
import {useLocale} from '../i18n';
import {useCalendarSystem} from '../i18n/useCalendarSystem';
import {VisuallyHidden} from '../VisuallyHidden';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/Calendar/Calendar.generated';

registerEnglishFallback(english);

// The month math needs a date before the opening month is known (server
// render, hydration). The grid it lays out is hidden.
const UNKNOWN_MONTH_STAND_IN = plainDateFromISO('1970-01-01');

/** How a month navigation moves the focused day: by its row offset in days, or by whole calendar months or years. */
type NavigationUnit = 'days' | 'months' | 'years';

/** Imperative handle for Calendar handleRef */
export interface CalendarHandle {
  /** Navigate the calendar to show the month containing the given date */
  navigateTo: (date: ISODateString) => void;
}

// ─── Base Props (shared across all modes) ─────────────────────

interface CalendarBaseProps extends Omit<
  BaseProps<HTMLDivElement>,
  'onChange' | 'defaultValue'
> {
  /** Ref forwarded to the calendar root element. */
  ref?: React.Ref<HTMLDivElement>;
  /** Imperative handle ref for calendar navigation. */
  handleRef?: React.Ref<CalendarHandle>;
  /** Number of months to display (default: 1) */
  numberOfMonths?: 1 | 2;

  /** Minimum selectable date in ISO format */
  min?: ISODateString;

  /** Maximum selectable date in ISO format */
  max?: ISODateString;

  /**
   * Custom date constraint functions. Date is disabled if ANY function returns false.
   * Use for complex rules like "weekdays only" or "no holidays".
   */
  dateConstraints?: ReadonlyArray<(date: Date) => boolean>;

  /**
   * Range mode only. Maximum number of days a selected range may span,
   * counting both endpoints — `maxRangeSpan={7}` allows a 7-day window
   * (start + 6 days). Once a start date is picked, days beyond this distance
   * from it are disabled in either direction; before a start is picked every
   * otherwise-valid day stays selectable. Use for rolling windows like "at
   * most a week from the chosen day". For fixed calendar bounds use min/max.
   */
  maxRangeSpan?: number;

  /**
   * Range mode only. Minimum number of days a selected range must span,
   * counting both endpoints — `minRangeSpan={2}` forbids a single-day range.
   * Once a start date is picked, days closer than this to it are disabled —
   * except the start itself, which stays selectable. Clicking the start again
   * commits a one-day range when the minimum allows it; otherwise it cancels
   * the in-progress selection so the start can be moved. Defaults to 1 (a
   * same-day start and end is allowed).
   */
  minRangeSpan?: number;

  /**
   * Controlled focus date (which month is visible).
   * If not provided, defaults to the selected date, else today clamped into
   * the `min`/`max` window (so a window that excludes today opens on the
   * bound nearest to it, not on an all-disabled month).
   */
  focusDate?: ISODateString;

  /** Callback when visible month changes via navigation */
  onFocusDateChange?: (focusDate: ISODateString) => void;

  /**
   * Show days from adjacent months (grayed out).
   * Default: true
   */
  hasOutsideDays?: boolean;

  /**
   * Show ISO 8601 week numbers in a side column. They are ISO 8601 week
   * numbers in every calendar system.
   * Default: false
   */
  hasWeekNumbers?: boolean;

  /**
   * Give each month only the rows it needs instead of a fixed 6-row grid.
   * The fixed grid keeps the same height from month to month.
   * Default: false (fixed 6 rows for consistent height)
   */
  hasVariableRowCount?: boolean;

  /**
   * First day of week. Accepts a number (0 = Sunday … 6 = Saturday) or a
   * three-letter day name ('sun'–'sat', case-insensitive) for readability.
   * Default: 0 (Sunday)
   */
  weekStartsOn?: DayOfWeek | DayOfWeekName;

  /**
   * The calendar system the grid shows, such as `'persian'` or `'hebrew'`.
   * It sets the months, their labels, and month and year navigation. `value`,
   * `min`, `max`, `focusDate`, and every callback stay Gregorian ISO dates.
   * Default: the `InternationalizationProvider` calendar, else Gregorian.
   * Calendars other than `gregory`, `iso8601`, `buddhist`, `roc`, and
   * `japanese` need `Temporal`; without it the grid shows Gregorian months.
   */
  calendar?: CalendarSystem;
}

// ─── Mode-specific Props (discriminated union) ────────────────

interface CalendarSingleProps extends CalendarBaseProps {
  /** Selection mode */
  mode?: 'single';

  /** Selected date in ISO format (YYYY-MM-DD), or null for controlled empty state */
  value?: ISODateString | null;

  /** Default value for uncontrolled mode */
  defaultValue?: ISODateString;

  /** Callback when date is selected */
  onChange?: (value: ISODateString, valueAsDate: Date) => void;
}

interface CalendarRangeProps extends CalendarBaseProps {
  /** Selection mode */
  mode: 'range';

  /** Selected date range, or null for controlled empty state */
  value?: DateRange | null;

  /** Default value for uncontrolled mode */
  defaultValue?: DateRange;

  /** Callback when range is selected */
  onChange?: (value: DateRange) => void;
}

export type CalendarProps = CalendarSingleProps | CalendarRangeProps;

function firstEnabledDayOfMonth(
  month: CalendarMonth,
  isDisabled: (pd: PlainDate) => boolean,
): PlainDate | null {
  for (let offset = 0; offset < month.length; offset += 1) {
    const pd = plainDateAddDays(month.start, offset);
    if (!isDisabled(pd)) {
      return pd;
    }
  }
  return null;
}

/** A day's full label, such as "Friday, Aban 8, 1405 AP", in the calendar. */
function formatDateLabel(
  date: PlainDate,
  calendar: CalendarSystem,
  locale: string,
): string {
  return formatCalendarDate(calendar, date, DATE_FORMAT_WITH_WEEKDAY, locale);
}

/**
 * ISO 8601 numbers a week by its Thursday. For any week start, the row's
 * Thursday is in the ISO week that holds most of the row's days.
 */
function rowThursday(week: ReadonlyArray<CalendarDay>): PlainDate {
  const first = week[0].date;
  return plainDateAddDays(first, (4 - plainDateDayOfWeek(first) + 7) % 7);
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * A calendar component for selecting dates or date ranges.
 *
 * @example
 * ```
 * <Calendar value={selectedDate} onChange={setSelectedDate} />
 * ```
 */
export function Calendar({ref, ...props}: CalendarProps) {
  const t = useComponentTranslator();
  const locale = useLocale();
  const {
    handleRef,
    mode = 'single',
    value,
    defaultValue,
    onChange,
    numberOfMonths: numberOfMonthsProp = 1,
    min,
    max,
    dateConstraints,
    maxRangeSpan,
    minRangeSpan,
    focusDate: focusDateProp,
    onFocusDateChange,
    hasOutsideDays = true,
    hasWeekNumbers = false,
    hasVariableRowCount = false,
    weekStartsOn: weekStartsOnProp = 0,
    calendar: calendarProp,
    xstyle,
    className,
    style,
    onKeyDown,
    ...rest
  } = props;
  const calendar = useCalendarSystem(calendarProp, 'Calendar');

  // Normalize `weekStartsOn` (number or three-letter day name) to a numeric
  // DayOfWeek so all downstream date math keeps working with an index.
  const weekStartsOn = normalizeDayOfWeek(weekStartsOnProp);

  // `numberOfMonths` is typed `1 | 2`; defensively clamp anything else that
  // slips through at runtime to 1 so `Array.from({length})` can't render an
  // absurd number of month grids (e.g. `numberOfMonths={1000}`).
  const numberOfMonths = numberOfMonthsProp === 2 ? 2 : 1;

  // Today is unknown on the server and while hydrating, so the hydrating
  // render matches the server markup.
  const today = useToday();

  // Internal state for uncontrolled mode
  const [internalValue, setInternalValue] = useState<
    ISODateString | DateRange | undefined
  >(defaultValue);

  // Range selection in progress (first click made, waiting for second)
  const [rangeSelectionStart, setRangeSelectionStart] =
    useState<ISODateString | null>(null);

  // Hovered date for range preview
  const [hoveredDate, setHoveredDate] = useState<ISODateString | null>(null);

  // Pending focus target after month navigation
  const [pendingFocus, setPendingFocus] = useState<ISODateString | null>(null);

  // Determine effective value
  const effectiveValue =
    (value !== undefined ? value : internalValue) ?? undefined;

  // The month to open on: the focus date, else the value, else today clamped
  // into the min/max window so a window that doesn't contain today doesn't
  // open on an all-disabled month. Without a focus date or a value it waits
  // for today, so it is unknown on the server and while hydrating.
  const getOpeningFocusDate = () =>
    getInitialFocusDate({
      focusDate: focusDateProp,
      value: effectiveValue,
      min,
      max,
      numberOfMonths,
      today,
      calendar,
    });

  // Focus date state (which month is visible). Null only while the opening
  // month waits for today.
  const [internalFocusDate, setInternalFocusDate] = useState<PlainDate | null>(
    getOpeningFocusDate,
  );

  // Use controlled focusDate if callback is provided, otherwise use internal state
  const isControlledFocus =
    focusDateProp !== undefined && onFocusDateChange !== undefined;
  // Store the opening month in the first render that knows today, so a later
  // pick or value change does not move the shown months.
  const openingFocusDate =
    !isControlledFocus && internalFocusDate == null && today != null
      ? getOpeningFocusDate()
      : null;
  if (openingFocusDate != null) {
    setInternalFocusDate(openingFocusDate);
  }
  const knownFocusDate = isControlledFocus
    ? plainDateFromISO(focusDateProp)
    : (internalFocusDate ?? openingFocusDate);
  // Before the month is known the grid is hidden, and the month math below
  // uses a stand-in date that nothing can act on before hydration ends.
  const isMonthKnown = knownFocusDate != null;
  const focusDate = knownFocusDate ?? UNKNOWN_MONTH_STAND_IN;

  // Expose imperative handle for external navigation
  useImperativeHandle(
    handleRef,
    () => ({
      navigateTo: (date: ISODateString) => {
        if (isControlledFocus) {
          onFocusDateChange?.(date);
        } else {
          setInternalFocusDate(plainDateFromISO(date));
        }
      },
    }),
    [isControlledFocus, onFocusDateChange],
  );

  // A controlled focus date is a new object on each render. Key the memo on
  // its ISO string.
  const focusIso = plainDateToISO(focusDate);
  const baseMonth = useMemo(
    () => calendarMonthOf(calendar, plainDateFromISO(focusIso)),
    [calendar, focusIso],
  );

  // Generate visible months
  const visibleMonths = useMemo(() => {
    return Array.from({length: numberOfMonths}, (_, i) => {
      return calendarAddMonths(calendar, baseMonth, i);
    });
  }, [calendar, baseMonth, numberOfMonths]);
  const lastVisibleMonth = visibleMonths[visibleMonths.length - 1];

  // A pending target is claimed by the grid that shows its month, or dropped
  // by the next focus move that is not onto the target day: when a controlled
  // owner refuses the month change, no grid shows the target's month, and a
  // stale target would later steal focus (and Enter) when that month does
  // appear. Only a grid showing the target's month receives it; any other
  // focus change (an arrow to another day, the month header's buttons, or out
  // of the calendar) drops it (see onBlur below).
  const claimablePendingFocus = useMemo(() => {
    if (pendingFocus == null) {
      return null;
    }
    const target = plainDateFromISO(pendingFocus);
    return visibleMonths.some(month => isInCalendarMonth(target, month))
      ? pendingFocus
      : null;
  }, [pendingFocus, visibleMonths]);
  const handleRootBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      // Only the move onto the target day itself keeps the target: an arrow
      // to any other day, a move to the header buttons, or focus leaving the
      // calendar all drop it.
      const movesToTarget =
        e.relatedTarget instanceof Element &&
        e.relatedTarget.getAttribute('data-date') === pendingFocus;
      if (pendingFocus != null && !movesToTarget) {
        setPendingFocus(null);
      }
    },
    [pendingFocus],
  );

  // Format month header
  // Each month is its own stand-alone label, so each starts with a capital
  // where the locale capitalizes one (FR1).
  const monthYearLabel = useMemo(
    () =>
      isMonthKnown
        ? visibleMonths
            .map(m => formatCalendarMonthLabel(calendar, m, locale))
            .join(' – ')
        : '',
    [calendar, visibleMonths, locale, isMonthKnown],
  );

  // Announce the newly visible month to screen readers whenever it changes.
  // The visible month label (`<span>`) carries no live semantics, so paging the
  // grid — via the header prev/next buttons, keyboard grid paging (arrow keys
  // across a month boundary, PageUp/PageDown), the `navigateTo` handle, or a
  // controlled `focusDate` change — otherwise updates the grid silently. Keying
  // off `monthYearLabel` reuses the existing single-/multi-month formatting and
  // only fires when the visible month actually changes (so selecting a date,
  // which does not move the grid, stays silent). The first-render guard avoids
  // announcing the initial month on mount.
  const announce = useAnnounce();
  const isInitialRenderRef = useRef(true);
  useEffect(() => {
    // The first month shown, after a server render too, is not a change.
    if (isInitialRenderRef.current || monthYearLabel === '') {
      isInitialRenderRef.current = monthYearLabel === '';
      return;
    }
    announce(monthYearLabel);
  }, [monthYearLabel, announce]);

  // Determine if prev/next navigation is possible based on min/max
  const minDateForKeys = useMemo(
    () => (min ? plainDateFromISO(min) : null),
    [min],
  );
  const maxDateForKeys = useMemo(
    () => (max ? plainDateFromISO(max) : null),
    [max],
  );

  // A month button is available while a day past the shown months is in range.
  const canNavigatePrevious =
    isMonthKnown &&
    (minDateForKeys == null ||
      plainDateIsBefore(minDateForKeys, baseMonth.start));
  const canNavigateNext =
    isMonthKnown &&
    (maxDateForKeys == null ||
      plainDateIsAfter(maxDateForKeys, lastVisibleMonth.end));

  // Navigation handlers
  // The same constraint view the grids use, so a key can resolve its target
  // before the month changes.
  const rootRangeAnchor = useMemo(
    () =>
      mode === 'range' && rangeSelectionStart
        ? plainDateFromISO(rangeSelectionStart)
        : null,
    [mode, rangeSelectionStart],
  );
  const {isDateDisabled: isRootDateDisabled} = useCalendarConstraints({
    min,
    max,
    dateConstraints,
    maxRangeSpan,
    minRangeSpan,
    rangeAnchor: rootRangeAnchor,
  });

  const navigateMonth = useCallback(
    (
      delta: number,
      focusedDate?: ISODateString,
      offset?: number,
      unit: NavigationUnit = 'days',
    ) => {
      // The Previous/Next buttons move the month with no focused day.
      if (!focusedDate) {
        if (
          (delta < 0 && !canNavigatePrevious) ||
          (delta > 0 && !canNavigateNext)
        ) {
          return;
        }
        const newPd = calendarAddMonths(calendar, baseMonth, delta).start;
        onFocusDateChange?.(plainDateToISO(newPd));
        if (!isControlledFocus) {
          setInternalFocusDate(newPd);
        }
        return;
      }

      // A key resolves its TARGET day first and decides by that, so a
      // boundary blocks only out-of-range targets, never the month movement
      // itself (ArrowUp from February 3 reaches January 27 at a January
      // minimum), and a direction with no enabled day left changes nothing
      // rather than dropping focus.
      const currentPd = plainDateFromISO(focusedDate);
      const inRange = (pd: PlainDate) =>
        !(minDateForKeys && plainDateIsBefore(pd, minDateForKeys)) &&
        !(maxDateForKeys && plainDateIsAfter(pd, maxDateForKeys));
      let targetPd: PlainDate;
      if (unit === 'months' || unit === 'years') {
        // A page or a year step keeps the day of the calendar month and clamps
        // it to the target month's length. A month with no enabled day is no
        // target, the same as for an arrow.
        const candidate =
          unit === 'years'
            ? calendarShiftYears(calendar, currentPd, delta)
            : calendarShiftMonths(calendar, currentPd, delta);
        if (!inRange(candidate)) {
          return;
        }
        if (isRootDateDisabled(candidate)) {
          const firstEnabled = firstEnabledDayOfMonth(
            calendarMonthOf(calendar, candidate),
            isRootDateDisabled,
          );
          if (firstEnabled == null) {
            return;
          }
          targetPd = firstEnabled;
        } else {
          targetPd = candidate;
        }
      } else {
        // Walk the arrow's direction to the first enabled day, up to a year
        // away; past `min`/`max` or with every day disabled, nothing moves.
        const step = delta * (offset ?? 7);
        let candidate = plainDateAddDays(currentPd, step);
        let found: PlainDate | null = null;
        while (Math.abs(plainDateDiffDays(currentPd, candidate)) <= 366) {
          if (!inRange(candidate)) {
            return;
          }
          if (!isRootDateDisabled(candidate)) {
            found = candidate;
            break;
          }
          candidate = plainDateAddDays(candidate, step);
        }
        if (found == null) {
          return;
        }
        targetPd = found;
      }

      // Focus moves to the target; the months change only when the target's
      // month is not already shown. The view shifts the least it can in the
      // key's direction, so the target month becomes the first (backwards)
      // or last (forwards) month shown.
      const resolved: PlainDate = targetPd;
      setPendingFocus(plainDateToISO(resolved));
      const isBeforeShown = plainDateIsBefore(resolved, baseMonth.start);
      if (!isBeforeShown && !plainDateIsAfter(resolved, lastVisibleMonth.end)) {
        return;
      }
      const targetMonth = calendarMonthOf(calendar, resolved);
      const newPd = isBeforeShown
        ? targetMonth.start
        : calendarAddMonths(calendar, targetMonth, -(numberOfMonths - 1)).start;
      onFocusDateChange?.(plainDateToISO(newPd));
      if (!isControlledFocus) {
        setInternalFocusDate(newPd);
      }
    },
    [
      baseMonth,
      calendar,
      canNavigateNext,
      canNavigatePrevious,
      isControlledFocus,
      isRootDateDisabled,
      lastVisibleMonth,
      maxDateForKeys,
      minDateForKeys,
      numberOfMonths,
      onFocusDateChange,
    ],
  );

  // Escape key handler to cancel range selection
  const handleCalendarKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (
        mode === 'range' &&
        rangeSelectionStart !== null &&
        e.key === 'Escape'
      ) {
        setRangeSelectionStart(null);
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [mode, rangeSelectionStart],
  );

  // Day click handler
  const handleDayClick = useCallback(
    (date: PlainDate) => {
      const iso = plainDateToISO(date);

      if (mode === 'single') {
        setInternalValue(iso);
        (onChange as CalendarSingleProps['onChange'])?.(
          iso,
          plainDateToDate(date),
        );
      } else {
        // Range mode
        if (rangeSelectionStart === null) {
          // First click - start the range. Nothing else about this pick is
          // perceivable non-visually (WCAG 1.3.1) — the grid doesn't move, so
          // the month-change announcement stays silent — so speak the range
          // progress through the same polite live region.
          setRangeSelectionStart(iso);
          announce(
            t('@astryx.calendar.rangeStartAnnounce', {
              date: formatDateLabel(date, calendar, locale),
            }),
          );
        } else {
          // Second click - complete the range
          const startPd = plainDateFromISO(rangeSelectionStart);

          // Clicking the anchor again commits a one-day range when the minimum
          // span allows it. For longer minimum spans, the repeated click clears
          // the in-progress start instead: the anchor is the only nearby day
          // that remains enabled, so this preserves an escape hatch for moving
          // the start without violating the configured minimum.
          if (plainDateIsEqual(date, startPd) && (minRangeSpan ?? 1) > 1) {
            setRangeSelectionStart(null);
            announce(
              t('@astryx.calendar.rangeClearedAnnounce', {
                date: formatDateLabel(date, calendar, locale),
              }),
            );
            return;
          }

          let start: ISODateString;
          let end: ISODateString;

          // Ensure start <= end
          if (plainDateIsBefore(date, startPd)) {
            start = iso;
            end = rangeSelectionStart;
          } else {
            start = rangeSelectionStart;
            end = iso;
          }

          const range: DateRange = {start, end};
          setInternalValue(range);
          setRangeSelectionStart(null);
          (onChange as CalendarRangeProps['onChange'])?.(range);
          // Completed-range announcement, in chronological order (matches the
          // swapped {start, end} above even for a reverse pick).
          announce(
            t('@astryx.calendar.rangeCompleteAnnounce', {
              start: formatDateLabel(plainDateFromISO(start), calendar, locale),
              end: formatDateLabel(plainDateFromISO(end), calendar, locale),
            }),
          );
        }
      }
    },
    [
      mode,
      onChange,
      rangeSelectionStart,
      minRangeSpan,
      announce,
      t,
      locale,
      calendar,
    ],
  );

  return (
    <div
      ref={ref}
      {...rest}
      onBlur={composeEventHandlers(rest.onBlur, handleRootBlur)}
      {...mergeProps(
        themeProps('calendar', {mode}),
        stylex.props(calendarStyles.calendar, xstyle),
        className,
        style,
      )}
      onKeyDown={composeEventHandlers(onKeyDown, handleCalendarKeyDown)}>
      {/* Header with navigation */}
      <div {...stylex.props(calendarStyles.header)}>
        <Button
          {...themeProps('calendar-nav', {
            nav: 'prev',
            disabled: !canNavigatePrevious ? 'disabled' : null,
          })}
          label={t('@astryx.calendar.previousMonth')}
          variant="ghost"
          icon={
            // Wrapper span (not Icon props): Icon's string mode clobbers
            // caller classNames, so the RTL mirror must live on its own
            // element.
            <span {...stylex.props(calendarStyles.navIcon, rtlStyles.mirror)}>
              <Icon icon="chevronLeft" size="sm" color="inherit" />
            </span>
          }
          onClick={() => navigateMonth(-1)}
          isDisabled={!canNavigatePrevious}
          isIconOnly
        />

        <span {...stylex.props(calendarStyles.monthYearLabel)}>
          {monthYearLabel}
        </span>

        <Button
          {...themeProps('calendar-nav', {
            nav: 'next',
            disabled: !canNavigateNext ? 'disabled' : null,
          })}
          label={t('@astryx.calendar.nextMonth')}
          variant="ghost"
          icon={
            <span {...stylex.props(calendarStyles.navIcon, rtlStyles.mirror)}>
              <Icon icon="chevronRight" size="sm" color="inherit" />
            </span>
          }
          onClick={() => navigateMonth(1)}
          isDisabled={!canNavigateNext}
          isIconOnly
        />
      </div>
      {/* Month grids */}
      {/* Before the month is known the grids keep their space but stay hidden
          and out of reach. With the default six-row grid, the month appears
          with no layout jump. */}
      <div
        aria-hidden={isMonthKnown ? undefined : true}
        inert={!isMonthKnown}
        {...stylex.props(
          calendarStyles.monthsContainer,
          !isMonthKnown && calendarStyles.monthsPending,
        )}>
        {visibleMonths.map(month => (
          <MonthGrid
            key={plainDateToISO(month.start)}
            month={month}
            calendar={calendar}
            value={effectiveValue}
            mode={mode}
            rangeSelectionStart={rangeSelectionStart}
            hoveredDate={hoveredDate}
            min={min}
            max={max}
            dateConstraints={dateConstraints}
            maxRangeSpan={maxRangeSpan}
            minRangeSpan={minRangeSpan}
            hasOutsideDays={hasOutsideDays}
            hasWeekNumbers={hasWeekNumbers}
            hasVariableRowCount={hasVariableRowCount}
            weekStartsOn={weekStartsOn}
            onDayClick={handleDayClick}
            onDayHover={date =>
              setHoveredDate(date ? plainDateToISO(date) : null)
            }
            today={today}
            onNavigatePrevious={(focusedDate, offset, unit) =>
              navigateMonth(-1, focusedDate, offset, unit)
            }
            onNavigateNext={(focusedDate, offset, unit) =>
              navigateMonth(1, focusedDate, offset, unit)
            }
            pendingFocus={claimablePendingFocus}
            onPendingFocusHandled={() => setPendingFocus(null)}
          />
        ))}
      </div>
    </div>
  );
}

Calendar.displayName = 'Calendar';

// =============================================================================
// MonthGrid (Private)
// =============================================================================

interface MonthGridProps {
  month: CalendarMonth;
  calendar: CalendarSystem;
  value: ISODateString | DateRange | undefined;
  mode: 'single' | 'range';
  rangeSelectionStart: ISODateString | null;
  hoveredDate: ISODateString | null;
  min?: ISODateString;
  max?: ISODateString;
  dateConstraints?: ReadonlyArray<(date: Date) => boolean>;
  maxRangeSpan?: number;
  minRangeSpan?: number;
  hasOutsideDays: boolean;
  hasWeekNumbers: boolean;
  hasVariableRowCount: boolean;
  weekStartsOn: DayOfWeek;
  onDayClick: (date: PlainDate) => void;
  onDayHover: (date: PlainDate | null) => void;
  /** Today, or `null` on the server and while hydrating. */
  today: PlainDate | null;
  onNavigatePrevious?: (
    focusedDate: ISODateString,
    offset: number,
    unit?: NavigationUnit,
  ) => void;
  onNavigateNext?: (
    focusedDate: ISODateString,
    offset: number,
    unit?: NavigationUnit,
  ) => void;
  pendingFocus?: ISODateString | null;
  onPendingFocusHandled?: () => void;
}

function MonthGrid({
  month,
  calendar,
  value,
  mode,
  rangeSelectionStart,
  hoveredDate,
  min,
  max,
  dateConstraints,
  maxRangeSpan,
  minRangeSpan,
  hasOutsideDays,
  hasWeekNumbers,
  hasVariableRowCount,
  weekStartsOn,
  onDayClick,
  onDayHover,
  today,
  onNavigatePrevious,
  onNavigateNext,
  pendingFocus,
  onPendingFocusHandled,
}: MonthGridProps) {
  const locale = useLocale();

  // Use hooks for days generation and constraints
  const yearMonth = useMemo(
    () => calendarYearMonthOf(calendar, month),
    [calendar, month],
  );
  const {days, weeks} = useCalendarDays({
    year: yearMonth.year,
    month: yearMonth.month,
    calendar,
    weekStartsOn,
    hasVariableRowCount,
  });
  const dayNameHeaders = useMemo(
    () => getWeekdayHeaders(locale, weekStartsOn),
    [locale, weekStartsOn],
  );

  const rangeAnchor = useMemo(
    () =>
      mode === 'range' && rangeSelectionStart
        ? plainDateFromISO(rangeSelectionStart)
        : null,
    [mode, rangeSelectionStart],
  );

  const {isDateDisabled} = useCalendarConstraints({
    min,
    max,
    dateConstraints,
    maxRangeSpan,
    minRangeSpan,
    rangeAnchor,
  });

  // Parse selected date for roving tabindex priority
  const selectedDateForTabindex = useMemo(() => {
    if (mode === 'single' && value && typeof value === 'string') {
      return plainDateFromISO(value);
    }
    return null;
  }, [mode, value]);

  // Seed the initial roving tab stop for this month. useGridFocus owns the
  // live tab stop (see `hasRovingTabIndex` below) — it honors an existing
  // `tabindex="0"` and repairs/moves it thereafter — so this only decides
  // which day button starts tabbable. Priority: selected date (if visible and
  // enabled) > today (if visible and enabled) > first enabled in-month day.
  const seedTabbableIso = useMemo((): ISODateString | null => {
    if (selectedDateForTabindex) {
      const isSelectedInMonth = isInCalendarMonth(
        selectedDateForTabindex,
        month,
      );
      if (isSelectedInMonth && !isDateDisabled(selectedDateForTabindex)) {
        return plainDateToISO(selectedDateForTabindex);
      }
    }

    if (
      today != null &&
      isInCalendarMonth(today, month) &&
      !isDateDisabled(today)
    ) {
      return plainDateToISO(today);
    }

    for (const day of days) {
      if (!day.isOutside && !isDateDisabled(day.date)) {
        return day.iso;
      }
    }

    return null;
  }, [days, today, month, isDateDisabled, selectedDateForTabindex]);

  // Helper to get the focused date from the currently focused element.
  // Reads the machine-readable `data-date` (ISO) attribute rather than parsing
  // the human-readable `aria-label` with `new Date()`, which is locale/format
  // dependent and returns Invalid Date in non-English locales (e.g. fr-FR,
  // ja-JP), silently swallowing month-boundary arrow navigation (complex-4).
  const getFocusedDate = useCallback((): ISODateString | null => {
    const activeElement = document.activeElement as HTMLElement | null;
    if (!activeElement) {
      return null;
    }

    const iso = activeElement.getAttribute('data-date');
    if (!iso) {
      return null;
    }

    return iso as ISODateString;
  }, []);

  // Handle navigation to previous month
  const handleNavigatePrevious = useCallback(
    (_column: number, offset: number) => {
      const focusedDate = getFocusedDate();
      if (focusedDate) {
        onNavigatePrevious?.(focusedDate, offset);
      }
    },
    [getFocusedDate, onNavigatePrevious],
  );

  // Handle navigation to next month
  const handleNavigateNext = useCallback(
    (_column: number, offset: number) => {
      const focusedDate = getFocusedDate();
      if (focusedDate) {
        onNavigateNext?.(focusedDate, offset);
      }
    },
    [getFocusedDate, onNavigateNext],
  );

  // PageUp/PageDown move by a month, and with Shift by a year (APG date
  // picker dialog).
  const handlePageUp = useCallback(
    (e: React.KeyboardEvent) => {
      const focusedDate = getFocusedDate();
      if (focusedDate) {
        onNavigatePrevious?.(focusedDate, 1, e.shiftKey ? 'years' : 'months');
      }
    },
    [getFocusedDate, onNavigatePrevious],
  );

  const handlePageDown = useCallback(
    (e: React.KeyboardEvent) => {
      const focusedDate = getFocusedDate();
      if (focusedDate) {
        onNavigateNext?.(focusedDate, 1, e.shiftKey ? 'years' : 'months');
      }
    },
    [getFocusedDate, onNavigateNext],
  );

  // Grid focus navigation.
  //
  // The hook enumerates ALL grid cells (every `role="gridcell"`, including
  // disabled days and empty placeholder cells) so the true 7-column geometry is
  // preserved. `isCellFocusable` / `getFocusTarget` tell the hook which cells
  // can take focus (those containing an enabled day button) and where to send
  // focus (the day button inside the cell). Arrow keys move to the target
  // row/column and, if that cell is disabled, continue in the same direction to
  // the next enabled cell.
  const {
    gridRef,
    handleKeyDown: handleGridKeyDown,
    handleFocus: handleGridFocus,
  } = useGridFocus<HTMLDivElement>({
    columns: 7,
    cellSelector: '[role="gridcell"]',
    // A borrowed adjacent-month day is exposed aria-disabled (its click does
    // nothing, but it can still take pointer focus) and may also be natively
    // disabled by bounds or a constraint; the keyboard skips it either way
    // and crosses into that month through the grid edge instead, so focus
    // lands on the real day in the month now shown (FR5).
    isCellFocusable: cell =>
      cell.querySelector(
        'button:not([disabled]):not([aria-disabled="true"])',
      ) !== null,
    getFocusTarget: cell => cell.querySelector<HTMLElement>('button'),
    hasRovingTabIndex: true,
    onNavigateBefore: handleNavigatePrevious,
    onNavigateAfter: handleNavigateNext,
    onPageUp: handlePageUp,
    onPageDown: handlePageDown,
  });

  // Handle pending focus after month navigation. Every mounted month grid
  // sees the same pending date; only the grid showing that date's month acts,
  // so a neighbouring grid's fallback never overrides the right target. The
  // target is the real day in this month, never an outside-day copy; when it
  // is disabled, the month's first enabled day takes focus instead.
  useEffect(() => {
    if (!pendingFocus || !gridRef.current) {
      return;
    }

    const targetPd = plainDateFromISO(pendingFocus);
    if (!isInCalendarMonth(targetPd, month)) {
      return;
    }
    const targetIso = plainDateToISO(targetPd);

    const buttons = Array.from(
      gridRef.current.querySelectorAll<HTMLElement>(
        'button[data-date]:not([disabled]):not([aria-disabled="true"])',
      ),
    );

    // The real target day, else the month's first enabled day, else — in a
    // month with no enabled day — the first day button that can still take
    // focus (a borrowed adjacent-month day), so focus stays in the grid
    // rather than dropping to the page.
    const targetButton =
      buttons.find(button => button.getAttribute('data-date') === targetIso) ??
      buttons[0] ??
      gridRef.current.querySelector<HTMLElement>(
        'button[data-date]:not([disabled])',
      ) ??
      null;

    if (targetButton != null) {
      // The target becomes this grid's one Tab stop before it takes focus,
      // the way the hook's own arrow moves do (FR2): a programmatic focus
      // alone would leave the stop on the day the grid mounted with.
      for (const button of gridRef.current.querySelectorAll<HTMLElement>(
        'button[data-date]',
      )) {
        button.tabIndex = button === targetButton ? 0 : -1;
      }
      targetButton.focus();
    }
    onPendingFocusHandled?.();
  }, [pendingFocus, gridRef, month, onPendingFocusHandled]);

  // Parse selection
  let selectedDate: PlainDate | null = null;
  let rangeStart: PlainDate | null = null;
  let rangeEnd: PlainDate | null = null;

  if (mode === 'single' && value && typeof value === 'string') {
    selectedDate = plainDateFromISO(value);
  } else if (mode === 'range' && value && typeof value === 'object') {
    const range = value;
    rangeStart = plainDateFromISO(range.start);
    rangeEnd = plainDateFromISO(range.end);
  }

  // Handle in-progress range selection
  if (rangeSelectionStart) {
    rangeStart = plainDateFromISO(rangeSelectionStart);
    rangeEnd = rangeStart;
  }

  // Calculate preview range when hovering during range selection
  let previewStart: PlainDate | null = null;
  let previewEnd: PlainDate | null = null;
  if (mode === 'range' && rangeSelectionStart && hoveredDate) {
    const startPd = plainDateFromISO(rangeSelectionStart);
    const hoverPd = plainDateFromISO(hoveredDate);
    if (!plainDateIsEqual(startPd, hoverPd)) {
      if (plainDateIsBefore(hoverPd, startPd)) {
        previewStart = hoverPd;
        previewEnd = startPd;
      } else {
        previewStart = startPd;
        previewEnd = hoverPd;
      }
    }
  }

  // Month label for announcements
  const monthLabel = useMemo(() => {
    return formatCalendarMonthLabel(calendar, month, locale);
  }, [calendar, month, locale]);

  return (
    <div {...stylex.props(monthGridStyles.monthGrid)}>
      {/* Days grid (APG grid: header row of columnheaders + week rows) */}
      <div
        ref={gridRef}
        role="grid"
        aria-label={monthLabel}
        // APG grid pattern: a range selection holds multiple selected cells,
        // so the grid must advertise multi-selectability.
        aria-multiselectable={mode === 'range' ? true : undefined}
        onKeyDown={handleGridKeyDown}
        onFocus={handleGridFocus}
        {...stylex.props(
          monthGridStyles.daysGrid,
          hasWeekNumbers && monthGridStyles.daysGridWithNumbers,
        )}>
        {/* Day names header row (columnheaders live inside the grid). Uses the
            same display:contents row so its cells align to the grid columns. */}
        <div role="row" {...stylex.props(monthGridStyles.weekRow)}>
          {hasWeekNumbers && (
            // The corner above the week-number column is a header cell like
            // the weekday names beside it (APG grid: every cell in a row is a
            // gridcell, columnheader or rowheader). Its name is the locale's
            // own word for the week field, as visually hidden text so the
            // column stays blank and the header is not empty to axe.
            <div
              role="columnheader"
              {...stylex.props(
                monthGridStyles.dayName,
                monthGridStyles.weekNumberHeader,
              )}>
              <VisuallyHidden>{plainDateWeekFieldName(locale)}</VisuallyHidden>
            </div>
          )}
          {dayNameHeaders.map(({dayOfWeek, name}) => (
            <div
              key={dayOfWeek}
              role="columnheader"
              {...stylex.props(monthGridStyles.dayName)}>
              {name}
            </div>
          ))}
        </div>

        {weeks.map(week => {
          const weekDate = week.find(d => !d.isOutside)?.date || week[0].date;
          const weekNum = plainDateGetWeekNumber(rowThursday(week));

          return (
            <div
              key={plainDateToISO(weekDate)}
              role="row"
              {...stylex.props(monthGridStyles.weekRow)}>
              {hasWeekNumbers && (
                <div
                  role="rowheader"
                  {...stylex.props(monthGridStyles.weekNumber)}>
                  {plainDateFormatDayNumber(weekNum, locale)}
                </div>
              )}
              {week.map((day, dayIndex) => {
                // Whether the previous/next day in this week row continues the
                // highlighted run (range and preview). A disabled or
                // adjacent-month neighbour breaks continuity, so this day gets
                // an end cap on that side (#2715).
                const neighbors = computeDayNeighborContinuity({
                  week,
                  dayIndex,
                  mode,
                  rangeStart,
                  rangeEnd,
                  previewStart,
                  previewEnd,
                  isDisabled: isDateDisabled,
                });
                return (
                  <DayCell
                    key={day.iso}
                    day={day}
                    dayIndex={dayIndex}
                    mode={mode}
                    selectedDate={selectedDate}
                    rangeStart={rangeStart}
                    rangeEnd={rangeEnd}
                    previewStart={previewStart}
                    previewEnd={previewEnd}
                    today={today}
                    hasOutsideDays={hasOutsideDays}
                    isDisabled={isDateDisabled(day.date)}
                    neighbors={neighbors}
                    isTabbable={day.iso === seedTabbableIso}
                    isRangeSelectionInProgress={rangeSelectionStart !== null}
                    calendar={calendar}
                    onDayClick={onDayClick}
                    onDayHover={onDayHover}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// DayCell (Private)
// =============================================================================

interface DayCellProps {
  day: CalendarDay;
  dayIndex: number;
  mode: 'single' | 'range';
  selectedDate: PlainDate | null;
  rangeStart: PlainDate | null;
  rangeEnd: PlainDate | null;
  previewStart: PlainDate | null;
  previewEnd: PlainDate | null;
  today: PlainDate | null;
  hasOutsideDays: boolean;
  isDisabled: boolean;
  /**
   * Whether the previous/next day in the same week continues the highlighted
   * run (range and preview). When a neighbour is disabled or outside the month
   * it breaks the run, so this day gets an end cap on that side (#2715).
   */
  neighbors: DayNeighborContinuity;
  /**
   * Whether this day seeds the initial roving tab stop. useGridFocus
   * (`hasRovingTabIndex`) owns the live tab stop thereafter — it honors an
   * existing `tabindex="0"` and repairs/moves it on navigation and focus.
   */
  isTabbable: boolean;
  /**
   * Whether a range selection is mid-flight (first pick made, awaiting the
   * second). Disambiguates the accessible name of the picked day: mid-flight
   * it is only the "range start", while a completed one-day range is both
   * "range start and range end" (rangeStart === rangeEnd in both cases).
   */
  isRangeSelectionInProgress: boolean;
  /** The calendar system that writes the day's accessible name. */
  calendar: CalendarSystem;
  onDayClick: (date: PlainDate) => void;
  onDayHover: (date: PlainDate | null) => void;
}

function DayCell({
  day,
  dayIndex,
  mode,
  selectedDate,
  rangeStart,
  rangeEnd,
  previewStart,
  previewEnd,
  today,
  hasOutsideDays,
  isDisabled,
  neighbors,
  isTabbable: isTabbableDay,
  isRangeSelectionInProgress,
  calendar,
  onDayClick,
  onDayHover,
}: DayCellProps) {
  const t = useComponentTranslator();
  const locale = useLocale();
  const pressable = usePressFeedback();
  const {date, isOutside, dayNumber} = day;

  if (isOutside && !hasOutsideDays) {
    // Empty placeholder cell — still a gridcell so the grid geometry stays a
    // clean 7-per-row set for keyboard navigation.
    return <div role="gridcell" {...stylex.props(dayCellStyles.cell)} />;
  }

  const state = computeDayCellState({
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
  });

  const endpoint = isEndpoint(state);

  // The day's focus-ring treatment, derived once so the reflected `marker`
  // theme state and the StyleX ring styles below share a single source of
  // truth. `state.isSelected` is single-select only, so a range endpoint that
  // is today still qualifies for the today-in-range ring (unchanged prior
  // behavior).
  const showsTodayRing = state.isToday && !state.isSelected && !state.isInRange;
  const showsTodayInRangeRing =
    state.isToday && !state.isSelected && state.isInRange;
  const markerState: 'today-only' | 'today-in-range' | null = showsTodayRing
    ? 'today-only'
    : showsTodayInRangeRing
      ? 'today-in-range'
      : null;

  // Accessible name for the day button. Roving focus lands on the <button>,
  // not the role="gridcell" wrapper that carries aria-selected — and
  // aria-selected is invalid on role="button" — so the selection/range state
  // must be encoded into the button's name (WCAG 4.1.2). Localized via ICU
  // params rather than string concatenation. A mid-flight first pick (where
  // rangeStart === rangeEnd) reads as "range start" only; a completed one-day
  // range reads as both start and end.
  const dateLabel = formatDateLabel(date, calendar, locale);
  const dayLabel = state.isSelected
    ? t('@astryx.calendar.daySelected', {date: dateLabel})
    : state.isRangeStart && state.isRangeEnd
      ? isRangeSelectionInProgress
        ? t('@astryx.calendar.dayRangeStart', {date: dateLabel})
        : t('@astryx.calendar.dayRangeStartAndEnd', {date: dateLabel})
      : state.isRangeStart
        ? t('@astryx.calendar.dayRangeStart', {date: dateLabel})
        : state.isRangeEnd
          ? t('@astryx.calendar.dayRangeEnd', {date: dateLabel})
          : state.isInRange
            ? t('@astryx.calendar.dayInRange', {date: dateLabel})
            : dateLabel;

  const rangeRounding = computeRangeRounding(state, {
    prevInRange: neighbors.prevInRange,
    nextInRange: neighbors.nextInRange,
  });
  const previewRounding = computePreviewRounding(state, {
    prevInPreview: neighbors.prevInPreview,
    nextInPreview: neighbors.nextInPreview,
  });

  return (
    <div
      role="gridcell"
      aria-selected={state.isSelected || state.isInRange || undefined}
      {...stylex.props(dayCellStyles.cell)}>
      {/* Range background */}
      {state.isInRange && (
        <div
          {...stylex.props(
            dayCellStyles.rangeBg,
            dayCellTheme.rangeBg,
            rangeRounding.roundStart && dayCellStyles.rangeBgRadiusStart,
            rangeRounding.roundEnd && dayCellStyles.rangeBgRadiusEnd,
            state.isRangeStart && dayCellStyles.rangeInsetStart,
            state.isRangeStart &&
              rangeRounding.roundEnd &&
              dayCellStyles.rangeInsetEnd,
            state.isRangeEnd && dayCellStyles.rangeInsetEnd,
            state.isRangeStart &&
              rangeRounding.roundStart &&
              dayCellStyles.rangeInsetStart,
          )}
        />
      )}

      {/* Preview range background */}
      {state.isInPreview && (
        <div
          {...stylex.props(
            dayCellStyles.previewBg,
            dayCellTheme.previewBg,
            previewRounding.roundStart && dayCellStyles.previewBgRadiusStart,
            previewRounding.roundEnd && dayCellStyles.previewBgRadiusEnd,
            state.isPreviewStart && dayCellStyles.previewStart,
            state.isPreviewEnd && dayCellStyles.previewEnd,
          )}
        />
      )}

      {/* Day button */}
      <button
        type="button"
        data-date={day.iso}
        aria-label={dayLabel}
        aria-disabled={state.effectivelyDisabled || undefined}
        // Mark today's cell programmatically (APG date-picker pattern), not just
        // visually, so screen-reader users can identify the current date.
        aria-current={state.isToday ? 'date' : undefined}
        // A disabled day stays focusable through aria-disabled (spec:AST-085
        // FR1); arrows still skip it and its click and hover are guarded.
        // Initial roving tab-stop seed; useGridFocus owns it after mount.
        tabIndex={isTabbableDay ? 0 : -1}
        onClick={() => !state.effectivelyDisabled && onDayClick(date)}
        onMouseEnter={() => !state.effectivelyDisabled && onDayHover(date)}
        onMouseLeave={() => onDayHover(null)}
        {...pressable}
        {...mergeProps(
          themeProps('calendar-day', {
            selected: endpoint ? 'selected' : null,
            today: state.isToday ? 'today' : null,
            disabled: state.effectivelyDisabled ? 'disabled' : null,
            'in-range': state.isInRange ? 'in-range' : null,
            // `marker` reflects the day's *actual* focus-ring treatment as a
            // single compound state, so a theme can target exactly the states
            // the ring is drawn under without needing `:not()` in the theme
            // key. It is null unless a ring is shown:
            //   'today-only'     → today, not single-selected, not in a range
            //   'today-in-range' → today, not single-selected, inside a range
            // `isSelected` here is single-select only (see computeDayCellState),
            // so a today range endpoint still shows the today-in-range ring —
            // `marker` mirrors the StyleX conditions below exactly, preserving
            // the default rendering.
            marker: markerState,
          }),
          focusOutlineProps.focusVisible(
            dayCellStyles.day,
            dayCellTheme.day,
            interactionOverlayStyles.backgroundImage,
            isOutside && dayCellStyles.dayOutside,
            isOutside && dayCellTheme.dayOutside,
            showsTodayRing && dayCellStyles.dayToday,
            showsTodayRing && dayCellTheme.dayToday,
            showsTodayInRangeRing && dayCellStyles.dayTodayInRange,
            showsTodayInRangeRing && dayCellTheme.dayTodayInRange,
            endpoint && dayCellStyles.daySelected,
            endpoint && dayCellTheme.daySelected,
            state.effectivelyDisabled && dayCellStyles.dayDisabled,
            state.effectivelyDisabled && dayCellTheme.dayDisabled,
          ),
        )}>
        {plainDateFormatDayNumber(dayNumber, locale)}
      </button>
    </div>
  );
}
