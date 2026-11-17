// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ProgressBar.a11y.states.ts
 * @input ProgressBar's representative states and the facts PROGRESSBAR_PATTERN reads
 * @output PROGRESSBAR_BINDING_STATES and the explicit ownership exclusions for this binding
 * @position Binding inventory shared by the jsdom test, the Chromium spec, and the story
 */

import type {ProgressbarStateFacts} from '@astryxdesign/a11y-spec';
import type {ProgressBarMark} from '../ProgressBar';

export interface ProgressBarBindingState {
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
  readonly marks?: ReadonlyArray<ProgressBarMark>;
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

const story = (id: string) => `a11y-progressbar--progress-bar-${id}`;

/** The custom formatter the `formatted` state passes, so its facts can quote the text. */
export const formatGigabytes = (value: number, max: number): string =>
  `${value} GB / ${max} GB`;

export const PROGRESSBAR_BINDING_STATES = [
  {
    id: 'determinate',
    summary: 'a ProgressBar at 40 of 0–100 speaking its default percentage',
    storyId: story('determinate'),
    facts: facts(),
  },
  {
    id: 'formatted',
    summary:
      'a ProgressBar with a custom formatter and a visible value label: 3 of 5 speaks "3 GB / 5 GB"',
    storyId: story('formatted'),
    facts: facts({
      name: 'Disk',
      value: 3,
      max: 5,
      valueText: '3 GB / 5 GB',
    }),
    hasValueLabel: true,
    formatsValue: true,
  },
  {
    id: 'complete',
    summary: 'a ProgressBar at its maximum',
    storyId: story('complete'),
    facts: facts({value: 100, valueText: '100%'}),
  },
  {
    id: 'label-hidden',
    summary:
      'a ProgressBar whose label is visually hidden keeps it as its name',
    storyId: story('label-hidden'),
    facts: facts({name: 'Storage used'}),
    isLabelHidden: true,
  },
  {
    id: 'indeterminate',
    summary:
      'an indeterminate ProgressBar with hasValueLabel claims no value or text',
    storyId: story('indeterminate'),
    facts: facts({name: 'Loading data', value: null, valueText: null}),
    isIndeterminate: true,
    hasValueLabel: true,
  },
  {
    id: 'disabled',
    summary: 'a disabled ProgressBar keeps its role, name, and value',
    storyId: story('disabled'),
    facts: facts(),
    isDisabled: true,
  },
  {
    id: 'target-marks',
    summary:
      'a ProgressBar with focusable target marks: the marks sit outside the progress bar and its value text stays the percentage',
    storyId: story('target-marks'),
    facts: facts({value: 50, valueText: '50%'}),
    marks: [
      {value: 25, label: 'Q1 target'},
      {value: 80, label: 'Goal'},
    ],
  },
] as const satisfies ReadonlyArray<ProgressBarBindingState>;

export const PROGRESSBAR_EXCLUSIONS = [
  {
    id: 'value-clamping',
    owner: 'ProgressBar.test.tsx clamping and non-finite value tests',
    reason:
      'Clamping an out-of-range or non-finite value before it reaches aria-valuenow is component input handling; this binding proves the value the bar exposes once it is in range.',
  },
  {
    id: 'mark-trigger',
    owner: 'ProgressBar.test.tsx target-mark tests and the tooltip contract',
    reason:
      "A target mark's focusability and the Tooltip that names it are the mark's own trigger behavior; this binding proves only that marks stay outside the progress bar's presentational subtree.",
  },
] as const;
