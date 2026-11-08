// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

// In production, use useToast() hook for proper positioning, stacking, and lifecycle.

import {Toast} from '@astryxdesign/core/Toast';
import {useToast} from '@astryxdesign/core/Toast';
import {Button} from '@astryxdesign/core/Button';
import {VStack, HStack} from '@astryxdesign/core/Layout';

export default function ToastDeduplication() {
  const toast = useToast();

  return (
    <VStack gap={3}>
      <Toast
        type="info"
        body="You are offline"
        isAutoHide={false}
        autoHideDuration={5000}
        isExiting={false}
        onDismiss={() => {}}
      />
      <HStack gap={3} vAlign="center">
        <Button
          label="Offline (ignore)"
          variant="secondary"
          size="sm"
          onClick={() =>
            toast({
              body: 'You are offline',
              uniqueID: 'offline',
              collisionBehavior: 'ignore',
              isAutoHide: false,
            })
          }
        />
        <Button
          label="Progress (overwrite)"
          variant="secondary"
          size="sm"
          onClick={() =>
            toast({
              body: `Uploading… ${Math.floor(Math.random() * 100)}%`,
              uniqueID: 'upload-progress',
              collisionBehavior: 'overwrite',
              isAutoHide: false,
            })
          }
        />
      </HStack>
    </VStack>
  );
}
