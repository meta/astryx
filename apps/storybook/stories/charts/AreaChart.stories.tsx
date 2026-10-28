// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {AreaChart} from '@astryxdesign/charts';
import {monthlyData} from './_data';

const meta: Meta<typeof AreaChart> = {
  title: 'Charts/AreaChart',
  component: AreaChart,
};
export default meta;

export const SingleSeries: StoryObj<typeof AreaChart> = {
  render: () => (
    <AreaChart
      data={monthlyData}
      xKey="month"
      yKeys={['revenue']}
      title="Monthly revenue"
      height={300}
    />
  ),
};

export const MultiSeries: StoryObj<typeof AreaChart> = {
  render: () => (
    <AreaChart
      data={monthlyData}
      xKey="month"
      yKeys={['revenue', 'costs']}
      labels={{revenue: 'Revenue', costs: 'Costs'}}
      title="Revenue vs costs"
      subtitle="First half of the year"
      height={300}
    />
  ),
};

export const StackedGradient: StoryObj<typeof AreaChart> = {
  render: () => (
    <AreaChart
      data={monthlyData}
      xKey="month"
      yKeys={['revenue', 'costs']}
      labels={{revenue: 'Revenue', costs: 'Costs'}}
      stacked
      gradient
      title="Stacked revenue and costs"
      height={300}
    />
  ),
};
