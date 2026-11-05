// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {Divider} from '@astryxdesign/core/Divider';
import {Card} from '@astryxdesign/core/Card';
import {Section} from '@astryxdesign/core/Section';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  storyWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-6'],
  },
  fullHeight: {
    height: '100%',
  },
});

const meta: Meta<typeof Divider> = {
  title: 'Core/Divider',
  component: Divider,
  tags: ['autodocs'],
  argTypes: {
    orientation: {
      control: 'select',
      options: ['horizontal', 'vertical'],
      description: 'Orientation of the divider',
    },
    variant: {
      control: 'select',
      options: ['subtle', 'strong'],
      description: 'Visual weight of the divider line',
    },
    isFullBleed: {
      control: 'boolean',
      description: 'Escape parent container padding',
    },
    label: {
      control: 'text',
      description: 'Optional label text (rendered small and secondary)',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Divider>;

export const Default: Story = {
  args: {},
  render: args => (
    <Section variant="muted">
      <Card>
        <VStack gap={3}>
          <Text type="body">Content above</Text>
          <Divider {...args} />
          <Text type="body">Content below</Text>
        </VStack>
      </Card>
    </Section>
  ),
};

export const WithLabel: Story = {
  args: {
    label: 'or',
  },
  render: args => (
    <Section variant="muted">
      <Card>
        <VStack gap={3}>
          <Text type="body">Content above</Text>
          <Divider {...args} />
          <Text type="body">Content below</Text>
        </VStack>
      </Card>
    </Section>
  ),
};

export const Variants: Story = {
  render: () => (
    <Section variant="muted">
      <div {...stylex.props(styles.storyWrapper)}>
        <Card>
          <VStack gap={3}>
            <Text type="supporting">Subtle (default)</Text>
            <Divider variant="subtle" />
          </VStack>
        </Card>
        <Card>
          <VStack gap={3}>
            <Text type="supporting">Strong</Text>
            <Divider variant="strong" />
          </VStack>
        </Card>
      </div>
    </Section>
  ),
};

export const FullBleed: Story = {
  render: () => (
    <Section variant="muted">
      <div {...stylex.props(styles.storyWrapper)}>
        <Card>
          <VStack gap={3}>
            <Text type="label">Normal divider</Text>
            <Text type="body">The divider respects container padding.</Text>
            <Divider />
            <Text type="body">Content below the divider.</Text>
          </VStack>
        </Card>
        <Card>
          <VStack gap={3}>
            <Text type="label">Full bleed divider</Text>
            <Text type="body">The divider extends to container edges.</Text>
            <Divider isFullBleed />
            <Text type="body">Content below the divider.</Text>
          </VStack>
        </Card>
      </div>
    </Section>
  ),
};

export const Vertical: Story = {
  args: {
    orientation: 'vertical',
  },
  render: args => (
    <Section variant="muted">
      <Card height={200}>
        <HStack gap={4} xstyle={styles.fullHeight}>
          <Text type="body">Left content</Text>
          <Divider {...args} />
          <Text type="body">Right content</Text>
        </HStack>
      </Card>
    </Section>
  ),
};

export const VerticalWithLabel: Story = {
  args: {
    orientation: 'vertical',
    label: 'OR',
  },
  render: args => (
    <Section variant="muted">
      <Card height={200}>
        <HStack gap={4} xstyle={styles.fullHeight}>
          <Text type="body">Option A</Text>
          <Divider {...args} />
          <Text type="body">Option B</Text>
        </HStack>
      </Card>
    </Section>
  ),
};

export const InCard: Story = {
  render: () => (
    <Section variant="muted">
      <Card>
        <VStack gap={3}>
          <Text type="label">Card Title</Text>
          <Divider />
          <Text type="body">
            This demonstrates how a divider can be used to separate content
            sections within a card or panel.
          </Text>
          <Divider label="More Info" />
          <Text type="supporting">
            Additional details can appear below a labeled divider.
          </Text>
        </VStack>
      </Card>
    </Section>
  ),
};

export const NumericLabel: Story = {
  render: () => (
    <Section variant="muted">
      <div {...stylex.props(styles.storyWrapper)}>
        <Card>
          <VStack gap={3}>
            <Text type="supporting">Horizontal numeric label</Text>
            <Divider label={0} />
          </VStack>
        </Card>
        <Card height={200}>
          <HStack gap={4} xstyle={styles.fullHeight}>
            <Text type="body">Start</Text>
            <Divider orientation="vertical" label={0} />
            <Text type="body">End</Text>
          </HStack>
        </Card>
      </div>
    </Section>
  ),
};

export const FullBleedVertical: Story = {
  render: () => (
    <Section variant="muted">
      <Card height={200}>
        <HStack gap={4} xstyle={styles.fullHeight}>
          <Text type="body">Left content</Text>
          <Divider orientation="vertical" isFullBleed />
          <Text type="body">Right content</Text>
        </HStack>
      </Card>
    </Section>
  ),
};
