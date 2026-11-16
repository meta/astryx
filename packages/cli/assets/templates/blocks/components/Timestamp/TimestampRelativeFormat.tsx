// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useSyncExternalStore} from 'react';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

// The server markup and the render that hydrates it share one fixed instant,
// so they match; the browser's clock takes over right after hydration.
const HYDRATION_NOW = Date.UTC(2026, 0, 1) / 1000;
const subscribeToNothing = () => () => {};
let clientNow: number | undefined;
const getClientNow = () => (clientNow ??= Date.now() / 1000);
const getHydrationNow = () => HYDRATION_NOW;

export default function TimestampRelativeFormat() {
  const now = useSyncExternalStore(
    subscribeToNothing,
    getClientNow,
    getHydrationNow,
  );
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
