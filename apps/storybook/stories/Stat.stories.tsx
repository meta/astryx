// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {Stat} from '@astryxdesign/core/Stat';
import {Card} from '@astryxdesign/core/Card';
import {Grid} from '@astryxdesign/core/Grid';
import {HStack, VStack} from '@astryxdesign/core/Layout';

const meta: Meta<typeof Stat> = {
  title: 'Core/Stat',
  component: Stat,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div style={{width: 760, maxWidth: '100%'}}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof Stat>;

export const Showcase: Story = {
  render: () => (
    <Grid columns={{minWidth: 160, repeat: 'fit'}} gap={6}>
      <Card>
        <Stat
          label="Total revenue"
          value="$1.28M"
          delta={{value: '+12.4%', direction: 'up'}}
          description="vs. previous 30 days"
        />
      </Card>
      <Card>
        <Stat
          label="Error rate"
          value="0.42%"
          delta={{value: '-0.08%', direction: 'down', sentiment: 'success'}}
          description="vs. previous 30 days"
        />
      </Card>
      <Card>
        <Stat
          label="Active users"
          value="18,204"
          delta={{value: '0.0%', direction: 'flat'}}
          description="vs. previous 30 days"
        />
      </Card>
    </Grid>
  ),
};

export const Sizes: Story = {
  render: () => (
    <HStack gap={8} vAlign="end">
      <Stat
        label="Deploys"
        value="128"
        size="sm"
        delta={{value: '+6', direction: 'up'}}
      />
      <Stat
        label="Deploys"
        value="128"
        size="md"
        delta={{value: '+6', direction: 'up'}}
      />
      <Stat
        label="Deploys"
        value="128"
        size="lg"
        delta={{value: '+6', direction: 'up'}}
      />
    </HStack>
  ),
};

export const WithMedia: Story = {
  render: () => (
    <Card>
      <VStack gap={4}>
        <Stat
          label="Conversion"
          value="7.8%"
          delta={{value: '+0.9%', direction: 'up'}}
          description="checkout completion"
          media={
            <svg viewBox="0 0 160 36" role="img" aria-label="Rising trend">
              <polyline
                points="0,28 24,26 48,30 72,18 96,20 120,10 160,8"
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
        />
      </VStack>
    </Card>
  ),
};
