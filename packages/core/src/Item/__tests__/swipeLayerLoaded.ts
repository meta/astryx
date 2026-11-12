// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file swipeLayerLoaded.ts
 * @input Item's lazily loaded swipe layer (ItemSwipeLayer.tsx) and a row that
 *   renders it
 * @output swipeLayerLoaded, which resolves once that layer has loaded and React
 *   has committed its panel in the row
 * @position Test helper for Item's and List's swipe tests
 *
 * On a loaded machine the load can outlast any fixed wait, so this awaits the
 * module inside `act`, with no clock. React can commit the panel after that
 * `act` returns, so the helper then waits for the panel itself.
 */

import {act, waitFor} from '@testing-library/react';

export async function swipeLayerLoaded(row: Element): Promise<void> {
  await act(async () => {
    await import('../ItemSwipeLayer');
  });
  await waitFor(() => {
    if (row.querySelector('[data-swipe-panel]') == null) {
      throw new Error(
        'the swipe layer loaded, but its panel never committed in this row',
      );
    }
  });
}
