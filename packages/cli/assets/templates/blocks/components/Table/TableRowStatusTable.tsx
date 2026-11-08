// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  Table,
  useTableRowStatus,
  proportional,
  pixel,
} from '@astryxdesign/core/Table';
import type {
  TableColumn,
  UseTableRowStatusConfig,
} from '@astryxdesign/core/Table';

interface Job extends Record<string, unknown> {
  id: string;
  name: string;
  owner: string;
  state: 'failed' | 'running' | 'queued' | 'succeeded' | 'needsAttention';
}

const jobs: Job[] = [
  {id: 'j1', name: 'build-core', owner: 'Ava', state: 'failed'},
  {id: 'j2', name: 'lint', owner: 'Liam', state: 'running'},
  {id: 'j3', name: 'unit-tests', owner: 'Zoe', state: 'succeeded'},
  {id: 'j4', name: 'docsite-deploy', owner: 'Max', state: 'queued'},
  {id: 'j5', name: 'smoke-test', owner: 'Mia', state: 'succeeded'},
  {
    id: 'j6',
    name: 'snapshot-review',
    owner: 'Noah',
    state: 'needsAttention',
  },
];

const columns: TableColumn<Job>[] = [
  {key: 'name', header: 'Job', width: proportional(2)},
  {key: 'owner', header: 'Owner', width: pixel(120)},
  {key: 'state', header: 'State', width: pixel(120)},
];

const jobStatus: UseTableRowStatusConfig<Job>['getStatus'] = job => {
  switch (job.state) {
    case 'failed':
      return {status: 'error', label: 'Failed'};
    case 'running':
      return {color: 'warning', icon: 'clock', label: 'Running'};
    case 'queued':
      return {color: 'gray', label: 'Queued'};
    case 'succeeded':
      return {status: 'success', label: 'Succeeded'};
    case 'needsAttention':
      return {status: 'warning', label: 'Needs attention'};
  }
};

export default function TableRowStatusTable() {
  const rowStatus = useTableRowStatus<Job>({getStatus: jobStatus});

  return (
    <Table
      data={jobs}
      columns={columns}
      idKey="id"
      hasHover
      plugins={{rowStatus}}
    />
  );
}
