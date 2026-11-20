// Copyright (c) Meta Platforms, Inc. and affiliates.

// A test file that spends 1.5 s loading before a quick test, so the watchdog's
// recorded time can be checked to leave the loading out.
import {expect, it} from 'vitest';

await new Promise(resolve => setTimeout(resolve, 1500));

it('finishes', () => expect(1 + 1).toBe(2));
