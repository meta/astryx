// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Button} from '@astryxdesign/core/Button';
import {Badge} from '@astryxdesign/core/Badge';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {useToast} from '@astryxdesign/core/Toast';

export default function ButtonWithEndSlot() {
  const showToast = useToast();
  return (
    <Stack direction="vertical" gap={4}>
      <Text type="supporting" color="secondary">
        Trailing badges for counts or status
      </Text>
      <Stack direction="horizontal" gap={3} vAlign="center">
        <Button
          label="Messages"
          variant="primary"
          endContent={<Badge variant="info" label={3} />}
          onClick={() =>
            showToast({body: 'Demo: your messages would open here'})
          }
        />
        <Button
          label="Notifications"
          variant="secondary"
          endContent={<Badge variant="warning" label={12} />}
          onClick={() =>
            showToast({body: 'Demo: your notifications would open here'})
          }
        />
        <Button
          label="Updates"
          variant="ghost"
          endContent={<Badge variant="neutral" label="New" />}
          onClick={() => showToast({body: 'Demo: the updates would open here'})}
        />
      </Stack>
    </Stack>
  );
}
