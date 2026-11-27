// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The Vitest worker count on a machine (testWorkers): CI's 4-core
 *   runners keep 3, a many-core machine runs at most 8, and a machine with
 *   little memory runs one worker per 2 GiB.
 */

import {describe, expect, it} from 'vitest';
import config from '../vitest.config.ts';
import {MOST_WORKERS, testWorkers} from './vitest-workers.mjs';

const GiB = 1024 ** 3;

describe('testWorkers', () => {
  it('keeps 3 workers on a 4-core CI runner', () => {
    expect(testWorkers({cores: 4, memory: 16 * GiB})).toBe(3);
  });

  it('runs at most 8 on a many-core machine', () => {
    for (const cores of [10, 16, 40, 174])
      expect(testWorkers({cores, memory: 256 * GiB}), `${cores} cores`).toBe(
        MOST_WORKERS,
      );
  });

  it('runs one worker per 2 GiB of memory when memory is short', () => {
    expect(testWorkers({cores: 40, memory: 8 * GiB})).toBe(4);
    expect(testWorkers({cores: 40, memory: 5 * GiB})).toBe(2);
  });

  it('runs at least one worker', () => {
    expect(testWorkers({cores: 1, memory: 16 * GiB})).toBe(1);
    expect(testWorkers({cores: 8, memory: 1 * GiB})).toBe(1);
  });

  it('is the root maxWorkers, which every project uses', () => {
    // A project with its own maxWorkers would differ from the others in the
    // same group, which Vitest refuses, and would hide a --maxWorkers flag.
    expect(config.test?.maxWorkers).toBe(testWorkers());
    for (const project of config.test?.projects ?? []) {
      if (typeof project !== 'object' || !('test' in project)) continue;
      expect(project.test?.maxWorkers, project.test?.name).toBeUndefined();
    }
  });
});
