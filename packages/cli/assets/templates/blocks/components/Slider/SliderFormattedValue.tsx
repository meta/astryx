// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Slider} from '@astryxdesign/core/Slider';

export default function SliderFormattedValue() {
  const [value, setValue] = useState(72);
  return (
    <Slider
      containerStyle={{width: 300}}
      label="Temperature"
      value={value}
      onChange={setValue}
      valueDisplay="text"
      min={60}
      max={90}
      step={1}
      formatValue={(v: number) => `${v}\u00B0F`}
    />
  );
}
