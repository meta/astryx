// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {ButtonGroup} from '@astryxdesign/core/ButtonGroup';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Stack} from '@astryxdesign/core/Layout';
import {Icon} from '@astryxdesign/core/Icon';
import {useToast} from '@astryxdesign/core/Toast';
import {
  ClipboardDocumentIcon,
  ScissorsIcon,
  ClipboardIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';

export default function ButtonGroupShowcase() {
  const showToast = useToast();
  return (
    <Stack direction="horizontal" gap={6} vAlign="center">
      <ButtonGroup label="Clipboard actions">
        <Button
          label="Copy"
          icon={<Icon icon={ClipboardDocumentIcon} />}
          onClick={() =>
            showToast({body: 'Demo: the selection would be copied here'})
          }
        />
        <Button
          label="Cut"
          icon={<Icon icon={ScissorsIcon} />}
          onClick={() =>
            showToast({body: 'Demo: the selection would be cut here'})
          }
        />
        <Button
          label="Paste"
          icon={<Icon icon={ClipboardIcon} />}
          onClick={() =>
            showToast({body: 'Demo: the clipboard would be pasted here'})
          }
        />
      </ButtonGroup>
      <ButtonGroup label="Save options">
        <Button
          label="Save"
          variant="primary"
          onClick={() =>
            showToast({body: 'Demo: your changes would be saved here'})
          }
        />
        <IconButton
          label="Save options"
          variant="primary"
          icon={<Icon icon={ChevronDownIcon} />}
          onClick={() =>
            showToast({body: 'Demo: more ways to save would open here'})
          }
        />
      </ButtonGroup>
    </Stack>
  );
}
