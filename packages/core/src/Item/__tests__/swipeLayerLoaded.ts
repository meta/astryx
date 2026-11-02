// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file swipeLayerLoaded.ts
 * @input The swipe layer Item's deprecated path loads
 *   (Swipe/DeprecatedSwipeLayer.tsx)
 * @output swipeLayerLoaded, which resolves once that layer has loaded and React
 *   has rendered it into every row that waits for it
 * @position Test helper for Item's and List's tests of the deprecated swipe
 *   props
 *
 * Item loads the swipe layer of a row given the deprecated `swipeActions` with
 * `import()` the first time a row has them (`spec:AST-057` DEP-0017), and
 * renders the row's panels once that module is in. On a loaded machine the
 * load can take longer than any fixed wait, so a test that polls for a panel
 * on a clock (`waitFor`'s second) reads nothing. This awaits the module the
 * row's import loads, inside `act`, which then renders what the load let
 * through: the panels are in the DOM when it resolves, however long the load
 * took. A row given `swipe` needs no wait: `createSwipe` brings its layer.
 */

import {act} from '@testing-library/react';

export async function swipeLayerLoaded(): Promise<void> {
  await act(async () => {
    await import('../../Swipe/DeprecatedSwipeLayer');
  });
}
