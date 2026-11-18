// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Avatar} from '@astryxdesign/core/Avatar';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {useToast} from '@astryxdesign/core/Toast';

export default function AvatarInteractive() {
  const showToast = useToast();
  return (
    <Stack direction="horizontal" gap={6} vAlign="start">
      <Stack direction="vertical" gap={2} hAlign="center">
        <Avatar
          src="/template-assets/DATA-Itai-Jordaan.png"
          name="Itai Jordaan"
          size="xl"
          href="https://example.com/people/itai-jordaan"
        />
        <Text type="supporting" color="secondary">
          Link (href)
        </Text>
      </Stack>
      <Stack direction="vertical" gap={2} hAlign="center">
        <Avatar
          src="/template-assets/DATA-Margot-Schroder.png"
          name="Margot Schroder"
          size="xl"
          onClick={() =>
            // Demo only: replace this toast with the call that performs the action.
            showToast({body: 'Demo: Margot Schroder’s profile would open here'})
          }
        />
        <Text type="supporting" color="secondary">
          Button (onClick)
        </Text>
      </Stack>
    </Stack>
  );
}
