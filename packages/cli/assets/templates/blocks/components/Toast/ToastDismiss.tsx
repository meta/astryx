// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

// In production, use useToast() hook for proper positioning, stacking, and lifecycle.

import {useRef} from 'react';
import {Toast} from '@astryxdesign/core/Toast';
import {useToast} from '@astryxdesign/core/Toast';
import {Button} from '@astryxdesign/core/Button';
import {VStack, HStack} from '@astryxdesign/core/Layout';

export default function ToastDismiss() {
  const toast = useToast();
  const dismissRef = useRef<(() => void) | null>(null);

  return (
    <VStack gap={3}>
      <Toast
        type="info"
        body="Uploading file…"
        isAutoHide={false}
        autoHideDuration={5000}
        isExiting={false}
        onDismiss={() => {}}
      />
      <HStack gap={3} vAlign="center">
        <Button
          label="Show toast"
          variant="secondary"
          size="sm"
          onClick={() => {
            dismissRef.current = toast({
              body: 'Uploading file…',
              isAutoHide: false,
            });
          }}
        />
        <Button
          label="Dismiss via code"
          variant="ghost"
          size="sm"
          onClick={() => {
            dismissRef.current?.();
            dismissRef.current = null;
          }}
        />
      </HStack>
    </VStack>
  );
}
