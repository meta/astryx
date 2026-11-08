// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {Icon} from '@astryxdesign/core/Icon';
import {Token} from '@astryxdesign/core/Token';
import {
  InformationCircleIcon,
  CalendarIcon,
  TagIcon,
} from '@heroicons/react/24/outline';

const meta: Meta<typeof MetadataList> = {
  title: 'Core/MetadataList',
  component: MetadataList,
  tags: ['autodocs'],
  argTypes: {
    columns: {
      control: 'select',
      options: ['single', 'multi', 2, 3],
      description: 'Column layout mode',
    },
    orientation: {
      control: 'select',
      options: ['vertical', 'horizontal'],
      description: 'Layout orientation',
    },
  },
};

export default meta;
type Story = StoryObj<typeof MetadataList>;

export const Basic: Story = {
  render: args => (
    <MetadataList {...args}>
      <MetadataListItem label="Name">MetadataList</MetadataListItem>
      <MetadataListItem label="Status">Active</MetadataListItem>
      <MetadataListItem label="Owner">Joey</MetadataListItem>
    </MetadataList>
  ),
};

export const MultiColumn: Story = {
  render: args => (
    <MetadataList columns="multi" {...args}>
      <MetadataListItem label="Name">MetadataList</MetadataListItem>
      <MetadataListItem label="Status">Active</MetadataListItem>
      <MetadataListItem label="Owner">Joey</MetadataListItem>
      <MetadataListItem label="Created">Jan 15, 2026</MetadataListItem>
      <MetadataListItem label="Tags">
        <span style={{display: 'flex', gap: 4}}>
          <Token label="component" />
          <Token label="astryx" />
        </span>
      </MetadataListItem>
      <MetadataListItem label="Priority">Tier 1</MetadataListItem>
    </MetadataList>
  ),
};

export const WithTitle: Story = {
  render: args => (
    <MetadataList
      title={<strong>Component Details</strong>}
      columns="multi"
      {...args}>
      <MetadataListItem label="Name">MetadataList</MetadataListItem>
      <MetadataListItem label="Status">Active</MetadataListItem>
      <MetadataListItem label="Owner">Joey</MetadataListItem>
      <MetadataListItem label="Created">Jan 15, 2026</MetadataListItem>
    </MetadataList>
  ),
};

export const Horizontal: Story = {
  render: args => (
    <MetadataList orientation="horizontal" {...args}>
      <MetadataListItem label="Status">Active</MetadataListItem>
      <MetadataListItem label="Type">Premium</MetadataListItem>
      <MetadataListItem label="Owner">Joey</MetadataListItem>
      <MetadataListItem label="Created">Jan 15, 2026</MetadataListItem>
    </MetadataList>
  ),
};

export const StackedLabelsSingleColumn: Story = {
  render: args => (
    <MetadataList label={{position: 'top'}} {...args}>
      <MetadataListItem label="Name">MetadataList</MetadataListItem>
      <MetadataListItem label="Status">Active</MetadataListItem>
      <MetadataListItem label="Owner">Joey</MetadataListItem>
      <MetadataListItem label="Tags">
        <span style={{display: 'flex', gap: 4}}>
          <Token label="component" />
          <Token label="astryx" />
        </span>
      </MetadataListItem>
    </MetadataList>
  ),
};

export const ShowMore: Story = {
  render: args => (
    <MetadataList maxNumOfItems={3} {...args}>
      <MetadataListItem label="Name">MetadataList</MetadataListItem>
      <MetadataListItem label="Status">Active</MetadataListItem>
      <MetadataListItem label="Owner">Joey</MetadataListItem>
      <MetadataListItem label="Created">Jan 15, 2026</MetadataListItem>
      <MetadataListItem label="Updated">Mar 26, 2026</MetadataListItem>
      <MetadataListItem label="Priority">Tier 1</MetadataListItem>
    </MetadataList>
  ),
};

export const TwoColumns: Story = {
  render: args => (
    <MetadataList columns={2} {...args}>
      <MetadataListItem label="Name">MetadataList</MetadataListItem>
      <MetadataListItem label="Status">Active</MetadataListItem>
      <MetadataListItem label="Owner">Joey</MetadataListItem>
      <MetadataListItem label="Priority">Tier 1</MetadataListItem>
    </MetadataList>
  ),
};

export const CustomLabelWidth: Story = {
  render: args => (
    <MetadataList label={{width: 200}} {...args}>
      <MetadataListItem label="Full Name">
        MetadataList Component
      </MetadataListItem>
      <MetadataListItem label="Current Status">Active</MetadataListItem>
      <MetadataListItem label="Primary Owner">Joey</MetadataListItem>
    </MetadataList>
  ),
};

export const MultiColumnSideLabels: Story = {
  render: args => (
    <MetadataList columns="multi" label={{position: 'start'}} {...args}>
      <MetadataListItem label="Name">MetadataList</MetadataListItem>
      <MetadataListItem label="Status">Active</MetadataListItem>
      <MetadataListItem label="Owner">Joey</MetadataListItem>
      <MetadataListItem label="Created">Jan 15, 2026</MetadataListItem>
    </MetadataList>
  ),
};

export const WithIcons: Story = {
  render: args => (
    <MetadataList columns="multi" {...args}>
      <MetadataListItem
        label="Information"
        icon={<Icon icon={InformationCircleIcon} size="sm" />}>
        Important details about this component
      </MetadataListItem>
      <MetadataListItem
        label="Created"
        icon={<Icon icon={CalendarIcon} size="sm" />}>
        January 1, 2023
      </MetadataListItem>
      <MetadataListItem label="Tags" icon={<Icon icon={TagIcon} size="sm" />}>
        <span style={{display: 'flex', gap: 4}}>
          <Token label="component" />
          <Token label="astryx" />
        </span>
      </MetadataListItem>
    </MetadataList>
  ),
};
