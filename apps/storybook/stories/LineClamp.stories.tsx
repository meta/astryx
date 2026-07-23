// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {LineClamp} from '@astryxdesign/lab/LineClamp';

const LONG_TEXT =
  'Astryx is an open source design system that grew inside Meta over the last eight years, where it became the most-used and largest design system in the company — powering thousands of apps and shaped by the engineers, designers, and product teams who depend on it every day.';

const meta: Meta<typeof LineClamp> = {
  title: 'Lab/LineClamp',
  component: LineClamp,
  tags: ['autodocs'],
  argTypes: {
    maxLines: {
      control: {type: 'number', min: 1, max: 6, step: 1},
      description: 'Maximum number of lines before clamping',
    },
    hasTooltip: {
      control: 'boolean',
      description: 'Show full content in a tooltip when clamped',
    },
    as: {
      control: 'select',
      options: ['div', 'span', 'p'],
      description: 'HTML element to render',
    },
  },
  decorators: [
    Story => (
      <div style={{maxWidth: 320}}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    maxLines: 3,
    children: LONG_TEXT,
  },
};

export const TwoLines: Story = {
  args: {
    maxLines: 2,
    children: LONG_TEXT,
  },
};

export const SingleLine: Story = {
  args: {
    maxLines: 1,
    children: LONG_TEXT,
  },
};

export const WithoutTooltip: Story = {
  args: {
    maxLines: 2,
    hasTooltip: false,
    children: LONG_TEXT,
  },
};

export const MixedContent: Story = {
  args: {
    maxLines: 2,
    children: (
      <>
        This card description mixes <strong>bold</strong>, <em>italic</em>, and
        plain text — content a single <code>{'<Text>'}</code> node can&apos;t
        compose, which is exactly what LineClamp wraps around instead.
      </>
    ),
  },
};

export const ShortContentNotClamped: Story = {
  args: {
    maxLines: 3,
    children: 'This content is short enough that it never clamps.',
  },
};
