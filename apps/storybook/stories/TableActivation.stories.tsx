// Copyright (c) Meta Platforms, Inc. and affiliates.

import React, {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {
  Table,
  useTableActivation,
  pixel,
  proportional,
} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';

// =============================================================================
// Sample Data: services with an adjacent detail view
// =============================================================================

interface Service extends Record<string, unknown> {
  id: string;
  name: string;
  owner: string;
  status: 'Healthy' | 'Degraded' | 'Down';
  updated: string;
  isArchived: boolean;
}

const services: Service[] = [
  {
    id: 'svc-api',
    name: 'API gateway',
    owner: 'Core',
    status: 'Healthy',
    updated: '2m ago',
    isArchived: false,
  },
  {
    id: 'svc-search',
    name: 'Search index',
    owner: 'Infra',
    status: 'Degraded',
    updated: '14m ago',
    isArchived: false,
  },
  {
    id: 'svc-billing',
    name: 'Billing worker',
    owner: 'Core',
    status: 'Healthy',
    updated: '1h ago',
    isArchived: false,
  },
  {
    id: 'svc-legacy',
    name: 'Legacy importer',
    owner: 'Infra',
    status: 'Down',
    updated: '3d ago',
    isArchived: true,
  },
];

const columns: TableColumn<Service>[] = [
  {key: 'name', header: 'Service', width: proportional(2)},
  {key: 'owner', header: 'Owner', width: pixel(110)},
  {
    key: 'status',
    header: 'Status',
    width: pixel(130),
    renderCell: item => (
      <Badge
        label={item.status}
        variant={
          item.status === 'Healthy'
            ? 'success'
            : item.status === 'Degraded'
              ? 'warning'
              : 'error'
        }
      />
    ),
  },
  {key: 'updated', header: 'Updated', width: pixel(100)},
  {
    key: 'actions',
    header: '',
    width: pixel(110),
    renderCell: () => (
      <Button
        label="Open"
        variant="ghost"
        size="sm"
        onClick={() => {
          // Nested controls stay independently operable: pressing Open
          // never activates the row as a side effect.
        }}
      />
    ),
  },
];

function ServiceDetail({service}: {service: Service | null}) {
  if (service == null) {
    return (
      <VStack gap={2}>
        <Heading level={4}>Detail</Heading>
        <Text type="body" color="secondary">
          Select a row to inspect it here. Archived rows are inert and cannot
          become active.
        </Text>
      </VStack>
    );
  }
  return (
    <VStack gap={2}>
      <Heading level={4}>{service.name}</Heading>
      <Text type="body" color="secondary">
        Owner: {service.owner} — status {service.status.toLowerCase()}, updated{' '}
        {service.updated}.
      </Text>
    </VStack>
  );
}

function MasterDetailDemo() {
  const [activeKey, setActiveKey] = useState<string | null>('svc-search');
  const activation = useTableActivation<Service>({
    activeKey,
    onActivate: (_item, key) => setActiveKey(key as string),
    getIsItemActivatable: item => !item.isArchived,
  });
  const active = services.find(service => service.id === activeKey) ?? null;
  const content = (
    <HStack gap={4} align="start">
      <div style={{flex: 3, minWidth: 0}}>
        <Table
          data={services}
          columns={columns}
          idKey="id"
          isStriped
          hasHover
          plugins={{activation}}
        />
      </div>
      <div style={{flex: 2, minWidth: 0}}>
        <ServiceDetail service={active} />
      </div>
    </HStack>
  );
  return content;
}

/** Sixty unvirtualized rows: every tenth archived, the rest activatable. */
const manyServices: Service[] = Array.from({length: 60}, (_, index) => ({
  id: `svc-${String(index).padStart(2, '0')}`,
  name: `Service ${String(index).padStart(2, '0')}`,
  owner: index % 2 === 0 ? 'Core' : 'Infra',
  status: index % 3 === 0 ? 'Degraded' : 'Healthy',
  updated: `${index + 1}m ago`,
  isArchived: index % 10 === 9,
}));

function LargeTableDemo() {
  const [activeKey, setActiveKey] = useState<string | null>('svc-05');
  const activation = useTableActivation<Service>({
    activeKey,
    onActivate: (_item, key) => setActiveKey(key as string),
    getIsItemActivatable: item => !item.isArchived,
  });
  return (
    <Table
      data={manyServices}
      columns={columns}
      idKey="id"
      isStriped
      hasHover
      plugins={{activation}}
    />
  );
}

const meta: Meta = {
  title: 'Core/TableActivation',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

/**
 * One controlled current row drives the adjacent detail view. Click a row (or
 * focus it and press Enter/Space) to move the detail; the archived row is
 * ineligible and stays inert. The Open buttons remain independently
 * operable without activating their row.
 */
export const MasterDetail: Story = {
  render: () => <MasterDetailDemo />,
};

/** The same master-detail layout with the canvas pinned to the dark theme. */
export const MasterDetailDark: Story = {
  globals: {colorMode: 'dark'},
  render: () => <MasterDetailDemo />,
};

/**
 * Sixty unvirtualized rows for focus-order evidence at scale: Tab walks
 * every eligible row in order while archived rows never take focus.
 */
export const LargeTable: Story = {
  render: () => <LargeTableDemo />,
};
