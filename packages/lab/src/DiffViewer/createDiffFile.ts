// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createDiffFile.ts
 * @input Two versions of a text (old and new) plus optional paths
 * @output Exports createDiffFile(options) → DiffViewerFile and
 *   CreateDiffFileOptions
 * @position Lab utility; computes a line diff (Myers) when the caller has two
 *   texts rather than a patch
 *
 * Shared leading and trailing lines are matched without a search. The minimal
 * search over the rest stops after MAX_EDIT_DISTANCE changed lines, so memory
 * stays bounded for any input; a middle that differs more than that becomes
 * one replaced block, marked with `isReplacedBlock` on its hunk.
 *
 * SYNC: When modified, update:
 * - /packages/lab/src/DiffViewer/createDiffFile.test.ts
 * - /packages/lab/src/DiffViewer/DiffViewer.doc.mjs (utilities section)
 */

import type {
  DiffViewerFile,
  DiffViewerFileStatus,
  DiffViewerHunk,
  DiffViewerLine,
} from './diffTypes';

export interface CreateDiffFileOptions {
  /** The original text. */
  oldValue: string;
  /** The changed text. */
  newValue: string;
  /**
   * Path of the file on both sides. `oldPath` / `newPath` take precedence
   * when they are given.
   */
  path?: string;
  /** Path before the change; pass `null` to mark the file as added. */
  oldPath?: string | null;
  /** Path after the change; pass `null` to mark the file as deleted. */
  newPath?: string | null;
  /**
   * Unchanged lines kept around each change. Changes closer together than
   * twice this share one hunk. `NaN` falls back to the default.
   * @default 3
   */
  contextLines?: number;
}

type Op =
  | {kind: 'context'; a: number; b: number}
  | {kind: 'removed'; a: number}
  | {kind: 'added'; b: number};

function splitLines(value: string): string[] {
  if (value === '') {
    return [];
  }
  const lines = value.split('\n').map(line => line.replace(/\r$/, ''));
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

/**
 * Most changed lines the minimal search explores before giving up. The trace
 * it keeps grows with the square of this, so the cap bounds memory to a few
 * megabytes; past it the changed middle is shown as one replaced block.
 */
const MAX_EDIT_DISTANCE = 2000;

interface EditScript {
  ops: Op[];
  /** True when the middle was replaced as a whole, not compared line by line. */
  isReplacedBlock: boolean;
}

/**
 * Line edit script from `a` to `b`. Shared leading and trailing lines are
 * context without a search; the middle uses Myers' O(ND) shortest edit script,
 * or, when it needs more than MAX_EDIT_DISTANCE edits, removes the old middle
 * and adds the new one.
 */
function diffLines(a: string[], b: string[]): EditScript {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) {
    head++;
  }
  let tailA = a.length;
  let tailB = b.length;
  while (tailA > head && tailB > head && a[tailA - 1] === b[tailB - 1]) {
    tailA--;
    tailB--;
  }

  const ops: Op[] = [];
  for (let i = 0; i < head; i++) {
    ops.push({kind: 'context', a: i, b: i});
  }
  // When one side of the middle is empty, adding or removing the other side
  // is already the minimal script.
  const isOneSided = tailA === head || tailB === head;
  const middle = isOneSided ? null : myers(a, b, head, tailA, tailB);
  if (middle != null) {
    // A loop, not a spread: one call argument per op overflows the stack on
    // long inputs.
    for (const op of middle) {
      ops.push(op);
    }
  } else {
    for (let i = head; i < tailA; i++) {
      ops.push({kind: 'removed', a: i});
    }
    for (let j = head; j < tailB; j++) {
      ops.push({kind: 'added', b: j});
    }
  }
  for (let i = 0; tailA + i < a.length; i++) {
    ops.push({kind: 'context', a: tailA + i, b: tailB + i});
  }
  return {ops, isReplacedBlock: middle == null && !isOneSided};
}

/**
 * Myers' shortest edit script over `a[start, endA)` and `b[start, endB)`,
 * with absolute indexes in the ops; null when it needs more than
 * MAX_EDIT_DISTANCE edits.
 */
function myers(
  a: string[],
  b: string[],
  start: number,
  endA: number,
  endB: number,
): Op[] | null {
  const n = endA - start;
  const m = endB - start;
  const max = n + m;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  // trace[d] holds diagonals -d..d of v as it was before step d.
  const trace: Int32Array[] = [];

  outer: for (let d = 0; d <= max; d++) {
    if (d > MAX_EDIT_DISTANCE) {
      return null;
    }
    trace.push(v.slice(offset - d, offset + d + 1));
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])
          ? v[offset + k + 1]
          : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[start + x] === b[start + y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        break outer;
      }
    }
  }

  const ops: Op[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vd = trace[d];
    // Outside the stored window (only k = 1 at d = 0) v was still zero.
    const at = (k: number) => vd[k + d] ?? 0;
    const k = x - y;
    const prevK =
      k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
      ops.push({kind: 'context', a: start + x, b: start + y});
    }
    if (d > 0) {
      if (x === prevX) {
        ops.push({kind: 'added', b: start + prevY});
      } else {
        ops.push({kind: 'removed', a: start + prevX});
      }
    }
    x = prevX;
    y = prevY;
  }
  ops.reverse();
  return ops;
}

function formatRange(start: number, count: number): string {
  return count === 1 ? `${start}` : `${start},${count}`;
}

/**
 * Compute a {@link DiffViewerFile} from two versions of a text, for callers
 * that hold file contents rather than a patch.
 *
 * @example
 * ```
 * const file = createDiffFile({oldValue: before, newValue: after, path: 'src/app.ts'});
 * <DiffViewer file={file} />
 * ```
 */
export function createDiffFile({
  oldValue,
  newValue,
  path,
  oldPath: oldPathOption,
  newPath: newPathOption,
  contextLines = 3,
}: CreateDiffFileOptions): DiffViewerFile {
  const oldPath = oldPathOption === undefined ? (path ?? null) : oldPathOption;
  const newPath = newPathOption === undefined ? (path ?? null) : newPathOption;
  const context = Number.isNaN(contextLines)
    ? 3
    : Math.max(0, Math.floor(contextLines));

  let status: DiffViewerFileStatus = 'modified';
  if (oldPathOption === null) {
    status = 'added';
  } else if (newPathOption === null) {
    status = 'deleted';
  } else if (oldPath != null && newPath != null && oldPath !== newPath) {
    status = 'renamed';
  }

  const a = splitLines(oldValue);
  const b = splitLines(newValue);
  const {ops, isReplacedBlock} = diffLines(a, b);

  const changed: number[] = [];
  ops.forEach((op, i) => {
    if (op.kind !== 'context') {
      changed.push(i);
    }
  });

  const hunks: DiffViewerHunk[] = [];
  let g = 0;
  while (g < changed.length) {
    let last = changed[g];
    let h = g + 1;
    while (h < changed.length && changed[h] - last - 1 <= context * 2) {
      last = changed[h];
      h++;
    }
    const start = Math.max(0, changed[g] - context);
    const end = Math.min(ops.length - 1, last + context);

    const lines: DiffViewerLine[] = [];
    let oldCount = 0;
    let newCount = 0;
    for (let i = start; i <= end; i++) {
      const op = ops[i];
      if (op.kind === 'context') {
        lines.push({
          kind: 'context',
          content: a[op.a],
          oldLineNumber: op.a + 1,
          newLineNumber: op.b + 1,
        });
        oldCount++;
        newCount++;
      } else if (op.kind === 'removed') {
        lines.push({
          kind: 'removed',
          content: a[op.a],
          oldLineNumber: op.a + 1,
          newLineNumber: null,
        });
        oldCount++;
      } else {
        lines.push({
          kind: 'added',
          content: b[op.b],
          oldLineNumber: null,
          newLineNumber: op.b + 1,
        });
        newCount++;
      }
    }

    // Lines of each side that come before this hunk.
    let oldBefore = 0;
    let newBefore = 0;
    for (let i = 0; i < start; i++) {
      const op = ops[i];
      if (op.kind !== 'added') {
        oldBefore++;
      }
      if (op.kind !== 'removed') {
        newBefore++;
      }
    }
    // Unified convention: an empty side's start is the line before the hunk.
    const oldStart = oldCount === 0 ? oldBefore : oldBefore + 1;
    const newStart = newCount === 0 ? newBefore : newBefore + 1;

    hunks.push({
      header: `@@ -${formatRange(oldStart, oldCount)} +${formatRange(newStart, newCount)} @@`,
      oldStart,
      oldLines: oldCount,
      newStart,
      newLines: newCount,
      lines,
      // A replaced block is the only change, so it fills the only hunk.
      ...(isReplacedBlock ? {isReplacedBlock: true} : {}),
    });
    g = h;
  }

  return {
    oldPath: status === 'added' ? null : oldPath,
    newPath: status === 'deleted' ? null : newPath,
    status,
    isBinary: false,
    hunks,
  };
}
