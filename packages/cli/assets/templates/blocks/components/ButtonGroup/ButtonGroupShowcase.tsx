// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {ButtonGroup} from '@astryxdesign/core/ButtonGroup';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Stack} from '@astryxdesign/core/Layout';
import {Icon} from '@astryxdesign/core/Icon';
import {
  CopyTextIcon,
  CutIcon,
  PasteIcon,
  ChevronDownIcon,
} from '@astryxdesign/template-icons';

export default function ButtonGroupShowcase() {
  return (
    <Stack direction="horizontal" gap={6} vAlign="center">
      <ButtonGroup label="Clipboard actions">
        <Button label="Copy" icon={<Icon icon={CopyTextIcon} />} />
        <Button label="Cut" icon={<Icon icon={CutIcon} />} />
        <Button label="Paste" icon={<Icon icon={PasteIcon} />} />
      </ButtonGroup>
      <ButtonGroup label="Save options">
        <Button label="Save" variant="primary" />
        <IconButton
          label="Save options"
          variant="primary"
          icon={<Icon icon={ChevronDownIcon} />}
        />
      </ButtonGroup>
    </Stack>
  );
}
