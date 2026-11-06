// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input Imports from DiffViewer.tsx, parseUnifiedDiff.ts, createDiffFile.ts, diffTypes.ts
 * @output Exports DiffViewer, its diff model types, and the patch/text utilities
 * @position Component entry point; re-exported by /packages/lab/src/index.ts
 *
 * SYNC: When modified, update /packages/lab/src/DiffViewer/DiffViewer.doc.mjs
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
