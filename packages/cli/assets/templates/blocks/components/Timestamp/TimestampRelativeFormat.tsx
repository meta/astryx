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

export default function TimestampRelativeFormat() {
  const isHydrating = useSyncExternalStore(
    subscribeToNothing,
    isHydratingOnClient,
    isHydratingOnServer,
  );
  const [mountNow] = useState(() => Date.now() / 1000);
  const now = isHydrating ? HYDRATION_NOW : mountNow;
  return (
    <Stack direction="vertical" gap={3}>
      <Text type="supporting" color="secondary">
        Relative timestamps (hover for full date)
      </Text>
      <Stack direction="vertical" gap={2}>
        <Timestamp value={now - 5} format="relative" color="primary" />
        <Timestamp value={now - 120} format="relative" color="primary" />
        <Timestamp value={now - 3600} format="relative" color="primary" />
        <Timestamp value={now - 86400} format="relative" color="primary" />
        <Timestamp value={now - 259200} format="relative" color="primary" />
        <Timestamp value={now - 90 * 86400} format="relative" color="primary" />
      </Stack>
    </Stack>
  );
}
