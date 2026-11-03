// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file swipeLayerLoaded.ts
 * @input Item's lazily loaded swipe layer (ItemSwipeLayer.tsx)
 * @output swipeLayerLoaded, which resolves once that layer has loaded and React
 *   has rendered it into every row that waits for it
 * @position Test helper for Item's and List's swipe tests
 *
 * On a loaded machine the load can outlast any fixed wait, so a test that
 * polls for a panel on a clock reads nothing. This awaits the module inside
 * `act`. `act` then renders what the load let through.
 */

import {act} from '@testing-library/react';

export async function swipeLayerLoaded(): Promise<void> {
  await act(async () => {
    await import('../ItemSwipeLayer');
  });
}
