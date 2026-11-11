// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useEffect, useRef, useState} from 'react';
import {
  useCalendarDays,
  useCalendarNavigation,
  type CalendarDay,
  type ISODateString,
} from '@astryxdesign/core/Calendar';
import {Button} from '@astryxdesign/core/Button';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

export default function UseCalendarNavigationHookUsage() {
  const [focusDate, setFocusDate] = useState<ISODateString>(
    '2026-06-01' as ISODateString,
  );

  const {
    monthYearLabel,
    visibleCalendarMonths,
    navigateMonth,
    pendingFocus,
    clearPendingFocus,
  } = useCalendarNavigation({
    focusDate,
    onFocusDateChange: setFocusDate,
    numberOfMonths: 1,
  });

  const {weeks, dayNames} = useCalendarDays({
    ...visibleCalendarMonths[0],
    weekStartsOn: 0,
    hasVariableRowCount: true,
  });

  const dayButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Move focus to target date when navigating across month boundaries
  useEffect(() => {
    if (pendingFocus) {
      const el = dayButtonRefs.current.get(pendingFocus);
      if (el) {
        el.focus();
        clearPendingFocus();
      }
    }
  }, [pendingFocus, clearPendingFocus, weeks]);

  // Arrow key navigation moving across days and month boundaries with RTL awareness (DR6, DR11)
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    day: CalendarDay,
  ) => {
    if (day.isOutside) {
      return;
    }

    const isRtl =
      typeof window !== 'undefined' &&
      getComputedStyle(e.currentTarget).direction === 'rtl';

    const isNext = isRtl ? e.key === 'ArrowLeft' : e.key === 'ArrowRight';
    const isPrev = isRtl ? e.key === 'ArrowRight' : e.key === 'ArrowLeft';

    if (isNext) {
      e.preventDefault();
      const inMonthDays = weeks.flatMap(w => w.filter(d => !d.isOutside));
      const currentIndex = inMonthDays.findIndex(d => d.iso === day.iso);
      if (currentIndex === inMonthDays.length - 1) {
        // Last day of month: advance month and focus next day across boundary
        navigateMonth(1, day.iso, 1);
      } else {
        const nextDay = inMonthDays[currentIndex + 1];
        dayButtonRefs.current.get(nextDay.iso)?.focus();
      }
    } else if (isPrev) {
      e.preventDefault();
      const inMonthDays = weeks.flatMap(w => w.filter(d => !d.isOutside));
      const currentIndex = inMonthDays.findIndex(d => d.iso === day.iso);
      if (currentIndex === 0) {
        // First day of month: step back month and focus previous day across boundary
        navigateMonth(-1, day.iso, 1);
      } else {
        const prevDay = inMonthDays[currentIndex - 1];
        dayButtonRefs.current.get(prevDay.iso)?.focus();
      }
    }
  };

  return (
    <VStack gap={3} style={{width: 280}}>
      <HStack gap={2} vAlign="center" hAlign="between">
        <Button
          label="Previous"
          size="sm"
          variant="secondary"
          onClick={() => navigateMonth(-1)}
          aria-label="Previous month"
        />
        <Text type="body" weight="bold">
          {monthYearLabel}
        </Text>
        <Button
          label="Next"
          size="sm"
          variant="secondary"
          onClick={() => navigateMonth(1)}
          aria-label="Next month"
        />
      </HStack>

      <table style={{tableLayout: 'fixed', width: 280}}>
        <thead>
          <tr>
            {dayNames.map((name, i) => (
              <th key={i} scope="col">
                <Text type="supporting" color="secondary">
                  {name}
                </Text>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map(week => (
            <tr key={week[0].iso}>
              {week.map(day => (
                <td key={day.iso} align="center">
                  <button
                    type="button"
                    ref={el => {
                      if (el) {
                        dayButtonRefs.current.set(day.iso, el);
                      } else {
                        dayButtonRefs.current.delete(day.iso);
                      }
                    }}
                    disabled={day.isOutside}
                    aria-hidden={day.isOutside || undefined}
                    onKeyDown={e => handleKeyDown(e, day)}
                    aria-label={
                      day.isOutside
                        ? undefined
                        : `${monthYearLabel} ${day.dayNumber}`
                    }
                    tabIndex={day.isOutside ? -1 : 0}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      border: 'none',
                      background: 'transparent',
                      opacity: day.isOutside ? 0.35 : 1,
                      cursor: day.isOutside ? 'not-allowed' : 'pointer',
                    }}>
                    <Text
                      type="body"
                      color={day.isOutside ? 'secondary' : 'primary'}>
                      {day.dayNumber}
                    </Text>
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </VStack>
  );
}
