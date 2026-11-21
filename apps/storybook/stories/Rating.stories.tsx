// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Rating} from '@astryxdesign/lab';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

const meta: Meta<typeof Rating> = {
  title: 'Lab/Rating',
  component: Rating,
  tags: ['autodocs'],
  parameters: {layout: 'centered'},
};

export default meta;

type Story = StoryObj<typeof Rating>;

export const Interactive: Story = {
  render: () => {
    const [stars, setStars] = useState<number | null>(null);
    return (
      <VStack gap={3}>
        <Rating label="Rate this recipe" value={stars} onChange={setStars} />
        <Text>{stars == null ? 'Not rated' : `${stars} of 5`}</Text>
      </VStack>
    );
  },
};

export const ReadOnlyAverage: Story = {
  render: () => (
    <VStack gap={3}>
      <HStack gap={3} vAlign="center">
        <Rating label="Average rating" value={4.3} isReadOnly />
        <Text>4.3 (128 reviews)</Text>
      </HStack>
      <Rating label="Average rating" value={2.5} isReadOnly size="sm" />
    </VStack>
  ),
};

export const Sizes: Story = {
  render: () => (
    <VStack gap={3}>
      <Rating label="Small" value={3} onChange={() => {}} size="sm" />
      <Rating label="Medium" value={3} onChange={() => {}} size="md" />
      <Rating label="Large" value={3} onChange={() => {}} size="lg" />
    </VStack>
  ),
};

export const States: Story = {
  render: () => (
    <VStack gap={3}>
      <Rating label="Disabled" value={2} onChange={() => {}} isDisabled />
      <Rating label="Ten stars" value={7} onChange={() => {}} max={10} />
    </VStack>
  ),
};
