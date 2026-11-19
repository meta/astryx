// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input None
 * @output A bare page with a TimeInput whose bottom sheet opens at 11:58 AM,
 *   the committed time, and rows that make the document scroll
 * @position A raw page, with no sandbox chrome, for checking the sheet's
 *   looping minute wheel on a phone. The page scrolls with the document, as
 *   an app's page does.
 */

import {useState} from 'react';
import {VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {TimeInput} from '@astryxdesign/core/TimeInput';
import type {ISOTimeString} from '@astryxdesign/core/TimeInput';

const ROWS = Array.from({length: 40}, (_, index) => `Row ${index + 1}`);

export default function MinuteWheelLoopPage() {
  const [value, setValue] = useState<ISOTimeString | undefined>(
    '11:58' as ISOTimeString,
  );
  return (
    <VStack gap={4} padding={4}>
      <VStack gap={1}>
        <Heading level={1}>Minute wheel loop</Heading>
        <Text color="secondary">
          Tap the field, then turn the minute wheel past :59 or back past :00.
        </Text>
      </VStack>
      <TimeInput
        label="Alarm"
        presentation="bottom-sheet"
        value={value}
        onChange={setValue}
      />
      <Text>{`Committed: ${value ?? 'none'}`}</Text>
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
