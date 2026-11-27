// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useImperativeAlertDialog} from '@astryxdesign/core/AlertDialog';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/Layout';
import {Center} from '@astryxdesign/core/Center';
import {useToast} from '@astryxdesign/core/Toast';

export default function TooltipActionBarTooltips() {
  const showToast = useToast();
  const confirm = useImperativeAlertDialog();
  return (
    <Center>
      <HStack gap={4}>
        <Tooltip content="Save your changes" placement="above">
          <Button
            label="Save"
            onClick={() =>
              showToast({body: 'Demo: your changes would save here'})
            }
          />
        </Tooltip>
        <Tooltip content="Discard changes" placement="above">
          <Button
            label="Cancel"
            onClick={() =>
              showToast({body: 'Demo: your changes would be discarded here'})
            }
          />
        </Tooltip>
        <Tooltip content="Delete permanently" placement="above">
          <Button
            label="Delete"
            variant="destructive"
            onClick={() =>
              confirm.show({
                title: 'Delete this item?',
                description: "This demo won't delete anything.",
                actionLabel: 'Delete',
                onAction: () => {
                  confirm.hide();
                  // Demo only: replace this toast with the call that performs the action.
                  showToast({body: 'Demo: the item would be deleted here'});
                },
              })
            }
          />
        </Tooltip>
      </HStack>
      {confirm.element}
    </Center>
  );
}
