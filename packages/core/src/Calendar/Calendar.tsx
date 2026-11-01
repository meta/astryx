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
import {
  useCalendarDays,
  useCalendarConstraints,
  type CalendarDay,
} from './hooks';
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
  plainDateToday,
  plainDateSetFirstOfMonth,
  plainDateAddMonths,
  plainDateAddDays,
  plainDateDiffDays,
  getDaysInMonth,
  plainDateIsAfter,
  plainDateIsBefore,
  plainDateIsEqual,
  plainDateGetWeekNumber,
  plainDateFormat,
  plainDateWeekFieldName,
  DATE_FORMAT_WITH_WEEKDAY,
  DATE_FORMAT_MONTH_YEAR,
} from '../utils/plainDate';
import {mergeProps, composeEventHandlers, rtlStyles} from '../utils';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {interactionOverlayStyles} from '../utils/interactionOverlay.stylex';
import {usePressFeedback} from '../hooks/usePressFeedback';
import {getInitialFocusDate} from './getInitialFocusDate';
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
import {useLocale, useTranslator} from '../i18n';
import {VisuallyHidden} from '../VisuallyHidden';

/** How a month navigation moves the focused day: by its row offset in days, or by whole months. */
type NavigationUnit = 'days' | 'months';

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
   * Show ISO week numbers in a side column.
   * Default: false
   */
  hasWeekNumbers?: boolean;

  /**
   * Use variable rows per month vs. fixed 6-row grid.
   * Default: false (fixed 6 rows for consistent height)
   */
  hasVariableRowCount?: boolean;

  /**
   * First day of week. Accepts a number (0 = Sunday … 6 = Saturday) or a
   * three-letter day name ('sun'–'sat', case-insensitive) for readability.
   * Default: 0 (Sunday)
   */
  weekStartsOn?: DayOfWeek | DayOfWeekName;
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

/** The first day of `month`'s month that `isDisabled` allows, or null. */
function firstEnabledDayOfMonth(
  month: PlainDate,
  isDisabled: (pd: PlainDate) => boolean,
): PlainDate | null {
  const days = getDaysInMonth(month.year, month.month);
  for (let day = 1; day <= days; day += 1) {
    const pd = {year: month.year, month: month.month, day};
    if (!isDisabled(pd)) {
      return pd;
    }
  }
  return null;
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
  const t = useTranslator();
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
    xstyle,
    className,
    style,
    onKeyDown,
    ...rest
  } = props;

  // Normalize `weekStartsOn` (number or three-letter day name) to a numeric
  // DayOfWeek so all downstream date math keeps working with an index.
  const weekStartsOn = normalizeDayOfWeek(weekStartsOnProp);

  // `numberOfMonths` is typed `1 | 2`; defensively clamp anything else that
  // slips through at runtime to 1 so `Array.from({length})` can't render an
  // absurd number of month grids (e.g. `numberOfMonths={1000}`).
  const numberOfMonths = numberOfMonthsProp === 2 ? 2 : 1;

  // Today's date (memoized)
  const today = useMemo(() => plainDateToday(), []);

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

  // Focus date state (which month is visible). Falls back to today, clamped
  // into the min/max window so a window that doesn't contain today doesn't
  // open on an all-disabled month.
  const [internalFocusDate, setInternalFocusDate] = useState<PlainDate>(() =>
    getInitialFocusDate({
      focusDate: focusDateProp,
      value: effectiveValue,
      min,
      max,
      numberOfMonths,
      today,
    }),
  );

  // Use controlled focusDate if callback is provided, otherwise use internal state
  const isControlledFocus =
    focusDateProp !== undefined && onFocusDateChange !== undefined;
  const focusDate = isControlledFocus
    ? plainDateFromISO(focusDateProp)
    : internalFocusDate;

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

  // Base month (first day of focus month)
  const baseMonth = useMemo(() => {
    return plainDateSetFirstOfMonth(focusDate);
  }, [focusDate]);

  // Generate visible months
  const visibleMonths = useMemo(() => {
    return Array.from({length: numberOfMonths}, (_, i) => {
      return plainDateAddMonths(baseMonth, i);
    });
  }, [baseMonth, numberOfMonths]);

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
    return visibleMonths.some(
      pd => pd.year === target.year && pd.month === target.month,
    )
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
  const monthYearLabel = useMemo(() => {
    if (numberOfMonths === 1) {
      return plainDateFormat(visibleMonths[0], DATE_FORMAT_MONTH_YEAR, locale);
    }
    return visibleMonths
      .map(m => plainDateFormat(m, DATE_FORMAT_MONTH_YEAR, locale))
      .join(' – ');
  }, [visibleMonths, numberOfMonths, locale]);

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
    if (isInitialRenderRef.current) {
      isInitialRenderRef.current = false;
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

  const canNavigatePrevious = useMemo(() => {
    if (!min) {
      return true;
    }
    const minDate = plainDateFromISO(min);
    // Can't go back if min is in the current focus month
    return (
      minDate.year < baseMonth.year ||
      (minDate.year === baseMonth.year && minDate.month < baseMonth.month)
    );
  }, [min, baseMonth]);

  const canNavigateNext = useMemo(() => {
    if (!max) {
      return true;
    }
    const maxDate = plainDateFromISO(max);
    // Check against the last visible month, not just baseMonth
    const lastVisibleMonth = plainDateAddMonths(baseMonth, numberOfMonths - 1);
    return (
      maxDate.year > lastVisibleMonth.year ||
      (maxDate.year === lastVisibleMonth.year &&
        maxDate.month > lastVisibleMonth.month)
    );
  }, [max, baseMonth, numberOfMonths]);

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
      const monthIndex = (pd: PlainDate) => pd.year * 12 + pd.month;
      const firstShown = monthIndex(baseMonth);
      const lastShown = firstShown + numberOfMonths - 1;

      // The Previous/Next buttons move the month with no focused day.
      if (!focusedDate) {
        if (
          (delta < 0 && !canNavigatePrevious) ||
          (delta > 0 && !canNavigateNext)
        ) {
          return;
        }
        const newPd = plainDateAddMonths(baseMonth, delta);
        if (onFocusDateChange) {
          onFocusDateChange(plainDateToISO(newPd));
        } else {
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
      if (unit === 'months') {
        // A page targets the same day of the month a month away (clamped to
        // that month's length). Past `min`/`max` nothing moves; a month with
        // no enabled day is no destination either, the same as an arrow with
        // no enabled day in its direction; a target disabled by a constraint
        // lands on that month's first enabled day instead.
        const candidate = plainDateAddMonths(currentPd, delta);
        if (!inRange(candidate)) {
          return;
        }
        if (isRootDateDisabled(candidate)) {
          const firstEnabled = firstEnabledDayOfMonth(
            candidate,
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
      const targetMonth = monthIndex(resolved);
      setPendingFocus(plainDateToISO(resolved));
      if (targetMonth >= firstShown && targetMonth <= lastShown) {
        return;
      }
      const targetFirst = {year: resolved.year, month: resolved.month, day: 1};
      const newPd =
        targetMonth < firstShown
          ? targetFirst
          : plainDateAddMonths(targetFirst, -(numberOfMonths - 1));
      if (onFocusDateChange) {
        onFocusDateChange(plainDateToISO(newPd));
      } else {
        setInternalFocusDate(newPd);
      }
    },
    [
      baseMonth,
      canNavigateNext,
      canNavigatePrevious,
      isRootDateDisabled,
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
              date: plainDateFormat(date, DATE_FORMAT_WITH_WEEKDAY, locale),
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
                date: plainDateFormat(date, DATE_FORMAT_WITH_WEEKDAY, locale),
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
              start: plainDateFormat(
                plainDateFromISO(start),
                DATE_FORMAT_WITH_WEEKDAY,
                locale,
              ),
              end: plainDateFormat(
                plainDateFromISO(end),
                DATE_FORMAT_WITH_WEEKDAY,
                locale,
              ),
            }),
          );
        }
      }
    },
    [mode, onChange, rangeSelectionStart, minRangeSpan, announce, t, locale],
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
      <div {...stylex.props(calendarStyles.monthsContainer)}>
        {visibleMonths.map(month => (
          <MonthGrid
            key={`${month.year}-${month.month}`}
            month={month}
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
  month: PlainDate;
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
  today: PlainDate;
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
  const year = month.year;

  // Use hooks for days generation and constraints
  const {days, weeks, dayNames} = useCalendarDays({
    year,
    month: month.month,
    weekStartsOn,
    hasVariableRowCount,
  });
  const dayNameHeaders = useMemo(
    () =>
      dayNames.map((name, offset) => ({
        dayOfWeek: ((weekStartsOn + offset) % 7) as DayOfWeek,
        name,
      })),
    [dayNames, weekStartsOn],
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
      const isSelectedInMonth =
        selectedDateForTabindex.year === year &&
        selectedDateForTabindex.month === month.month;
      if (isSelectedInMonth && !isDateDisabled(selectedDateForTabindex)) {
        return plainDateToISO(selectedDateForTabindex);
      }
    }

    const isTodayInMonth = today.year === year && today.month === month.month;
    if (isTodayInMonth && !isDateDisabled(today)) {
      return plainDateToISO(today);
    }

    for (const day of days) {
      if (!day.isOutside && !isDateDisabled(day.date)) {
        return day.iso;
      }
    }

    return null;
  }, [days, today, year, month.month, isDateDisabled, selectedDateForTabindex]);

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

  // Handle PageUp/PageDown
  const handlePageUp = useCallback(() => {
    const focusedDate = getFocusedDate();
    if (focusedDate) {
      onNavigatePrevious?.(focusedDate, 1, 'months');
    }
  }, [getFocusedDate, onNavigatePrevious]);

  const handlePageDown = useCallback(() => {
    const focusedDate = getFocusedDate();
    if (focusedDate) {
      onNavigateNext?.(focusedDate, 1, 'months');
    }
  }, [getFocusedDate, onNavigateNext]);

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
    if (targetPd.year !== year || targetPd.month !== month.month) {
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
  }, [pendingFocus, gridRef, month.month, onPendingFocusHandled, year]);

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
    return plainDateFormat(month, DATE_FORMAT_MONTH_YEAR, locale);
  }, [month, locale]);

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
          const weekNum = plainDateGetWeekNumber(weekDate);

          return (
            <div
              key={plainDateToISO(weekDate)}
              role="row"
              {...stylex.props(monthGridStyles.weekRow)}>
              {hasWeekNumbers && (
                <div
                  role="rowheader"
                  {...stylex.props(monthGridStyles.weekNumber)}>
                  {weekNum}
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
  today: PlainDate;
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
  onDayClick,
  onDayHover,
}: DayCellProps) {
  const t = useTranslator();
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
  const dateLabel = plainDateFormat(date, DATE_FORMAT_WITH_WEEKDAY, locale);
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
        {dayNumber}
      </button>
    </div>
  );
}
