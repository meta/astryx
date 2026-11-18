// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {Chart, bar, ChartGrid, ChartAxis, currency} from '@astryxdesign/charts';
import {monthlyData, groupedStackData, profitLossData} from './_data';
import {useLocale} from '@astryxdesign/core';

const meta: Meta<typeof Chart> = {
  title: 'Charts/Marks/Bar',
  component: Chart,
};
export default meta;

const axes = (
  <>
    <ChartAxis position="bottom" />
    <ChartAxis position="left" />
  </>
);

export const Default: StoryObj = {
  render: () => {
    const locale = useLocale();
    return (
      <Chart
        data={monthlyData}
        xKey="month"
        title="Monthly Revenue"
        series={[bar('revenue', {color: '#3b82f6'})]}
        tooltip
        grid={<ChartGrid />}
        axes={
          <>
            <ChartAxis position="bottom" />
            <ChartAxis position="left" tickFormat={currency('$', locale)} />
          </>
        }
        height={300}
      />
    );
  },
};

export const Stacked: StoryObj = {
  render: () => (
    <Chart
      data={monthlyData}
      xKey="month"
      title="Revenue & Costs"
      subtitle="Stacked by category"
      series={[
        bar('revenue', {color: '#3b82f6', stack: 'totals', label: 'Revenue'}),
        bar('costs', {color: '#ef4444', stack: 'totals', label: 'Costs'}),
      ]}
      legend={{position: 'bottom', alignment: 'center'}}
      grid={<ChartGrid />}
      axes={axes}
      height={300}
    />
  ),
};

export const Grouped: StoryObj = {
  render: () => (
    <Chart
      data={monthlyData}
      xKey="month"
      title="Revenue vs Costs"
      series={[
        bar('revenue', {color: '#3b82f6', group: 'compare', label: 'Revenue'}),
        bar('costs', {color: '#ef4444', group: 'compare', label: 'Costs'}),
      ]}
      legend={{position: 'top', alignment: 'end'}}
      grid={<ChartGrid />}
      axes={axes}
      height={300}
    />
  ),
};

export const GroupedStacked: StoryObj = {
  render: () => (
    <Chart
      data={groupedStackData}
      xKey="month"
      title="Grouped + stacked"
      series={[
        bar('revenueA', {color: '#3b82f6', stack: 'a', group: 'cmp'}),
        bar('costsA', {color: '#93c5fd', stack: 'a', group: 'cmp'}),
        bar('revenueB', {color: '#ef4444', stack: 'b', group: 'cmp'}),
        bar('costsB', {color: '#fca5a5', stack: 'b', group: 'cmp'}),
      ]}
      grid={<ChartGrid />}
      axes={axes}
      height={300}
    />
  ),
};

export const NegativeValues: StoryObj = {
  render: () => (
    <Chart
      data={profitLossData}
      xKey="month"
      title="Profit / Loss"
      series={[bar('profit', {color: '#3b82f6'})]}
      grid={<ChartGrid />}
      axes={axes}
      height={300}
    />
  ),
};
