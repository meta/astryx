// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useImperativeAlertDialog} from '@astryxdesign/core/AlertDialog';
import * as stylex from '@stylexjs/stylex';
import {useContainerReveal} from '@astryxdesign/core/hooks';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Icon} from '@astryxdesign/core/Icon';
import {Item} from '@astryxdesign/core/Item';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {useToast} from '@astryxdesign/core/Toast';
import {PencilIcon, TrashIcon} from '@heroicons/react/24/outline';

const styles = stylex.create({
  intro: {
    paddingInline: 12,
    paddingBottom: 8,
  },
});

function FileRow({
  name,
  onDelete,
}: {
  name: string;
  onDelete: (name: string) => void;
}) {
  // Destructure the two prop getters. Spreading getContainerProps() on the row
  // gives it a scoped hover/focus-within trigger; getContentRevealProps() hides
  // the actions at rest and reveals them when the row is hovered or focused.
  const {getContainerProps, getContentRevealProps} = useContainerReveal();
  const showToast = useToast();

  return (
    <Item
      label={name}
      description="Edited 2 hours ago"
      endContent={
        <Stack direction="horizontal" gap={1} {...getContentRevealProps()}>
          <Button
            label={`Edit ${name}`}
            variant="ghost"
            isIconOnly
            icon={<Icon icon={PencilIcon} size="sm" />}
            onClick={() =>
              showToast({body: `Demo: ${name} would open for editing here`})
            }
          />
          <Button
            label={`Delete ${name}`}
            variant="ghost"
            isIconOnly
            icon={<Icon icon={TrashIcon} size="sm" />}
            onClick={() => onDelete(name)}
          />
        </Stack>
      }
      {...getContainerProps()}
    />
  );
}

export default function UseContainerRevealHookUsage() {
  const showToast = useToast();
  const confirm = useImperativeAlertDialog();
  const deleteFile = (name: string) =>
    confirm.show({
      title: `Delete ${name}?`,
      description: "This demo won't delete anything.",
      actionLabel: 'Delete',
      onAction: () => {
        confirm.hide();
        // Demo only: replace this toast with the call that performs the action.
        showToast({body: `Demo: ${name} would be deleted here`});
      },
    });

  return (
    <Card width={420} maxWidth="100%" padding={2}>
      <Stack gap={0}>
        <Text type="supporting" color="secondary" xstyle={styles.intro}>
          Hover a row — or Tab into it — to reveal its actions. Under a coarse
          primary pointer (a phone or tablet) they stay visible.
        </Text>
        <FileRow name="report.pdf" onDelete={deleteFile} />
        <FileRow name="budget.xlsx" onDelete={deleteFile} />
        <FileRow name="notes.txt" onDelete={deleteFile} />
      </Stack>
      {confirm.element}
    </Card>
  );
}
