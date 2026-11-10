// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file cases.tsx
 * @input A case id from caseIds.ts
 * @output The case: a reorderable List, a TransferList, or a reorderable List
 *   in a Card
 * @position The List reorder cases page's content: a List's reorder alone and
 *   inside the containers that clip it.
 */

import {useMemo, useState} from 'react';
import {createReorderable} from '@astryxdesign/core';
import {Card} from '@astryxdesign/core/Card';
import {List, ListItem} from '@astryxdesign/core/List';
import {TransferList} from '@astryxdesign/lab';
import type {TransferListOption} from '@astryxdesign/lab';
import type {ListReorderCaseId} from './caseIds';

const MAILBOXES = [
  'Inbox',
  'Sent',
  'Drafts',
  'Archive',
  'Spam',
  'Trash',
  'Receipts',
  'Travel',
];

const FIELDS: ReadonlyArray<TransferListOption<string>> = Array.from(
  {length: 12},
  (_, index) => {
    const label = `Field ${String(index + 1).padStart(3, '0')}`;
    return {value: label, label};
  },
);

/** `items` with `key` moved to index `to`. */
function moveTo(
  items: ReadonlyArray<string>,
  key: string,
  to: number,
): string[] {
  const next = items.filter(item => item !== key);
  next.splice(to, 0, key);
  return next;
}

function ReorderableList({hasSwipeActions}: {hasSwipeActions: boolean}) {
  const [rows, setRows] = useState<ReadonlyArray<string>>(MAILBOXES);
  const [archived, setArchived] = useState(0);
  const reorderable = useMemo(
    () =>
      createReorderable({
        onReorder: ({key, to}) =>
          setRows(current => moveTo(current, String(key), to)),
      }),
    [],
  );
  return (
    <List hasDividers reorderable={reorderable}>
      {rows.map(label => (
        <ListItem
          key={label}
          itemKey={label}
          label={label}
          description={
            hasSwipeActions ? `Archive swipes: ${archived}` : undefined
          }
          swipeActions={
            hasSwipeActions
              ? {
                  trailing: [
                    {
                      label: 'Archive',
                      onActivate: () => setArchived(count => count + 1),
                    },
                  ],
                }
              : undefined
          }
        />
      ))}
    </List>
  );
}

function TransferListCase() {
  const [value, setValue] = useState<readonly string[]>(
    FIELDS.map(field => field.value),
  );
  const reorderable = useMemo(
    () =>
      createReorderable<string>({
        onReorder: ({key, to}) => setValue(current => moveTo(current, key, to)),
      }),
    [],
  );
  return (
    <TransferList
      label="Fields"
      description="Reorder the shown fields."
      options={FIELDS}
      value={value}
      onChange={setValue}
      reorderable={reorderable}
      selectedLabel="Shown fields"
      availableLabel="Hidden fields"
    />
  );
}

export function ListReorderCase({id}: {id: ListReorderCaseId}) {
  switch (id) {
    case 'list':
      return <ReorderableList hasSwipeActions={false} />;
    case 'transfer-list':
      return <TransferListCase />;
    case 'list-in-a-card':
      return (
        <Card>
          <ReorderableList hasSwipeActions />
        </Card>
      );
  }
}
