// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ProgressBar.a11y.renders.tsx
 * @input One ProgressBar binding state
 * @output The React tree every lane renders for that state (the jsdom test directly, the story through Storybook)
 * @position Shared fixture for the ProgressBar binding
 */

import type {ReactElement} from 'react';
import {ProgressBar} from '../ProgressBar';
import {
  formatGigabytes,
  type ProgressBarBindingState,
} from './ProgressBar.a11y.states';

export function renderProgressBarState(
  state: ProgressBarBindingState,
): ReactElement {
  return (
    <ProgressBar
      style={{width: 320}}
      label={state.facts.name}
      // An indeterminate state still passes a value, so the proof shows the
      // bar withholds it rather than never having had one.
      value={state.facts.value ?? 50}
      max={state.facts.max}
      isLabelHidden={state.isLabelHidden}
      hasValueLabel={state.hasValueLabel}
      formatValueLabel={state.formatsValue ? formatGigabytes : undefined}
      isIndeterminate={state.isIndeterminate}
      isDisabled={state.isDisabled}
      marks={state.marks}
    />
  );
}
