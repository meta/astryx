// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Text} from '@astryxdesign/core/Text';

export default function TextWordBreak() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        maxWidth: 400,
      }}>
      <div>
        <Text type="label" display="block">
          Break-word (default for multi-line)
        </Text>
        <div
          style={{
            width: 200,
            border: '1px solid var(--color-border)',
            padding: 8,
          }}>
          <Text type="body" maxLines={2} wordBreak="break-word">
            This is a verylongunbreakableword for a break-word example
          </Text>
        </div>
      </div>
      <div>
        <Text type="label" display="block">
          Break-all (default for single-line)
        </Text>
        <div
          style={{
            width: 200,
            border: '1px solid var(--color-border)',
            padding: 8,
          }}>
          <Text type="body" maxLines={2} wordBreak="break-all">
            Breaks anywhere: abcdefghijklmnopqrstuvwxyz0123456789
          </Text>
        </div>
      </div>
    </div>
  );
}
