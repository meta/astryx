// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {
  useCalendarConstraints,
  type ISODateString,
} from '@astryxdesign/core/Calendar';
import {Button} from '@astryxdesign/core/Button';
import {VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

// The hotel's bookable season: no past dates, none after the season ends.
const SEASON_START: ISODateString = '2026-07-01';
const SEASON_END: ISODateString = '2026-08-31';
// The hotel is closed on Mondays.
const isOpen = (date: Date) => date.getDay() !== 1;

type PlainDate = {year: number; month: number; day: number};

const iso = (d: PlainDate) =>
  `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;

const parseISO = (value: string): PlainDate => {
  const [year, month, day] = value.split('-').map(Number);
  return {year, month, day};
};

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export default function UseCalendarConstraintsHookUsage() {
  const [anchor, setAnchor] = useState<PlainDate | null>(null);
  const {isDateDisabled} = useCalendarConstraints({
    min: SEASON_START,
    max: SEASON_END,
    maxRangeSpan: 7, // at most a 7-day window once check-in is picked
    rangeAnchor: anchor,
    dateConstraints: [isOpen],
  });

  const month = parseISO(SEASON_START);
  const days = Array.from(
    {length: daysInMonth(month.year, month.month)},
    (_, i) => ({
      ...month,
      day: i + 1,
    }),
  );

  const pick = (day: PlainDate) => {
    if (isDateDisabled(day)) return;
    setAnchor(day); // first click: the span cap now measures from here
  };

  return (
    <VStack gap={3} hAlign="center" style={{width: '100%'}}>
      <Text type="supporting" color="secondary">
        {anchor
          ? `Check-in ${iso(anchor)} — stays up to 7 days`
          : 'Pick a check-in date (Jul 1 – Aug 31, closed Mondays)'}
      </Text>
      <div
        role="grid"
        aria-label="July 2026"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 34px)',
          gap: 4,
        }}>
        {days.map(day => {
          const disabled = isDateDisabled(day);
          return (
            <button
              key={iso(day)}
              type="button"
              aria-disabled={disabled}
              onClick={() => pick(day)}
              style={{
                height: 30,
                border: 'none',
                borderRadius: 6,
                background: disabled
                  ? 'transparent'
                  : 'var(--color-surface-raised)',
                color: disabled
                  ? 'var(--color-text-tertiary)'
                  : 'var(--color-text-primary)',
                cursor: disabled ? 'default' : 'pointer',
                textDecoration: disabled ? 'line-through' : 'none',
              }}>
              {day.day}
            </button>
          );
        })}
      </div>
      {anchor && (
        <Button
          label="Clear selection"
          variant="secondary"
          size="sm"
          onClick={() => setAnchor(null)}
        />
      )}
    </VStack>
  );
}
