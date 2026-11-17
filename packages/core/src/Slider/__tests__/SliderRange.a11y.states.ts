// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SliderRange.a11y.states.ts
 * @input Range Slider's representative two-thumb states and the facts SLIDER_MULTITHUMB_PATTERN and SLIDER_PATTERN read
 * @output SLIDER_RANGE_BINDING_STATES, the per-thumb facts derived from them, and the explicit ownership exclusions for this binding
 * @position Binding inventory shared by the jsdom test, the Chromium spec, and the story (component:Slider AR1)
 */

import type {
  SliderMultithumbStateFacts,
  SliderStateFacts,
} from '@astryxdesign/a11y-spec';

export interface SliderRangeBindingState {
  readonly id: string;
  readonly summary: string;
  readonly storyId: string;
  /** The group's visible label. */
  readonly label: string;
  readonly facts: SliderMultithumbStateFacts;
  /** `minStepsBetweenThumbs`; `facts.separation` is this times `facts.step`. */
  readonly minStepsBetweenThumbs: number;
  readonly orientation: 'horizontal' | 'vertical';
  readonly direction: 'ltr' | 'rtl';
  /**
   * Whether each thumb also runs SLIDER_PATTERN. It moves a thumb one step and
   * ten steps up and back, so a thumb needs that room below its upper bound.
   */
  readonly perThumb: boolean;
  /** Whether each thumb speaks its value as "<value> percent". */
  readonly formatValue?: boolean;
}

/** The names Slider gives a range's thumbs (`@astryx.slider.minimumThumb`, `maximumThumb`). */
export const LOWER_THUMB_NAME = 'Minimum value';
export const UPPER_THUMB_NAME = 'Maximum value';

function facts(
  overrides: Partial<SliderMultithumbStateFacts> = {},
): SliderMultithumbStateFacts {
  return {
    min: 0,
    max: 100,
    step: 1,
    lower: 20,
    upper: 80,
    separation: 0,
    operable: true,
    focusable: true,
    ...overrides,
  };
}

const story = (id: string) => `a11y-slider--${id}`;

export const SLIDER_RANGE_BINDING_STATES = [
  {
    id: 'range',
    summary: 'a horizontal range Slider at 20–80 of 0–100',
    storyId: story('range'),
    label: 'Price',
    facts: facts(),
    minStepsBetweenThumbs: 0,
    orientation: 'horizontal',
    direction: 'ltr',
    perThumb: true,
  },
  {
    id: 'range-separation',
    summary:
      'a range Slider whose thumbs keep 10 steps apart: each bound stops 10 short of the other thumb',
    storyId: story('range-separation'),
    label: 'Price',
    facts: facts({upper: 60, separation: 10}),
    minStepsBetweenThumbs: 10,
    orientation: 'horizontal',
    direction: 'ltr',
    perThumb: true,
  },
  {
    id: 'range-coincident',
    summary:
      'a range Slider whose thumbs share the value 50: neither key crosses the other thumb',
    storyId: story('range-coincident'),
    label: 'Price',
    facts: facts({lower: 50, upper: 50}),
    minStepsBetweenThumbs: 0,
    orientation: 'horizontal',
    direction: 'ltr',
    perThumb: false,
  },
  {
    id: 'range-rtl',
    summary:
      'a horizontal range Slider on a right-to-left page: ArrowLeft must raise each thumb',
    storyId: story('range-rtl'),
    label: 'Price',
    facts: facts(),
    minStepsBetweenThumbs: 0,
    orientation: 'horizontal',
    direction: 'rtl',
    perThumb: true,
  },
  {
    id: 'range-vertical',
    summary: 'a vertical range Slider',
    storyId: story('range-vertical'),
    label: 'Temperature',
    facts: facts(),
    minStepsBetweenThumbs: 0,
    orientation: 'vertical',
    direction: 'ltr',
    perThumb: true,
  },
  {
    id: 'range-formatted',
    summary: 'a range Slider whose thumbs speak formatted values',
    storyId: story('range-formatted'),
    label: 'Discount',
    facts: facts(),
    minStepsBetweenThumbs: 0,
    orientation: 'horizontal',
    direction: 'ltr',
    perThumb: true,
    formatValue: true,
  },
] as const satisfies ReadonlyArray<SliderRangeBindingState>;

export type SliderRangeThumb = 'lower' | 'upper';

/** What SLIDER_PATTERN expects of one range thumb: its bounds stop at the other thumb. */
export function thumbFacts(
  state: SliderRangeBindingState,
  thumb: SliderRangeThumb,
): SliderStateFacts {
  const {min, max, step, lower, upper, separation, operable, focusable} =
    state.facts;
  const value = thumb === 'lower' ? lower : upper;
  return {
    min: thumb === 'lower' ? min : lower + separation,
    max: thumb === 'lower' ? upper - separation : max,
    step,
    value,
    orientation: state.orientation,
    rtl: state.direction === 'rtl',
    operable,
    focusable,
    valueText: state.formatValue === true ? `${value} percent` : null,
    largeStep: step * 10,
  };
}

export const SLIDER_RANGE_EXCLUSIONS = [
  {
    id: 'group-semantics',
    owner: 'component:Slider and Slider.test.tsx range-group suites',
    reason:
      'The role="group" around the thumbs, its label, description and status association are the component\'s relationships; the multi-thumb contract exempts them to the binding, and Slider.test.tsx proves them.',
  },
  {
    id: 'disabled-range',
    owner:
      'Slider.test.tsx "keeps both thumbs of a disabled range as Tab stops that hold their values"',
    reason:
      'A disabled range is not a story state yet: its story trips the axe color-contrast rule on the group label, because the thumbs carry aria-disabled and the group does not. The multi-thumb outcomes a disabled range can still change are its Tab order and its held values, and that local test proves both thumbs stay Tab stops in order, carry aria-disabled, and keep their values under End and Home.',
  },
  {
    id: 'pointer-drag-model',
    owner: 'Slider.test.tsx pointer suites and the Chromium pointer evidence',
    reason:
      'Which coincident thumb a press takes, how a drag hands over between thumbs, and how a released drag coasts are pointer behavior outside the keyboard-and-semantics patterns; the component suites prove them.',
  },
] as const;
