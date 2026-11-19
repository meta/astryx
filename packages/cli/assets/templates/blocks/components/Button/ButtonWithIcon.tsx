// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {useToast} from '@astryxdesign/core/Toast';
import {useImperativeAlertDialog} from '@astryxdesign/core/AlertDialog';
import {
  ArrowDownTrayIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

export default function ButtonWithIcon() {
  const showToast = useToast();
  const confirm = useImperativeAlertDialog();
  return (
    <Stack direction="vertical" gap={4}>
      <Text type="supporting" color="secondary">
        Icons reinforce the action
      </Text>
      <Stack direction="horizontal" gap={3} vAlign="center">
        <Button
          label="New item"
          variant="primary"
          icon={<Icon icon={PlusIcon} />}
          onClick={() =>
            showToast({body: 'Demo: a new item would be created here'})
          }
        />
        <Button
          label="Edit"
          variant="secondary"
          icon={<Icon icon={PencilSquareIcon} />}
          onClick={() =>
            showToast({body: 'Demo: the item would open for editing here'})
          }
        />
        <Button
          label="Download"
          variant="ghost"
          icon={<Icon icon={ArrowDownTrayIcon} />}
          onClick={() =>
            showToast({body: 'Demo: the file would download here'})
          }
        />
        <Button
          label="Delete"
          variant="destructive"
          icon={<Icon icon={TrashIcon} />}
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
      </Stack>
      {confirm.element}
    </Stack>
  );
}
