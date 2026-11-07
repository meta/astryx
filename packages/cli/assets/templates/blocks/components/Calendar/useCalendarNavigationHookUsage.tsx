// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useEffect, useRef, useState} from 'react';
import {
  useCalendarNavigation,
  type ISODateString,
} from '@astryxdesign/core/Calendar';
import {Button} from '@astryxdesign/core/Button';
import {VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

type PlainDate = {year: number; month: number; day: number};

const iso = (d: PlainDate) =>
  `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;

const parseISO = (value: string): PlainDate => {
  const [year, month, day] = value.split('-').map(Number);
  return {year, month, day};
};

const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

export default function UseCalendarNavigationHookUsage() {
  const [focusedDay, setFocusedDay] = useState<ISODateString | null>(null);
  const {
    baseMonth,
    monthYearLabel,
    navigateMonth,
    pendingFocus,
    clearPendingFocus,
  } = useCalendarNavigation({
    initialValue: '2026-07-01',
    numberOfMonths: 1,
  });

  // Focus the day a navigation asked for, once the new month has rendered.
  useEffect(() => {
    if (pendingFocus) {
      setFocusedDay(pendingFocus);
      clearPendingFocus();
    }
  }, [pendingFocus, clearPendingFocus]);

  const days = Array.from(
    {length: daysInMonth(baseMonth.year, baseMonth.month)},
    (_, i) => ({...baseMonth, day: i + 1}),
  );

  const onKeyDown = (event: React.KeyboardEvent, day: PlainDate) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const isLast = day.day === days.length;
    const isFirst = day.day === 1;
    const right = event.key === 'ArrowRight';
    // Crossing an edge hands the movement to navigation with offset 1, so
    // pendingFocus lands on the first (or last) day of the neighbor month.
    if ((right && isLast) || (!right && isFirst)) {
      navigateMonth(right ? 1 : -1, iso(day), 1);
      return;
    }
    const next = {...day, day: day.day + (right ? 1 : -1)};
    setFocusedDay(iso(next));
  };

  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusedDay) {
      const target = gridRef.current?.querySelector<HTMLElement>(
        `[data-date="${focusedDay}"]`,
      );
      target?.focus();
    }
  }, [focusedDay, baseMonth]);

  return (
    <VStack gap={3} hAlign="center" style={{width: '100%'}}>
      <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
        <Button
          label="Previous"
          variant="secondary"
          size="sm"
          onClick={() => navigateMonth(-1)}
        />
        <Text type="body" weight="bold">
          {monthYearLabel}
        </Text>
        <Button
          label="Next"
          variant="secondary"
          size="sm"
          onClick={() => navigateMonth(1)}
        />
      </div>
      <div
        ref={gridRef}
        role="grid"
        aria-label={monthYearLabel}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 34px)',
          gap: 4,
        }}>
        {days.map(day => {
          const dayISO = iso(day);
          return (
            <button
              key={dayISO}
              type="button"
              data-date={dayISO}
              aria-selected={focusedDay === dayISO}
              onClick={() => setFocusedDay(dayISO)}
              onKeyDown={event => onKeyDown(event, day)}
              style={{
                height: 30,
                border: 'none',
                borderRadius: 6,
                background:
                  focusedDay === dayISO
                    ? 'var(--color-accent)'
                    : 'var(--color-surface-raised)',
                color:
                  focusedDay === dayISO
                    ? 'var(--color-text-on-accent)'
                    : 'var(--color-text-primary)',
                cursor: 'pointer',
              }}>
              {day.day}
            </button>
          );
        })}
      </div>
    </VStack>
  );
}
