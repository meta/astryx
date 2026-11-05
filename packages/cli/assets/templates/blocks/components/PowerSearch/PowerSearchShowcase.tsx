// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {PowerSearch} from '@astryxdesign/core/PowerSearch';
import type {
  PowerSearchConfig,
  PowerSearchFilter,
} from '@astryxdesign/core/PowerSearch';

const config: PowerSearchConfig = {
  name: 'BasicSearch',
  fields: [
    {
      key: 'status',
      label: 'Status',
      defaultOperator: 'is',
      operators: [
        {
          key: 'is',
          label: 'is',
          value: {
            type: 'enum',
            values: [
              {value: 'open', label: 'Open'},
              {value: 'in_progress', label: 'In Progress'},
              {value: 'closed', label: 'Closed'},
            ],
          },
        },
      ],
    },
    {
      key: 'title',
      label: 'Title',
      defaultOperator: 'contains',
      operators: [
        {key: 'contains', label: 'contains', value: {type: 'string'}},
      ],
    },
  ],
};

const initialFilters: PowerSearchFilter[] = [
  {field: 'status', operator: 'is', value: {type: 'enum', value: 'open'}},
  {
    field: 'title',
    operator: 'contains',
    value: {type: 'string', value: 'dashboard'},
  },
];

export default function PowerSearchShowcase() {
  const [filters, setFilters] = useState<PowerSearchFilter[]>(initialFilters);

  return (
    <div style={{display: 'grid', gridTemplateColumns: 'minmax(0, 400px)'}}>
      <PowerSearch
        config={config}
        filters={filters}
        onChange={newFilters => setFilters([...newFilters])}
        placeholder="Search by status, title..."
      />
    </div>
  );
}
