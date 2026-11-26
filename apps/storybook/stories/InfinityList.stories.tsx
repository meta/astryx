// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import InfinityListShowcase from '../../../packages/lab/blocks/InfinityListShowcase';

const meta = {
  title: 'Lab/InfinityList',
  component: InfinityListShowcase,
  parameters: {layout: 'centered'},
} satisfies Meta<typeof InfinityListShowcase>;

export default meta;
export const Archive: StoryObj<typeof meta> = {};
