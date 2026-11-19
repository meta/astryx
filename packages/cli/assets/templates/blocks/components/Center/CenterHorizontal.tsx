// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Center} from '@astryxdesign/core/Center';
import {Card} from '@astryxdesign/core/Card';
import {Stack} from '@astryxdesign/core/Layout';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  ListIcon,
  LinkIcon,
  ImageIcon,
} from '@astryxdesign/template-icons';

export default function CenterHorizontal() {
  return (
    <Card width={520} maxWidth="100%" padding={2}>
      <Center axis="horizontal" width="100%">
        <Stack direction="horizontal" gap={0} vAlign="center">
          <IconButton
            label="Bold"
            icon={<Icon icon={BoldIcon} />}
            variant="ghost"
            size="sm"
          />
          <IconButton
            label="Italic"
            icon={<Icon icon={ItalicIcon} />}
            variant="ghost"
            size="sm"
          />
          <IconButton
            label="Underline"
            icon={<Icon icon={UnderlineIcon} />}
            variant="ghost"
            size="sm"
          />
          <IconButton
            label="List"
            icon={<Icon icon={ListIcon} />}
            variant="ghost"
            size="sm"
          />
          <IconButton
            label="Link"
            icon={<Icon icon={LinkIcon} />}
            variant="ghost"
            size="sm"
          />
          <IconButton
            label="Image"
            icon={<Icon icon={ImageIcon} />}
            variant="ghost"
            size="sm"
          />
        </Stack>
      </Center>
    </Card>
  );
}
