// Copyright (c) Meta Platforms, Inc. and affiliates.

// A test that finishes at once, so the watchdog records a time for it.
import {expect, it} from 'vitest';

it('finishes', () => expect(1 + 1).toBe(2));
