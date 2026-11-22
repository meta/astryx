// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {ChartLegend} from '@astryxdesign/charts';

const sampleItems = [
  {label: 'Revenue', color: '#3b82f6', type: 'bar'},
  {label: 'Costs', color: '#ef4444', type: 'bar'},
  {label: 'Trend', color: '#f59e0b', type: 'line'},
];

const meta: Meta<typeof ChartLegend> = {
  title: 'Charts/Chrome/Legend',
  component: ChartLegend,
  tags: ['autodocs'],
  argTypes: {
    position: {
      control: 'inline-radio',
      options: ['top', 'bottom', 'start', 'end'],
    },
    alignment: {control: 'inline-radio', options: ['start', 'center', 'end']},
    items: {table: {disable: true}},
  },
  args: {items: sampleItems, position: 'bottom', alignment: 'start'},
  render: args => <ChartLegend {...args} />,
};
export default meta;

/** Standalone legend. Swatch shape follows the mark type (square for bar). */
export const Default: StoryObj = {};
