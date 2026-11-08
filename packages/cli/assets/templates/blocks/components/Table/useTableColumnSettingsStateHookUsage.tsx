// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Popover} from '@astryxdesign/core/Popover';
import {
  Table,
  useTableColumnSettings,
  useTableColumnSettingsState,
} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';

interface Member extends Record<string, unknown> {
  id: string;
  name: string;
  email: string;
  role: string;
}

const members: Member[] = [
  {id: '1', name: 'Alice', email: 'alice@example.com', role: 'Engineer'},
  {id: '2', name: 'Bob', email: 'bob@example.com', role: 'Designer'},
  {id: '3', name: 'Charlie', email: 'charlie@example.com', role: 'Manager'},
];

const allColumns: TableColumn<Member>[] = [
  {key: 'name', header: 'Name'},
  {key: 'email', header: 'Email'},
  {key: 'role', header: 'Role'},
];

const columnOptions = [
  {key: 'name' as const, label: 'Name', isAlwaysVisible: true},
  {key: 'email' as const, label: 'Email'},
  {key: 'role' as const, label: 'Role'},
];

const defaultKeys = ['name', 'email', 'role'];

export default function UseTableColumnSettingsStateHookUsage() {
  const [activeKeys, setActiveKeys] =
    useState<ReadonlyArray<string>>(defaultKeys);

  const state = useTableColumnSettingsState({
    columns: columnOptions,
    activeColumnKeys: activeKeys,
    onChangeActiveColumnKeys: setActiveKeys,
    defaultColumnKeys: defaultKeys,
  });

  const plugin = useTableColumnSettings<Member>(state.columnSettingsConfig);

  return (
    <VStack gap={3}>
      <HStack hAlign="start">
        <Popover
          placement="below"
          label="Column settings"
          width={200}
          content={
            <VStack gap={2}>
              {columnOptions.map(col => (
                <CheckboxInput
                  key={col.key}
                  label={col.label}
                  value={state.isColumnActive(col.key)}
                  isDisabled={!state.isColumnToggleable(col.key)}
                  onChange={() => state.toggleColumn(col.key)}
                />
              ))}
              <Button
                label="Reset"
                size="sm"
                variant="secondary"
                onClick={state.resetToDefault}>
                Reset
              </Button>
            </VStack>
          }>
          <Button label="Columns" size="sm">
            Columns
          </Button>
        </Popover>
      </HStack>
      <Table
        data={members}
        columns={allColumns}
        idKey="id"
        plugins={{columnSettings: plugin}}
      />
    </VStack>
  );
}
