// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {
  Chart,
  bar,
  line,
  band,
  errorBar,
  referenceLine,
  ChartGrid,
  ChartAxis,
} from '@astryxdesign/charts';
import {
  apiErrorRateData,
  conversionTestData,
  cpuUtilizationData,
  latencyByConcurrencyData,
  salesData,
  signupForecastData,
} from './_data';

/**
 * Annotations mark values on a chart: targets, ranges, events, uncertainty.
 * Build them with `referenceLine()`, `band()` and `errorBar()`, the same
 * factories you pass in `series`. They get no legend entry and no tooltip row.
 *
 * `referenceLine({x})` takes a numeric `x`. It draws only on a numeric x axis;
 * on a categorical x axis it draws nothing.
 */
const meta: Meta<typeof Chart> = {
  title: 'Charts/Annotations',
  component: Chart,
  tags: ['autodocs'],
};
export default meta;

const axes = (
  <>
    <ChartAxis position="bottom" />
    <ChartAxis position="left" />
  </>
);

/**
 * A horizontal reference line marks a fixed threshold, here a 1% service
 * level objective (SLO). Two hours breach it: 09:00 and 15:00. Check: the
 * dashed line sits at 1% with its label, and exactly two bars cross it.
 */
export const ReferenceLine: StoryObj = {
  render: () => (
    <Chart
      data={apiErrorRateData}
      xKey="hour"
      title="API error rate"
      subtitle="Percent of requests that failed, by hour of day"
      series={[
        bar('errorRate', {color: '#3b82f6', label: 'Error rate'}),
        referenceLine({y: 1, label: 'SLO 1%', color: '#ef4444'}),
      ]}
      grid={<ChartGrid />}
      axes={axes}
      height={300}
    />
  ),
};

/**
 * A reference range (`y` + `y2`) shades a band between two values, here the
 * healthy CPU range of 40–70%. Utilization falls below the range at night and
 * rises above it at midday and in the early evening. Check: the band spans
 * 40–70% and the line leaves it on both sides.
 */
export const ReferenceRange: StoryObj = {
  render: () => (
    <Chart
      data={cpuUtilizationData}
      xKey="hour"
      title="CPU utilization"
      subtitle="Percent of capacity, by hour of day. Shaded: healthy range, 40–70%"
      series={[
        referenceLine({
          y: 40,
          y2: 70,
          label: 'Healthy',
          color: '#22c55e',
          bandOpacity: 0.12,
        }),
        line('cpu', {color: '#3b82f6', label: 'CPU'}),
      ]}
      grid={<ChartGrid />}
      axes={axes}
      height={300}
    />
  ),
};

/**
 * A vertical reference line (`x`) marks a value on a numeric x axis, here the
 * tested capacity of 800 concurrent users. Latency rises steeply above it.
 * Check: the x axis is numeric, and the line sits at 800 users.
 */
export const VerticalReferenceLine: StoryObj = {
  render: () => (
    <Chart
      data={latencyByConcurrencyData}
      xKey="users"
      title="Latency under load"
      subtitle="95th-percentile response time (ms) by concurrent users"
      series={[
        line('p95LatencyMs', {
          color: '#3b82f6',
          dots: true,
          label: 'p95 latency',
        }),
        referenceLine({x: 800, label: 'Capacity', color: '#6b1efd'}),
      ]}
      grid={<ChartGrid />}
      axes={axes}
      height={300}
    />
  ),
};

/**
 * Nested bands show forecast uncertainty: the inner band is the 80% interval
 * and the outer band is the 95% interval. Both widen as the forecast goes
 * further out. Check: the forecast starts where the actuals end (week 8), and
 * the inner band stays inside the outer band.
 */
export const ConfidenceBand: StoryObj = {
  render: () => (
    <Chart
      data={signupForecastData}
      xKey="week"
      title="Weekly signups"
      subtitle="Signups per week. Weeks 1–8 actual; weeks 9–20 forecast with 80% and 95% intervals"
      series={[
        band({
          upper: 'upper95',
          lower: 'lower95',
          color: '#f59e0b',
          opacity: 0.12,
        }),
        band({
          upper: 'upper80',
          lower: 'lower80',
          color: '#f59e0b',
          opacity: 0.22,
        }),
        line('actual', {color: '#3b82f6', strokeWidth: 2, label: 'Actual'}),
        line('forecast', {color: '#f59e0b', strokeWidth: 2, label: 'Forecast'}),
      ]}
      legend
      grid={<ChartGrid />}
      axes={axes}
      height={320}
    />
  ),
};

/**
 * Error bars pair with a value mark (here, bars) to show a range, here the
 * 95% confidence interval of each variant. Only Variant C's interval does not
 * overlap Control's. Check: each bar has a whisker, and Variant C's lower cap
 * is above Control's upper cap.
 */
export const ErrorBars: StoryObj = {
  render: () => (
    <Chart
      data={conversionTestData}
      xKey="variant"
      title="Checkout conversion by variant"
      subtitle="Percent of sessions that converted, with 95% confidence intervals"
      series={[
        bar('conversionRate', {color: '#3b82f6', label: 'Conversion rate'}),
        errorBar({high: 'ciHigh', low: 'ciLow', color: '#1e3a5f'}),
      ]}
      grid={<ChartGrid />}
      axes={axes}
      height={320}
    />
  ),
};

/** Many marks at once: bars, reference range, confidence band, reference line, line, error bars. */
export const Layering: StoryObj = {
  render: () => {
    const data = salesData.map((d, i, arr) => {
      const avg =
        arr.slice(0, i + 1).reduce((s, v) => s + v.sales, 0) / (i + 1);
      return {
        ...d,
        runAvg: Math.round(avg * 10) / 10,
        upper: Math.round((avg + 8) * 10) / 10,
        lower: Math.round((avg - 8) * 10) / 10,
      };
    });
    return (
      <Chart
        data={data}
        xKey="month"
        title="Kitchen sink"
        series={[
          bar('sales', {color: '#3b82f6', label: 'Sales'}),
          referenceLine({y: 40, y2: 60, color: '#22c55e', bandOpacity: 0.08}),
          band({
            upper: 'upper',
            lower: 'lower',
            color: '#f59e0b',
            opacity: 0.15,
          }),
          referenceLine({y: 50, label: 'Target', color: '#ef4444'}),
          line('runAvg', {color: '#f59e0b', strokeWidth: 2, label: 'Run avg'}),
          errorBar({high: 'errorHigh', low: 'errorLow', color: '#1e3a5f'}),
        ]}
        grid={<ChartGrid />}
        axes={axes}
        height={400}
      />
    );
  },
};
