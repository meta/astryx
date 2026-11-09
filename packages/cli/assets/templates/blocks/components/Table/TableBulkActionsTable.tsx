// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {
  Table,
  TableSelectionToolbar,
  useTableSelection,
  useTableSelectionState,
  proportional,
} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';

interface User extends Record<string, unknown> {
  id: string;
  name: string;
  email: string;
  role: string;
}

const users: User[] = [
  {id: '1', name: 'Alice', email: 'alice@example.com', role: 'Engineer'},
  {id: '2', name: 'Bob', email: 'bob@example.com', role: 'Designer'},
  {id: '3', name: 'Charlie', email: 'charlie@example.com', role: 'Manager'},
  {id: '4', name: 'Diana', email: 'diana@example.com', role: 'Engineer'},
  {id: '5', name: 'Eve', email: 'eve@example.com', role: 'Admin'},
];

const columns: TableColumn<User>[] = [
  {key: 'name', header: 'Name', width: proportional(1)},
  {key: 'email', header: 'Email', width: proportional(2)},
  {key: 'role', header: 'Role', width: proportional(1)},
];

export default function TableBulkActionsTable() {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const {selectionConfig, selectionState} = useTableSelectionState<User>({
    data: users,
    idKey: 'id',
    selectedKeys,
    setSelectedKeys,
  });
  const selectionPlugin = useTableSelection<User>(selectionConfig);

  return (
    <div>
      <TableSelectionToolbar
        selection={selectionState}
        startContent={
          <>
            <Button label="Export" variant="ghost" onClick={() => {}} />
            <Button
              label="Delete"
              variant="ghost"
              onClick={selectionState.clearSelection}
            />
          </>
        }
      />
      <Table
        data={users}
        columns={columns}
        idKey="id"
        plugins={{selection: selectionPlugin}}
      />
    </div>
  );
}
