// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Selector} from '@astryxdesign/core/Selector';

export default function SelectorShowcase() {
  const [value, setValue] = useState<string | undefined>();
  return (
    <Selector
      controlStyle={{width: 300}}
      label="Fruit"
      options={['Apple', 'Banana', 'Orange', 'Mango', 'Pineapple']}
      placeholder="Select a fruit..."
      value={value}
      onChange={setValue}
    />
  );
}
