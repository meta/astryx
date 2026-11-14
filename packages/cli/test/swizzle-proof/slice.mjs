// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file slice.mjs
 * @input A slice index and the slice count
 * @output One Vitest case that runs that slice of the swizzle proof
 *   (spec:AST-110 FR7). It prints each step's time, and fails with
 *   each target's failure.
 * @position Shared by the swizzle-proof.<n>.test.mjs files, one per slice,
 *   so CI runs one per leg of its swizzle-proof job
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

import {runSlice} from './proof.mjs';
import {notRendered} from './samples.mjs';

/** @param {number} index @param {number} count */
export function proveSlice(index, count) {
  describe(`swizzle proof, slice ${index + 1} of ${count}`, () => {
    it('ejects, type-checks, bundles and renders each affected target', async () => {
      const project = fs.mkdtempSync(
        path.join(os.tmpdir(), 'astryx-swizzle-proof-'),
      );
      try {
        const run = await runSlice({
          index,
          count,
          notRendered,
          project,
          all: process.env.SWIZZLE_PROOF_ALL === '1',
          browser: process.env.SWIZZLE_PROOF_BROWSER === '1',
        });
        const failures = run.results.filter(r => r.failure);
        console.log(
          `SWIZZLE_PROOF ${JSON.stringify({
            slice: `${index + 1}/${count}`,
            offered: run.offered,
            affected: run.affected,
            reason: run.reason,
            failed: failures.length,
            timings: run.timings,
            totalMs: run.totalMs,
          })}`,
        );
        for (const r of failures) {
          console.log(
            `SWIZZLE_PROOF_FAIL ${r.key} [${r.failure.step}] ${r.failure.error}`,
          );
        }
        expect(run.results.length).toBe(run.affected);
        expect(
          failures.map(r => `${r.key} [${r.failure.step}] ${r.failure.error}`),
          'swizzle proof failures (spec:AST-110 FR7)',
        ).toEqual([]);
      } finally {
        fs.rmSync(project, {recursive: true, force: true});
      }
    }, 600_000);
  });
}
