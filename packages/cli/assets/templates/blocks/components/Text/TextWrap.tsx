// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Text} from '@astryxdesign/core/Text';

export default function TextWrap() {
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
          Wrap (default)
        </Text>
        <div
          style={{
            border: '1px solid var(--color-border)',
            padding: 8,
            width: 200,
          }}>
          <Text type="body" textWrap="wrap">
            This text wraps normally at word boundaries when it reaches the
            edge.
          </Text>
        </div>
      </div>
      <div>
        <Text type="label" display="block">
          Nowrap
        </Text>
        <div
          style={{
            border: '1px solid var(--color-border)',
            padding: 8,
            width: 200,
            overflow: 'hidden',
          }}>
          <Text type="body" textWrap="nowrap">
            This text does not wrap and will overflow its container.
          </Text>
        </div>
      </div>
      <div>
        <Text type="label" display="block">
          Balance
        </Text>
        <div
          style={{
            border: '1px solid var(--color-border)',
            padding: 8,
            width: 200,
          }}>
          <Text type="body" textWrap="balance">
            This text is balanced for better visual appearance across lines.
          </Text>
        </div>
      </div>
      <div>
        <Text type="label" display="block">
          Pretty
        </Text>
        <div
          style={{
            border: '1px solid var(--color-border)',
            padding: 8,
            width: 200,
          }}>
          <Text type="body" textWrap="pretty">
            This text uses pretty wrap to avoid orphans at the end of
            paragraphs.
          </Text>
        </div>
      </div>
    </div>
  );
}
