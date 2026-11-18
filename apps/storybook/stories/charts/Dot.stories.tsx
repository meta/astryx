// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {Chart, dot, ChartGrid, ChartAxis} from '@astryxdesign/charts';
import {scatterData, stripData} from './_data';

const meta: Meta<typeof Chart> = {
  title: 'Charts/Marks/Dot',
  component: Chart,
};
export default meta;

const axes = (
  <>
    <ChartAxis position="bottom" />
    <ChartAxis position="left" />
  </>
);

/** SVG scatter (numeric x/y). For large N (thousands of points) use `dotGL`. */
export const Scatter: StoryObj = {
  render: () => (
    <Chart
      data={scatterData}
      xKey="x"
      title="Scatter (SVG)"
      series={[dot('y', {color: '#3b82f6', radius: 4, opacity: 0.7})]}
      grid={<ChartGrid horizontal vertical />}
      axes={axes}
      height={360}
    />
  ),
};

/** `dodge` spreads points sharing a category so they don't overlap. */
export const Dodged: StoryObj = {
  render: () => (
    <Chart
      data={stripData}
      xKey="group"
      title="Values by group (dodged)"
      series={[dot('value', {dodge: true, radius: 5})]}
      grid={<ChartGrid />}
      axes={axes}
      height={300}
    />
  ),
};
