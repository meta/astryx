// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Selector} from '@astryxdesign/core/Selector';

const OPTIONS = [
  {value: 'design', label: 'Design'},
  {value: 'engineering', label: 'Engineering'},
  {value: 'marketing', label: 'Marketing'},
  {value: 'operations', label: 'Operations'},
];

export default function SelectorBottomSheet() {
  const [value, setValue] = useState<string | undefined>();

  return (
    <div style={{width: 320, maxWidth: '100%'}}>
      <Selector
        label="Team"
        options={OPTIONS}
        value={value}
        onChange={setValue}
        placeholder="Choose a team"
        presentation="bottom-sheet"
      />
    </div>
  );
}
