// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ProgressbarA11y.stories.tsx
 * @input The ProgressBar and Lab CircularProgress binding states, rendered through each binding's own renderer so the jsdom and Chromium lanes see the same tree
 * @output One checked-in story per state for the Chromium accessibility lane; excluded from the visual matrix
 * @position Browser fixtures for PROGRESSBAR_PATTERN
 */

import type {Meta, StoryObj} from '@storybook/react';
import {renderProgressBarState} from '../../../packages/core/src/ProgressBar/__tests__/ProgressBar.a11y.renders';
import {PROGRESSBAR_BINDING_STATES} from '../../../packages/core/src/ProgressBar/__tests__/ProgressBar.a11y.states';
import {renderCircularProgressState} from '../../../packages/lab/src/CircularProgress/__tests__/CircularProgress.a11y.renders';
import {CIRCULAR_PROGRESS_BINDING_STATES} from '../../../packages/lab/src/CircularProgress/__tests__/CircularProgress.a11y.states';

const meta = {
  title: 'A11y/Progressbar',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function progressBarStory(
  id: (typeof PROGRESSBAR_BINDING_STATES)[number]['id'],
): Story {
  const state = PROGRESSBAR_BINDING_STATES.find(
    candidate => candidate.id === id,
  );
  if (state == null) {
    throw new Error(`no ProgressBar binding state "${id}"`);
  }
  return {render: () => renderProgressBarState(state)};
}

function circularProgressStory(
  id: (typeof CIRCULAR_PROGRESS_BINDING_STATES)[number]['id'],
): Story {
  const state = CIRCULAR_PROGRESS_BINDING_STATES.find(
    candidate => candidate.id === id,
  );
  if (state == null) {
    throw new Error(`no CircularProgress binding state "${id}"`);
  }
  return {render: () => renderCircularProgressState(state)};
}

export const ProgressBarDeterminate = progressBarStory('determinate');
export const ProgressBarFormatted = progressBarStory('formatted');
export const ProgressBarComplete = progressBarStory('complete');
export const ProgressBarLabelHidden = progressBarStory('label-hidden');
export const ProgressBarIndeterminate = progressBarStory('indeterminate');
export const ProgressBarDisabled = progressBarStory('disabled');
export const ProgressBarTargetMarks = progressBarStory('target-marks');

export const CircularProgressDeterminate = circularProgressStory('determinate');
export const CircularProgressFormatted = circularProgressStory('formatted');
export const CircularProgressLabelVisible =
  circularProgressStory('label-visible');
export const CircularProgressIndeterminate =
  circularProgressStory('indeterminate');
export const CircularProgressCenterContent =
  circularProgressStory('center-content');
