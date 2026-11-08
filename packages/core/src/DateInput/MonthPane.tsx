// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MonthPane.tsx
 * @input A month, the selection, the focused day and the day handlers
 * @output MonthPane: one month as a six-row grid of day buttons; and
 *   monthGridKeyTarget: the day a grid key moves the focus to
 * @position Internal leaf shared by MonthScroller.tsx and MonthPager.tsx
 *
 * SYNC: When modified, update DateInputTouch.test.tsx.
 */

import {memo, useMemo} from 'react';
import * as stylex from '@stylexjs/stylex';
import {useCalendarDays} from '../Calendar/hooks/useCalendarDays';
import {useLocale} from '../i18n/useLocale';
import {
  colorVars,
  radiusVars,
  fontWeightVars,
  typeScaleVars,
  durationVars,
  borderVars,
} from '../theme/tokens.stylex';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import type {DayOfWeek, ISODateString, PlainDate} from '../utils/dateTypes';
import {
  plainDateAddDays,
  plainDateDayOfWeek,
  plainDateFormatDayNumber,
  plainDateIsEqual,
  plainDateToISO,
  DATE_FORMAT_WITH_WEEKDAY,
} from '../utils/plainDate';
import {
  type CalendarSystem,
  calendarShiftMonths,
  calendarShiftYears,
  calendarYearMonthOf,
  formatCalendarDate,
  formatCalendarMonthLabel,
  isInCalendarMonth,
} from '../utils/calendarSystem';
import {dateInputTouchSizes, dateInputTouchGeometry} from './tokens.stylex';
import type {MonthModel} from './monthGeometry';

const DAY_SIZE = dateInputTouchSizes.daySize;

const styles = stylex.create({
  pane: {
    position: 'absolute',
    insetBlock: 0,
    blockSize: dateInputTouchGeometry.paneBlockSize,
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gridTemplateRows: dateInputTouchGeometry.paneRows,
  },
  row: {
    display: 'contents',
  },
  cell: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    inlineSize: '100%',
    blockSize: '100%',
    minInlineSize: DAY_SIZE,
    minBlockSize: DAY_SIZE,
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    color: colorVars['--color-text-primary'],
    fontSize: typeScaleVars['--text-body-size'],
    fontWeight: fontWeightVars['--font-weight-normal'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    // A tap on a 44px target should not also select the number inside it.
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
  },
  /**
   * The circular hit/selection puck inside the tap target. Sizing the puck
   * rather than the button keeps the touch target at the full cell while the
   * visual stays a tidy circle.
   */
  puck: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    inlineSize: `calc(${DAY_SIZE} - 8px)`,
    blockSize: `calc(${DAY_SIZE} - 8px)`,
    borderRadius: radiusVars['--radius-full'],
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    transitionProperty: 'background-color, color, border-color',
    transitionDuration: durationVars['--duration-fast'],
  },
  puckHoverable: {
    // Two guards, for two different failure modes.
    //
    // `@media (hover: hover)`: on a touch screen a :hover tint sticks to the
    // last tapped day until something else is tapped.
    //
    // `:where(:not(:disabled,[aria-disabled="true"]))`: a browser suppresses a
    // disabled control's events, not its hover styling, so an unguarded
    // :hover tints a day you cannot pick. The disabled state sits on the
    // button, and this puck is the span inside it. So the call site's gate
    // does the work, and this guard holds if the styles move to the button.
    backgroundColor: {
      default: 'transparent',
      '@media (hover: hover)': {
        default: 'transparent',
        ':hover:where(:not(:disabled,[aria-disabled="true"]))':
          colorVars['--color-overlay-hover'],
      },
    },
  },
  puckToday: {
    borderColor: colorVars['--color-border-emphasized'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
  },
  puckSelected: {
    backgroundColor: {
      default: colorVars['--color-accent'],
      // Holds the accent through hover, overriding puckHoverable's tint.
      // Same guarded selector, so the two have equal specificity and
      // application order decides — which is what puts this one on top.
      ':hover:where(:not(:disabled,[aria-disabled="true"]))':
        colorVars['--color-accent'],
    },
    borderColor: colorVars['--color-accent'],
    color: colorVars['--color-on-accent'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
  },
  /**
   * A day belonging to the month either side of this pane. It is muted and
   * unselectable, as in Calendar: it shows where the month ends. A tap out of
   * the pane would move the calendar under the thumb.
   *
   * It takes no tab stop: `tabbableISO` names only a date in its own pane's
   * month. So a date never has two tab stops.
   */
  dayOutside: {
    // Calendar's spill-day treatment: the secondary text colour and half
    // opacity, so these days read as background, not as dimmer choices.
    color: colorVars['--color-text-secondary'],
    opacity: 0.5,
  },
  dayDisabled: {
    // Calendar's disabled treatment: it fades the day's own colour to 0.3.
    // So a disabled in-month day and a disabled spill day stay a step apart,
    // and both read lighter than an enabled spill day.
    opacity: 0.3,
    cursor: 'default',
  },
});

const dynamic = stylex.create({
  // insetInlineStart, not left: under RTL the panes lay out from the right,
  // and the scroller and the pager mirror with them.
  pane: (insetInlineStart: number, inlineSize: number) => ({
    insetInlineStart: `${insetInlineStart}px`,
    inlineSize: `${inlineSize}px`,
  }),
});

export interface MonthPaneProps {
  /** The calendar's months, by index. */
  monthModel: MonthModel;
  monthIndex: number;
  insetInlineStart: number;
  inlineSize: number;
  selectedDate: PlainDate | null;
  focusedDate: PlainDate | null;
  /** Today, or `null` while it is not known yet (server render, hydration). */
  today: PlainDate | null;
  isDateDisabled: (date: PlainDate) => boolean;
  weekStartsOn: DayOfWeek;
  onSelect: (value: ISODateString) => void;
  onDayKeyDown: (event: React.KeyboardEvent, date: PlainDate) => void;
  onDayFocus: (date: PlainDate) => void;
  /**
   * Whether one of this pane's days takes a tab stop. The pager gives it only
   * to the month it shows. A neighbour is mounted off-screen, and Tab into it
   * would scroll the clipped viewport under the track.
   */
  hasTabStop: boolean;
  /** The surface's own pane style: the scroller's snap or the pager's layer. */
  paneStyle?: stylex.StyleXStyles;
}

/**
 * One month, as a six-row grid.
 *
 * It has no `role="columnheader"` row: the weekday names are one sticky row
 * outside the scroller or the pager, so they never scroll away. Each day
 * carries its weekday in its accessible name instead.
 */
export const MonthPane = memo(function MonthPane({
  monthModel,
  monthIndex,
  insetInlineStart,
  inlineSize,
  selectedDate,
  focusedDate,
  today,
  isDateDisabled,
  weekStartsOn,
  onSelect,
  onDayKeyDown,
  onDayFocus,
  hasTabStop,
  paneStyle,
}: MonthPaneProps) {
  const locale = useLocale();
  const {calendar} = monthModel;
  const month = useMemo(
    () => monthModel.monthAt(monthIndex),
    [monthModel, monthIndex],
  );
  const {weeks} = useCalendarDays({
    ...calendarYearMonthOf(calendar, month),
    calendar,
    weekStartsOn,
    // Always six rows: a variable grid would make pane heights differ, and
    // with them every snap offset below this month.
    hasVariableRowCount: false,
  });

  const monthLabel = formatCalendarMonthLabel(calendar, month, locale);

  // One day per pane is tab-reachable, so Tab moves through the picker, not
  // through 42 buttons. It is the focused day, else the selection, else the
  // first of the month.
  const tabbableISO = (() => {
    if (focusedDate != null && isInCalendarMonth(focusedDate, month)) {
      return plainDateToISO(focusedDate);
    }
    if (selectedDate != null && isInCalendarMonth(selectedDate, month)) {
      return plainDateToISO(selectedDate);
    }
    return plainDateToISO(month.start);
  })();

  return (
    <div
      role="grid"
      aria-label={monthLabel}
      data-month={monthLabel}
      {...stylex.props(
        styles.pane,
        paneStyle,
        dynamic.pane(insetInlineStart, inlineSize),
      )}>
      {weeks.map(week => (
        <div key={week[0].iso} role="row" {...stylex.props(styles.row)}>
          {week.map(day => {
            // A spilled day is context, not a choice, as in Calendar's
            // `effectivelyDisabled`. So a date borrowed from a neighbouring
            // month carries no ring or puck in the pane that only shows it.
            const isDisabled = day.isOutside || isDateDisabled(day.date);
            const isSelected =
              !day.isOutside &&
              selectedDate != null &&
              plainDateIsEqual(day.date, selectedDate);
            const isToday =
              !day.isOutside &&
              today != null &&
              plainDateIsEqual(day.date, today);

            return (
              <div
                key={day.iso}
                role="gridcell"
                aria-selected={isSelected || undefined}
                {...stylex.props(styles.cell)}>
                <button
                  type="button"
                  data-date={day.iso}
                  data-outside={day.isOutside ? '' : undefined}
                  tabIndex={hasTabStop && day.iso === tabbableISO ? 0 : -1}
                  aria-label={formatCalendarDate(
                    calendar,
                    day.date,
                    DATE_FORMAT_WITH_WEEKDAY,
                    locale,
                  )}
                  aria-disabled={isDisabled || undefined}
                  aria-current={isToday ? 'date' : undefined}
                  onClick={() => {
                    if (!isDisabled) {
                      onSelect(day.iso);
                    }
                  }}
                  onFocus={() => onDayFocus(day.date)}
                  onKeyDown={event => onDayKeyDown(event, day.date)}
                  {...stylex.props(
                    styles.day,
                    focusOutlineStyles.focusVisible,
                    // Outside first, so disabled wins where both apply. A
                    // spilled day past the range must not look more available
                    // than the in-month days beside it.
                    day.isOutside && styles.dayOutside,
                    isDisabled && styles.dayDisabled,
                  )}>
                  <span
                    {...stylex.props(
                      styles.puck,
                      !isDisabled && styles.puckHoverable,
                      isToday && styles.puckToday,
                      isSelected && styles.puckSelected,
                    )}>
                    {plainDateFormatDayNumber(day.dayNumber, locale)}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
});

MonthPane.displayName = 'MonthPane';

/**
 * The day a grid key moves the focus to from `date`, or null for any other
 * key. The vocabulary is the APG grid's: the arrows follow the reading
 * direction, and Home and End reach the ends of the shown week. PageUp and
 * PageDown move a month of the calendar, and with Shift a year, as Calendar
 * does.
 */
export function monthGridKeyTarget(
  event: React.KeyboardEvent,
  date: PlainDate,
  {
    calendar,
    isRTL,
    weekStartsOn,
  }: {calendar: CalendarSystem; isRTL: boolean; weekStartsOn: DayOfWeek},
): PlainDate | null {
  const column = (plainDateDayOfWeek(date) - weekStartsOn + 7) % 7;
  const forward = isRTL ? 'ArrowLeft' : 'ArrowRight';
  const backward = isRTL ? 'ArrowRight' : 'ArrowLeft';
  switch (event.key) {
    case backward:
      return plainDateAddDays(date, -1);
    case forward:
      return plainDateAddDays(date, 1);
    case 'ArrowUp':
      return plainDateAddDays(date, -7);
    case 'ArrowDown':
      return plainDateAddDays(date, 7);
    case 'Home':
      return plainDateAddDays(date, -column);
    case 'End':
      return plainDateAddDays(date, 6 - column);
    case 'PageUp':
      return event.shiftKey
        ? calendarShiftYears(calendar, date, -1)
        : calendarShiftMonths(calendar, date, -1);
    case 'PageDown':
      return event.shiftKey
        ? calendarShiftYears(calendar, date, 1)
        : calendarShiftMonths(calendar, date, 1);
    default:
      return null;
  }
}
