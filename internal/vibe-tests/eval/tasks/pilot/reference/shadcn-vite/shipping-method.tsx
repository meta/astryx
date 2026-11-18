// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {Label} from '@/components/ui/label';
import {RadioGroup, RadioGroupItem} from '@/components/ui/radio-group';

const OPTIONS = [
  {
    value: 'standard',
    label: 'Standard',
    detail: 'Free · 5-7 days',
    price: 'Free',
  },
  {
    value: 'express',
    label: 'Express',
    detail: '$9.99 · 2-3 days',
    price: '$9.99',
  },
  {
    value: 'overnight',
    label: 'Overnight',
    detail: '$24.99 · next day',
    price: '$24.99',
  },
];

export default function App() {
  const [value, setValue] = useState('standard');
  const price = OPTIONS.find(option => option.value === value)?.price;
  return (
    <div className="flex flex-col gap-4 p-6">
      <RadioGroup
        value={value}
        onValueChange={setValue}
        aria-label="Shipping method">
        {OPTIONS.map(option => (
          <div key={option.value} className="flex items-center gap-2">
            <RadioGroupItem id={option.value} value={option.value} />
            <Label htmlFor={option.value}>
              {option.label} ({option.detail})
            </Label>
          </div>
        ))}
      </RadioGroup>
      <p>Shipping: {price}</p>
    </div>
  );
}
