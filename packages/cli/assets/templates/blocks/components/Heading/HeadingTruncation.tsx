// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {VStack} from '@astryxdesign/core/Layout';
import {Heading} from '@astryxdesign/core/Text';

export default function HeadingTruncation() {
  return (
    <VStack gap={6}>
      <div
        style={{
          width: 300,
          border: '1px solid var(--color-border)',
          padding: 12,
        }}>
        <Heading level={2} maxLines={1}>
          Very Long Heading That Will Be Truncated To One Line With Ellipsis
        </Heading>
      </div>
      <div
        style={{
          width: 300,
          border: '1px solid var(--color-border)',
          padding: 12,
        }}>
        <Heading level={2} maxLines={2}>
          Very Long Heading That Will Be Truncated To Two Lines To Keep Card
          Layout Compact
        </Heading>
      </div>
    </VStack>
  );
}
