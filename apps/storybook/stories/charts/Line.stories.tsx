// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {Chart, line, ChartGrid, ChartAxis} from '@astryxdesign/charts';
import {monthlyData} from './_data';

const meta: Meta<typeof Chart> = {
  title: 'Charts/Marks/Line',
  component: Chart,
};
export default meta;

const axes = (
  <>
    <ChartAxis position="bottom" />
    <ChartAxis position="left" />
  </>
);

export const Default: StoryObj = {
  render: () => (
    <Chart
      data={monthlyData}
      xKey="month"
      title="Trend"
      series={[line('trend', {color: '#3b82f6'})]}
      tooltip
      grid={<ChartGrid />}
      axes={axes}
      height={300}
    />
  ),
};

export const WithDots: StoryObj = {
  render: () => (
    <Chart
      data={monthlyData}
      xKey="month"
      series={[line('trend', {color: '#3b82f6', dots: true, strokeWidth: 2})]}
      grid={<ChartGrid />}
      axes={axes}
      height={300}
    />
  ),
};

export const MultiSeries: StoryObj = {
  render: () => (
    <Chart
      data={monthlyData}
      xKey="month"
      series={[
        line('revenue', {color: '#3b82f6', label: 'Revenue'}),
        line('costs', {color: '#ef4444', label: 'Costs'}),
        line('trend', {color: '#f59e0b', label: 'Trend'}),
      ]}
      legend
      grid={<ChartGrid />}
      axes={axes}
      height={300}
    />
  ),
};

export const Curves: StoryObj = {
  render: () => (
    <Chart
      data={monthlyData}
      xKey="month"
      subtitle="linear vs monotone vs step"
      series={[
        line('revenue', {color: '#3b82f6', curve: 'linear', label: 'linear'}),
        line('costs', {color: '#22c55e', curve: 'monotone', label: 'monotone'}),
        line('trend', {color: '#f59e0b', curve: 'step', label: 'step'}),
      ]}
      legend
      grid={<ChartGrid />}
      axes={axes}
      height={300}
    />
  ),
};
