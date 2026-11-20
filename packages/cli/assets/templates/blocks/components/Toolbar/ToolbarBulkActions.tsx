// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Toolbar} from '@astryxdesign/core/Toolbar';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {Badge} from '@astryxdesign/core/Badge';
import {Table} from '@astryxdesign/core/Table';
import {
  useTableSelection,
  useTableSelectionState,
} from '@astryxdesign/core/Table';
import {Stack} from '@astryxdesign/core/Layout';
import {useToast} from '@astryxdesign/core/Toast';
import {useImperativeAlertDialog} from '@astryxdesign/core/AlertDialog';
import {DeleteIcon, ArchiveIcon} from '@astryxdesign/template-icons';

const DATA = [
  {id: '1', name: 'Alex Johnson', status: 'Active', role: 'Admin'},
  {id: '2', name: 'Sam Rivera', status: 'Active', role: 'Editor'},
  {id: '3', name: 'Jordan Lee', status: 'Invited', role: 'Viewer'},
  {id: '4', name: 'Taylor Kim', status: 'Active', role: 'Editor'},
  {id: '5', name: 'Casey Park', status: 'Active', role: 'Viewer'},
];

export default function ToolbarBulkActions() {
  const showToast = useToast();
  const confirm = useImperativeAlertDialog();
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(['1', '3', '5']),
  );

  const {selectionConfig} = useTableSelectionState({
    data: DATA,
    idKey: 'id',
    selectedKeys,
    setSelectedKeys,
  });

  const selectionPlugin = useTableSelection(selectionConfig);

  return (
    <Stack direction="vertical">
      {selectedKeys.size > 0 && (
        <Toolbar
          label="Bulk actions"
          size="sm"
          variant="muted"
          dividers={['bottom']}
          startContent={
            <>
              <Badge label={`${selectedKeys.size} selected`} />
              <Button
                label="Delete"
                variant="ghost"
                icon={<Icon icon={DeleteIcon} />}
                isIconOnly
                onClick={() =>
                  confirm.show({
                    title: `Delete ${selectedKeys.size} ${selectedKeys.size === 1 ? 'row' : 'rows'}?`,
                    description: "This demo won't delete anything.",
                    actionLabel: 'Delete',
                    onAction: () => {
                      confirm.hide();
                      // Demo only: replace this toast with the call that performs the action.
                      showToast({
                        body: 'Demo: the selected rows would be deleted here',
                      });
                    },
                  })
                }
              />
              <Button
                label="Archive"
                variant="ghost"
                icon={<Icon icon={ArchiveIcon} />}
                isIconOnly
                onClick={() =>
                  confirm.show({
                    title: `Archive ${selectedKeys.size} ${selectedKeys.size === 1 ? 'row' : 'rows'}?`,
                    description: "This demo won't archive anything.",
                    actionLabel: 'Archive',
                    onAction: () => {
                      confirm.hide();
                      // Demo only: replace this toast with the call that performs the action.
                      showToast({
                        body: 'Demo: the selected rows would be archived here',
                      });
                    },
                  })
                }
              />
            </>
          }
          endContent={
            <Button
              label="Deselect all"
              variant="ghost"
              onClick={() => setSelectedKeys(new Set())}
            />
          }
        />
      )}
      <Table
        idKey="id"
        columns={[
          {key: 'name', header: 'Name'},
          {key: 'status', header: 'Status'},
          {key: 'role', header: 'Role'},
        ]}
        data={DATA}
        plugins={{selection: selectionPlugin}}
      />
      {confirm.element}
    </Stack>
  );
}
