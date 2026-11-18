// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Avatar} from '@astryxdesign/core/Avatar';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {HStack} from '@astryxdesign/core/HStack';
import {useContainerReveal} from '@astryxdesign/core/hooks';
import {
  Table,
  proportional,
  useTableSelectionState,
} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';
import {colorVars, spacingVars} from '@astryxdesign/core/theme/tokens.stylex';
import {mergeProps} from '@astryxdesign/core/utils';

interface Automation extends Record<string, unknown> {
  id: string;
  name: string;
  owner: string;
  schedule: string;
}

const automations: Automation[] = [
  {id: '1', name: 'Nightly backup', owner: 'Alice', schedule: 'Daily, 2:00'},
  {id: '2', name: 'Weekly digest', owner: 'Bob', schedule: 'Mondays, 9:00'},
  {id: '3', name: 'Cache warmup', owner: 'Diana', schedule: 'Hourly'},
  {id: '4', name: 'Usage report', owner: 'Eve', schedule: 'Monthly, 1st'},
];

const styles = stylex.create({
  mark: {
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
  },
  // A flex layer is exactly as tall as the 24px avatar; a block layer
  // follows the taller line box and lets the avatar's edge show under the
  // checkbox.
  layer: {
    gridArea: '1 / 1',
    display: 'flex',
  },
  // The checkbox covers the avatar while it shows, so the two never read as
  // one mark.
  checkbox: {
    borderRadius: '50%',
    backgroundColor: colorVars['--color-background-surface'],
  },
  name: {
    paddingInlineStart: spacingVars['--spacing-1'],
  },
});

export default function TableLeadingMarkSelection() {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  // The mark reveals its checkbox on hover and keyboard focus, and always
  // shows it on touch.
  const {getContainerProps, getContentRevealProps} = useContainerReveal();
  const {selectionConfig, selectionState} = useTableSelectionState<Automation>({
    data: automations,
    idKey: 'id',
    selectedKeys,
    setSelectedKeys,
  });

  const columns: TableColumn<Automation>[] = [
    {
      key: 'name',
      header: (
        <HStack gap={2} vAlign="center">
          <CheckboxInput
            label="Select all automations"
            isLabelHidden
            value={
              selectionConfig.getIsAllSelected()
                ? true
                : selectionConfig.getIsIndeterminate?.()
                  ? 'indeterminate'
                  : false
            }
            onChange={checked =>
              selectionConfig.onSelectAll({isAllSelected: checked})
            }
          />
          Automation
        </HStack>
      ),
      width: proportional(2),
      renderCell: item => {
        const isSelected = selectionConfig.getIsItemSelected(item);
        return (
          <HStack gap={2} vAlign="center">
            <span
              {...mergeProps(stylex.props(styles.mark), getContainerProps())}>
              {selectionState.hasSelection ? null : (
                <span {...stylex.props(styles.layer)}>
                  <Avatar name={item.owner} size="sm" tooltip={false} />
                </span>
              )}
              <span
                {...mergeProps(
                  stylex.props(styles.layer, styles.checkbox),
                  getContentRevealProps({
                    isLayoutPreserved: true,
                    forceVisibility: selectionState.hasSelection
                      ? 'shown'
                      : undefined,
                  }),
                )}>
                <CheckboxInput
                  label={`Select ${item.name}`}
                  isLabelHidden
                  value={isSelected}
                  onChange={checked =>
                    selectionConfig.onSelectItem({item, isSelected: checked})
                  }
                />
              </span>
            </span>
            <span {...stylex.props(styles.name)}>{item.name}</span>
          </HStack>
        );
      },
    },
    {key: 'owner', header: 'Owner', width: proportional(1)},
    {key: 'schedule', header: 'Schedule', width: proportional(1)},
  ];

  return <Table data={automations} columns={columns} idKey="id" />;
}
