// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {useCalendarDays} from '@astryxdesign/core/Calendar';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Text} from '@astryxdesign/core/Text';

export default function UseCalendarDaysHookUsage() {
  const [weekStartsOn, setWeekStartsOn] = useState<0 | 1>(0);
  const {weeks, dayNames} = useCalendarDays({
    year: 2026,
    month: 12,
    weekStartsOn,
    hasVariableRowCount: true,
  });

  return (
    <VStack gap={3}>
      <HStack gap={2} vAlign="center">
        <Text type="body">Week starts on</Text>
        <SegmentedControl
          label="Week starts on"
          value={String(weekStartsOn)}
          onChange={value => setWeekStartsOn(value === '1' ? 1 : 0)}
          size="sm">
          <SegmentedControlItem value="0" label="Sunday" />
          <SegmentedControlItem value="1" label="Monday" />
        </SegmentedControl>
      </HStack>
      <table style={{tableLayout: 'fixed', width: 280}}>
        <caption>
          <Text type="body" weight="bold">
            December 2026
          </Text>
        </caption>
        <thead>
          <tr>
            {dayNames.map((name, column) => (
              <th key={(weekStartsOn + column) % 7} scope="col">
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
                  <Text
                    type="body"
                    color={day.isOutside ? 'secondary' : 'primary'}>
                    {day.dayNumber}
                  </Text>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </VStack>
  );
}
