// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file DiffViewer re-export
 * @input `@astryxdesign/core/DiffViewer`
 * @output Re-exports DiffViewer, parseUnifiedDiff, createDiffFile, and their
 *   types from Core
 * @position Lab entry for DiffViewer, which lives in Core; consumed by
 *   packages/lab/src/index.ts
 */

export {
  DiffViewer,
  createDiffFile,
  parseUnifiedDiff,
} from '@astryxdesign/core/DiffViewer';
export type {
  CreateDiffFileOptions,
  DiffViewerChangeIndicator,
  DiffViewerFile,
  DiffViewerFileStatus,
  DiffViewerHunk,
  DiffViewerInlineHighlight,
  DiffViewerLine,
  DiffViewerLineKind,
  DiffViewerLineRef,
  DiffViewerProps,
  DiffViewerSide,
  DiffViewerViewMode,
} from '@astryxdesign/core/DiffViewer';
