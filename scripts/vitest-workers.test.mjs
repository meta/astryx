// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The Vitest worker count on a machine (testWorkers): a CI runner keeps
 *   Vitest's default, a shared many-core machine runs at most 8, and a shared
 *   machine with little memory runs one worker per 2 GiB.
 */

import {describe, expect, it} from 'vitest';
import config from '../vitest.config.ts';
import {MOST_WORKERS, testWorkers} from './vitest-workers.mjs';

const GiB = 1024 ** 3;

/** A shared machine: CI unset. */
const shared = {env: {}};

describe('testWorkers', () => {
  it("leaves a CI runner to Vitest's default, whatever its size", () => {
    for (const cores of [4, 24, 40])
      for (const ci of ['true', '1'])
        expect(
          testWorkers({cores, memory: 256 * GiB, env: {CI: ci}}),
          `${cores} cores, CI=${ci}`,
        ).toBeUndefined();
  });

  it('caps a run where CI is unset, empty, "0" or "false"', () => {
    expect(testWorkers({cores: 40, memory: 256 * GiB, env: {}})).toBe(
      MOST_WORKERS,
    );
    for (const ci of ['', '0', 'false'])
      expect(
        testWorkers({cores: 40, memory: 256 * GiB, env: {CI: ci}}),
        `CI=${ci}`,
      ).toBe(MOST_WORKERS);
  });

  it('keeps 3 workers on a shared 4-core machine', () => {
    expect(testWorkers({cores: 4, memory: 16 * GiB, ...shared})).toBe(3);
  });

  it('runs at most 8 on a shared many-core machine', () => {
    for (const cores of [10, 16, 40, 174])
      expect(
        testWorkers({cores, memory: 256 * GiB, ...shared}),
        `${cores} cores`,
      ).toBe(MOST_WORKERS);
  });

  it('runs one worker per 2 GiB of memory when memory is short', () => {
    expect(testWorkers({cores: 40, memory: 8 * GiB, ...shared})).toBe(4);
    expect(testWorkers({cores: 40, memory: 5 * GiB, ...shared})).toBe(2);
  });

  it('runs at least one worker', () => {
    expect(testWorkers({cores: 1, memory: 16 * GiB, ...shared})).toBe(1);
    expect(testWorkers({cores: 8, memory: 1 * GiB, ...shared})).toBe(1);
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
