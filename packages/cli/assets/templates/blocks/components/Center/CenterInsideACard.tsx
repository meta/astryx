// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Center} from '@astryxdesign/core/Center';
import {Card} from '@astryxdesign/core/Card';
import {Stack} from '@astryxdesign/core/Layout';
import {Icon} from '@astryxdesign/core/Icon';
import {Text} from '@astryxdesign/core/Text';
import {InboxIcon} from '@heroicons/react/24/outline';

export default function CenterInsideACard() {
  return (
    <Card width={400} maxWidth="100%">
      <Center height={200}>
        <Stack direction="vertical" gap={2} hAlign="center">
          <Icon icon={InboxIcon} size="lg" color="secondary" />
          <Text type="body" weight="bold">
            No messages yet
          </Text>
          <Text type="supporting" color="secondary">
            Messages from your team will appear here.
          </Text>
        </Stack>
      </Center>
    </Card>
  );
}
