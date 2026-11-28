// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import InfinityTableShowcase from '../../../packages/lab/blocks/InfinityTableShowcase';

const meta = {
  title: 'Lab/InfinityTable',
  component: InfinityTableShowcase,
  parameters: {layout: 'centered'},
} satisfies Meta<typeof InfinityTableShowcase>;

export default meta;
export const Archive: StoryObj<typeof meta> = {};
export const Rtl: StoryObj<typeof meta> = {
  decorators: [
    Story => (
      <div dir="rtl">
        <Story />
      </div>
    ),
  ],
};
