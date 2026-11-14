// Copyright (c) Meta Platforms, Inc. and affiliates.

// A test that never finishes, so the shard watchdog has a stuck file to name.
import {it} from 'vitest';

it('never finishes', () => new Promise(() => {}));
