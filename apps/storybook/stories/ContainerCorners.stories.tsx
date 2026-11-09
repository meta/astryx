// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContainerCorners.stories.tsx
 * @input Card, Dialog, BottomSheet, Section, Table, and List
 * @output Stories where a full-bleed child meets, or stops short of, a
 *   rounded container corner
 * @position Storybook evidence for container corner geometry. The
 *   ContainerCorners Chromium spec reads these stories.
 */

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {BottomSheet} from '@astryxdesign/core/BottomSheet';
import {Card} from '@astryxdesign/core/Card';
import {Dialog} from '@astryxdesign/core/Dialog';
import {List, ListItem} from '@astryxdesign/core/List';
import {Section} from '@astryxdesign/core/Section';
import {Table} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';

const meta: Meta = {
  title: 'Core/ContainerCorners',
  parameters: {layout: 'padded'},
};

export default meta;
type Story = StoryObj;

interface Order extends Record<string, unknown> {
  id: string;
  customer: string;
  item: string;
  quantity: string;
  warehouse: string;
  carrier: string;
  status: string;
  email: string;
  tracking: string;
}

const orders: Order[] = [
  {
    id: '1',
    customer: 'Alice Johnson',
    item: 'Standing desk',
    quantity: '1',
    warehouse: 'Oakland',
    carrier: 'Ground',
    status: 'Shipped',
    email: 'alice.johnson@example.com',
    tracking: '1Z999AA10123456784',
  },
  {
    id: '2',
    customer: 'Bob Martinez',
    item: 'Monitor arm',
    quantity: '2',
    warehouse: 'Reno',
    carrier: 'Express',
    status: 'Packing',
    email: 'bob.martinez@example.com',
    tracking: '1Z999AA10123456785',
  },
  {
    id: '3',
    customer: 'Chen Wei',
    item: 'Desk lamp',
    quantity: '4',
    warehouse: 'Oakland',
    carrier: 'Ground',
    status: 'Delivered',
    email: 'chen.wei@example.com',
    tracking: '1Z999AA10123456786',
  },
];

// Enough columns that the table scrolls inline in a narrow card, so its
// scroll region is a tab stop with a focus ring.
const orderColumns: TableColumn<Order>[] = [
  {key: 'customer', header: 'Customer'},
  {key: 'item', header: 'Item'},
  {key: 'quantity', header: 'Quantity'},
  {key: 'warehouse', header: 'Warehouse'},
  {key: 'carrier', header: 'Carrier'},
  {key: 'status', header: 'Status'},
  {key: 'email', header: 'Email'},
  {key: 'tracking', header: 'Tracking number'},
];

function OrdersTable() {
  return (
    <Table
      data={orders}
      columns={orderColumns}
      idKey="id"
      dividers="rows"
      density="compact"
      textOverflow="truncate"
      aria-label="Orders"
    />
  );
}

const rows = ['Inbox', 'Drafts', 'Sent', 'Archive'];

function BleedList() {
  return (
    <List edge="bleed" hasDividers>
      {rows.map(label => (
        <ListItem key={label} label={label} onClick={() => {}} />
      ))}
    </List>
  );
}

/** A table fills a Card and reaches all four of its corners. */
export const TableInCard: Story = {
  render: () => (
    <div style={{width: 360}}>
      <Card>
        <OrdersTable />
      </Card>
    </div>
  ),
};

/**
 * Text sits above the table, so the card's top padding stays between the
 * table and the top corners: only the bottom corners are reached.
 */
export const TableAfterTextInCard: Story = {
  render: () => (
    <div style={{width: 360}}>
      <Card>
        <Text>Open orders</Text>
        <OrdersTable />
      </Card>
    </div>
  ),
};

/** A Section is a square container: a table inside it reaches no corner. */
export const TableInSectionInCard: Story = {
  render: () => (
    <div style={{width: 360}}>
      <Card>
        <Section>
          <OrdersTable />
        </Section>
      </Card>
    </div>
  ),
};

/**
 * A Dialog with no padding: the bleeding list's first and last rows touch
 * the dialog's corners.
 */
export const BleedListInDialog: Story = {
  render: () => (
    <Dialog isOpen isInline onOpenChange={() => {}} width={360} padding={0}>
      <BleedList />
    </Dialog>
  ),
};

/**
 * A Dialog with no padding, with the table between two lines of text: the
 * table reaches no corner, so it stays square.
 */
export const TableBetweenTextInDialog: Story = {
  render: () => (
    <Dialog isOpen isInline onOpenChange={() => {}} width={360} padding={0}>
      <Text>Open orders</Text>
      <OrdersTable />
      <Text>Three open orders.</Text>
    </Dialog>
  ),
};

/**
 * A Dialog with no padding, with the bleeding list inside a wrapper element
 * below a heading: the list is not the dialog's own child, so its rows stay
 * square.
 */
export const WrappedBleedListInDialog: Story = {
  render: () => (
    <Dialog isOpen isInline onOpenChange={() => {}} width={360} padding={0}>
      <Text>Folders</Text>
      <div>
        <BleedList />
      </div>
    </Dialog>
  ),
};

/**
 * The card's block padding is larger than its corner radius, so the
 * bleeding list's rows stay square.
 */
export const BleedListInCard: Story = {
  render: () => (
    <div style={{width: 360}}>
      <Card>
        <BleedList />
      </Card>
    </div>
  ),
};

/**
 * A table at the top of a bottom sheet starts below the grab bar's band, so it
 * reaches no corner and stays square.
 */
export const TableInBottomSheet: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(true);
    return (
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        label="Orders"
        height="hug">
        <OrdersTable />
        <Text>Three open orders.</Text>
      </BottomSheet>
    );
  },
};
