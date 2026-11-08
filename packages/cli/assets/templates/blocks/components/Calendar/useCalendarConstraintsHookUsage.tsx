// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {
  useCalendarConstraints,
  useCalendarDays,
  type CalendarDay,
} from '@astryxdesign/core/Calendar';
import {Button} from '@astryxdesign/core/Button';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

// Hotel closed on Mondays (day === 1)
const isNotMonday = (date: Date) => date.getDay() !== 1;

export default function UseCalendarConstraintsHookUsage() {
  const [checkIn, setCheckIn] = useState<CalendarDay['date'] | null>(null);
  const [checkOut, setCheckOut] = useState<CalendarDay['date'] | null>(null);

  // June 2026 season: open Jun 5 – Jun 25, max 7 nights (8-day span), closed Mondays.
  // When checkOut is already chosen, clear rangeAnchor so full season remains viewable without lingering span restrictions.
  const {isDateDisabled} = useCalendarConstraints({
    min: '2026-06-05',
    max: '2026-06-25',
    maxRangeSpan: 8,
    rangeAnchor: checkOut ? null : checkIn,
    dateConstraints: [isNotMonday],
  });

  const {weeks, dayNames} = useCalendarDays({
    year: 2026,
    month: 6,
    weekStartsOn: 0,
    hasVariableRowCount: true,
  });

  const handleSelect = (day: CalendarDay) => {
    if (day.isOutside || isDateDisabled(day.date)) {
      return;
    }
    // If no check-in yet, or already booked, or clicking on/before current check-in: start new check-in
    if (!checkIn || checkOut || day.date.day <= checkIn.day) {
      setCheckIn(day.date);
      setCheckOut(null);
    } else {
      // Pick is after checkIn: set as check-out
      setCheckOut(day.date);
    }
  };

  const handleReset = () => {
    setCheckIn(null);
    setCheckOut(null);
  };

  return (
    <VStack gap={3}>
      <VStack gap={1}>
        <Text type="body" weight="bold">
          Hotel Booking — June 2026
        </Text>
        <Text type="supporting" color="secondary">
          Season: Jun 5 – Jun 25 · Max stay: 7 nights · Closed Mondays
        </Text>
      </VStack>
      <HStack gap={2} vAlign="center">
        <Text type="supporting">
          {checkIn
            ? checkOut
              ? `Booked: Jun ${checkIn.day} – Jun ${checkOut.day}`
              : `Check-in: Jun ${checkIn.day} (pick check-out)`
            : 'Pick a check-in date'}
        </Text>
        {checkIn && (
          <Button
            label="Reset"
            size="sm"
            variant="secondary"
            onClick={handleReset}
          />
        )}
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
              {week.map(day => {
                if (day.isOutside) {
                  return <td key={day.iso} align="center" />;
                }

                const disabled = isDateDisabled(day.date);
                const isSelected =
                  (checkIn &&
                    checkIn.day === day.date.day &&
                    checkIn.month === day.date.month) ||
                  (checkOut &&
                    checkOut.day === day.date.day &&
                    checkOut.month === day.date.month);

                return (
                  <td key={day.iso} align="center">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => handleSelect(day)}
                      aria-pressed={isSelected ? 'true' : 'false'}
                      aria-label={`June ${day.dayNumber}`}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 6,
                        border: isSelected ? '1px solid currentColor' : 'none',
                        background: 'transparent',
                        opacity: disabled ? 0.35 : 1,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                      }}>
                      <Text
                        type="body"
                        color={disabled ? 'secondary' : 'primary'}>
                        {day.dayNumber}
                      </Text>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </VStack>
  );
}
