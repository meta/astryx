// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input Three shipping speeds, each with its delivery time and price
 * @output A vertical SelectableCardGroup whose cards carry a description
 * @position Lab SelectableCardGroup's docsite example and copyable CLI block
 */

import {useState} from 'react';
import {SelectableCardGroup, SelectableCardGroupItem} from '@astryxdesign/lab';
import {HStack, StackItem, VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';

const SPEEDS = [
  {
    value: 'standard',
    name: 'Standard',
    detail: 'Arrives in 5 to 7 business days',
    price: 'Free',
  },
  {
    value: 'express',
    name: 'Express',
    detail: 'Arrives in 2 to 3 business days',
    price: '$8',
  },
  {
    value: 'overnight',
    name: 'Overnight',
    detail: 'Arrives the next business day',
    price: '$24',
  },
];

export default function SelectableCardGroupShippingSpeed() {
  const [speed, setSpeed] = useState<string | null>('standard');

  return (
    <SelectableCardGroup
      label="Shipping speed"
      orientation="vertical"
      value={speed}
      onChange={setSpeed}>
      {SPEEDS.map(item => (
        <SelectableCardGroupItem
          key={item.value}
          value={item.value}
          label={item.name}
          maxWidth={420}>
          <HStack gap={3} vAlign="center">
            <StackItem size="fill">
              <VStack gap={1}>
                <Text type="body" weight="bold">
                  {item.name}
                </Text>
                <Text type="supporting" color="secondary">
                  {item.detail}
                </Text>
              </VStack>
            </StackItem>
            <Text type="body">{item.price}</Text>
          </HStack>
        </SelectableCardGroupItem>
      ))}
    </SelectableCardGroup>
  );
}
