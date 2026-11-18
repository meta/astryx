// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {Chart, area, line, ChartGrid, ChartAxis} from '@astryxdesign/charts';
import {monthlyData} from './_data';

const meta: Meta<typeof Chart> = {
  title: 'Charts/Marks/Area',
  component: Chart,
};
export default meta;

const axes = (
  <>
    <ChartAxis position="bottom" />
    <ChartAxis position="left" />
  </>
);

export const Gradient: StoryObj = {
  render: () => (
    <Chart
      data={monthlyData}
      xKey="month"
      title="Revenue over time"
      series={[
        area('revenue', {color: '#3b82f6', gradient: true}),
        line('revenue', {color: '#3b82f6'}),
      ]}
      grid={<ChartGrid />}
      axes={axes}
      height={300}
    />
  ),
};

export const Stacked: StoryObj = {
  render: () => (
    <Chart
      data={monthlyData}
      xKey="month"
      title="Revenue & Costs"
      series={[
        area('revenue', {color: '#3b82f6', stack: 'total', label: 'Revenue'}),
        area('costs', {color: '#ef4444', stack: 'total', label: 'Costs'}),
      ]}
      legend
      grid={<ChartGrid />}
      axes={axes}
      height={300}
    />
  ),
};
