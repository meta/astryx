// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {Slider as SliderPrimitive} from 'radix-ui';

// The generated Slider does not forward a name to its thumb, and the thumb is
// the element with role="slider", so this uses the primitive directly.
export default function App() {
  const [price, setPrice] = useState(250);
  return (
    <div className="flex w-[420px] flex-col gap-3 p-6">
      <div className="flex items-center justify-between">
        <span id="price-label" className="text-sm font-medium">
          Maximum price
        </span>
        <span className="text-sm">Up to ${price}</span>
      </div>
      <SliderPrimitive.Root
        min={0}
        max={500}
        step={10}
        value={[price]}
        onValueChange={([value]) => setPrice(value)}
        className="relative flex w-full touch-none items-center select-none">
        <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-muted">
          <SliderPrimitive.Range className="absolute h-full bg-primary" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-labelledby="price-label"
          className="block size-4 rounded-full border border-ring bg-white focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-hidden"
        />
      </SliderPrimitive.Root>
    </div>
  );
}
