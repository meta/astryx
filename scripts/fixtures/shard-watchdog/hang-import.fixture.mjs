// Copyright (c) Meta Platforms, Inc. and affiliates.

// A test file that never finishes loading, so the shard watchdog has a file
// stuck at module level to name.
import {it} from 'vitest';

await new Promise(() => {});

it('never collected', () => {});
