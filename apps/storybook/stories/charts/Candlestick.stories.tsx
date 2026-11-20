// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {
  Chart,
  candlestick,
  line,
  ChartGrid,
  ChartAxis,
} from '@astryxdesign/charts';
import {dailySharePriceData} from './_data';

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

/**
 * Open, high, low and close (OHLC) for each trading day of a fictional
 * company. Up and down days use the theme's success and error colors. Day 18
 * (Mar 26) opens with a gap up. Check: there are 30 candles, and the x axis
 * skips weekends because it shows trading days only.
 */
export const Basic: StoryObj = {
  render: () => (
    <Chart
      data={dailySharePriceData}
      xKey="day"
      title="Example Co. share price"
      subtitle="US dollars per share, 30 trading days from Mar 3"
      series={[
        candlestick({open: 'open', high: 'high', low: 'low', close: 'close'}),
      ]}
      grid={<ChartGrid />}
      axes={axes}
      height={360}
    />
  ),
};

/**
 * Candlesticks with a 5-day moving average of the close on the same price
 * scale. The average needs 5 days of data, so it starts on day 5 (Mar 7).
 * Check: the line starts at the fifth candle, not the first.
 */
export const WithMovingAverage: StoryObj = {
  render: () => (
    <Chart
      data={dailySharePriceData}
      xKey="day"
      title="Example Co. share price"
      subtitle="US dollars per share, 30 trading days from Mar 3, with a 5-day moving average"
      series={[
        candlestick({open: 'open', high: 'high', low: 'low', close: 'close'}),
        line('movingAverage5', {
          color: '#f59e0b',
          strokeWidth: 1.5,
          label: '5-day moving average',
        }),
      ]}
      grid={<ChartGrid />}
      axes={axes}
      height={360}
    />
  ),
};
