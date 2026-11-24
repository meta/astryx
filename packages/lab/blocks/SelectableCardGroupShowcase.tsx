// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input Three plans, one chosen at a time
 * @output A SelectableCardGroup of plan cards: a radio group with one tab stop
 * @position Lab SelectableCardGroup's docsite showcase and copyable CLI block
 */

import {useState} from 'react';
import {SelectableCardGroup, SelectableCardGroupItem} from '@astryxdesign/lab';
import {VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';

const PLANS = [
  {value: 'basic', name: 'Basic', price: '$9 a month', detail: 'One project'},
  {
    value: 'pro',
    name: 'Pro',
    price: '$29 a month',
    detail: 'Unlimited projects',
  },
  {
    value: 'team',
    name: 'Team',
    price: '$99 a month',
    detail: 'Shared workspaces',
  },
];

export default function SelectableCardGroupShowcase() {
  const [plan, setPlan] = useState<string | null>('pro');

  return (
    <SelectableCardGroup
      label="Plan"
      description="Billed monthly. You can change it at any time."
      value={plan}
      onChange={setPlan}>
      {PLANS.map(item => (
        <SelectableCardGroupItem
          key={item.value}
          value={item.value}
          label={item.name}
          width={180}>
          <VStack gap={1}>
            <Text type="body" weight="bold">
              {item.name}
            </Text>
            <Text type="body">{item.price}</Text>
            <Text type="supporting" color="secondary">
              {item.detail}
            </Text>
          </VStack>
        </SelectableCardGroupItem>
      ))}
    </SelectableCardGroup>
  );
}
