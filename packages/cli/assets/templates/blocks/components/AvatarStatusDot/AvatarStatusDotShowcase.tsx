// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Avatar, AvatarStatusDot} from '@astryxdesign/core/Avatar';
import {HStack} from '@astryxdesign/core/Layout';

export default function AvatarStatusDotShowcase() {
  return (
    <HStack gap={4} vAlign="center" wrap="wrap">
      <Avatar
        name="Online User"
        size="xl"
        status={<AvatarStatusDot variant="success" label="Online" />}
      />
      <Avatar
        name="Away User"
        size="xl"
        status={<AvatarStatusDot variant="neutral" label="Away" />}
      />
      <Avatar
        name="Busy User"
        size="xl"
        status={<AvatarStatusDot variant="error" label="Busy" />}
      />
    </HStack>
  );
}
