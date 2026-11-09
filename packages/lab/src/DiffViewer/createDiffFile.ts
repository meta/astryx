// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createDiffFile.ts
 * @input Two versions of a text (old and new) plus optional paths
 * @output Exports createDiffFile(options) → DiffViewerFile and
 *   CreateDiffFileOptions
 * @position Lab utility; computes a line diff (Myers) when the caller has two
 *   texts rather than a patch
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
 * Most changed lines the search compares line by line; past it the changed
 * middle is shown as one replaced block. The search keeps a few arrays the
 * size of the input, so its memory does not grow with this limit.
 */
const MAX_EDIT_DISTANCE = 10_000;

/**
 * Most search work, counted as changed-middle lines times edits. The search
 * time grows with both, so a long file gets a lower edit limit. A file of up
 * to 50,000 lines keeps the full MAX_EDIT_DISTANCE.
 */
const MAX_SEARCH_WORK = 1_000_000_000;

/**
 * Most changed lines the traced search tries first. Most changes are small,
 * and for them the traced search is faster than the linear-space one. Its
 * trace grows with the square of the edits, so at this limit it stays near
 * 4 MB.
 */
const TRACED_SEARCH_LIMIT = 1000;

interface EditScript {
  ops: Op[];
  /** True when the middle was replaced as a whole, not compared line by line. */
  isReplacedBlock: boolean;
}

/**
 * Line edit script from `a` to `b`. Shared leading and trailing lines are
 * context without a search. The middle uses a shortest edit script, or, when
 * it needs more edits than the limit, removes the old middle and adds the new
 * one. The limit is MAX_EDIT_DISTANCE, lowered for a long middle so the work
 * stays under MAX_SEARCH_WORK. The traced search runs first; the linear-space
 * search takes over when the change is larger than TRACED_SEARCH_LIMIT.
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
  const editLimit = Math.min(
    MAX_EDIT_DISTANCE,
    Math.floor(MAX_SEARCH_WORK / (tailA - head + (tailB - head))),
  );
  const middle = isOneSided
    ? null
    : (tracedEditScript(
        a,
        b,
        head,
        tailA,
        tailB,
        Math.min(TRACED_SEARCH_LIMIT, editLimit),
      ) ?? shortestEditScript(a, b, head, tailA, tailB, editLimit));
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
 * Shortest edit script over `a[start, endA)` and `b[start, endB)`, with
 * absolute indexes in the ops; null when it needs more than `maxEdits` edits.
 *
 * This is Myers' O(ND) search in linear space. Each step searches forward
 * from the start and backward from the end at the same time until the two
 * searches meet. The meeting point is on a shortest path, so the step then
 * solves the part before it and the part after it. Lines are compared as
 * integer ids.
 */
function shortestEditScript(
  a: string[],
  b: string[],
  start: number,
  endA: number,
  endB: number,
  maxEdits: number,
): Op[] | null {
  const ids = new Map<string, number>();
  const toIds = (lines: string[], end: number) => {
    const out = new Int32Array(end - start);
    for (let i = start; i < end; i++) {
      let id = ids.get(lines[i]);
      if (id === undefined) {
        id = ids.size;
        ids.set(lines[i], id);
      }
      out[i - start] = id;
    }
    return out;
  };
  const oldIds = toIds(a, endA);
  const newIds = toIds(b, endB);

  // Each copy of a line that one side has more often than the other is an
  // edit, so this count is a lower bound on the edits. When it is past the
  // limit (a rewrite, for example), skip the search.
  const surplus = new Int32Array(ids.size);
  for (const id of oldIds) {
    surplus[id]++;
  }
  for (const id of newIds) {
    surplus[id]--;
  }
  let minEdits = 0;
  for (const count of surplus) {
    minEdits += Math.abs(count);
  }
  if (minEdits > maxEdits) {
    return null;
  }
  // The furthest x each search reached on diagonal k (x - y), stored at
  // index k + offset. The backward search counts x and y from the end.
  const offset = oldIds.length + newIds.length + 1;
  const forward = new Int32Array(2 * offset + 1);
  const backward = new Int32Array(2 * offset + 1);
  const ops: Op[] = [];

  // A point on a shortest path through the box, or null when the path needs
  // more than `limit` edits.
  const meetingPoint = (
    aLo: number,
    aHi: number,
    bLo: number,
    bHi: number,
    limit: number,
  ): [number, number] | null => {
    const n = aHi - aLo;
    const m = bHi - bLo;
    const delta = n - m;
    const isOdd = (delta & 1) !== 0;
    forward[offset + 1] = 0;
    backward[offset + 1] = 0;
    for (let d = 0; d <= Math.ceil((n + m) / 2); d++) {
      // Forward step d can find a path of 2d - 1 edits, backward step d one
      // of 2d edits.
      if (2 * d - 1 > limit) {
        return null;
      }
      for (let k = -d; k <= d; k += 2) {
        let x =
          k === -d ||
          (k !== d && forward[offset + k - 1] < forward[offset + k + 1])
            ? forward[offset + k + 1]
            : forward[offset + k - 1] + 1;
        let y = x - k;
        while (x < n && y < m && oldIds[aLo + x] === newIds[bLo + y]) {
          x++;
          y++;
        }
        forward[offset + k] = x;
        // The backward search has done d - 1 steps, so it holds diagonals
        // -(d - 1)..d - 1, in its own coordinates.
        const back = delta - k;
        if (
          isOdd &&
          x <= n &&
          y <= m &&
          back >= 1 - d &&
          back <= d - 1 &&
          x + backward[offset + back] >= n
        ) {
          return [aLo + x, bLo + y];
        }
      }
      if (2 * d > limit) {
        return null;
      }
      for (let k = -d; k <= d; k += 2) {
        let x =
          k === -d ||
          (k !== d && backward[offset + k - 1] < backward[offset + k + 1])
            ? backward[offset + k + 1]
            : backward[offset + k - 1] + 1;
        let y = x - k;
        while (x < n && y < m && oldIds[aHi - 1 - x] === newIds[bHi - 1 - y]) {
          x++;
          y++;
        }
        backward[offset + k] = x;
        const front = delta - k;
        if (
          !isOdd &&
          x <= n &&
          y <= m &&
          front >= -d &&
          front <= d &&
          x + forward[offset + front] >= n
        ) {
          const meetX = forward[offset + front];
          return [aLo + meetX, bLo + meetX - front];
        }
      }
    }
    return null;
  };

  // Appends the script for the box to `ops`; false when the box needs more
  // than `limit` edits. Only the outermost box sets a limit.
  const solve = (
    aLo: number,
    aHi: number,
    bLo: number,
    bHi: number,
    limit: number,
  ): boolean => {
    while (aLo < aHi && bLo < bHi && oldIds[aLo] === newIds[bLo]) {
      ops.push({kind: 'context', a: start + aLo, b: start + bLo});
      aLo++;
      bLo++;
    }
    let tail = 0;
    while (
      aHi - tail > aLo &&
      bHi - tail > bLo &&
      oldIds[aHi - 1 - tail] === newIds[bHi - 1 - tail]
    ) {
      tail++;
    }
    const aEnd = aHi - tail;
    const bEnd = bHi - tail;
    if (aLo === aEnd || bLo === bEnd) {
      if (aEnd - aLo + (bEnd - bLo) > limit) {
        return false;
      }
      for (let i = aLo; i < aEnd; i++) {
        ops.push({kind: 'removed', a: start + i});
      }
      for (let j = bLo; j < bEnd; j++) {
        ops.push({kind: 'added', b: start + j});
      }
    } else {
      const point = meetingPoint(aLo, aEnd, bLo, bEnd, limit);
      if (
        point == null ||
        !solve(aLo, point[0], bLo, point[1], Infinity) ||
        !solve(point[0], aEnd, point[1], bEnd, Infinity)
      ) {
        return false;
      }
    }
    for (let t = tail; t > 0; t--) {
      ops.push({kind: 'context', a: start + aHi - t, b: start + bHi - t});
    }
    return true;
  };

  if (!solve(0, oldIds.length, 0, newIds.length, maxEdits)) {
    return null;
  }
  return removalsFirst(ops);
}

/**
 * Put the removals of each run of changes before its additions, so split view
 * pairs each removed line with the added line that replaced it.
 */
function removalsFirst(ops: Op[]): Op[] {
  const sorted: Op[] = [];
  const added: Op[] = [];
  for (const op of ops) {
    if (op.kind === 'added') {
      added.push(op);
      continue;
    }
    if (op.kind === 'context') {
      for (const addedOp of added) {
        sorted.push(addedOp);
      }
      added.length = 0;
    }
    sorted.push(op);
  }
  for (const addedOp of added) {
    sorted.push(addedOp);
  }
  return sorted;
}

/**
 * Myers' O(ND) shortest edit script over `a[start, endA)` and
 * `b[start, endB)`, with absolute indexes in the ops; null when it needs more
 * than `maxEdits` edits. It keeps every step's diagonals to trace the path
 * back, so its memory grows with the square of the edits.
 */
function tracedEditScript(
  a: string[],
  b: string[],
  start: number,
  endA: number,
  endB: number,
  maxEdits: number,
): Op[] | null {
  const n = endA - start;
  const m = endB - start;
  const max = n + m;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  // trace[d] holds diagonals -d..d of v as it was before step d.
  const trace: Int32Array[] = [];

  outer: for (let d = 0; d <= max; d++) {
    if (d > maxEdits) {
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
