// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CircularProgress.a11y.states.ts
 * @input CircularProgress's representative states and the facts PROGRESSBAR_PATTERN reads
 * @output CIRCULAR_PROGRESS_BINDING_STATES and the explicit ownership exclusions for this binding
 * @position Binding inventory shared by the jsdom test, the Chromium spec, and the story
 */

import type {ProgressbarStateFacts} from '@astryxdesign/a11y-spec';

export interface CircularProgressBindingState {
  readonly id: string;
  readonly summary: string;
  readonly storyId: string;
  readonly facts: ProgressbarStateFacts;
  /** Props beyond label/value/max that shape the state. */
  readonly isLabelHidden?: boolean;
  readonly hasValueLabel?: boolean;
  readonly formatsValue?: boolean;
  readonly isIndeterminate?: boolean;
  readonly isDisabled?: boolean;
  /**
   * A focusable link rendered as the ring's center content, which must sit
   * beside the progress bar rather than inside its presentational subtree.
   */
  readonly centerLink?: string;
}

function facts(
  overrides: Partial<ProgressbarStateFacts> = {},
): ProgressbarStateFacts {
  return {
    name: 'Upload',
    value: 40,
    min: 0,
    max: 100,
    valueText: '40%',
    ...overrides,
  };
}

const story = (id: string) => `a11y-progressbar--circular-progress-${id}`;

/** The custom formatter the `formatted` state passes, so its facts can quote the text. */
export const formatSteps = (value: number, max: number): string =>
  `${value} of ${max}`;

export const CIRCULAR_PROGRESS_BINDING_STATES = [
  {
    id: 'determinate',
    summary:
      'a CircularProgress at 40 of 0–100 with its default hidden label and percentage',
    storyId: story('determinate'),
    facts: facts(),
  },
  {
    id: 'formatted',
    summary:
      'a CircularProgress with a custom formatter shown in the ring: 3 of 10 speaks "3 of 10"',
    storyId: story('formatted'),
    facts: facts({name: 'Steps', value: 3, max: 10, valueText: '3 of 10'}),
    hasValueLabel: true,
    formatsValue: true,
  },
  {
    id: 'label-visible',
    summary: 'a CircularProgress whose label is shown names the ring with it',
    storyId: story('label-visible'),
    facts: facts({name: 'Storage used'}),
    isLabelHidden: false,
  },
  {
    id: 'indeterminate',
    summary:
      'an indeterminate CircularProgress with hasValueLabel claims no value or text',
    storyId: story('indeterminate'),
    facts: facts({name: 'Loading data', value: null, valueText: null}),
    isIndeterminate: true,
    hasValueLabel: true,
  },
  {
    id: 'center-content',
    summary:
      'a disabled CircularProgress whose center content is a focusable link: the link sits beside the ring, not inside it',
    storyId: story('center-content'),
    facts: facts({value: 75, valueText: '75%'}),
    isDisabled: true,
    centerLink: 'Upload details',
  },
] as const satisfies ReadonlyArray<CircularProgressBindingState>;

export const CIRCULAR_PROGRESS_EXCLUSIONS = [
  {
    id: 'value-clamping',
    owner: 'CircularProgress.test.tsx clamping and non-finite value tests',
    reason:
      'Clamping an out-of-range or non-finite value before it reaches aria-valuenow is component input handling; this binding proves the value the ring exposes once it is in range.',
  },
  {
    id: 'ring-geometry',
    owner: 'CircularProgress.test.tsx size and half-ring turn tests',
    reason:
      "Ring size, stroke, and the half-rings' turns that draw the completed arc are paint geometry; this binding proves the programmatic value they illustrate.",
  },
] as const;
