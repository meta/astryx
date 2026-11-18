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
import {salesData, predictionData} from './_data';

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

/** A single horizontal reference line at a fixed y value. */
export const ReferenceLine: StoryObj = {
  render: () => (
    <Chart
      data={salesData}
      xKey="month"
      title="Sales vs target"
      series={[
        bar('sales', {color: '#3b82f6'}),
        referenceLine({y: 50, label: 'Target', color: '#ef4444'}),
      ]}
      grid={<ChartGrid />}
      axes={axes}
      height={300}
    />
  ),
};

/** A shaded band between two y values (y + y2). */
export const ReferenceRange: StoryObj = {
  render: () => (
    <Chart
      data={salesData}
      xKey="month"
      title="Acceptable range"
      series={[
        bar('sales', {color: '#3b82f6'}),
        referenceLine({
          y: 40,
          y2: 60,
          label: 'Acceptable',
          color: '#22c55e',
          bandOpacity: 0.12,
        }),
      ]}
      grid={<ChartGrid />}
      axes={axes}
      height={300}
    />
  ),
};

/** A vertical reference line at a fixed x value (linear x scale only). */
export const VerticalReferenceLine: StoryObj = {
  render: () => (
    <Chart
      data={predictionData}
      xKey="x"
      title="Event marker"
      series={[
        line('mean', {color: '#3b82f6'}),
        referenceLine({x: 10, label: 'Launch', color: '#6b1efd'}),
      ]}
      grid={<ChartGrid />}
      axes={axes}
      height={300}
    />
  ),
};

/** Confidence bands (80% + 95%) around a forecast line. */
export const ConfidenceBand: StoryObj = {
  render: () => (
    <Chart
      data={predictionData}
      xKey="x"
      title="Forecast with confidence bands"
      series={[
        band({
          upper: 'upper95',
          lower: 'lower95',
          color: '#3b82f6',
          opacity: 0.12,
        }),
        band({
          upper: 'upper80',
          lower: 'lower80',
          color: '#3b82f6',
          opacity: 0.22,
        }),
        line('mean', {color: '#3b82f6', strokeWidth: 2}),
      ]}
      grid={<ChartGrid />}
      axes={axes}
      height={320}
    />
  ),
};

/** Error bars pair with a value mark (here, bars) to show a high/low range. */
export const ErrorBars: StoryObj = {
  render: () => (
    <Chart
      data={salesData}
      xKey="month"
      title="Sales with error bars"
      series={[
        bar('sales', {color: '#3b82f6'}),
        errorBar({high: 'errorHigh', low: 'errorLow', color: '#1e3a5f'}),
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
