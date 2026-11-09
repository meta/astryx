// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {ScrollableArea} from '@astryxdesign/core/ScrollableArea';
import {
  Table,
  TableSelectionToolbar,
  useTableSelection,
  useTableSelectionState,
  proportional,
} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';
import {
  colorVars,
  radiusVars,
  shadowVars,
  sizeVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';

interface User extends Record<string, unknown> {
  id: string;
  name: string;
  email: string;
  role: string;
}

const baseUsers: Array<Pick<User, 'name' | 'email' | 'role'>> = [
  {name: 'Alice', email: 'alice@example.com', role: 'Engineer'},
  {name: 'Bob', email: 'bob@example.com', role: 'Designer'},
  {name: 'Charlie', email: 'charlie@example.com', role: 'Manager'},
  {name: 'Diana', email: 'diana@example.com', role: 'Engineer'},
  {name: 'Eve', email: 'eve@example.com', role: 'Admin'},
];

const users: User[] = Array.from({length: 40}, (_, index) => {
  const user = baseUsers[index % baseUsers.length];
  return {...user, id: String(index + 1), name: `${user.name} ${index + 1}`};
});

const columns: TableColumn<User>[] = [
  {key: 'name', header: 'Name', width: proportional(1)},
  {key: 'email', header: 'Email', width: proportional(1)},
  {key: 'role', header: 'Role', width: proportional(1)},
];

const styles = stylex.create({
  page: {
    maxBlockSize: 640,
    isolation: 'isolate',
    scrollbarGutter: 'stable',
  },
  metrics: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: spacingVars['--spacing-3'],
    marginBlockEnd: spacingVars['--spacing-6'],
  },
  metricCard: {
    padding: spacingVars['--spacing-4'],
    borderRadius: radiusVars['--radius-container'],
    backgroundColor: colorVars['--color-background-muted'],
  },
  metricLabel: {
    display: 'block',
    color: colorVars['--color-text-secondary'],
  },
  metricValue: {
    display: 'block',
    marginBlockStart: spacingVars['--spacing-1'],
    color: colorVars['--color-text-primary'],
  },
  tableRegion: {
    '--table-bulk-actions-space': `calc(${sizeVars['--size-element-sm']} + ${spacingVars['--spacing-2']} + ${spacingVars['--spacing-2']} + ${spacingVars['--spacing-4']})`,
    position: 'relative',
    paddingBlockStart: 'var(--table-bulk-actions-space)',
  },
  toolbar: {
    position: 'sticky',
    insetBlockStart: `calc(var(--table-bulk-actions-space) + ${spacingVars['--spacing-4']})`,
    transform: 'translateY(calc(0px - var(--table-bulk-actions-space)))',
    marginBlockEnd: `calc(${spacingVars['--spacing-4']} - var(--table-bulk-actions-space))`,
    zIndex: 1,
    borderRadius: radiusVars['--radius-element'],
    boxShadow: shadowVars['--shadow-med'],
  },
});

export default function TableFloatingBulkActionsTable() {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const {selectionConfig, selectionState} = useTableSelectionState<User>({
    data: users,
    idKey: 'id',
    selectedKeys,
    setSelectedKeys,
  });
  const selectionPlugin = useTableSelection<User>(selectionConfig);

  return (
    <ScrollableArea
      axis="block"
      label="Bulk actions example"
      overscroll="contain"
      xstyle={styles.page}>
      <div {...stylex.props(styles.metrics)}>
        {[
          ['Active users', '12,840'],
          ['Selection rate', '18.4%'],
          ['Pending reviews', '247'],
        ].map(([label, value]) => (
          <div key={label} {...stylex.props(styles.metricCard)}>
            <span {...stylex.props(styles.metricLabel)}>{label}</span>
            <strong {...stylex.props(styles.metricValue)}>{value}</strong>
          </div>
        ))}
      </div>
      <div {...stylex.props(styles.tableRegion)}>
        <TableSelectionToolbar
          selection={selectionState}
          xstyle={styles.toolbar}
          startContent={
            <Button label="Approve" variant="ghost" onClick={() => {}} />
          }
        />
        <Table
          data={users}
          columns={columns}
          idKey="id"
          plugins={{selection: selectionPlugin}}
        />
      </div>
    </ScrollableArea>
  );
}
