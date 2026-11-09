// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Slider} from '@astryxdesign/core/Slider';

export default function SliderRangeSlider() {
  const [value, setValue] = useState<[number, number]>([20, 80]);
  return (
    <Slider
      label="Price range"
      value={value}
      onChange={setValue}
      containerStyle={{width: 300}}
    />
  );
}
