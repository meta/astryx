// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Toolbar} from '@astryxdesign/core/Toolbar';
import {TabList, Tab} from '@astryxdesign/core/TabList';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Section} from '@astryxdesign/core/Section';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Badge} from '@astryxdesign/core/Badge';
import {Table} from '@astryxdesign/core/Table';
import {Layout} from '@astryxdesign/core/Layout';
import {LayoutHeader} from '@astryxdesign/core/Layout';
import {LayoutContent} from '@astryxdesign/core/Layout';
import {MoreMenu} from '@astryxdesign/core/MoreMenu';
import {Heading} from '@astryxdesign/core/Text';
import {
  Cog6ToothIcon,
  FunnelIcon,
  PlusIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowLeftIcon,
  TrashIcon,
  ArchiveBoxIcon,
} from '@heroicons/react/24/outline';

const meta: Meta<typeof Toolbar> = {
  title: 'Core/Toolbar',
  component: Toolbar,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    label: {control: 'text'},
    size: {control: 'radio', options: ['sm', 'md', 'lg']},
    orientation: {control: 'radio', options: ['horizontal', 'vertical']},
    variant: {control: 'select', options: ['transparent', 'section', 'muted']},
    gap: {control: 'number'},
  },
};

export default meta;
type Story = StoryObj<typeof Toolbar>;

// ---------------------------------------------------------------------------
// Basic slot patterns
// ---------------------------------------------------------------------------

/** Two-slot layout: start + end content with space-between. */
export const Default: Story = {
  args: {
    label: 'Actions',
    startContent: (
      <>
        <Button label="Cut" variant="ghost" />
        <Button label="Copy" variant="ghost" />
        <Button label="Paste" variant="ghost" />
      </>
    ),
    endContent: (
      <Button
        label="Settings"
        variant="ghost"
        icon={<Cog6ToothIcon style={{width: 16, height: 16}} />}
        isIconOnly
      />
    ),
  },
};

/** Three-slot layout: CSS grid 1fr auto 1fr. Center content stays centered regardless of start/end width. */
export const ThreeSlot: Story = {
  render: () => (
    <Toolbar
      label="Document toolbar"
      startContent={
        <Button
          label="Back"
          variant="ghost"
          icon={<ArrowLeftIcon style={{width: 16, height: 16}} />}
          isIconOnly
        />
      }
      centerContent={<Heading level={4}>Q1 Planning Document</Heading>}
      endContent={
        <>
          <Button label="Discard" variant="secondary" />
          <Button label="Save" />
        </>
      }
    />
  ),
};

export const StartOnly: Story = {
  args: {
    label: 'Bulk actions',
    size: 'sm',
    startContent: (
      <>
        <Badge label="3 selected" />
        <Button label="Delete" variant="ghost" />
        <Button label="Archive" variant="ghost" />
      </>
    ),
  },
};

export const EndOnly: Story = {
  args: {
    label: 'Page actions',
    endContent: (
      <>
        <Button label="Cancel" variant="ghost" />
        <Button label="Save" />
      </>
    ),
  },
};

export const Compact: Story = {
  args: {
    label: 'Compact toolbar',
    size: 'sm',
    startContent: (
      <>
        <Button label="Cut" variant="ghost" />
        <Button label="Copy" variant="ghost" />
        <Button label="Paste" variant="ghost" />
      </>
    ),
    endContent: (
      <Button
        label="Settings"
        variant="ghost"
        icon={<Cog6ToothIcon style={{width: 14, height: 14}} />}
        isIconOnly
      />
    ),
  },
};

export const WashVariant: Story = {
  args: {
    label: 'Highlighted toolbar',
    variant: 'muted',
    startContent: <Text type="body">3 items selected</Text>,
    endContent: (
      <>
        <Button label="Delete" variant="ghost" />
        <Button label="Move" variant="ghost" />
      </>
    ),
  },
};

// ---------------------------------------------------------------------------
// Composition patterns — real-world layouts
// ---------------------------------------------------------------------------

/** Toolbar as a Card header. Compact density for card context. */
export const InsideCard: Story = {
  name: 'Composition: Card Header',
  render: () => (
    <Card width={600}>
      <Toolbar
        label="User list actions"
        size="sm"
        dividers={['bottom']}
        startContent={<Heading level={4}>Users</Heading>}
        endContent={
          <>
            <Button
              label="Filter"
              variant="ghost"
              icon={<FunnelIcon style={{width: 16, height: 16}} />}
              isIconOnly
            />
            <Button
              label="Add user"
              icon={<PlusIcon style={{width: 16, height: 16}} />}
              isIconOnly
            />
          </>
        }
      />
      <Section>
        <Text type="body">Table rows go here...</Text>
      </Section>
    </Card>
  ),
};

/** Toolbar above a data table with search + filter buttons + view controls. */
export const TableToolbar: Story = {
  name: 'Composition: Table Toolbar',
  render: () => (
    <div style={{width: 700}}>
      <Toolbar
        label="Table filters"
        size="sm"
        startContent={
          <>
            <TextInput
              label="Search"
              isLabelHidden
              placeholder="Search..."
              value=""
              onChange={() => {}}
            />
            <Button label="Status" variant="secondary" />
            <Button label="Priority" variant="secondary" />
            <Button label="Assignee" variant="secondary" />
          </>
        }
        endContent={
          <MoreMenu
            items={[
              {label: 'Compact view'},
              {label: 'Comfortable view'},
              {label: 'Export CSV'},
            ]}
          />
        }
      />
      <Table
        columns={[
          {key: 'name', header: 'Name'},
          {key: 'status', header: 'Status'},
          {key: 'priority', header: 'Priority'},
        ]}
        data={[
          {name: 'Fix login bug', status: 'Open', priority: 'High'},
          {name: 'Update docs', status: 'In Progress', priority: 'Medium'},
          {name: 'Add tests', status: 'Open', priority: 'Low'},
        ]}
      />
    </div>
  ),
};

/** Page-level toolbar with back nav, centered title, and actions. */
export const PageHeader: Story = {
  name: 'Composition: Page Header',
  render: () => (
    <Card>
      <Toolbar
        label="Page navigation"
        dividers={['bottom']}
        startContent={
          <Button
            label="Back to projects"
            variant="ghost"
            icon={<ArrowLeftIcon style={{width: 16, height: 16}} />}
            isIconOnly
          />
        }
        centerContent={<Heading level={3}>Project Settings</Heading>}
        endContent={
          <>
            <Button label="Reset" variant="ghost" />
            <Button label="Save changes" />
          </>
        }
      />
      <Section>
        <Text type="body">Settings form content...</Text>
      </Section>
    </Card>
  ),
};

/** Bulk selection toolbar with badge count + action buttons. */
export const BulkActions: Story = {
  name: 'Composition: Bulk Selection',
  render: () => (
    <Toolbar
      label="Bulk actions"
      size="sm"
      variant="muted"
      startContent={
        <>
          <Badge label="5 selected" />
          <Button
            label="Delete"
            variant="ghost"
            icon={<TrashIcon style={{width: 16, height: 16}} />}
            isIconOnly
          />
          <Button
            label="Archive"
            variant="ghost"
            icon={<ArchiveBoxIcon style={{width: 16, height: 16}} />}
            isIconOnly
          />
        </>
      }
      endContent={<Button label="Deselect all" variant="ghost" />}
    />
  ),
};

/** Stacked toolbars: primary actions above, secondary filters below. */
export const StackedToolbars: Story = {
  name: 'Composition: Stacked Toolbars',
  render: () => (
    <Card width={700}>
      <Toolbar
        label="Primary actions"
        size="sm"
        dividers={['bottom']}
        startContent={<Heading level={4}>Orders</Heading>}
        endContent={
          <>
            <Button
              label="Refresh"
              variant="ghost"
              icon={<ArrowPathIcon style={{width: 16, height: 16}} />}
              isIconOnly
            />
            <Button
              label="Export"
              variant="ghost"
              icon={<ArrowDownTrayIcon style={{width: 16, height: 16}} />}
              isIconOnly
            />
            <Button label="New order" />
          </>
        }
      />
      <Toolbar
        label="Filters"
        size="sm"
        variant="muted"
        startContent={
          <>
            <TextInput
              label="Search orders"
              isLabelHidden
              placeholder="Search orders..."
              value=""
              onChange={() => {}}
            />
            <Button label="Status" variant="secondary" />
            <Button label="Date range" variant="secondary" />
            <Button label="Customer" variant="secondary" />
          </>
        }
        endContent={<Button label="Clear filters" variant="ghost" />}
      />
      <Section>
        <Text type="body">Order table rows...</Text>
      </Section>
    </Card>
  ),
};

/** Inside a Layout header — toolbar inherits the layout's padding context. */
export const InsideLayout: Story = {
  name: 'Composition: Inside Layout',
  render: () => (
    <div style={{height: 300, border: '1px solid #e0e0e0', borderRadius: 8}}>
      <Layout
        header={
          <LayoutHeader hasDivider padding={0}>
            <Toolbar
              label="App toolbar"
              startContent={
                <>
                  <Heading level={4}>Dashboard</Heading>
                  <Badge label="Beta" variant="info" />
                </>
              }
              endContent={
                <>
                  <Button label="Notifications" variant="ghost" />
                  <MoreMenu
                    items={[
                      {label: 'Profile'},
                      {label: 'Settings'},
                      {label: 'Sign out'},
                    ]}
                  />
                </>
              }
            />
          </LayoutHeader>
        }
        content={
          <LayoutContent>
            <Text type="body">Dashboard content...</Text>
          </LayoutContent>
        }
      />
    </div>
  ),
};

/** Toolbar with tab navigation. Size cascades from toolbar to tabs and buttons. */
export const WithTabNavigation: Story = {
  name: 'Composition: Tab Navigation',
  render: () => {
    const [tab, setTab] = useState('overview');
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 24}}>
        {(['sm', 'md', 'lg'] as const).map(size => (
          <Card key={size}>
            <Toolbar
              label={`Tab navigation (${size})`}
              size={size}
              dividers={['bottom']}
              startContent={
                <TabList
                  value={tab}
                  onChange={setTab}
                  aria-label={`Tab navigation (${size})`}>
                  <Tab value="overview" label="Overview" />
                  <Tab value="analytics" label="Analytics" />
                  <Tab value="settings" label="Settings" />
                </TabList>
              }
              endContent={
                <>
                  <Button
                    label="Export"
                    variant="ghost"
                    icon={<ArrowDownTrayIcon style={{width: 16, height: 16}} />}
                    isIconOnly
                  />
                  <Button label="New item" />
                </>
              }
            />
            <Section>
              <Text type="body">Content for {size} size variant</Text>
            </Section>
          </Card>
        ))}
      </div>
    );
  },
};

/**
 * Tabs in the center slot of a divided toolbar. The selected-tab indicator
 * sits on the divider rail, just outside the slot's box, so the slot must not
 * clip its content (the same goes for box-shadows and focus rings).
 */
export const WithCenterTabNavigation: Story = {
  name: 'Composition: Center Tab Navigation',
  render: () => {
    const [tab, setTab] = useState('overview');
    return (
      <Card>
        <Toolbar
          label="Center tab navigation"
          dividers={['bottom']}
          startContent={
            <Button
              label="Back"
              variant="ghost"
              icon={<ArrowLeftIcon style={{width: 16, height: 16}} />}
              isIconOnly
            />
          }
          centerContent={
            <TabList
              value={tab}
              onChange={setTab}
              aria-label="Center tab navigation">
              <Tab value="overview" label="Overview" />
              <Tab value="analytics" label="Analytics" />
              <Tab value="settings" label="Settings" />
            </TabList>
          }
          endContent={<Button label="New item" />}
        />
        <Section>
          <Text type="body">Content for the center tab navigation</Text>
        </Section>
      </Card>
    );
  },
};
