// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Divider} from '@astryxdesign/core/Divider';
import {Stack} from '@astryxdesign/core/Layout';

export default function DividerShowcase() {
  return (
    <Stack direction="vertical" gap={4} style={{width: 500, maxWidth: '100%'}}>
      <Divider variant="subtle" />
      <Divider variant="strong" />
      <Divider label="or" />
    </Stack>
  );
}
