// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useImperativeAlertDialog} from '@astryxdesign/core/AlertDialog';
import {OverflowList} from '@astryxdesign/core/OverflowList';
import {Button} from '@astryxdesign/core/Button';
import {useToast} from '@astryxdesign/core/Toast';

// Archive and Delete ask first, as a real destructive action would.
const destructive: Record<string, {verb: string; done: string}> = {
  Archive: {verb: 'archive', done: 'archived'},
  Delete: {verb: 'delete', done: 'deleted'},
};

const actions = ['Edit', 'Duplicate', 'Share', 'Archive', 'Delete'];

export default function OverflowListShowcase() {
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
    <div
      style={{
        maxWidth: 400,
        border: '1px dashed var(--color-border)',
        padding: 8,
      }}>
      <OverflowList
        gap={2}
        overflowRenderer={overflowItems => (
          <Button
            label={`+${overflowItems.length} more`}
            variant="ghost"
            size="sm"
            onClick={() =>
              showToast({
                body: `Demo: the ${overflowItems.length} hidden ${overflowItems.length === 1 ? 'action' : 'actions'} would show here`,
              })
            }
          />
        )}>
        {actions.map(action => (
          <Button
            key={action}
            label={action}
            size="sm"
            onClick={() => runAction(action)}
          />
        ))}
      </OverflowList>
      {confirm.element}
    </div>
  );
}
