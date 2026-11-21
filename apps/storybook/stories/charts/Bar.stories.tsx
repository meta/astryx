// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {
  Chart,
  bar,
  ChartGrid,
  ChartAxis,
  compactNumber,
  currency,
} from '@astryxdesign/charts';
import {useLocale} from '@astryxdesign/core';
import {
  customersByQuarterData,
  departmentSpendData,
  monthlyRevenueData,
  netCashFlowData,
  ordersByChannelData,
} from './_data';

const meta: Meta<typeof Chart> = {
  title: 'Charts/Marks/Bar',
  component: Chart,
};
export default meta;

function CurrencyAxes() {
  const locale = useLocale();
  return (
    <>
      <ChartAxis position="bottom" />
      <ChartAxis position="left" tickFormat={currency('$', locale)} />
    </>
  );
}

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

/**
 * Compare one value across periods. Revenue rises through the year and peaks
 * in December. Check: bars start at $0, and the tooltip shows each month's
 * revenue.
 */
export const Default: StoryObj = {
  render: () => (
    <Chart
      data={monthlyRevenueData}
      xKey="month"
      title="Monthly revenue"
      subtitle="US dollars, January to December"
      series={[bar('revenue', {color: '#3b82f6', label: 'Revenue'})]}
      tooltip
      grid={<ChartGrid />}
      axes={<CurrencyAxes />}
      height={300}
    />
  ),
};

/**
 * Show a total and its parts. Online orders are the larger channel every
 * month, and both channels peak in December. Check: each bar's height is the
 * sum of its two segments, and the legend names both channels.
 */
export const Stacked: StoryObj = {
  render: () => (
    <Chart
      data={ordersByChannelData}
      xKey="month"
      title="Orders by channel"
      subtitle="Orders per month, January to December"
      series={[
        bar('online', {color: '#3b82f6', stack: 'totals', label: 'Online'}),
        bar('inStore', {color: '#f59e0b', stack: 'totals', label: 'In-store'}),
      ]}
      legend={{position: 'bottom', alignment: 'center'}}
      grid={<ChartGrid />}
      axes={<CompactAxes />}
      height={300}
    />
  ),
};

/**
 * Compare two values side by side in each category. Engineering and Sales
 * spent more than their budget; the other departments spent less. Check: each
 * department has a budget bar and an actual bar, sorted by budget.
 */
export const Grouped: StoryObj = {
  render: () => (
    <Chart
      data={departmentSpendData}
      xKey="department"
      title="Budget and actual spend"
      subtitle="US dollars by department, Q3"
      series={[
        bar('budget', {color: '#93c5fd', group: 'compare', label: 'Budget'}),
        bar('actual', {color: '#3b82f6', group: 'compare', label: 'Actual'}),
      ]}
      legend={{position: 'top', alignment: 'end'}}
      grid={<ChartGrid />}
      axes={<CurrencyAxes />}
      height={300}
    />
  ),
};

/**
 * Compare totals and their parts across two groups. Each quarter has one bar
 * per year, and each bar stacks new and returning customers. This year is
 * higher in every quarter. Check: the legend names all four segments, and
 * each quarter shows two stacked bars.
 */
export const GroupedStacked: StoryObj = {
  render: () => (
    <Chart
      data={customersByQuarterData}
      xKey="quarter"
      title="Customers by quarter"
      subtitle="New and returning customers, last year and this year, Q1 to Q4"
      series={[
        bar('newLastYear', {
          color: '#3b82f6',
          stack: 'lastYear',
          group: 'year',
          label: 'New, last year',
        }),
        bar('returningLastYear', {
          color: '#93c5fd',
          stack: 'lastYear',
          group: 'year',
          label: 'Returning, last year',
        }),
        bar('newThisYear', {
          color: '#f59e0b',
          stack: 'thisYear',
          group: 'year',
          label: 'New, this year',
        }),
        bar('returningThisYear', {
          color: '#fcd34d',
          stack: 'thisYear',
          group: 'year',
          label: 'Returning, this year',
        }),
      ]}
      legend
      grid={<ChartGrid />}
      axes={<CompactAxes />}
      height={300}
    />
  ),
};

/**
 * Show values above and below zero. Four months (February, April, June and
 * September) have a negative net cash flow. Check: those four bars grow down
 * from the $0 line, and the y axis shows negative values.
 */
export const NegativeValues: StoryObj = {
  render: () => (
    <Chart
      data={netCashFlowData}
      xKey="month"
      title="Net cash flow"
      subtitle="US dollars per month, January to December"
      series={[bar('netCashFlow', {color: '#3b82f6', label: 'Net cash flow'})]}
      grid={<ChartGrid />}
      axes={<CurrencyAxes />}
      height={300}
    />
  ),
};
