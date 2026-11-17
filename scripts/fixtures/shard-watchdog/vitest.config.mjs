// Copyright (c) Meta Platforms, Inc. and affiliates.

// The shard watchdog's own test runs these fixtures; no project of the
// repository's Vitest config includes this folder.
import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['*.fixture.mjs'],
    testTimeout: 120_000,
  },
});
