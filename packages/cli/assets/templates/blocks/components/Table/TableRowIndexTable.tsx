// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  Table,
  useTableRowIndex,
  proportional,
  pixel,
} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';

interface Track extends Record<string, unknown> {
  id: string;
  title: string;
  artist: string;
  plays: number;
}

const tracks: Track[] = [
  {id: 't1', title: 'Nightfall', artist: 'Ava Chen', plays: 1820},
  {id: 't2', title: 'Ember', artist: 'Liam Park', plays: 942},
  {id: 't3', title: 'Tidal', artist: 'Zoe Vega', plays: 3310},
  {id: 't4', title: 'Cinder', artist: 'Max Ross', plays: 604},
  {id: 't5', title: 'Halcyon', artist: 'Mia Cole', plays: 2075},
];

const columns: TableColumn<Track>[] = [
  {key: 'title', header: 'Title', width: proportional(2)},
  {key: 'artist', header: 'Artist', width: proportional(2)},
  {key: 'plays', header: 'Plays', width: pixel(90), align: 'end'},
];

export default function TableRowIndexTable() {
  // Table gives each row its position, so numbering follows the rendered rows.
  const rowIndex = useTableRowIndex<Track>();

  return (
    <Table
      data={tracks}
      columns={columns}
      idKey="id"
      hasHover
      plugins={{rowIndex}}
    />
  );
}
