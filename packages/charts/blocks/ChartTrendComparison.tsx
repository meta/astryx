// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Chart, ChartAxis, ChartGrid, bar, line} from '@astryxdesign/charts';

const quarterlyResults = [
  {quarter: 'Q1', actual: 48, plan: 45},
  {quarter: 'Q2', actual: 57, plan: 54},
  {quarter: 'Q3', actual: 62, plan: 66},
  {quarter: 'Q4', actual: 78, plan: 72},
];

export default function ChartTrendComparison() {
  return (
    <Chart
      data={quarterlyResults}
      xKey="quarter"
      series={[bar('actual', {label: 'Actual'}), line('plan', {label: 'Plan'})]}
      title="Quarterly results"
      subtitle="Actual revenue compared with plan"
      legend
      tooltip
      grid={<ChartGrid horizontal />}
      axes={
        <>
          <ChartAxis position="bottom" />
          <ChartAxis position="left" />
        </>
      }
      height={280}
    />
  );
}
