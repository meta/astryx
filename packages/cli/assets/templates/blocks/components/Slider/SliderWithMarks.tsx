// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Slider} from '@astryxdesign/core/Slider';

export default function SliderWithMarks() {
  const [value, setValue] = useState(50);
  return (
    <Slider
      containerStyle={{width: 300}}
      label="Volume"
      value={value}
      onChange={setValue}
      marks={[
        {value: 0, label: '0'},
        {value: 25, label: '25'},
        {value: 50, label: '50'},
        {value: 75, label: '75'},
        {value: 100, label: '100'},
      ]}
    />
  );
}
