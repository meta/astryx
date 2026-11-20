// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  Table,
  pixel,
  useTableColumnsVirtualization,
  useTableStickyColumns,
  type TableColumn,
} from '@astryxdesign/core/Table';

interface Reading extends Record<string, unknown> {
  id: string;
  sensor: string;
}

const MONTHS = 120;
const readings: Reading[] = Array.from({length: 40}, (_, row) => {
  const reading: Reading = {id: `sensor-${row}`, sensor: `Sensor ${row + 1}`};
  for (let month = 0; month < MONTHS; month++) {
    reading[`m${month}`] = ((row * 7 + month * 3) % 90) + 10;
  }
  return reading;
});
const columns: TableColumn<Reading>[] = [
  {key: 'sensor', header: 'Sensor', width: pixel(160)},
  ...Array.from({length: MONTHS}, (_, month): TableColumn<Reading> => ({
    key: `m${month}`,
    header: `Month ${month + 1}`,
    width: pixel(110),
    align: 'end',
  })),
];

export default function ColumnsVirtualizationHookUsage() {
  const virtualization = useTableColumnsVirtualization({
    initialViewportWidth: 960,
  });
  // The pinned Sensor column always renders. Only the unpinned columns near
  // the horizontal scroll position mount. initialViewportWidth sizes only the
  // first window, before the Table measures its scroll area.
  const sticky = useTableStickyColumns<Reading>({startKeys: ['sensor']});
  return (
    <Table
      data={readings}
      columns={columns}
      idKey="id"
      plugins={{sticky}}
      virtualization={virtualization}
    />
  );
}
