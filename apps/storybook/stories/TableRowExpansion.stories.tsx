// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {
  Table,
  useTableRowExpansion,
  pixel,
  proportional,
} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';
import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral';
import {VStack, HStack} from '@astryxdesign/core/Stack';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Badge} from '@astryxdesign/core/Badge';

// =============================================================================
// Sample Data: orders with expandable detail panels
// =============================================================================

interface Order extends Record<string, unknown> {
  id: string;
  customer: string;
  status: string;
  total: string;
  placed: string;
  items: {name: string; qty: number; price: string}[];
}

const orders: Order[] = [
  {
    id: 'ord-1001',
    customer: 'Ada Lovelace',
    status: 'Shipped',
    total: '$248.00',
    placed: '2026-06-20',
    items: [
      {name: 'Mechanical keyboard', qty: 1, price: '$180.00'},
      {name: 'Wrist rest', qty: 2, price: '$34.00'},
    ],
  },
  {
    id: 'ord-1002',
    customer: 'Alan Turing',
    status: 'Processing',
    total: '$52.00',
    placed: '2026-06-21',
    items: [{name: 'USB-C cable', qty: 4, price: '$13.00'}],
  },
  {
    id: 'ord-1003',
    customer: 'Grace Hopper',
    status: 'Delivered',
    total: '$1,200.00',
    placed: '2026-06-18',
    items: [{name: 'Standing desk', qty: 1, price: '$1,200.00'}],
  },
];

const columns: TableColumn<Order>[] = [
  {key: 'customer', header: 'Customer', width: proportional(2)},
  {key: 'status', header: 'Status', width: pixel(130)},
  {key: 'total', header: 'Total', width: pixel(110)},
  {key: 'placed', header: 'Placed', width: pixel(120)},
];

function OrderItems({order}: {order: Order}) {
  return (
    <VStack gap={2}>
      <Heading level={4}>Line items</Heading>
      {order.items.map(line => (
        <HStack key={line.name} gap={3}>
          <Badge label={`x${line.qty}`} variant="info" />
          <Text type="body">{line.name}</Text>
          <Text type="body" color="secondary">
            {line.price}
          </Text>
        </HStack>
      ))}
    </VStack>
  );
}

function toggleKey(keys: Set<string>, key: string): Set<string> {
  const next = new Set(keys);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
}

// =============================================================================
// Stories
// =============================================================================

const meta: Meta = {
  title: 'Core/TableRowExpansion',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

/**
 * Each row expands a full-width detail panel below it, rendered by
 * `renderExpanded(item)`. Click the chevron (or right-click, then
 * "Expand/Collapse row") to toggle the panel. The consumer owns the
 * `expandedKeys` set.
 *
 * For hierarchical data (child rows that reuse the parent columns), use
 * `useTableTreeData` + `useTableTreeState` instead.
 */
export const DetailPanel: Story = {
  render: () => {
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
      new Set(['ord-1001']),
    );

    const expansion = useTableRowExpansion<Order>({
      expandedKeys,
      onToggle: key => setExpandedKeys(prev => toggleKey(prev, key)),
      getRowKey: item => item.id,
      renderExpanded: item => <OrderItems order={item} />,
    });

    return (
      <Table
        data={orders}
        columns={columns}
        idKey="id"
        hasHover
        plugins={{expansion}}
      />
    );
  },
};

/**
 * An open panel's divider is the one its row hands down, in the theme's
 * colour, and follows a switch between light and dark: the table sits in a
 * `system`-mode Theme, which follows the operating system. With `override`,
 * an app draws the row's cells dashed in a token colour, which the panel
 * carries and follows across the switch too.
 */
export const PanelDividerFollowsScheme: StoryObj<{override?: boolean}> = {
  args: {override: false},
  render: ({override}) => {
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
      () => new Set(['ord-1001']),
    );
    const expansion = useTableRowExpansion<Order>({
      expandedKeys,
      onToggle: key => setExpandedKeys(prev => toggleKey(prev, key)),
      getRowKey: item => item.id,
      renderExpanded: item => <OrderItems order={item} />,
    });
    return (
      <Theme theme={neutralTheme} mode="system">
        <div
          data-testid="panel-divider-scheme"
          style={{backgroundColor: 'var(--color-background-surface)'}}>
          {override && (
            <style>{`[data-testid="panel-divider-scheme"] tbody tr:not([data-expansion-panel]) > td { border-bottom-color: var(--color-text-secondary); border-bottom-style: dashed; }`}</style>
          )}
          <Table
            data={orders}
            columns={columns}
            idKey="id"
            plugins={{expansion}}
          />
        </div>
      </Theme>
    );
  },
};

/**
 * `getIsItemExpandable` restricts which rows can expand. Here only orders with
 * more than one line item are expandable; the rest show no chevron and no
 * context-menu action.
 */
export const NotAllRowsExpandable: Story = {
  render: () => {
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

    const expansion = useTableRowExpansion<Order>({
      expandedKeys,
      onToggle: key => setExpandedKeys(prev => toggleKey(prev, key)),
      getRowKey: item => item.id,
      getIsItemExpandable: item => item.items.length > 1,
      renderExpanded: item => <OrderItems order={item} />,
    });

    return (
      <Table
        data={orders}
        columns={columns}
        idKey="id"
        hasHover
        plugins={{expansion}}
      />
    );
  },
};
