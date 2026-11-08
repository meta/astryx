// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Slider.a11y.states.ts
 * @input Slider's representative thumb states and the facts SLIDER_PATTERN reads
 * @output SLIDER_BINDING_STATES and the explicit ownership exclusions for this binding
 * @position Binding inventory shared by the jsdom test, the Chromium spec, and the story (component:Slider AR1)
 */

import type {SliderStateFacts} from '@astryxdesign/a11y-spec';

export interface SliderBindingState {
  readonly id: string;
  readonly summary: string;
  readonly storyId: string;
  /** The thumb's accessible name (the visible label). */
  readonly label: string;
  readonly facts: SliderStateFacts;
  /** Props beyond label/min/max/step/value that shape the state. */
  readonly disabledMessage?: string;
  readonly formatValue?: boolean;
  readonly direction?: 'ltr' | 'rtl';
}

function facts(overrides: Partial<SliderStateFacts> = {}): SliderStateFacts {
  return {
    min: 0,
    max: 100,
    step: 1,
    value: 40,
    orientation: 'horizontal',
    rtl: false,
    operable: true,
    focusable: true,
    valueText: null,
    largeStep: 10,
    ...overrides,
  };
}

const story = (id: string) => `a11y-slider--${id}`;

export const SLIDER_BINDING_STATES = [
  {
    id: 'horizontal',
    summary: 'a horizontal single-thumb Slider at 40 of 0–100',
    storyId: story('horizontal'),
    label: 'Volume',
    facts: facts(),
  },
  {
    id: 'vertical',
    summary: 'a vertical single-thumb Slider',
    storyId: story('vertical'),
    label: 'Temperature',
    facts: facts({orientation: 'vertical'}),
  },
  {
    id: 'horizontal-rtl',
    summary:
      'a horizontal Slider on a right-to-left page: ArrowLeft must raise the value',
    storyId: story('horizontal-rtl'),
    label: 'Volume',
    facts: facts({rtl: true}),
    direction: 'rtl',
  },
  {
    id: 'formatted',
    summary: 'a Slider that speaks a formatted value',
    storyId: story('formatted'),
    label: 'Brightness',
    facts: facts({valueText: '40 percent'}),
    formatValue: true,
  },
  {
    id: 'disabled-with-message',
    summary:
      'a disabled Slider with a disabled message: the thumb keeps focus and its value',
    storyId: story('disabled-with-message'),
    label: 'Volume',
    facts: facts({operable: false}),
    disabledMessage: 'Volume is locked while sharing your screen',
  },
  {
    id: 'step-three',
    summary: 'a Slider with step 3 on a 0–100 range: End must reach 100',
    storyId: story('step-three'),
    label: 'Zoom',
    facts: facts({step: 3, value: 48, largeStep: 30}),
  },
] as const satisfies ReadonlyArray<SliderBindingState>;

export const SLIDER_EXCLUSIONS = [
  {
    id: 'range-thumb-separation',
    owner: 'component:Slider AR1 and Slider.test.tsx',
    reason:
      "A range Slider renders two thumbs whose aria-valuemin/aria-valuemax narrow to the other thumb minus the minimum separation; that two-thumb coupling and the group semantics around them are the binding's own tests. This binding proves the single-thumb pattern each thumb follows.",
  },
  {
    id: 'pointer-drag-model',
    owner: 'Slider.test.tsx pointer suites and the Chromium pointer evidence',
    reason:
      "Dragging, track clicks (mirrored under RTL), and the value tooltip are pointer behavior outside the keyboard-and-semantics pattern; the component's own suites prove them.",
  },
] as const;
