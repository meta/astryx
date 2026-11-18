// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';

const OPTIONS = [
  {
    value: 'standard',
    label: 'Standard',
    description: 'Free · 5-7 days',
    price: 'Free',
  },
  {
    value: 'express',
    label: 'Express',
    description: '$9.99 · 2-3 days',
    price: '$9.99',
  },
  {
    value: 'overnight',
    label: 'Overnight',
    description: '$24.99 · next day',
    price: '$24.99',
  },
];

export default function App() {
  const [value, setValue] = useState('standard');
  const price = OPTIONS.find(option => option.value === value)?.price;
  return (
    <VStack gap={3} padding={6}>
      <RadioList label="Shipping method" value={value} onChange={setValue}>
        {OPTIONS.map(option => (
          <RadioListItem
            key={option.value}
            value={option.value}
            label={option.label}
            description={option.description}
          />
        ))}
      </RadioList>
      <Text>Shipping: {price}</Text>
    </VStack>
  );
}
