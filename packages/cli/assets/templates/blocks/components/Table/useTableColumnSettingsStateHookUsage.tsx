// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {
  Table,
  useTableColumnSettings,
  useTableColumnSettingsState,
  proportional,
} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';
import {Button} from '@astryxdesign/core/Button';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {Popover} from '@astryxdesign/core/Popover';
import {VStack} from '@astryxdesign/core/Layout';
import {Toolbar} from '@astryxdesign/core/Toolbar';
import {Text} from '@astryxdesign/core/Text';

interface User extends Record<string, unknown> {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
}

const users: User[] = [
  {
    id: '1',
    name: 'Alice Johnson',
    email: 'alice@example.com',
    role: 'Engineer',
    department: 'Platform',
  },
  {
    id: '2',
    name: 'Bob Smith',
    email: 'bob@example.com',
    role: 'Designer',
    department: 'Product',
  },
  {
    id: '3',
    name: 'Charlie Brown',
    email: 'charlie@example.com',
    role: 'Manager',
    department: 'Platform',
  },
];

const allColumns: TableColumn<User>[] = [
  {key: 'name', header: 'Name', width: proportional(1)},
  {key: 'email', header: 'Email', width: proportional(2)},
  {key: 'role', header: 'Role', width: proportional(1)},
  {key: 'department', header: 'Department', width: proportional(1)},
];

const columnOptions = [
  {key: 'name' as const, label: 'Name', isAlwaysVisible: true},
  {key: 'email' as const, label: 'Email'},
  {key: 'role' as const, label: 'Role'},
  {key: 'department' as const, label: 'Department'},
];

const defaultKeys = ['name', 'email', 'role'];
const allKeys = ['name', 'email', 'role', 'department'];

export default function UseTableColumnSettingsStateHookUsage() {
  // The consumer owns the keys; the hook computes the operations.
  const [activeKeys, setActiveKeys] = useState<string[]>(defaultKeys);

  const state = useTableColumnSettingsState({
    columns: columnOptions,
    activeColumnKeys: activeKeys,
    onChangeActiveColumnKeys: keys => setActiveKeys([...keys]),
    defaultColumnKeys: defaultKeys,
  });
  const plugin = useTableColumnSettings<User>(state.columnSettingsConfig);

  return (
    <VStack gap={3} width="100%">
      <Toolbar
        label="Table actions"
        startContent={<Text type="label">Team</Text>}
        endContent={
          <Popover
            content={
              <VStack gap={2} padding={3}>
                {columnOptions.map(column => (
                  <CheckboxInput
                    key={column.key}
                    label={column.label}
                    value={state.isColumnActive(column.key)}
                    isDisabled={!state.isColumnToggleable(column.key)}
                    onChange={() => state.toggleColumn(column.key)}
                  />
                ))}
                <Button
                  label="Reset to default"
                  variant="secondary"
                  size="sm"
                  onClick={state.resetToDefault}
                />
              </VStack>
            }>
            <Button label="Columns" variant="secondary" size="sm" />
          </Popover>
        }
      />
      <Table
        data={users}
        columns={allColumns}
        idKey="id"
        hasHover
        plugins={{columnSettings: plugin}}
      />
    </VStack>
  );
}
