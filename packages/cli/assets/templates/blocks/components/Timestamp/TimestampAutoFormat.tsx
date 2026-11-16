// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState, useSyncExternalStore} from 'react';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

// The server markup and the render that hydrates it share one fixed instant,
// so they match. After hydration each mount reads the browser's clock once.
const HYDRATION_NOW = Date.UTC(2026, 0, 1) / 1000;
const subscribeToNothing = () => () => {};
const isHydratingOnClient = () => false;
const isHydratingOnServer = () => true;

export default function TimestampAutoFormat() {
  const isHydrating = useSyncExternalStore(
    subscribeToNothing,
    isHydratingOnClient,
    isHydratingOnServer,
  );
  const [mountNow] = useState(() => Date.now() / 1000);
  const now = isHydrating ? HYDRATION_NOW : mountNow;
  return (
    <Stack direction="vertical" gap={4}>
      <Stack direction="vertical" gap={1}>
        <Text type="supporting" color="secondary">
          Recent — renders as relative
        </Text>
        <Stack direction="horizontal" gap={4} vAlign="center">
          <Timestamp value={now - 300} format="auto" color="primary" />
          <Timestamp value={now - 7200} format="auto" color="primary" />
          <Timestamp value={now - 86400} format="auto" color="primary" />
        </Stack>
      </Stack>
      <Stack direction="vertical" gap={1}>
        <Text type="supporting" color="secondary">
          Older than 7 days — renders as date_time
        </Text>
        <Stack direction="horizontal" gap={4} vAlign="center">
          <Timestamp
            value="2025-01-15T09:30:00Z"
            format="auto"
            color="primary"
          />
          <Timestamp
            value="2024-06-01T14:00:00Z"
            format="auto"
            color="primary"
          />
        </Stack>
      </Stack>
    </Stack>
  );
}
