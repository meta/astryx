// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {IconButton} from '@astryxdesign/core/IconButton';
import {Icon} from '@astryxdesign/core/Icon';
import {HStack} from '@astryxdesign/core/Stack';
import {useToast} from '@astryxdesign/core/Toast';

export default function IconButtactionBar() {
  const showToast = useToast();
  return (
    <HStack gap={1}>
      <IconButton
        label="Search"
        icon={<Icon icon="search" color="inherit" />}
        variant="ghost"
        onClick={() => showToast({body: 'Demo: search would open here'})}
      />
      <IconButton
        label="Copy"
        icon={<Icon icon="copy" color="inherit" />}
        variant="ghost"
        onClick={() =>
          showToast({body: 'Demo: the content would be copied here'})
        }
      />
      <IconButton
        label="Info"
        icon={<Icon icon="info" color="inherit" />}
        variant="ghost"
        onClick={() =>
          showToast({body: 'Demo: more information would open here'})
        }
      />
      <IconButton
        label="Menu"
        icon={<Icon icon="menu" color="inherit" />}
        variant="ghost"
        onClick={() => showToast({body: 'Demo: the menu would open here'})}
      />
      <IconButton
        label="Close"
        icon={<Icon icon="close" color="inherit" />}
        variant="ghost"
        onClick={() => showToast({body: 'Demo: this panel would close here'})}
      />
    </HStack>
  );
}
