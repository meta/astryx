// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {Sparkline} from '@astryxdesign/charts';

const meta: Meta<typeof Sparkline> = {
  title: 'Charts/Sparkline',
  component: Sparkline,
};
export default meta;

const data = [4, 7, 5, 9, 6, 11, 8, 13, 10, 15];

export const Filled: StoryObj<typeof Sparkline> = {
  render: () => (
    <div style={{width: 160}}>
      <Sparkline data={data} title="Requests over the last hour" />
    </div>
  ),
};

export const LineOnly: StoryObj<typeof Sparkline> = {
  render: () => (
    <div style={{width: 160}}>
      <Sparkline data={data} fill={false} title="Error budget trend" />
    </div>
  ),
};

export const WithTooltip: StoryObj<typeof Sparkline> = {
  render: () => (
    <div style={{width: 160}}>
      <Sparkline data={data} tooltip title="Hover for values" />
    </div>
  ),
};
