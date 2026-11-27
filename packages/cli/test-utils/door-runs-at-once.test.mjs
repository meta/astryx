// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How many example runs a door-conformance file starts at a time
 * (doorRunsAtOnce): never more than CI's 4 or the box's cores, and 2 on a box
 * that other work keeps busy.
 */

import {describe, expect, it} from 'vitest';
import {doorRunsAtOnce} from './door-conformance.mjs';

describe('doorRunsAtOnce', () => {
  it('runs 4 at a time on a quiet box of 4 cores or more', () => {
    for (const cores of [4, 16, 64, 174])
      expect(doorRunsAtOnce({cores, load: 0}), `${cores} cores`).toBe(4);
    expect(doorRunsAtOnce({cores: 2, load: 0})).toBe(2);
  });

  it('still runs 4 on a CI leg that its own workers keep busy', () => {
    // A 4-core runner with Vitest's 3 workers and their children.
    expect(doorRunsAtOnce({cores: 4, load: 4})).toBe(4);
  });

  it('runs fewer as other work loads the box, down to 2', () => {
    expect(doorRunsAtOnce({cores: 4, load: 5})).toBe(3);
    expect(doorRunsAtOnce({cores: 4, load: 6})).toBe(2);
    expect(doorRunsAtOnce({cores: 4, load: 8})).toBe(2);
    // A many-core box under heavy load (70 to 89), which ran 16.
    expect(doorRunsAtOnce({cores: 32, load: 80})).toBe(2);
    expect(doorRunsAtOnce({cores: 48, load: 80})).toBe(2);
  });

  it("never runs more than 4 or the box's cores, nor fewer than 2", () => {
    for (const cores of [1, 2, 4, 8, 32, 174])
      for (const load of [0, 0.5, 3, 10, 50, 200]) {
        const n = doorRunsAtOnce({cores, load});
        expect(n, `${cores} cores, load ${load}`).toBeGreaterThanOrEqual(2);
        expect(n, `${cores} cores, load ${load}`).toBeLessThanOrEqual(
          Math.max(2, Math.min(4, cores)),
        );
      }
  });
});
