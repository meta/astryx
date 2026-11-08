// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Read the shipped source lines a change adds.
 * @input A unified diff (`git diff` output).
 * @output Each added line of shipped source with its file and new line number,
 *   every added line of any file with its file and new line number, every
 *   changed path, every added line of each path, and the count of added and
 *   removed lines of each path.
 * @position Shared by `pnpm specs:for --diff`, the public text check in Lint
 *   and `scripts/review-global-baselines.mjs`, which match these lines against the
 *   `concerns` the owning records declare (`architecture:knowledge-contracts/INV20`).
 */

import {Buffer} from 'node:buffer';

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
 * keeps shipped source only; `everyAddedLine` keeps every added line of any
 * file, with its new line number; `addedByFile` keeps every added line of each path;
 * `changedCountByFile` counts the added and removed lines of each path.
 */
/**
 * The path in a `--- a/…` or `+++ b/…` header. Git quotes a path with special
 * bytes (`"b/caf\303\251.md"`); the quotes and octal escapes are undone.
 */
function headerPath(rest, side) {
  // Git ends a header path that holds a space with a tab.
  let value = rest.replace(/\t$/, '');
  if (value.startsWith('"') && value.endsWith('"')) {
    const bytes = [];
    const inner = value.slice(1, -1);
    for (let i = 0; i < inner.length; i += 1) {
      if (inner[i] === '\\' && /[0-7]{3}/.test(inner.slice(i + 1, i + 4))) {
        bytes.push(parseInt(inner.slice(i + 1, i + 4), 8));
        i += 3;
      } else if (inner[i] === '\\' && i + 1 < inner.length) {
        const escaped = {n: '\n', t: '\t', '"': '"', '\\': '\\'}[inner[i + 1]];
        bytes.push(...Buffer.from(escaped ?? inner[i + 1]));
        i += 1;
      } else {
        bytes.push(...Buffer.from(inner[i]));
      }
    }
    value = Buffer.from(bytes).toString('utf8');
  }
  return value.startsWith(`${side}/`) ? value.slice(2) : null;
}

export function readDiff(diffText) {
  const files = [];
  const addedLines = [];
  const everyAddedLine = [];
  const addedByFile = {};
  const changedCountByFile = {};
  // True when a hunk comes before its file's path could be read.
  let unreadable = false;
  let file = null;
  let oldFile = null;
  let newLine = 0;
  let inHunk = false;
  const open = name => {
    file = name;
    if (!files.includes(name)) files.push(name);
    addedByFile[name] ??= [];
    changedCountByFile[name] ??= 0;
  };
  for (const line of diffText.split('\n')) {
    // Every `diff --git` line starts a file. Its path comes from the `+++`
    // header (or `---` for a deleted file); the `diff --git` line itself
    // cannot be split when a path holds a space. A diff with no headers (a
    // pure rename, a mode or binary change) keeps the simple-path reading.
    if (line.startsWith('diff --git ')) {
      file = null;
      oldFile = null;
      inHunk = false;
      const simple = /^diff --git a\/(\S+) b\/(\S+)$/.exec(line);
      if (simple) open(simple[2]);
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      newLine = Number(hunk[1]);
      inHunk = file != null;
      if (file == null) unreadable = true;
      continue;
    }
    // Before the first hunk, `---` and `+++` lines are file headers. Inside a
    // hunk, they are content.
    if (!inHunk) {
      if (line.startsWith('--- ')) oldFile = headerPath(line.slice(4), 'a');
      else if (line.startsWith('+++ ')) {
        const name =
          line.slice(4) === '/dev/null'
            ? oldFile
            : headerPath(line.slice(4), 'b');
        if (name != null) open(name);
      }
      continue;
    }
    if (line.startsWith('+')) {
      addedByFile[file].push(line.slice(1));
      everyAddedLine.push({file, line: newLine, text: line.slice(1)});
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
  return {
    files,
    addedLines,
    everyAddedLine,
    addedByFile,
    changedCountByFile,
    unreadable,
  };
}
