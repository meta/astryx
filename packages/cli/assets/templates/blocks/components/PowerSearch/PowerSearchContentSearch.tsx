// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {PowerSearch} from '@astryxdesign/core/PowerSearch';
import type {
  PowerSearchConfig,
  PowerSearchFilter,
} from '@astryxdesign/core/PowerSearch';

const statusValues = [
  {value: 'open', label: 'Open'},
  {value: 'in_progress', label: 'In Progress'},
  {value: 'closed', label: 'Closed'},
];

const priorityValues = [
  {value: 'p0', label: 'P0 — Critical'},
  {value: 'p1', label: 'P1 — High'},
  {value: 'p2', label: 'P2 — Medium'},
  {value: 'p3', label: 'P3 — Low'},
];

const config: PowerSearchConfig = {
  name: 'ContentSearch',
  contentSearchFieldKey: 'title',
  fields: [
    {
      key: 'title',
      label: 'Title',
      defaultOperator: 'contains',
      operators: [
        {key: 'contains', label: 'contains', value: {type: 'string'}},
        {
          key: 'not_contains',
          label: 'does not contain',
          value: {type: 'string'},
        },
      ],
    },
    {
      key: 'status',
      label: 'Status',
      defaultOperator: 'is',
      operators: [
        {key: 'is', label: 'is', value: {type: 'enum', values: statusValues}},
      ],
    },
    {
      key: 'priority',
      label: 'Priority',
      defaultOperator: 'is',
      operators: [
        {
          key: 'is',
          label: 'is',
          value: {type: 'enum', values: priorityValues},
        },
      ],
    },
  ],
};

export default function PowerSearchContentSearch() {
  const [filters, setFilters] = useState<PowerSearchFilter[]>([]);

  return (
    <div style={{display: 'grid', gridTemplateColumns: 'minmax(0, 300px)'}}>
      <PowerSearch
        config={config}
        filters={filters}
        onChange={newFilters => setFilters([...newFilters])}
        placeholder="Type to search by title, or pick a field..."
      />
    </div>
  );
}
