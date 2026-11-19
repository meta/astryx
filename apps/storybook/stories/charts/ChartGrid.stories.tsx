// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {Chart, ChartAxis, ChartGrid, bar, line} from '@astryxdesign/charts';

const CATEGORICAL_DATA = [
  {month: 'January', value: 18},
  {month: 'February', value: 31},
  {month: 'March', value: 24},
  {month: 'April', value: 42},
];

const REQUESTS_BY_HOUR = [
  {label: '0 h', hour: 0, requests: 120},
  {label: '4 h', hour: 4, requests: 80},
  {label: '8 h', hour: 8, requests: 260},
  {label: '12 h', hour: 12, requests: 410},
  {label: '16 h', hour: 16, requests: 380},
  {label: '20 h', hour: 20, requests: 300},
  {label: '24 h', hour: 24, requests: 150},
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

/**
 * Requests per minute in the 24 hours after a launch, one bar every 4 hours.
 * Category labels on x put one vertical grid line on each band center, so
 * each bar has a grid line. Continuous X uses the same rows.
 */
export const CategoricalX: Story = {
  args: {
    horizontal: false,
    vertical: true,
    tickCount: 5,
  },
  render: args => (
    <Chart
      data={REQUESTS_BY_HOUR}
      xKey="label"
      series={[bar('requests', {label: 'Requests per minute'})]}
      title="Categorical x: grid on band centers"
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
  parameters: {controls: {disable: true}},
};

/**
 * Requests per minute in the 24 hours after a launch, with the hours since
 * the launch on x. Numbers on x put vertical grid lines on d3 ticks, which
 * need not match the data points. Categorical X uses the same rows.
 */
export const ContinuousX: Story = {
  args: {
    horizontal: false,
    vertical: true,
    tickCount: 5,
  },
  render: args => (
    <Chart
      data={REQUESTS_BY_HOUR}
      xKey="hour"
      series={[line('requests', {dots: true, label: 'Requests per minute'})]}
      title="Continuous x: grid on d3 ticks"
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
