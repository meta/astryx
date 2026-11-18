// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {useMemo} from 'react';
import {
  Chart,
  candlestick,
  line,
  ChartGrid,
  ChartAxis,
} from '@astryxdesign/charts';
import {stockData} from './_data';

const meta: Meta<typeof Chart> = {
  title: 'Charts/Marks/Candlestick',
  component: Chart,
};
export default meta;

const axes = (
  <>
    <ChartAxis position="bottom" />
    <ChartAxis position="left" />
  </>
);

/** OHLC candlesticks. Up/down default to the theme's success/error colors. */
export const Basic: StoryObj = {
  render: () => (
    <Chart
      data={stockData}
      xKey="day"
      title="Price (OHLC)"
      series={[
        candlestick({open: 'open', high: 'high', low: 'low', close: 'close'}),
      ]}
      grid={<ChartGrid />}
      axes={axes}
      height={360}
    />
  ),
};

/** Candlesticks + a moving-average line overlay on the shared price scale. */
export const WithMovingAverage: StoryObj = {
  render: () => {
    const data = useMemo(() => {
      let sum = 0;
      return stockData.map((d, i) => {
        sum += d.close;
        const ma =
          i >= 4
            ? (sum -
                stockData.slice(0, i - 4).reduce((s, v) => s + v.close, 0)) /
              5
            : undefined;
        return {...d, ma5: ma == null ? undefined : Math.round(ma * 10) / 10};
      });
    }, []);
    return (
      <Chart
        data={data}
        xKey="day"
        title="Price + 5-day MA"
        series={[
          candlestick({open: 'open', high: 'high', low: 'low', close: 'close'}),
          line('ma5', {color: '#f59e0b', strokeWidth: 1.5}),
        ]}
        grid={<ChartGrid />}
        axes={axes}
        height={360}
      />
    );
  },
};
