// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {Chart, bar, line, ChartGrid, ChartAxis} from '@astryxdesign/charts';
import {monthlyData} from './_data';

const meta: Meta<typeof Chart> = {
  title: 'Charts/Marks/Combo',
  component: Chart,
};
export default meta;

const axes = (
  <>
    <ChartAxis position="bottom" />
    <ChartAxis position="left" />
  </>
);

/** Bars + a trendline overlay sharing one scale. */
export const BarsAndLine: StoryObj = {
  name: 'Bars + line',
  parameters: {controls: {disable: true}},
  render: () => (
    <Chart
      data={monthlyData}
      xKey="month"
      title="Revenue vs trend"
      subtitle="Bars with a trendline overlay"
      series={[
        bar('revenue', {color: '#3b82f6', label: 'Revenue'}),
        line('trend', {color: '#f59e0b', label: 'Trend'}),
      ]}
      tooltip
      legend
      grid={<ChartGrid />}
      axes={axes}
      height={320}
    />
  ),
};
