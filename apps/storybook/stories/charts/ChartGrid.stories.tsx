// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {Chart, ChartAxis, ChartGrid, bar} from '@astryxdesign/charts';

const CATEGORICAL_DATA = [
  {month: 'January', value: 18},
  {month: 'February', value: 31},
  {month: 'March', value: 24},
  {month: 'April', value: 42},
];

const CONTINUOUS_DATA = [
  {x: 0, value: 18},
  {x: 5, value: 31},
  {x: 10, value: 24},
];

const meta = {
  title: 'Charts/Chrome/ChartGrid',
  component: ChartGrid,
  tags: ['autodocs'],
  args: {
    horizontal: true,
    vertical: false,
    tickCount: 5,
  },
  argTypes: {
    tickCount: {control: {type: 'range', min: 0, max: 10, step: 1}},
  },
  render: args => (
    <Chart
      data={CATEGORICAL_DATA}
      xKey="month"
      series={[bar('value')]}
      title="Monthly value"
      grid={<ChartGrid {...args} />}
      axes={
        <>
          <ChartAxis position="bottom" />
          <ChartAxis position="left" />
        </>
      }
      height={300}
    />
  ),
} satisfies Meta<typeof ChartGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Drive horizontal, vertical, combined, empty, and density states. */
export const Playground: Story = {};

/** Continuous x values use d3 ticks rather than categorical band centers. */
export const ContinuousX: Story = {
  args: {
    horizontal: false,
    vertical: true,
    tickCount: 5,
  },
  render: args => (
    <Chart
      data={CONTINUOUS_DATA}
      xKey="x"
      series={[bar('value')]}
      title="Continuous x values"
      grid={<ChartGrid {...args} />}
      axes={
        <>
          <ChartAxis position="bottom" />
          <ChartAxis position="left" />
        </>
      }
      height={300}
    />
  ),
};
