// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {IconButton} from '@astryxdesign/core/IconButton';
import {Icon} from '@astryxdesign/core/Icon';
import {HStack} from '@astryxdesign/core/Stack';
import {useToast} from '@astryxdesign/core/Toast';

export default function IconButtonTooltipIconButton() {
  const showToast = useToast();
  return (
    <HStack gap={2}>
      <IconButton
        label="Search"
        icon={<Icon icon="search" color="inherit" />}
        variant="ghost"
        tooltip="Search items"
        onClick={() => showToast({body: 'Demo: search would open here'})}
      />
      <IconButton
        label="Copy link"
        icon={<Icon icon="copy" color="inherit" />}
        variant="ghost"
        tooltip="Copy to clipboard"
        onClick={() => showToast({body: 'Demo: the link would be copied here'})}
      />
      <IconButton
        label="More options"
        icon={<Icon icon="moreHorizontal" color="inherit" />}
        variant="ghost"
        tooltip="More options"
        onClick={() => showToast({body: 'Demo: more options would open here'})}
      />
    </HStack>
  );
}
