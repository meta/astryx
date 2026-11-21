// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Avatar, AvatarStatusDot} from '@astryxdesign/core/Avatar';
import {HStack} from '@astryxdesign/core/Layout';

export default function AvatarStatusDotVariants() {
  return (
    <HStack gap={4} vAlign="center" wrap="wrap">
      <Avatar
        name="Ana Silva"
        size="xl"
        status={<AvatarStatusDot variant="success" label="Online" />}
      />
      <Avatar
        name="Ben Okafor"
        size="xl"
        status={<AvatarStatusDot variant="neutral" label="Away" />}
      />
      <Avatar
        name="Cleo Marsh"
        size="xl"
        status={<AvatarStatusDot variant="error" label="Do not disturb" />}
      />
    </HStack>
  );
}
