// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input None
 * @output A bare page with a DateInput sheet over two centuries, a
 *   DateTimeInput sheet, and rows that make the document scroll
 * @position A raw page, with no sandbox chrome, for trying the month and year
 *   toggle in both sheets on a phone. The page scrolls with the document, as
 *   an app's page does.
 */

import {useState} from 'react';
import type {ISODateString} from '@astryxdesign/core/Calendar';
import {DateInput} from '@astryxdesign/core/DateInput';
import {DateTimeInput} from '@astryxdesign/core/DateTimeInput';
import type {ISODateTimeString} from '@astryxdesign/core/DateTimeInput';
import {VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';

const ROWS = Array.from({length: 40}, (_, index) => `Row ${index + 1}`);

export default function MonthYearTogglePage() {
  const [date, setDate] = useState<ISODateString | undefined>(
    '2026-03-15' as ISODateString,
  );
  const [dateTime, setDateTime] = useState<ISODateTimeString | undefined>(
    undefined,
  );
  return (
    <VStack gap={4} padding={4}>
      <VStack gap={1}>
        <Heading level={1}>Month and year toggle</Heading>
        <Text color="secondary">
          Tap a field, then tap the month title in its sheet.
        </Text>
      </VStack>
      <DateInput
        label="Date of birth"
        presentation="bottom-sheet"
        min={'1900-01-01' as ISODateString}
        max={'2099-12-31' as ISODateString}
        value={date}
        onChange={setDate}
      />
      <DateTimeInput
        label="Meeting time"
        placeholder="Select a date"
        presentation="bottom-sheet"
        value={dateTime}
        onChange={setDateTime}
      />
      <VStack gap={2}>
        {ROWS.map(row => (
          <Text key={row} color="secondary">
            {row}
          </Text>
        ))}
      </VStack>
    </VStack>
  );
}
