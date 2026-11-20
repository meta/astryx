// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Item} from '@astryxdesign/core/Item';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Badge} from '@astryxdesign/core/Badge';
import {Icon} from '@astryxdesign/core/Icon';
import {Text} from '@astryxdesign/core/Text';
import {Stack} from '@astryxdesign/core/Layout';
import {
  UserIcon,
  FileIcon,
  NotificationIcon,
} from '@astryxdesign/template-icons';

export default function ItemShowcase() {
  return (
    <Stack gap={0}>
      <Item
        startContent={<Avatar name="Alice Johnson" size={40} />}
        label="Alice Johnson"
        description="Engineering Lead"
        endContent={<Badge label="Admin" />}
        onClick={() => {}}
      />
      <Item
        startContent={<Icon icon={NotificationIcon} size="sm" />}
        label="Build completed successfully"
        description="Pipeline #4521 — all 42 tests passed"
        endContent={<Text color="secondary">5h ago</Text>}
        descriptionLines={1}
        onClick={() => {}}
      />
      <Item
        startContent={<Icon icon={FileIcon} size="sm" />}
        label="design-spec.pdf"
        description="Modified 2 hours ago"
        endContent={<Text color="secondary">2.4 MB</Text>}
        isSelected
        onClick={() => {}}
      />
      <Item
        startContent={<Icon icon={UserIcon} size="sm" />}
        label="Compact menu item"
        density="compact"
        onClick={() => {}}
      />
    </Stack>
  );
}
