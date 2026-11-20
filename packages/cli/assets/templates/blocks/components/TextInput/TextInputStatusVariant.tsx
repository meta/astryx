// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

export default function TextInputStatusVariant() {
  const [attached, setAttached] = useState('sarah@');
  const [detached, setDetached] = useState('sarah@');

  return (
    <div style={{width: 640, maxWidth: '100%'}}>
      <Stack direction="horizontal" gap={5} wrap="wrap">
        <Stack direction="vertical" gap={2}>
          <Text type="label">attached (default)</Text>
          <TextInput
            label="Email"
            value={attached}
            onChange={setAttached}
            placeholder="you@example.com"
            statusVariant="attached"
            status={{
              type: 'error',
              message: 'Please enter a valid email address.',
            }}
          />
          <Text type="supporting">
            Message overlaps directly below the input.
          </Text>
        </Stack>
        <Stack direction="vertical" gap={2}>
          <Text type="label">detached</Text>
          <TextInput
            label="Email"
            value={detached}
            onChange={setDetached}
            placeholder="you@example.com"
            statusVariant="detached"
            status={{
              type: 'error',
              message: 'Please enter a valid email address.',
            }}
          />
          <Text type="supporting">
            Message floats below as a separate element with spacing.
          </Text>
        </Stack>
      </Stack>
    </div>
  );
}
