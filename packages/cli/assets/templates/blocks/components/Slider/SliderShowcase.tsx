// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Slider} from '@astryxdesign/core/Slider';

export default function SliderShowcase() {
  const [value, setValue] = useState(50);
  return (
    <Slider
      label="Volume"
      value={value}
      onChange={setValue}
      containerStyle={{width: 300}}
    />
  );
}
