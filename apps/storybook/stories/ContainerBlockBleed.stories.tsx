// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContainerBlockBleed.stories.tsx
 * @input Card, Section, Dialog, VStack, Heading, Table, and Text
 * @output Stories where a Table is a padding host's direct child, or sits
 *   inside a Stack in that host
 * @position Storybook evidence for block-edge bleed. The ContainerBlockBleed
 *   Chromium spec reads these stories.
 */

import type {Meta, StoryObj} from '@storybook/react';
import {Card} from '@astryxdesign/core/Card';
import {Dialog} from '@astryxdesign/core/Dialog';
import {Heading} from '@astryxdesign/core/Heading';
import {Section} from '@astryxdesign/core/Section';
import {VStack} from '@astryxdesign/core/Stack';
import {Table} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';

const meta: Meta = {
  title: 'Core/ContainerBlockBleed',
  parameters: {layout: 'padded'},
};

export default meta;
type Story = StoryObj;

interface Invoice extends Record<string, unknown> {
  id: string;
  customer: string;
  amount: string;
  status: string;
}

const invoices: Invoice[] = [
  {id: '1', customer: 'Alice Johnson', amount: '$1,200', status: 'Paid'},
  {id: '2', customer: 'Bob Martinez', amount: '$860', status: 'Due'},
  {id: '3', customer: 'Chen Wei', amount: '$2,410', status: 'Overdue'},
];

const invoiceColumns: TableColumn<Invoice>[] = [
  {key: 'customer', header: 'Customer'},
  {key: 'amount', header: 'Amount'},
  {key: 'status', header: 'Status'},
];

function InvoicesTable() {
  return (
    <Table
      data={invoices}
      columns={invoiceColumns}
      idKey="id"
      dividers="rows"
      aria-label="Invoices"
    />
  );
}

/** The table is the card's only child, so it bleeds to both block edges. */
export const TableInCard: Story = {
  render: () => (
    <div style={{width: 420}}>
      <Card>
        <InvoicesTable />
      </Card>
    </div>
  ),
};

/** The table is the section's only child, so it bleeds to both block edges. */
export const TableInSection: Story = {
  render: () => (
    <div style={{width: 420}}>
      <Section variant="muted">
        <InvoicesTable />
      </Section>
    </div>
  ),
};

/** The table is the dialog's only child, so it bleeds to both block edges. */
export const TableInDialog: Story = {
  render: () => (
    <Dialog isOpen isInline onOpenChange={() => {}} width={420}>
      <InvoicesTable />
    </Dialog>
  ),
};

/**
 * The table is the last child of a Stack inside a Section, and text follows
 * that Stack. The table keeps the section's padding, so the text sits below
 * its last row.
 */
export const TableInStackInSection: Story = {
  render: () => (
    <div style={{width: 420}}>
      <Section variant="muted">
        <VStack gap={4}>
          <VStack gap={2}>
            <Heading level={3}>Invoices</Heading>
            <InvoicesTable />
          </VStack>
          <Text>Three invoices this month.</Text>
        </VStack>
      </Section>
    </div>
  ),
};

/** The table is the only child of a Stack in a Card: it keeps the padding. */
export const TableInStackInCard: Story = {
  render: () => (
    <div style={{width: 420}}>
      <Card>
        <VStack>
          <InvoicesTable />
        </VStack>
      </Card>
    </div>
  ),
};
