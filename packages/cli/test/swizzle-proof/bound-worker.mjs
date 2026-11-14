// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file bound-worker.mjs
 * @input workerData `{relevant, count}`: the change's component source files
 *   and the number of slices
 * @output Two messages: `{listed: true}` once the targets are listed, then
 *   `{held}`: for each slice, how many of its targets ({@link sliceOf}) the
 *   change can affect ({@link affectedBound})
 * @position Run in a worker by scripts/vitest-shard-sequencer.mjs, so the
 *   Node legs' split can stop waiting at its time budget
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parentPort, workerData} from 'node:worker_threads';

import {affectedBound, createProject, listTargets, sliceOf} from './proof.mjs';

const project = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-swizzle-bound-'));
try {
  createProject(project);
  const targets = await listTargets(project);
  parentPort?.postMessage({listed: true});
  const affected = affectedBound(targets, workerData.relevant);
  parentPort?.postMessage({
    held: Array.from(
      {length: workerData.count},
      (_, index) =>
        sliceOf(targets, index, workerData.count).filter(t =>
          affected.has(t.key),
        ).length,
    ),
  });
} finally {
  fs.rmSync(project, {recursive: true, force: true});
}
