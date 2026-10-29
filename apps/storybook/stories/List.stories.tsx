// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file List.stories.tsx
 * @input List, ListItem, and Storybook args
 * @output List examples, including the four row edge treatments
 * @position Storybook demonstrations for List consumers
 */

import {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {Meta, StoryObj} from '@storybook/react';
import {List, ListItem} from '@astryxdesign/core/List';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Badge} from '@astryxdesign/core/Badge';
import {Card} from '@astryxdesign/core/Card';
import {Icon} from '@astryxdesign/core/Icon';
import {Switch} from '@astryxdesign/core/Switch';
import {Heading, Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Layout';
import {
  Cog6ToothIcon,
  BellIcon,
  ShieldCheckIcon,
  ChevronRightIcon,
  InboxIcon,
  PaperAirplaneIcon,
  DocumentIcon,
} from '@heroicons/react/24/outline';

const meta: Meta<typeof List> = {
  title: 'Core/List',
  component: List,
  tags: ['autodocs'],
  argTypes: {
    density: {
      control: 'select',
      options: ['compact', 'balanced', 'spacious'],
      description: 'Spacing density for list items',
    },
    hasDividers: {
      control: 'boolean',
      description: 'Whether to show dividers between items',
    },
    edge: {
      control: 'select',
      options: ['padded', 'flush', 'outset', 'bleed'],
      description:
        "Where row text, dividers, and backgrounds sit relative to the list's " +
        "edges and the container's padding",
    },
    listStyle: {
      control: 'select',
      options: ['none', 'disc', 'decimal', 'circle'],
      description: 'List marker style',
    },
  },
};

export default meta;
type Story = StoryObj<typeof List>;

const edgeStoryStyles = stylex.create({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 24,
  },
});

export const Basic: Story = {
  render: args => (
    <List {...args}>
      <ListItem label="Notifications" description="Manage your alerts" />
      <ListItem label="Privacy" description="Control your data" />
      <ListItem label="Security" description="Password and 2FA" />
    </List>
  ),
};

export const WithDividers: Story = {
  render: args => (
    <List hasDividers header={<strong>Settings</strong>} {...args}>
      <ListItem
        label="Notifications"
        description="Manage your alerts"
        startContent={<Icon icon={BellIcon} />}
      />
      <ListItem
        label="Privacy"
        description="Control your data"
        startContent={<Icon icon={ShieldCheckIcon} />}
      />
      <ListItem
        label="General"
        description="App preferences"
        startContent={<Icon icon={Cog6ToothIcon} />}
      />
    </List>
  ),
};

export const Compact: Story = {
  render: args => (
    <List density="compact" hasDividers {...args}>
      <ListItem
        label="Notifications"
        onClick={() => {}}
        endContent={<Badge label="3" />}
      />
      <ListItem
        label="Messages"
        onClick={() => {}}
        endContent={<Badge label="12" />}
      />
      <ListItem label="Settings" onClick={() => {}} />
    </List>
  ),
};

export const Spacious: Story = {
  render: args => (
    <List density="spacious" {...args}>
      <ListItem
        label="Getting Started"
        description="Learn the basics of our platform"
      />
      <ListItem
        label="Advanced Topics"
        description="Deep dive into advanced features"
      />
      <ListItem
        label="API Reference"
        description="Complete API documentation"
      />
    </List>
  ),
};

export const Flush: Story = {
  args: {edge: 'flush', hasDividers: true},
  render: args => (
    <div>
      <Text type="label" size="lg">
        Order items
      </Text>
      <List {...args}>
        <ListItem label="Solstice Mug" description="Ceramic, 12 oz" />
        <ListItem label="Meridian Notebook" description="Dot grid, A5" />
        <ListItem label="Field Pen" description="0.5 mm, black ink" />
      </List>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'edge="flush" drops the rows\' side padding, so row text starts on ' +
          'the same line as the heading and the ends of the dividers, with no ' +
          'container needed. Switch edge to compare.',
      },
    },
  },
};

const EDGES = ['padded', 'flush', 'outset', 'bleed'] as const;

/**
 * The four edge treatments inside a Card, for a static list with dividers
 * and an interactive list with a selected row.
 */
export const EdgeInCard: Story = {
  render: args => (
    <div {...stylex.props(edgeStoryStyles.grid)}>
      {EDGES.map(edge => (
        <Card key={edge} data-edge={edge}>
          <VStack gap={3}>
            <Heading level={3}>{`edge="${edge}"`}</Heading>
            <List {...args} edge={edge} hasDividers>
              <ListItem label="Ada Lovelace" description="Engineer" />
              <ListItem label="Grace Hopper" description="Admiral" />
            </List>
            <List {...args} edge={edge}>
              <ListItem
                label="Inbox"
                onClick={() => {}}
                startContent={<Icon icon={InboxIcon} />}
              />
              <ListItem
                label="Sent"
                isSelected
                onClick={() => {}}
                startContent={<Icon icon={PaperAirplaneIcon} />}
              />
            </List>
          </VStack>
        </Card>
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "padded keeps text inside each row's padding. flush puts text, " +
          "dividers, and backgrounds on the heading's line. outset puts text " +
          "on the heading's line and reaches backgrounds into the card's " +
          "padding by the rows' own padding. bleed reaches rows to the card's " +
          "edges, like Table rows, with text on the card's padding line.",
      },
    },
  },
};

export const Interactive: Story = {
  render: args => (
    <List {...args}>
      <ListItem
        label="Inbox"
        isSelected
        onClick={() => {}}
        startContent={<Icon icon={InboxIcon} />}
        endContent={<Icon icon={ChevronRightIcon} />}
      />
      <ListItem
        label="Sent"
        onClick={() => {}}
        startContent={<Icon icon={PaperAirplaneIcon} />}
        endContent={<Icon icon={ChevronRightIcon} />}
      />
      <ListItem
        label="Drafts"
        onClick={() => {}}
        startContent={<Icon icon={DocumentIcon} />}
        endContent={<Icon icon={ChevronRightIcon} />}
      />
    </List>
  ),
};

export const Links: Story = {
  render: args => (
    <List {...args}>
      <ListItem label="Documentation" href="/docs" />
      <ListItem
        label="GitHub"
        href="https://github.com"
        target="_blank"
        description="View source code"
      />
      <ListItem
        label="Storybook"
        href="/storybook"
        description="Component playground"
      />
    </List>
  ),
};

export const OrderedList: Story = {
  render: args => (
    <List listStyle="decimal" {...args}>
      <ListItem
        label="Install the package"
        description="npm install @astryxdesign/core"
      />
      <ListItem
        label="Import components"
        description="import { List } from '@astryxdesign/core'"
      />
      <ListItem
        label="Start building"
        description="Use components in your app"
      />
    </List>
  ),
};

export const BulletedList: Story = {
  render: args => (
    <List listStyle="disc" {...args}>
      <ListItem label="Accessible by default" />
      <ListItem label="Themeable with StyleX" />
      <ListItem label="Composable and extensible" />
    </List>
  ),
};

export const DisabledItems: Story = {
  render: args => (
    <List {...args}>
      <ListItem label="Available" onClick={() => {}} />
      <ListItem label="Unavailable" onClick={() => {}} isDisabled />
      <ListItem label="Also Available" onClick={() => {}} />
    </List>
  ),
};

export const WithMedia: Story = {
  render: args => (
    <List hasDividers {...args}>
      <ListItem
        label="Alex Johnson"
        description="Hey, are we still on for lunch tomorrow?"
        startContent={<Avatar name="Alex Johnson" size={40} />}
        onClick={() => {}}
        endContent={<Badge label="2" />}
      />
      <ListItem
        label="Sam Rivera"
        description="I pushed the latest changes to the repo"
        startContent={<Avatar name="Sam Rivera" size={40} />}
        onClick={() => {}}
      />
      <ListItem
        label="Jordan Lee"
        description="Can you review the design spec when you get a chance?"
        startContent={<Avatar name="Jordan Lee" size={40} />}
        onClick={() => {}}
        endContent={<Badge label="5" />}
      />
    </List>
  ),
};

function ToggleHeaderDemo() {
  const [showArchived, setShowArchived] = useState(false);
  return (
    <List
      hasDividers
      header={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
          <Text type="label" size="lg">
            Notifications
          </Text>
          <Switch
            label="Show archived"
            value={showArchived}
            onChange={checked => setShowArchived(checked)}
          />
        </div>
      }>
      <ListItem
        label="New deployment succeeded"
        description="Production v2.4.1 deployed"
        startContent={<Icon icon={BellIcon} />}
      />
      <ListItem
        label="Security alert"
        description="Unusual login detected"
        startContent={<Icon icon={ShieldCheckIcon} />}
      />
      {showArchived && (
        <ListItem
          label="Archived: Build completed"
          description="CI pipeline finished"
          startContent={<Icon icon={Cog6ToothIcon} />}
        />
      )}
    </List>
  );
}

export const HeaderWithToggle: Story = {
  render: () => <ToggleHeaderDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'A list with a toggle in the header. The header and list are ' +
          'wrapped so they stack correctly even inside flex parents.',
      },
    },
  },
};

export const HeaderInFlexParent: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        gap: 24,
        border: '1px dashed #888',
        padding: 16,
      }}>
      <div style={{flex: 1}}>
        <Text type="label" size="lg">
          Sidebar
        </Text>
      </div>
      <div style={{flex: 2}}>
        <ToggleHeaderDemo />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates the list with a header inside a flex parent. ' +
          'The header should appear above the list, not beside it.',
      },
    },
  },
};
