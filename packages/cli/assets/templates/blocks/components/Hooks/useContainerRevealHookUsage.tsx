// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import * as stylex from '@stylexjs/stylex';
import {useContainerReveal} from '@astryxdesign/core/hooks';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Icon} from '@astryxdesign/core/Icon';
import {Item} from '@astryxdesign/core/Item';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {mergeProps} from '@astryxdesign/core/utils';
import {PencilIcon, TrashIcon} from '@heroicons/react/24/outline';

const styles = stylex.create({
  actions: {
    display: 'flex',
    gap: 4,
  },
  intro: {
    paddingInline: 12,
    paddingBottom: 8,
  },
});

function FileRow({name}: {name: string}) {
  // Destructure the two prop getters. Spreading getContainerProps() on the row
  // gives it a scoped hover/focus-within trigger; getContentRevealProps() hides
  // the actions at rest and reveals them when the row is hovered or focused.
  const {getContainerProps, getContentRevealProps} = useContainerReveal();

  return (
    <Item
      label={name}
      description="Edited 2 hours ago"
      endContent={
        <span
          {...mergeProps(
            getContentRevealProps(),
            stylex.props(styles.actions),
          )}>
          <Button
            label={`Edit ${name}`}
            variant="ghost"
            isIconOnly
            icon={<Icon icon={PencilIcon} size="sm" />}
          />
          <Button
            label={`Delete ${name}`}
            variant="ghost"
            isIconOnly
            icon={<Icon icon={TrashIcon} size="sm" />}
          />
        </span>
      }
      {...getContainerProps()}
    />
  );
}

export default function UseContainerRevealHookUsage() {
  return (
    <Card width={420} padding={2}>
      <Stack gap={0}>
        <Text type="supporting" color="secondary" xstyle={styles.intro}>
          Hover a row — or Tab into it — to reveal its actions. Under a coarse
          primary pointer (a phone or tablet) they stay visible.
        </Text>
        <FileRow name="report.pdf" />
        <FileRow name="budget.xlsx" />
        <FileRow name="notes.txt" />
      </Stack>
    </Card>
  );
}
