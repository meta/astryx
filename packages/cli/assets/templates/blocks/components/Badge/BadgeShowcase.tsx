// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Badge} from '@astryxdesign/core/Badge';
import {Stack} from '@astryxdesign/core/Layout';

export default function BadgeShowcase() {
  return (
    <Stack direction="vertical" gap={4} hAlign="center">
      <Stack direction="horizontal" gap={2} wrap="wrap">
        <Badge label="Neutral" variant="neutral" />
        <Badge label="Info" variant="info" />
        <Badge label="Success" variant="success" />
        <Badge label="Warning" variant="warning" />
        <Badge label="Error" variant="error" />
      </Stack>
      <Stack direction="horizontal" gap={2} wrap="wrap">
        <Badge label="Blue" variant="blue" />
        <Badge label="Purple" variant="purple" />
        <Badge label="Pink" variant="pink" />
        <Badge label="Teal" variant="teal" />
        <Badge label="Orange" variant="orange" />
      </Stack>
    </Stack>
  );
}
