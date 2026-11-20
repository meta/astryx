// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {
  Chart,
  area,
  line,
  ChartGrid,
  ChartAxis,
  compactNumber,
} from '@astryxdesign/charts';
import {useLocale} from '@astryxdesign/core';
import {subscriberGrowthData, visitsByDeviceData} from './_data';

const meta: Meta<typeof Chart> = {
  title: 'Charts/Marks/Area',
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

/**
 * Show one total over time, with the area filled down to zero. A March
 * campaign adds subscribers, and a May list cleanup removes inactive ones.
 * Check: the fill fades from the line toward the x axis, and the y axis
 * starts at 0.
 */
export const Gradient: StoryObj = {
  render: () => (
    <Chart
      data={subscriberGrowthData}
      xKey="month"
      title="Newsletter subscribers"
      subtitle="Subscribers at the end of each month, January to December"
      series={[
        area('subscribers', {color: '#3b82f6', gradient: true}),
        line('subscribers', {color: '#3b82f6', label: 'Subscribers'}),
      ]}
      grid={<ChartGrid />}
      axes={<CompactAxes />}
      height={300}
    />
  ),
};

/**
 * Show how parts of a total change over time. Mobile is the larger part
 * every month; desktop visits drop in the summer. Check: the top edge is the
 * total of both devices, and the legend names both.
 */
export const Stacked: StoryObj = {
  render: () => (
    <Chart
      data={visitsByDeviceData}
      xKey="month"
      title="Website visits by device"
      subtitle="Visits per month, January to December"
      series={[
        area('mobile', {color: '#3b82f6', stack: 'total', label: 'Mobile'}),
        area('desktop', {color: '#f59e0b', stack: 'total', label: 'Desktop'}),
      ]}
      legend
      grid={<ChartGrid />}
      axes={<CompactAxes />}
      height={300}
    />
  ),
};
