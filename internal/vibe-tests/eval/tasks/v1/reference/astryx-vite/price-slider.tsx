// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {Slider} from '@astryxdesign/core/Slider';
import {VStack} from '@astryxdesign/core/VStack';

export default function App() {
  const [price, setPrice] = useState(250);
  return (
    <VStack padding={6} width={420}>
      <Slider
        label="Maximum price"
        min={0}
        max={500}
        step={10}
        value={price}
        onChange={setPrice}
        valueDisplay="text"
        formatValue={value => `Up to $${value}`}
      />
    </VStack>
  );
}
