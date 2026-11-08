// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CircularProgress.a11y.renders.tsx
 * @input One CircularProgress binding state
 * @output The React tree every lane renders for that state (the jsdom test directly, the story through Storybook)
 * @position Shared fixture for the CircularProgress binding
 */

import type {ReactElement} from 'react';
import {CircularProgress} from '../CircularProgress';
import {
  formatSteps,
  type CircularProgressBindingState,
} from './CircularProgress.a11y.states';

export function renderCircularProgressState(
  state: CircularProgressBindingState,
): ReactElement {
  return (
    <div style={{padding: 24}}>
      <CircularProgress
        label={state.facts.name}
        // An indeterminate state still passes a value, so the proof shows the
        // ring withholds it rather than never having had one.
        value={state.facts.value ?? 50}
        max={state.facts.max}
        isLabelHidden={state.isLabelHidden}
        hasValueLabel={state.hasValueLabel}
        formatValueLabel={state.formatsValue ? formatSteps : undefined}
        isIndeterminate={state.isIndeterminate}
        isDisabled={state.isDisabled}>
        {state.centerLink != null ? (
          <a href="#upload-details">{state.centerLink}</a>
        ) : null}
      </CircularProgress>
    </div>
  );
}
