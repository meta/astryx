// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Button} from '@astryxdesign/core/Button';

const meta: Meta<typeof EmptyState> = {
  title: 'Core/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
  argTypes: {
    title: {
      control: 'text',
      description: 'Primary message',
    },
    description: {
      control: 'text',
      description: 'Optional secondary text',
    },
    isCompact: {
      control: 'boolean',
      description: 'Compact variant with reduced spacing',
    },
  },
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  args: {
    title: 'No results found',
    description: 'Try adjusting your search or filters to find what you need.',
  },
};

export const TitleOnly: Story = {
  args: {
    title: 'Nothing here yet',
  },
};

export const NonRenderingOptionalSlots: Story = {
  args: {
    title: 'Nothing here yet',
    description: '',
    icon: false,
    actions: '',
  },
};

export const WithIcon: Story = {
  args: {
    icon: <span style={{fontSize: '48px'}}>📭</span>,
    title: 'No messages',
    description: "You're all caught up!",
  },
};

export const WithActions: Story = {
  args: {
    icon: <span style={{fontSize: '48px'}}>🔍</span>,
    title: 'No results found',
    description: 'Try adjusting your search or filters.',
    actions: (
      <>
        <Button label="Go back" variant="secondary" />
        <Button label="Clear filters" variant="primary" />
      </>
    ),
  },
};

export const Compact: Story = {
  args: {
    icon: <span style={{fontSize: '32px'}}>📋</span>,
    title: 'No items',
    description: 'Nothing to show here.',
    isCompact: true,
  },
};

export const CompactWithActions: Story = {
  args: {
    title: 'No data',
    description: 'Add some data to get started.',
    actions: (
      <>
        <Button label="Import" variant="secondary" />
        <Button label="Add item" variant="primary" />
      </>
    ),
    isCompact: true,
  },
};

export const FullExample: Story = {
  render: () => (
    <div
      style={{
        border: '1px dashed #ccc',
        borderRadius: '12px',
        maxWidth: '480px',
      }}>
      <EmptyState
        icon={<span style={{fontSize: '48px'}}>📬</span>}
        title="No notifications"
        description="When you receive notifications, they will appear here. Check back later!"
        actions={
          <>
            <Button label="Settings" variant="secondary" />
            <Button label="Refresh" variant="primary" />
          </>
        }
      />
    </div>
  ),
};
