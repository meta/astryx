// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {ChartSwatch} from '@astryxdesign/charts';

const meta: Meta<typeof ChartSwatch> = {
  title: 'Charts/Chrome/Swatch',
  component: ChartSwatch,
  tags: ['autodocs'],
  argTypes: {
    color: {control: 'color'},
    variant: {control: 'inline-radio', options: ['square', 'line']},
  },
  args: {color: '#3b82f6', variant: 'square'},
};
export default meta;

const COLORS = [
  '#3b82f6',
  '#eb6e00',
  '#6b1efd',
  '#0b991f',
  '#f351c0',
  '#f5394f',
];

/** The color swatch primitive — `square` for bar series, `line` for others. */
export const Gallery: StoryObj = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
      <div style={{display: 'flex', gap: 12, alignItems: 'center'}}>
        {COLORS.map(c => (
          <ChartSwatch key={`sq-${c}`} color={c} variant="square" />
        ))}
      </div>
      <div style={{display: 'flex', gap: 12, alignItems: 'center'}}>
        {COLORS.map(c => (
          <ChartSwatch key={`ln-${c}`} color={c} variant="line" />
        ))}
      </div>
    </div>
  ),
};

/** Interactive single swatch. */
export const Playground: StoryObj = {};
