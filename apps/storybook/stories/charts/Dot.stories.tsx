// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {Chart, dot, ChartGrid, ChartAxis} from '@astryxdesign/charts';
import {pageWeightLoadTimeData, ticketResolutionData} from './_data';

const meta: Meta<typeof Chart> = {
  title: 'Charts/Marks/Dot',
  component: Chart,
};
export default meta;

const axes = (
  <>
    <ChartAxis position="bottom" />
    <ChartAxis position="left" />
  </>
);

/**
 * SVG scatter plot of two numeric values. Use it to show a relationship and
 * outliers. Heavier pages load more slowly, and three pages are much slower
 * than their weight predicts. Check: there are 60 dots on numeric x and y
 * axes. For thousands of points, use `dotGL`.
 */
export const Scatter: StoryObj = {
  render: () => (
    <Chart
      data={pageWeightLoadTimeData}
      xKey="pageWeightKb"
      title="Page load time by page weight"
      subtitle="Load time (ms) against page weight (KB), 60 pages of one site"
      series={[
        dot('loadTimeMs', {
          color: '#3b82f6',
          radius: 4,
          opacity: 0.7,
          label: 'Load time',
        }),
      ]}
      grid={<ChartGrid horizontal vertical />}
      axes={axes}
      height={360}
    />
  ),
};

/**
 * `dodge` spreads points that share a category, so equal values do not hide
 * each other. Higher priorities resolve faster. Check: each priority has 12
 * dots, and dots with the same value sit side by side.
 */
export const Dodged: StoryObj = {
  render: () => (
    <Chart
      data={ticketResolutionData}
      xKey="priority"
      title="Support ticket resolution time"
      subtitle="Hours to resolve, by priority, 12 tickets each"
      series={[dot('hours', {dodge: true, radius: 5, label: 'Hours'})]}
      grid={<ChartGrid />}
      axes={axes}
      height={300}
    />
  ),
};
