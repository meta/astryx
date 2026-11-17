// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/Layout';
import {Icon} from '@astryxdesign/core/Icon';
import {InboxIcon} from '@heroicons/react/24/outline';
import {useToast} from '@astryxdesign/core/Toast';

export default function EmptyStateCompact() {
  const showToast = useToast();
  return (
    <EmptyState
      icon={<Icon icon={InboxIcon} size="lg" />}
      title="No notifications"
      description="You're all caught up. New notifications will appear here."
      actions={
        <HStack gap={2}>
          <Button
            onClick={() =>
              showToast({body: 'Demo: notification settings would open here'})
            }
            label="Settings"
            variant="secondary"
            size="sm"
          />
          <Button
            onClick={() =>
              showToast({
                body: 'Demo: notifications would be checked again here',
              })
            }
            label="Refresh"
            variant="primary"
            size="sm"
          />
        </HStack>
      }
      isCompact
    />
  );
}
