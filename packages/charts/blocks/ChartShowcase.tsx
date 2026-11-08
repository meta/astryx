// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Chart, ChartAxis, ChartGrid, bar} from '@astryxdesign/charts';

const monthlyRevenue = [
  {month: 'Jan', revenue: 42},
  {month: 'Feb', revenue: 58},
  {month: 'Mar', revenue: 51},
  {month: 'Apr', revenue: 74},
  {month: 'May', revenue: 68},
  {month: 'Jun', revenue: 86},
];

export default function ChartShowcase() {
  return (
    <Chart
      data={monthlyRevenue}
      xKey="month"
      series={[bar('revenue', {label: 'Revenue'})]}
      tooltip
      grid={<ChartGrid horizontal />}
      axes={
        <>
          <ChartAxis position="bottom" />
          <ChartAxis position="left" />
        </>
      }
      height={260}
    />
  );
}
