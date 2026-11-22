// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Button} from '@astryxdesign/core/Button';
import {Stack} from '@astryxdesign/core/Layout';
import {useToast} from '@astryxdesign/core/Toast';
import {useImperativeAlertDialog} from '@astryxdesign/core/AlertDialog';

export default function ButtonShowcase() {
  const showToast = useToast();
  const confirm = useImperativeAlertDialog();
  return (
    <Stack direction="horizontal" gap={3} vAlign="center">
      <Button
        label="Primary"
        variant="primary"
        onClick={() =>
          showToast({body: 'Demo: the primary action would run here'})
        }
      />
      <Button
        label="Secondary"
        variant="secondary"
        onClick={() =>
          showToast({body: 'Demo: the secondary action would run here'})
        }
      />
      <Button
        label="Ghost"
        variant="ghost"
        onClick={() =>
          showToast({body: 'Demo: the ghost action would run here'})
        }
      />
      <Button
        label="Destructive"
        variant="destructive"
        onClick={() =>
          confirm.show({
            title: 'Run the destructive action?',
            description: "This demo won't change anything.",
            actionLabel: 'Continue',
            onAction: () => {
              confirm.hide();
              // Demo only: replace this toast with the call that performs the action.
              showToast({body: 'Demo: the destructive action would run here'});
            },
          })
        }
      />
      {confirm.element}
    </Stack>
  );
}
