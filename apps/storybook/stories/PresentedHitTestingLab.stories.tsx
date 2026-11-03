// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PresentedHitTestingLab.stories.tsx
 * @input The gesture host's device-check harness
 * @output One full-screen story for checking presented hit testing on a phone
 * @position Storybook: open it on a preview from an iPhone. Not a component
 *   story; the harness is not exported.
 */

import type {Meta, StoryObj} from '@storybook/react';
import {PresentedHitTestingLab} from '../../../packages/core/src/__tests__/PresentedHitTestingLab';

const meta: Meta<typeof PresentedHitTestingLab> = {
  title: 'Core/Gestures',
  component: PresentedHitTestingLab,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A device check for the gesture host. A sheet springs up slowly over a full-page scrim. Tap Done or drag the sheet while it rises: on an iPhone, with the correction on, Done clicks once, the scrim takes nothing, and the page does not scroll. Turn the correction off to see the engine without it.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof PresentedHitTestingLab>;

export const PresentedHitTesting: Story = {
  name: 'Presented hit testing',
};
