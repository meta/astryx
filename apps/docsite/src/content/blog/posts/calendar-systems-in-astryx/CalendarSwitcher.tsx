// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {Calendar, type ISODateString} from '@astryxdesign/core/Calendar';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Text} from '@astryxdesign/core/Text';

const CALENDARS = [
  ['gregory', 'Gregorian'],
  ['persian', 'Persian'],
  ['hebrew', 'Hebrew'],
  ['japanese', 'Japanese'],
  ['buddhist', 'Buddhist'],
] as const;

type CalendarId = (typeof CALENDARS)[number][0];

export function CalendarSwitcher() {
  const [calendar, setCalendar] = useState<CalendarId>('persian');
  const [value, setValue] = useState<ISODateString | null>('2026-11-12');
  return (
    <InternationalizationProvider locale="en" calendar={calendar}>
      <VStack gap={4} hAlign="center">
        <HStack gap={4} vAlign="center" hAlign="center" wrap="wrap">
          <SegmentedControl
            label="Calendar"
            value={calendar}
            onChange={next => setCalendar(next as CalendarId)}
            size="sm">
            {CALENDARS.map(([id, label]) => (
              <SegmentedControlItem key={id} value={id} label={label} />
            ))}
          </SegmentedControl>
          <Text type="supporting" color="secondary">
            {value ? `Value: ${value}` : 'No date'}
          </Text>
        </HStack>
        <Calendar value={value} onChange={next => setValue(next)} />
      </VStack>
    </InternationalizationProvider>
  );
}
