// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Center} from '@astryxdesign/core/Center';
import {Card} from '@astryxdesign/core/Card';
import {Stack} from '@astryxdesign/core/Layout';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {useToast} from '@astryxdesign/core/Toast';
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  ListIcon,
  LinkIcon,
  ImageIcon,
} from '@astryxdesign/template-icons';

export default function CenterHorizontal() {
  const showToast = useToast();
  return (
    <Card width={520} maxWidth="100%" padding={2}>
      <Center axis="horizontal" width="100%">
        <Stack direction="horizontal" gap={0} vAlign="center">
          <IconButton
            label="Bold"
            icon={<Icon icon={BoldIcon} />}
            variant="ghost"
            size="sm"
            onClick={() =>
              showToast({body: 'Demo: the text would turn bold here'})
            }
          />
          <IconButton
            label="Italic"
            icon={<Icon icon={ItalicIcon} />}
            variant="ghost"
            size="sm"
            onClick={() =>
              showToast({body: 'Demo: the text would turn italic here'})
            }
          />
          <IconButton
            label="Underline"
            icon={<Icon icon={UnderlineIcon} />}
            variant="ghost"
            size="sm"
            onClick={() =>
              showToast({body: 'Demo: the text would be underlined here'})
            }
          />
          <IconButton
            label="List"
            icon={<Icon icon={ListIcon} />}
            variant="ghost"
            size="sm"
            onClick={() => showToast({body: 'Demo: a list would start here'})}
          />
          <IconButton
            label="Link"
            icon={<Icon icon={LinkIcon} />}
            variant="ghost"
            size="sm"
            onClick={() =>
              showToast({body: 'Demo: a link would be added here'})
            }
          />
          <IconButton
            label="Image"
            icon={<Icon icon={ImageIcon} />}
            variant="ghost"
            size="sm"
            onClick={() =>
              showToast({body: 'Demo: an image would be added here'})
            }
          />
        </Stack>
      </Center>
    </Card>
  );
}
