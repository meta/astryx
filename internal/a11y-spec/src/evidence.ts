// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file evidence.ts
 * @input Uses node:fs
 * @output `resetAuditEvidence`, the evidence folder for one copy of an audit
 *   file, emptied and created
 * @position Binding infrastructure for the Playwright audit specs: where a
 *   spec writes its screenshots and receipts.
 */

import fs from 'node:fs';

/**
 * Empty and create this copy's evidence folder, and return it. The first copy
 * of a file keeps `folder`, which CI uploads and audit pull requests read.
 * Each further `--repeat-each` copy can run at the same time in another
 * worker, so it gets `<folder>-repeat-<n>`. No copy deletes or counts
 * another copy's receipts.
 */
export function resetAuditEvidence(
  folder: string,
  copy: {readonly repeatEachIndex: number},
): string {
  const own =
    copy.repeatEachIndex === 0
      ? folder
      : `${folder}-repeat-${copy.repeatEachIndex}`;
  fs.rmSync(own, {recursive: true, force: true});
  fs.mkdirSync(own, {recursive: true});
  return own;
}
