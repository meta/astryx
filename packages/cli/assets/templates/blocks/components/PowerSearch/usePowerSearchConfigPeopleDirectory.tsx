// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {
  PowerSearch,
  usePowerSearchConfig,
} from '@astryxdesign/core/PowerSearch';
import type {PowerSearchFilter} from '@astryxdesign/core/PowerSearch';
import {Table, proportional} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';
import {VStack} from '@astryxdesign/core/Layout';

const statusValues = [
  {value: 'active', label: 'Active'},
  {value: 'away', label: 'Away'},
  {value: 'offline', label: 'Offline'},
];

const fieldDefinitions = [
  {key: 'name', type: 'string', label: 'Name'},
  {
    key: 'status',
    type: 'enum',
    label: 'Status',
    enumValues: statusValues,
  },
  {key: 'startDate', type: 'date', label: 'Start date'},
] as const;

interface Person extends Record<string, unknown> {
  id: string;
  name: string;
  status: string;
  startDate: Date;
}

const people: Person[] = [
  {
    id: '1',
    name: 'Aisha Johnson',
    status: 'active',
    startDate: new Date('2021-03-15'),
  },
  {
    id: '2',
    name: 'Daniel Kim',
    status: 'away',
    startDate: new Date('2022-07-01'),
  },
  {
    id: '3',
    name: 'Elena Garcia',
    status: 'active',
    startDate: new Date('2020-11-09'),
  },
  {
    id: '4',
    name: 'Marcus Lee',
    status: 'offline',
    startDate: new Date('2023-01-23'),
  },
  {
    id: '5',
    name: 'Noah Williams',
    status: 'active',
    startDate: new Date('2019-05-06'),
  },
  {
    id: '6',
    name: 'Priya Patel',
    status: 'away',
    startDate: new Date('2024-02-12'),
  },
];

const columns: TableColumn<Person>[] = [
  {key: 'name', header: 'Name', width: proportional(2)},
  {
    key: 'status',
    header: 'Status',
    width: proportional(1),
    renderCell: person =>
      statusValues.find(status => status.value === person.status)?.label ??
      person.status,
  },
  {
    key: 'startDate',
    header: 'Start date',
    width: proportional(1),
    renderCell: person => person.startDate.toISOString().slice(0, 10),
  },
];

export default function UsePowerSearchConfigPeopleDirectory() {
  const [filters, setFilters] = useState<PowerSearchFilter[]>([]);
  const {config, applyFilters} = usePowerSearchConfig(
    fieldDefinitions,
    'People directory',
  );
  const filteredPeople = applyFilters(filters, people);

  return (
    <VStack gap={4} width="100%">
      <PowerSearch
        config={config}
        filters={filters}
        onChange={nextFilters => setFilters([...nextFilters])}
        placeholder="Filter people by name, status, or start date..."
        resultCount={filteredPeople.length}
      />
      <Table data={filteredPeople} columns={columns} idKey="id" hasHover />
    </VStack>
  );
}
