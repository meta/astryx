// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {LineChart} from '@astryxdesign/charts';
import {monthlyData} from './_data';

const meta: Meta<typeof LineChart> = {
  title: 'Charts/LineChart',
  component: LineChart,
};
export default meta;

export const SingleSeries: StoryObj<typeof LineChart> = {
  render: () => (
    <LineChart
      data={monthlyData}
      xKey="month"
      yKeys={['trend']}
      dots
      title="Trend"
      height={300}
    />
  ),
};

export const MultiSeries: StoryObj<typeof LineChart> = {
  render: () => (
    <LineChart
      data={monthlyData}
      xKey="month"
      yKeys={['revenue', 'costs', 'trend']}
      labels={{revenue: 'Revenue', costs: 'Costs', trend: 'Trend'}}
      title="Revenue, costs, and trend"
      height={300}
    />
  ),
};

export const Stepped: StoryObj<typeof LineChart> = {
  render: () => (
    <LineChart
      data={monthlyData}
      xKey="month"
      yKeys={['revenue']}
      curve="step"
      strokeWidth={3}
      title="Stepped revenue"
      height={300}
    />
  ),
};
