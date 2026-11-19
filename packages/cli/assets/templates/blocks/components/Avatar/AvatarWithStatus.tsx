// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Avatar, AvatarStatusDot} from '@astryxdesign/core/Avatar';
import {Stack} from '@astryxdesign/core/Layout';

export default function AvatarWithStatus() {
  return (
    <Stack direction="horizontal" gap={4} vAlign="center" wrap="wrap">
      <Avatar
        src="/template-assets/DATA-Itai-Jordaan.png"
        name="Itai Jordaan"
        size="xl"
        status={<AvatarStatusDot variant="success" label="Online" />}
      />
      <Avatar
        src="/template-assets/DATA-Margot-Schroder.png"
        name="Margot Schroder"
        size="xl"
        status={<AvatarStatusDot variant="neutral" label="Offline" />}
      />
      <Avatar
        src="/template-assets/DATA-Pablo-Morales.png"
        name="Pablo Morales"
        size="xl"
        status={<AvatarStatusDot variant="error" label="Busy" />}
      />
    </Stack>
  );
}
