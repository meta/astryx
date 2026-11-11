// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file swipeLayerLoaded.ts
 *
 * @input The swipe layer Item's deprecated path loads
 *   (Swipe/DeprecatedSwipeLayer.tsx), and optionally a row that renders it
 * @output swipeLayerLoaded, which resolves once that layer has loaded and React
 *   has committed its panel (in `row`, when one is given)
 * @position Test helper for Item's and List's tests of the deprecated swipe
 *   props
 *
 * On a loaded machine the load can outlast any fixed wait, so this awaits the
 * module inside `act`, with no clock. React can commit the panel after that
 * `act` returns, so the helper then waits for the panel itself. A row given
 * `swipe` needs no wait: `createSwipe` brings its layer.
 */

import {act, waitFor} from '@testing-library/react';

export async function swipeLayerLoaded(row?: Element): Promise<void> {
  await act(async () => {
    await import('../../Swipe/DeprecatedSwipeLayer');
  });
  if (row == null) {
    return;
  }
  await waitFor(() => {
    if (row.querySelector('[data-swipe-panel]') == null) {
      throw new Error(
        'the swipe layer loaded, but its panel never committed in this row',
      );
    }
  });
}
