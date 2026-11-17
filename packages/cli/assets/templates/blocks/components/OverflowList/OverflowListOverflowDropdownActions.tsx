// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useImperativeAlertDialog} from '@astryxdesign/core/AlertDialog';
import {OverflowList} from '@astryxdesign/core/OverflowList';
import {Button} from '@astryxdesign/core/Button';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {Card} from '@astryxdesign/core/Card';
import {useToast} from '@astryxdesign/core/Toast';

// Archive and Delete ask first, as a real destructive action would.
const destructive: Record<string, {verb: string; done: string}> = {
  Archive: {verb: 'archive', done: 'archived'},
  Delete: {verb: 'delete', done: 'deleted'},
};

const actions = ['Save', 'Edit', 'Duplicate', 'Share', 'Archive', 'Delete'];

export default function OverflowListOverflowDropdownActions() {
  const showToast = useToast();
  const confirm = useImperativeAlertDialog();
  const runAction = (action: string) => {
    const destructiveAction = destructive[action];
    if (destructiveAction == null) {
      showToast({body: `Demo: ${action} would run here`});
      return;
    }
    confirm.show({
      title: `${action} this item?`,
      description: `This demo won't ${destructiveAction.verb} anything.`,
      actionLabel: action,
      onAction: () => {
        confirm.hide();
        // Demo only: replace this toast with the call that performs the action.
        showToast({
          body: `Demo: the item would be ${destructiveAction.done} here`,
        });
      },
    });
  };
  return (
    <Card
      padding={2}
      style={{
        resize: 'horizontal',
        overflow: 'hidden',
        minWidth: 100,
        width: 350,
        maxWidth: '100%',
      }}>
      <OverflowList
        gap={2}
        overflowRenderer={overflowItems => (
          <DropdownMenu
            button={{
              label: `+${overflowItems.length}`,
              variant: 'ghost',
              size: 'sm',
            }}
            items={overflowItems.map(({index}) => ({
              label: actions[index],
              onClick: () => runAction(actions[index]),
            }))}
          />
        )}>
        {actions.map(action => (
          <Button
            key={action}
            label={action}
            size="sm"
            variant={
              action === 'Save'
                ? 'primary'
                : action === 'Delete'
                  ? 'destructive'
                  : undefined
            }
            onClick={() => runAction(action)}
          />
        ))}
      </OverflowList>
      {confirm.element}
    </Card>
  );
}
