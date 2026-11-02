// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {MetricTile, Sparkline} from '@astryxdesign/charts';

const meta: Meta<typeof MetricTile> = {
  title: 'Charts/MetricTile',
  component: MetricTile,
};
export default meta;

const trendData = [4, 7, 5, 9, 6, 11, 8, 13, 10, 15];

export const WithTrend: StoryObj<typeof MetricTile> = {
  render: () => (
    <div style={{width: 280}}>
      <MetricTile
        label="Total requests"
        value="2.4M"
        delta={{value: '+12.4%', direction: 'up'}}
        description="vs. previous 30 days"
        trend={<Sparkline data={trendData} title="Request trend" />}
      />
    </div>
  ),
};

export const InvertedDelta: StoryObj<typeof MetricTile> = {
  render: () => (
    <div style={{width: 280}}>
      <MetricTile
        label="Error rate"
        value="0.42%"
        delta={{value: '-0.08%', direction: 'down', sentiment: 'positive'}}
        description="vs. previous 7 days"
      />
    </div>
  ),
};

export const Sizes: StoryObj<typeof MetricTile> = {
  render: () => (
    <div style={{display: 'flex', gap: 24}}>
      <MetricTile label="Active users" value="18,204" size="sm" />
      <MetricTile label="Active users" value="18,204" size="md" />
      <MetricTile label="Active users" value="18,204" size="lg" />
    </div>
  ),
};
