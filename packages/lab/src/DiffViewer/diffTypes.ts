// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file diffTypes.ts
 * @input None (type-only module)
 * @output Exports the structured diff model DiffViewer renders: DiffViewerFile,
 *   DiffViewerHunk, DiffViewerLine, DiffViewerLineKind, DiffViewerFileStatus,
 *   DiffViewerSide, DiffViewerLineRef
 * @position Lab data model; produced by parseUnifiedDiff / createDiffFile and
 *   consumed by DiffViewer
 *
 * SYNC: When modified, update:
 * - /packages/lab/src/DiffViewer/DiffViewer.doc.mjs (types in the props table)
 * - /packages/lab/src/DiffViewer/index.ts (type exports)
 */

/** What one line of a hunk does: adds, removes, or keeps a line. */
export type DiffViewerLineKind = 'added' | 'removed' | 'context';

/** How the file changed as a whole. */
export type DiffViewerFileStatus = 'added' | 'deleted' | 'modified' | 'renamed';

/**
 * Which version of the file a line number belongs to: `old` is the original
 * (left in split view), `new` the changed version (right in split view).
 */
export type DiffViewerSide = 'old' | 'new';

/** One line of a hunk, without its leading `+`/`-`/space glyph. */
export interface DiffViewerLine {
  kind: DiffViewerLineKind;
  /** The line's text with the diff glyph removed. */
  content: string;
  /** 1-based line number in the old file; `null` for an added line. */
  oldLineNumber: number | null;
  /** 1-based line number in the new file; `null` for a removed line. */
  newLineNumber: number | null;
}

/** One `@@` hunk: a run of changed lines with their surrounding context. */
export interface DiffViewerHunk {
  /** The hunk header as written, e.g. `@@ -12,7 +12,9 @@ function save()`. */
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffViewerLine[];
  /**
   * True when the change was too large to compare line by line, so the hunk
   * lists every old line as removed and every new line as added instead of a
   * minimal diff. `createDiffFile` sets it; DiffViewer folds the changed lines
   * behind a labeled control that shows them on request.
   */
  isReplacedBlock?: boolean;
}

/** One file's changes. */
export interface DiffViewerFile {
  /** Path before the change; `null` when the file was added. */
  oldPath: string | null;
  /** Path after the change; `null` when the file was deleted. */
  newPath: string | null;
  status: DiffViewerFileStatus;
  /** True when the patch reports a binary change with no line hunks. */
  isBinary: boolean;
  hunks: DiffViewerHunk[];
}

/**
 * Identifies one line of a rendered diff for annotations and line-number
 * clicks. Every line has exactly one ref, the same in unified and split view,
 * so `side` + `lineNumber` is a stable anchor (e.g. for a review comment): an
 * added line is `new`, a removed line is `old`, and a context line is `new`.
 */
export interface DiffViewerLineRef {
  side: DiffViewerSide;
  lineNumber: number;
  line: DiffViewerLine;
  hunkIndex: number;
}
