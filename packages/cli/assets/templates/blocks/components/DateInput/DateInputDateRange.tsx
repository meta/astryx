// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {DateInput} from '@astryxdesign/core/DateInput';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

type DateString =
  `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

const pad = (n: number) => String(n).padStart(2, '0');
const today = new Date();
const year = today.getFullYear();
const month = today.getMonth();
const startDay = 8;
const endDay = 21;
const min = `${year}-${pad(month + 1)}-${pad(startDay)}` as DateString;
const max = `${year}-${pad(month + 1)}-${pad(endDay)}` as DateString;
const monthName = new Date(year, month, 1).toLocaleString('en-US', {
  month: 'short',
});
const description = `Available dates: ${monthName} ${startDay} – ${endDay}, ${year}`;

export default function DateInputDateRange() {
  const [value, setValue] = useState<DateString | undefined>(undefined);

  return (
    <Stack
      direction="vertical"
      gap={4}
      width="100%"
      style={{minWidth: 240, maxWidth: 400}}>
      <Text type="supporting" color="secondary">
        {value ? `Booked: ${value}` : 'Pick a date in the available range'}
      </Text>
      <DateInput
        label="Booking date"
        min={min}
        max={max}
        description={description}
        placeholder="Select a booking date"
        presentation="adaptive-bottom-sheet"
        value={value}
        onChange={setValue}
      />
    </Stack>
  );
}
