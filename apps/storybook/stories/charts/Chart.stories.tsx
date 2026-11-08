// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {Chart, ChartAxis, ChartGrid, bar, line} from '@astryxdesign/charts';

const monthlyData = [
  {month: 'Jan', revenue: 42, trend: 38},
  {month: 'Feb', revenue: 58, trend: 46},
  {month: 'Mar', revenue: 51, trend: 49},
  {month: 'Apr', revenue: 74, trend: 61},
  {month: 'May', revenue: 68, trend: 65},
  {month: 'Jun', revenue: 86, trend: 72},
];

const largeData = Array.from({length: 51}, (_, index) => ({
  month: `Period ${index + 1}`,
  revenue: 40 + (index % 8) * 6,
  trend: 42 + index * 0.75,
}));

type DataState = 'default' | 'empty' | 'large';
type TitleState = 'default' | 'none' | 'long';
type LegendPosition = 'off' | 'top' | 'bottom' | 'start' | 'end';

interface ChartStoryArgs {
  dataState: DataState;
  titleState: TitleState;
  legendPosition: LegendPosition;
  hasTooltip: boolean;
  height: number;
}

const meta: Meta<ChartStoryArgs> = {
  title: 'Charts/Chart',
  tags: ['autodocs'],
  argTypes: {
    dataState: {
      control: 'inline-radio',
      options: ['default', 'empty', 'large'],
    },
    titleState: {control: 'inline-radio', options: ['default', 'none', 'long']},
    legendPosition: {
      control: 'inline-radio',
      options: ['off', 'top', 'bottom', 'start', 'end'],
    },
    hasTooltip: {control: 'boolean'},
    height: {control: {type: 'range', min: 160, max: 480, step: 20}},
  },
  args: {
    dataState: 'default',
    titleState: 'default',
    legendPosition: 'bottom',
    hasTooltip: true,
    height: 300,
  },
};

export default meta;

type Story = StoryObj<ChartStoryArgs>;

/**
 * Reusable Chart-root fixture for normal, empty, large-data, long-text,
 * legend-position, tooltip, and height evidence.
 */
export const Playground: Story = {
  render: ({dataState, titleState, legendPosition, hasTooltip, height}) => {
    const data =
      dataState === 'empty'
        ? []
        : dataState === 'large'
          ? largeData
          : monthlyData;
    const title =
      titleState === 'none'
        ? undefined
        : titleState === 'long'
          ? 'Monthly revenue across every regional sales program and reporting period'
          : 'Monthly revenue';
    const subtitle =
      titleState === 'long'
        ? 'A deliberately expanded description that verifies the chart heading wraps without hiding the plot or creating horizontal scrolling.'
        : undefined;

    return (
      <Chart
        data={data}
        xKey="month"
        series={[
          bar('revenue', {group: 'comparison', label: 'Revenue'}),
          line('trend', {label: 'Trend'}),
        ]}
        title={title}
        subtitle={subtitle}
        legend={legendPosition === 'off' ? false : {position: legendPosition}}
        tooltip={hasTooltip}
        grid={<ChartGrid horizontal />}
        axes={
          <>
            <ChartAxis position="bottom" />
            <ChartAxis position="left" />
          </>
        }
        height={height}
      />
    );
  },
};
