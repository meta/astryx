// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Avatar} from '@astryxdesign/core/Avatar';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

export default function AvatarTooltip() {
  return (
    <Stack direction="vertical" gap={5}>
      <Stack direction="vertical" gap={2}>
        <Text type="supporting" color="secondary">
          Hover or focus to reveal each name
        </Text>
        <Stack direction="horizontal" gap={4} vAlign="center" wrap="wrap">
          <Avatar
            src="/template-assets/DATA-Ana-Thomas.png"
            name="Ana Thomas"
            size="xl"
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
        </Stack>
      </Stack>
      <Stack direction="vertical" gap={2}>
        <Text type="supporting" color="secondary">
          Custom tooltip text
        </Text>
        <Avatar
          src="/template-assets/DATA-Itai-Jordaan.png"
          name="Itai Jordaan"
          size="xl"
          tooltip="Itai Jordaan · Engineering Lead"
        />
      </Stack>
    </Stack>
  );
}
