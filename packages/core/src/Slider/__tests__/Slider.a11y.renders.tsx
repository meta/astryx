// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Slider.a11y.renders.tsx
 * @input One Slider binding state
 * @output The React tree every lane renders for that state (the jsdom test directly, the story through Storybook)
 * @position Shared fixture for the Slider binding
 */

import {useState, type ReactElement} from 'react';
import {Slider} from '../Slider';
import type {SliderBindingState} from './Slider.a11y.states';

function BoundSlider({state}: {state: SliderBindingState}) {
  const [value, setValue] = useState(state.facts.value);
  return (
    <Slider
      label={state.label}
      min={state.facts.min}
      max={state.facts.max}
      step={state.facts.step}
      value={value}
      onChange={setValue}
      orientation={state.facts.orientation}
      isDisabled={!state.facts.operable}
      disabledMessage={state.disabledMessage}
      formatValue={
        state.formatValue ? current => `${current} percent` : undefined
      }
    />
  );
}

export function renderSliderState(state: SliderBindingState): ReactElement {
  return (
    <div dir={state.direction ?? 'ltr'} style={{padding: 24, width: 320}}>
      <BoundSlider state={state} />
    </div>
  );
}
