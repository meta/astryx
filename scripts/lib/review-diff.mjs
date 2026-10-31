// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Read the shipped source lines a change adds.
 * @input A unified diff (`git diff` output).
 * @output Each added line of shipped source with its file and new line number,
 *   and every changed path.
 * @position Shared by `pnpm specs:for --diff` and
 *   `scripts/review-global-baselines.mjs`, which match these lines against the
 *   `concerns` the owning records declare (`architecture:knowledge-contracts/INV20`).
 */

/** Source files whose added lines can change what a product runs. */
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;

/**
 * Tests, stories and fixtures exercise shipped code but are not shipped, so a
 * listener a test adds re-implements nothing.
 */
const NOT_SHIPPED =
  /(?:^|\/)(?:__tests__|__fixtures__|__mocks__)\/|\.(?:test|spec|stories)\.[cm]?[jt]sx?$/;

export function isShippedSource(file) {
  return SOURCE_FILE.test(file) && !NOT_SHIPPED.test(file);
}

/** Parse a unified diff into its changed paths and added lines. */
export function readDiff(diffText) {
  const files = [];
  const addedLines = [];
  let file = null;
  let newLine = 0;
  for (const line of diffText.split('\n')) {
    const header = /^diff --git a\/\S+ b\/(\S+)/.exec(line);
    if (header) {
      file = header[1];
      files.push(file);
      continue;
    }
    if (line.startsWith('+++ ') || line.startsWith('--- ')) continue;
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (file == null) continue;
    if (line.startsWith('+')) {
      if (isShippedSource(file)) {
        addedLines.push({file, line: newLine, text: line.slice(1)});
      }
      newLine += 1;
    } else if (line.startsWith(' ')) {
      newLine += 1;
    }
  }
  return {files, addedLines};
}
