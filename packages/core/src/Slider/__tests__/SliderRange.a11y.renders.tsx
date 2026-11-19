// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SliderRange.a11y.renders.tsx
 * @input One range Slider binding state
 * @output The React tree every lane renders for that state (the jsdom test directly, the story through Storybook)
 * @position Shared fixture for the range Slider binding
 */

import {useState, type ReactElement} from 'react';
import {Slider} from '../Slider';
import type {SliderRangeBindingState} from './SliderRange.a11y.states';

function BoundRangeSlider({state}: {state: SliderRangeBindingState}) {
  const [value, setValue] = useState<[number, number]>([
    state.facts.lower,
    state.facts.upper,
  ]);
  return (
    <Slider
      label={state.label}
      min={state.facts.min}
      max={state.facts.max}
      step={state.facts.step}
      value={value}
      onChange={setValue}
      minStepsBetweenThumbs={state.minStepsBetweenThumbs}
      orientation={state.orientation}
      isDisabled={!state.facts.operable}
      formatValue={
        state.formatValue === true ? current => `${current} percent` : undefined
      }
    />
  );
}

export function renderSliderRangeState(
  state: SliderRangeBindingState,
): ReactElement {
  return (
    <div dir={state.direction} style={{padding: 24, width: 320}}>
      <BoundRangeSlider state={state} />
    </div>
  );
}
