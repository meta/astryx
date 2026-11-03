// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Read the shipped source lines a change adds.
 * @input A unified diff (`git diff` output).
 * @output Each added line of shipped source with its file and new line number,
 *   every changed path, every added line of each path, and the count of added
 *   and removed lines of each path.
 * @position Shared by `pnpm specs:for --diff` and
 *   `scripts/review-global-baselines.mjs`, which match these lines against the
 *   `concerns` the owning records declare (`architecture:knowledge-contracts/INV20`).
 */

/** Source files whose added lines can change what a product runs. */
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;

/**
 * Tests, stories and fixtures (`*.fixtures.ts`, `fixtures/`) exercise shipped
 * code but are not shipped, so a listener a test adds re-implements nothing.
 */
const NOT_SHIPPED =
  /(?:^|\/)(?:__tests__|__fixtures__|__mocks__|fixtures)\/|\.(?:test|spec|stories|fixtures?)\.[cm]?[jt]sx?$/;

export function isShippedSource(file) {
  return SOURCE_FILE.test(file) && !NOT_SHIPPED.test(file);
}

/**
 * Parse a unified diff into its changed paths and added lines. `addedLines`
 * keeps shipped source only; `addedByFile` keeps every added line of each path;
 * `changedCountByFile` counts the added and removed lines of each path.
 */
export function readDiff(diffText) {
  const files = [];
  const addedLines = [];
  const addedByFile = {};
  const changedCountByFile = {};
  let file = null;
  let newLine = 0;
  let inHunk = false;
  for (const line of diffText.split('\n')) {
    const header = /^diff --git a\/\S+ b\/(\S+)/.exec(line);
    if (header) {
      file = header[1];
      files.push(file);
      addedByFile[file] ??= [];
      changedCountByFile[file] ??= 0;
      inHunk = false;
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      newLine = Number(hunk[1]);
      inHunk = file != null;
      continue;
    }
    // Before the first hunk, `---` and `+++` lines are file headers. Inside a
    // hunk, they are content.
    if (!inHunk) continue;
    if (line.startsWith('+')) {
      addedByFile[file].push(line.slice(1));
      changedCountByFile[file] += 1;
      if (isShippedSource(file)) {
        addedLines.push({file, line: newLine, text: line.slice(1)});
      }
      newLine += 1;
    } else if (line.startsWith('-')) {
      changedCountByFile[file] += 1;
    } else if (line.startsWith(' ')) {
      newLine += 1;
    }
  }
  return {files, addedLines, addedByFile, changedCountByFile};
}
