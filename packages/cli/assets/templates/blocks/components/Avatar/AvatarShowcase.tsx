// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Avatar, AvatarStatusDot} from '@astryxdesign/core/Avatar';
import {Stack} from '@astryxdesign/core/Layout';

export default function AvatarShowcase() {
  return (
    <Stack direction="horizontal" gap={4} vAlign="center" wrap="wrap">
      <Avatar
        src="/template-assets/DATA-Ana-Thomas.png"
        name="Ana Thomas"
        size="xl"
        status={<AvatarStatusDot variant="success" label="Online" />}
      />
      <Avatar
        src="/template-assets/DATA-Drew-Young.png"
        name="Drew Young"
        size="xl"
      />
      <Avatar
        src="/template-assets/DATA-Jihoo-Song.png"
        name="Jihoo Song"
        size="xl"
      />
      <Avatar
        src="/template-assets/DATA-Nam-Tran.png"
        name="Nam Tran"
        size="xl"
        status={<AvatarStatusDot variant="error" label="Busy" />}
      />
    </Stack>
  );
}
