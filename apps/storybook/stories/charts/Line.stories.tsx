// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {
  Chart,
  line,
  ChartGrid,
  ChartAxis,
  compactNumber,
} from '@astryxdesign/charts';
import {Grid, useLocale} from '@astryxdesign/core';
import {
  dailyVisitorsData,
  dailyVisitorsWithGapData,
  pageLoadTimeData,
  subscriberGrowthData,
} from './_data';

const meta: Meta<typeof Chart> = {
  title: 'Charts/Marks/Line',
  component: Chart,
};
export default meta;

function CompactAxes() {
  const locale = useLocale();
  return (
    <>
      <ChartAxis position="bottom" />
      <ChartAxis
        position="left"
        tickFormat={value => compactNumber(value, locale)}
      />
    </>
  );
}

const axes = (
  <>
    <ChartAxis position="bottom" />
    <ChartAxis position="left" />
  </>
);

/**
 * Show a trend over evenly spaced periods. Visitors drop on each weekend
 * (June 7–8 and 14–15). Check: the y axis fits the data instead of starting
 * at 0, and the tooltip shows each day's count.
 */
export const Default: StoryObj = {
  render: () => (
    <Chart
      data={dailyVisitorsData}
      xKey="day"
      title="Daily website visitors"
      subtitle="Unique visitors per day, June 2–15"
      series={[line('visitors', {color: '#3b82f6', label: 'Visitors'})]}
      tooltip
      grid={<ChartGrid />}
      axes={<CompactAxes />}
      height={300}
    />
  ),
};

/**
 * `dots: true` marks each data point on the line. Use it when each period's
 * exact value matters. Check: there is one dot per day, 14 in total.
 */
export const WithDots: StoryObj = {
  render: () => (
    <Chart
      data={dailyVisitorsData}
      xKey="day"
      title="Daily website visitors"
      subtitle="Unique visitors per day, June 2–15"
      series={[
        line('visitors', {
          color: '#3b82f6',
          label: 'Visitors',
          dots: true,
          strokeWidth: 2,
        }),
      ]}
      grid={<ChartGrid />}
      axes={<CompactAxes />}
      height={300}
    />
  ),
};

/**
 * Compare a few related series on one scale. The three percentiles stay in
 * order (median < 75th < 95th) and all peak at 12:00. Check: the legend names
 * each percentile, and no line crosses another.
 */
export const MultiSeries: StoryObj = {
  render: () => (
    <Chart
      data={pageLoadTimeData}
      xKey="hour"
      title="Page load time"
      subtitle="Milliseconds, by hour of day, every 2 hours"
      series={[
        line('median', {color: '#3b82f6', label: 'Median'}),
        line('p75', {color: '#f59e0b', label: '75th percentile'}),
        line('p95', {color: '#6b1efd', label: '95th percentile'}),
      ]}
      legend
      grid={<ChartGrid />}
      axes={axes}
      height={300}
    />
  ),
};

const CURVES = [
  {curve: 'linear', note: 'Straight segments between points'},
  {curve: 'monotone', note: 'Default. Smooth, with no overshoot'},
  {curve: 'natural', note: 'Smooth, can overshoot the data'},
  {curve: 'step', note: 'Changes value halfway between points'},
] as const;

/**
 * Each chart draws the same series with a different `curve`. Straight
 * segments (`linear`) show the data most accurately. `monotone` is the
 * default. Check: all four lines pass through the same 12 points; between the
 * March spike and the May drop, `natural` overshoots and `step` jumps
 * halfway between months.
 */
export const Curves: StoryObj = {
  render: () => (
    <Grid columns={{minWidth: 280, max: 4}} gap={6}>
      {CURVES.map(({curve, note}) => (
        <Chart
          key={curve}
          data={subscriberGrowthData}
          xKey="month"
          title={`Curve: ${curve}`}
          subtitle={`${note}. Newsletter subscribers, January to December`}
          series={[
            line('subscribers', {
              color: '#3b82f6',
              curve,
              label: 'Subscribers',
            }),
          ]}
          grid={<ChartGrid />}
          axes={<CompactAxes />}
          height={220}
        />
      ))}
    </Grid>
  ),
};

/**
 * Missing values (`null`) break the line. The line does not drop to zero and
 * does not join the points on each side of the gap. Say in the subtitle why
 * data is missing. Check: the line stops after June 9 and starts again at
 * June 12, and there is no dot for June 10 or 11.
 */
export const MissingData: StoryObj = {
  render: () => (
    <Chart
      data={dailyVisitorsWithGapData}
      xKey="day"
      title="Daily website visitors"
      subtitle="Unique visitors per day, June 2–15. No data for June 10–11 (tracking outage)"
      series={[
        line('visitors', {color: '#3b82f6', label: 'Visitors', dots: true}),
      ]}
      tooltip
      grid={<ChartGrid />}
      axes={<CompactAxes />}
      height={300}
    />
  ),
};
