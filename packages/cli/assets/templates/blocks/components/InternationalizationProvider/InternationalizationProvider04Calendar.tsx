// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {Calendar, type ISODateString} from '@astryxdesign/core/Calendar';
import {DateInput} from '@astryxdesign/core/DateInput';
import {VStack} from '@astryxdesign/core/Layout';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Text} from '@astryxdesign/core/Text';

type CalendarSystem = 'gregory' | 'japanese' | 'buddhist';

export default function InternationalizationProviderCalendar() {
  const [calendar, setCalendar] = useState<CalendarSystem>('japanese');
  const [value, setValue] = useState<ISODateString | undefined>('2026-10-30');
  return (
    <InternationalizationProvider locale="en" calendar={calendar}>
      <VStack gap={4} hAlign="center">
        <SegmentedControl
          label="Calendar"
          value={calendar}
          onChange={next => setCalendar(next as CalendarSystem)}
          size="sm">
          <SegmentedControlItem value="gregory" label="Gregorian" />
          <SegmentedControlItem value="japanese" label="Japanese" />
          <SegmentedControlItem value="buddhist" label="Buddhist" />
        </SegmentedControl>
        <DateInput
          label="Start date"
          value={value}
          onChange={setValue}
          controlStyle={{width: 300}}
        />
        <Calendar value={value ?? null} onChange={next => setValue(next)} />
        <Text type="supporting" color="secondary">
          {value ? `Value: ${value}` : 'No date'}
        </Text>
      </VStack>
    </InternationalizationProvider>
  );
}
