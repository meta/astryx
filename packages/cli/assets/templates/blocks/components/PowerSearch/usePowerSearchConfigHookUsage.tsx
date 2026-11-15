// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {VStack} from '@astryxdesign/core/Layout';
import {
  PowerSearch,
  usePowerSearchConfig,
} from '@astryxdesign/core/PowerSearch';
import type {PowerSearchFilter} from '@astryxdesign/core/PowerSearch';
import {Table} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';

const statusValues = [
  {value: 'active', label: 'Active'},
  {value: 'on-leave', label: 'On Leave'},
  {value: 'contractor', label: 'Contractor'},
];

const fieldDefs = [
  {key: 'name', type: 'string', label: 'Name'},
  {key: 'status', type: 'enum', label: 'Status', enumValues: statusValues},
  {key: 'startDate', type: 'date', label: 'Start date'},
] as const;

interface Person extends Record<string, unknown> {
  id: string;
  name: string;
  status: string;
  startDate: number;
}

const people: Person[] = [
  {id: '1', name: 'Alice Chen', status: 'active', startDate: 1672531200},
  {id: '2', name: 'Bob Dylan', status: 'on-leave', startDate: 1680307200},
  {id: '3', name: 'Charlie Kim', status: 'active', startDate: 1688169600},
  {id: '4', name: 'Dana Scully', status: 'contractor', startDate: 1696118400},
  {id: '5', name: 'Evan Wright', status: 'active', startDate: 1704067200},
];

const columns: TableColumn<Person>[] = [
  {key: 'name', header: 'Name'},
  {
    key: 'status',
    header: 'Status',
    renderCell: (person: Person) =>
      statusValues.find(s => s.value === person.status)?.label ?? person.status,
  },
  {
    key: 'startDate',
    header: 'Start Date',
    renderCell: (person: Person) =>
      new Date(person.startDate * 1000).toLocaleDateString('en-US', {
        timeZone: 'UTC',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
  },
];

export default function UsePowerSearchConfigHookUsage() {
  const [filters, setFilters] = useState<PowerSearchFilter[]>([]);
  const {config, applyFilters} = usePowerSearchConfig(
    fieldDefs,
    'PeopleDirectory',
  );
  const filteredPeople = applyFilters(filters, people);

  return (
    <VStack gap={4}>
      <PowerSearch
        config={config}
        filters={filters}
        onChange={newFilters => setFilters([...newFilters])}
        placeholder="Filter directory by name, status, start date..."
        resultCount={filteredPeople.length}
      />
      <Table data={filteredPeople} columns={columns} idKey="id" hasHover />
    </VStack>
  );
}
