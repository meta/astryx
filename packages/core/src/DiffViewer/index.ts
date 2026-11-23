// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Imports from DiffViewer.tsx, parseUnifiedDiff.ts, createDiffFile.ts, diffTypes.ts
 * @output Exports DiffViewer, its diff model types, and the patch/text utilities
 * @position Entry point for @astryxdesign/core/DiffViewer; re-exported by
 *   /packages/core/src/index.ts and /packages/lab/src/DiffViewer/index.ts
 *
 * SYNC: When modified, update /packages/core/src/DiffViewer/DiffViewer.doc.mjs
 * and /packages/lab/src/DiffViewer/index.ts
 */

export {DiffViewer} from './DiffViewer';
export type {
  DiffViewerChangeIndicator,
  DiffViewerInlineHighlight,
  DiffViewerProps,
  DiffViewerViewMode,
} from './DiffViewer';
export {parseUnifiedDiff} from './parseUnifiedDiff';
export {createDiffFile} from './createDiffFile';
export type {CreateDiffFileOptions} from './createDiffFile';
export type {
  DiffViewerFile,
  DiffViewerFileStatus,
  DiffViewerHunk,
  DiffViewerLine,
  DiffViewerLineKind,
  DiffViewerLineRef,
  DiffViewerSide,
} from './diffTypes';
