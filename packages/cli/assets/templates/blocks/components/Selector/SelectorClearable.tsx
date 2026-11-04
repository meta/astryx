// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Selector} from '@astryxdesign/core/Selector';

export default function SelectorClearable() {
  const [value, setValue] = useState<string | null>('engineering');
  return (
    <Selector
      controlStyle={{width: 300}}
      label="Department"
      options={[
        {value: 'engineering', label: 'Engineering'},
        {value: 'design', label: 'Design'},
        {value: 'marketing', label: 'Marketing'},
        {value: 'sales', label: 'Sales'},
      ]}
      value={value}
      onChange={setValue}
      placeholder="Choose a department..."
      hasClear
    />
  );
}
