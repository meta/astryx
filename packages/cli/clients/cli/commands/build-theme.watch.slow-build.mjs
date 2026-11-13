// Copyright (c) Meta Platforms, Inc. and affiliates.

// Preloaded through NODE_OPTIONS by build-theme.watch.test.mjs: each theme
// build child waits before it builds, as a loaded machine makes a rebuild slow.
// The watcher process itself (its arguments name --watch) does not wait.
if (!process.argv.includes('--watch')) {
  const ms = Number(process.env.ASTRYX_TEST_BUILD_DELAY_MS ?? 1500);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
