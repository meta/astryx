// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {Chart, ChartAxis, bar} from '@astryxdesign/charts';

const DATA = [
  {month: 'January', value: 18},
  {month: 'February', value: 31},
  {month: 'March', value: 24},
  {month: 'April', value: 42},
];

const GRAPHEME_DATA = [
  {month: '👨‍👩‍👧‍👦 Family', value: 18},
  {month: '👩🏽‍🚀 Space', value: 31},
  {month: '🇯🇵 Japan', value: 24},
  {month: 'éclair', value: 42},
];

const meta = {
  title: 'Charts/Chrome/ChartAxis',
  component: ChartAxis,
  tags: ['autodocs'],
  args: {
    position: 'bottom',
  },
  argTypes: {
    tickFormat: {control: false},
  },
  render: args => (
    <Chart
      data={DATA}
      xKey="month"
      series={[bar('value')]}
      axes={<ChartAxis {...args} />}
      height={300}
    />
  ),
} satisfies Meta<typeof ChartAxis>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Drive every ChartAxis prop against one stable categorical/linear chart. */
export const Playground: Story = {};

/** Compare all four physical plot-edge placements in one chart. */
export const AllPositions: Story = {
  render: () => (
    <Chart
      data={DATA}
      xKey="month"
      series={[bar('value')]}
      axes={
        <>
          <ChartAxis position="top" showAxisLine showTicks />
          <ChartAxis position="right" showAxisLine showTicks />
          <ChartAxis position="bottom" showAxisLine showTicks />
          <ChartAxis position="left" showAxisLine showTicks />
        </>
      }
      height={300}
    />
  ),
};

/** Truncation keeps each user-perceived character intact before the ellipsis. */
export const GraphemeTruncation: Story = {
  args: {
    position: 'bottom',
    truncate: 1,
    animated: false,
  },
  render: args => (
    <Chart
      data={GRAPHEME_DATA}
      xKey="month"
      series={[bar('value')]}
      axes={<ChartAxis {...args} />}
      height={300}
    />
  ),
};
