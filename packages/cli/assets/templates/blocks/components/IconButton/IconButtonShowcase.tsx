// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {IconButton} from '@astryxdesign/core/IconButton';
import {Icon} from '@astryxdesign/core/Icon';
import {useToast} from '@astryxdesign/core/Toast';

export default function IconButtonShowcase() {
  const showToast = useToast();
  return (
    <IconButton
      label="Settings"
      icon={<Icon icon="wrench" color="inherit" />}
      onClick={() => showToast({body: 'Demo: settings would open here'})}
    />
  );
}
